import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbType, User } from 'generated/prisma/client';
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent';
import { CreateDbConnectDataDto } from './dto/db-agent.dto';
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

    async updateUserDbCred(user: User, data: CreateDbConnectDataDto, connectionId: string) {
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

    async connectUserDbConnection(
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

        const cacheKey = this.getSessionCacheKey(user.id, connectionId);

        const existingSession = await this.cacheManager.get<string>(cacheKey);

        if (existingSession) {
            return {
                success: true,
                sessionId: existingSession,
                message: 'existing session reused',
            };
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

        await this.cacheManager.set(
            cacheKey,
            result.sessionId,
             604800000 
        );

        return {
            success: true,
            sessionId: result.sessionId,
            message: 'new session created',
        };
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
