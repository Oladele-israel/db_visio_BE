import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbType, User } from 'generated/prisma/client';
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent';
import { CreateDbConnectDataDto } from './dto/db-agent.dto';
import * as bcrypt from 'bcrypt';
import { DbAgentRepository } from './repositories/db-agent.repository';

@Injectable()
export class DbAgentService {
    private readonly logger = new Logger(DbAgentService.name);

    constructor(
        private readonly dbAgent: VisioAgentService,
        private readonly dbAgentRepo: DbAgentRepository,

    ) { }

    async testHello() {
        return await this.dbAgent.testHello()
    }

    async createUserDbCreds(user: User, data: CreateDbConnectDataDto) {

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
                encryptedPassword: hashedPassword,
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
}
