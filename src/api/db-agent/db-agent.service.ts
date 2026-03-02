import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbType, User } from 'generated/prisma/client';
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent';
import { CreateDbConnectDataDto, QueryParams, RelationQueryInput } from './dto/db-agent.dto';
import * as bcrypt from 'bcrypt';
import { DbAgentRepository } from './repositories/db-agent.repository';
import { HashingService } from 'src/common/hashing/hashing.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class DbAgentService {
    private readonly logger = new Logger(DbAgentService.name);

    constructor(
        private readonly dbAgent: VisioAgentService,
        private readonly dbAgentRepo: DbAgentRepository,
        private readonly hash: HashingService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }

    async testHello() {
        return await this.dbAgent.testHello()
    }

    async createUserDbCreds(user: User, data: CreateDbConnectDataDto) {

        const encryptedPass = this.hash.encrypt(data.password)

        const dbTypeMap = {
            'postgres': DbType.POSTGRES,
            'mysql': DbType.MYSQL,
            'sqlite': DbType.SQLITE,
            'mssql': DbType.MSSQL
        };

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const connection = await this.dbAgentRepo.create({
            data: {
                name: data.name,
                type: dbTypeMap[data.type],
                host: data.host,
                port: data.port,
                database: data.database,
                username: data.username,
                encryptedPassword: encryptedPass,
                ssl: data.ssl ?? false,
                user: {
                    connect: {
                        id: user.id
                    }
                }
            }
        })

        return {
            success: true,
            data: connection
        }
    }

    async getAllUserDbCreds(
        user: User,
        page = 1,
        limit = 10,
    ) {
        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(Math.max(limit, 1), 100);

        const skip = (safePage - 1) * safeLimit;

        const [data, total] = await Promise.all([
            this.dbAgentRepo.findMany({
                where: {
                    userId: user.id,
                },
                skip,
                take: safeLimit,
                orderBy: {
                    createdAt: 'desc',
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    host: true,
                    port: true,
                    database: true,
                    username: true,
                    ssl: true,
                    isActive: true,
                    createdAt: true,
                },
            }),
            this.dbAgentRepo.count({
                where: {
                    userId: user.id,
                },
            }),
        ]);

        return {
            data,
            meta: {
                total,
                page: safePage,
                limit: safeLimit,
                totalPages: Math.ceil(total / safeLimit),
            },
        };
    }


    async getSingleDbCred(user: User, connectionId: string) {
        const connection = await this.dbAgentRepo.findFirst({
            where: {
                id: connectionId,
                userId: user.id,
            },
            select: {
                id: true,
                name: true,
                type: true,
                host: true,
                port: true,
                database: true,
                username: true,
                ssl: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!connection) {
            throw new NotFoundException('Connection not found');
        }

        return connection;
    }

    async updateUserDbCred(user: User, data: any, connectionId: string) {
        const dataToUpdate: any = { ...data };

        if (data.password) {
            dataToUpdate.encryptedPassword = await bcrypt.hash(data.password, 10);
            delete dataToUpdate.password;
        }

        return this.dbAgentRepo.update({
            where: {
                id: connectionId,
                userId: user.id
            },
            data: dataToUpdate
        })
    }

    async deleteUserDbCred(user: User, connectionId: string) {
        const connection = await this.getSingleDbCred(user, connectionId);

        return this.dbAgentRepo.delete({
            where: { id: connection.id },
        });
    }

   async connectUserDbConnection(user: User, connectionId: string) {
        const connection = await this.dbAgentRepo.findFirst({
            where: { id: connectionId, userId: user.id },
        });

        if (!connection) throw new NotFoundException('Connection not found');

        const cacheKey = this.getSessionCacheKey(user.id, connectionId);

        // FIX: Never reuse an existing session blindly.
        //
        // The old code returned a cached sessionId if one existed, which meant
        // switching databases on the same connectionId would silently reuse a
        // session already pointed at the OLD database on the agent side.
        //
        // Now we ALWAYS create a fresh session on connect(). This is the single
        // source of truth: the agent's session IS the database connection.
        // The agent's own session pool handles cleanup of old sessions.
        //
        // We also bust the agent-side schema cache for any prior session tied
        // to this connection, so stale schema is never served after a reconnect.
        const existingSessionId = await this.cacheManager.get<string>(cacheKey);
        if (existingSessionId) {
            this.logger.debug(
                `Invalidating stale schema cache for session ${existingSessionId} before reconnect`
            );
            // Best-effort: if the agent is unreachable this should not block reconnection
            try {
                await this.dbAgent.invalidateSchemaCache(existingSessionId);
            } catch (err) {
                this.logger.warn(`Could not invalidate schema cache for old session: ${err.message}`);
            }
            await this.cacheManager.del(cacheKey);
        }

        const decryptedPassword = this.hash.decrypt(connection.encryptedPassword);

        const payload = {
            type: connection.type.toLowerCase(),
            host: connection.host,
            port: connection.port,
            database: connection.database,
            user: connection.username,
            password: decryptedPassword,
        };

        const result = await this.dbAgent.connectToDb(payload);

        await this.cacheManager.set(cacheKey, result.sessionId, 604800000);

        return {
            success: true,
            sessionId: result.sessionId,
            message: 'new session created',
        };
    }

    async invalidateConnectionSchema(user: User, connectionId: string) {
        await this.ensureConnectionBelongsToUser(user, connectionId);

        const sessionId = await this.getActiveSessionOrThrow(user, connectionId);

        await this.dbAgent.invalidateSchemaCache(sessionId);

        return { success: true, invalidated: true };
    }

     async getDatabaseSchema(user: User, connectionId: string) {
        await this.ensureConnectionBelongsToUser(user, connectionId);
        const sessionId = await this.getActiveSessionOrThrow(user, connectionId);

        this.logger.debug(`Fetching schema using session ${sessionId}`);

        const schema = await this.dbAgent.getDbSchema(sessionId);

        return { success: true, data: schema };
    }

    async getTableRelations(
        user: User,
        connectionId: string,
        table: string,
    ) {
        await this.ensureConnectionBelongsToUser(user, connectionId);

        const sessionId = await this.getActiveSessionOrThrow(
            user,
            connectionId,
        );

        this.logger.debug(
            `Fetching relations for table ${table} using session ${sessionId}`,
        );

        const relations =
            await this.dbAgent.getTableRelation(sessionId, table);

        return {
            success: true,
            data: relations,
        };
    }

    async queryRelations(
        user: User,
        connectionId: string,
        body: RelationQueryInput,
    ) {
        await this.ensureConnectionBelongsToUser(user, connectionId);
        // Get session from Redis
        const sessionId = await this.getActiveSessionOrThrow(
            user,
            connectionId,
        );

        const result = await this.dbAgent.queryRelations(
            sessionId,
            body,
        );

        return {
            success: true,
            data: result,
        };
    }

    async queryTable(
        user: User,
        connectionId: string,
        table: string,
        body: Omit<QueryParams, 'tableName'>,
    ) {
        await this.ensureConnectionBelongsToUser(user, connectionId);

        const sessionId = await this.getActiveSessionOrThrow(
            user,
            connectionId,
        );

        const result = await this.dbAgent.queryTable(
            sessionId,
            {
                tableName: table,
                ...body,
            },
        );

        return {
            success: true,
            data: result,
        };
    }

    async getRowRelations(
        user: User,
        connectionId: string,
        table: string,
        pk: string,
        relationTable: string,
    ) {
        await this.ensureConnectionBelongsToUser(user, connectionId);

        const sessionId = await this.getActiveSessionOrThrow(
            user,
            connectionId,
        );

        const result = await this.dbAgent.getRowRelations(
            sessionId,
            table,
            pk,
            relationTable,
        );

        return {
            success: true,
            data: result,
        };
    }
    

    private async ensureConnectionBelongsToUser(
        user: User,
        connectionId: string,
    ) {
        const connection = await this.dbAgentRepo.findFirst({
            where: {
                id: connectionId,
                userId: user.id,
            },
        });

        if (!connection) {
            throw new NotFoundException('Connection not found');
        }

        return connection;
    }


    private getSessionCacheKey(userId: string, connectionId: string) {
        return `agent:session:${userId}:${connectionId}`;
    }

    private async getActiveSessionOrThrow(
        user: User,
        connectionId: string,
    ): Promise<string> {
        const cacheKey = this.getSessionCacheKey(user.id, connectionId);

        const sessionId = await this.cacheManager.get<string>(cacheKey);

        if (!sessionId) {
            throw new BadRequestException(
                'Session expired. Please reconnect your database.',
            );
        }

        return sessionId;
    }


}
