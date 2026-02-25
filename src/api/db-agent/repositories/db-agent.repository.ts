import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/api/database/prisma.service';

@Injectable()
export class DbAgentRepository {

    constructor(private readonly prisma: PrismaService) { }

    public async create(query: Prisma.DbConnectionCreateArgs) {
        return this.prisma.dbConnection.create(query)
    }

    public async findUnique(query: Prisma.DbConnectionFindUniqueArgs) {
        return this.prisma.dbConnection.findUnique(query);
    }

    public async findFirst(query: Prisma.DbConnectionFindFirstArgs) {
        return this.prisma.dbConnection.findFirst(query);
    }

    public async findMany(query: Prisma.DbConnectionFindManyArgs) {
        return this.prisma.dbConnection.findMany(query);
    }

    public async update(query: Prisma.DbConnectionUpdateArgs) {
        return this.prisma.dbConnection.update(query);
    }

    public async delete(query: Prisma.DbConnectionDeleteArgs) {
        return this.prisma.dbConnection.delete(query);
    }

    public async count(query: Prisma.DbConnectionCountArgs = {}) {
        return this.prisma.dbConnection.count(query);
    }

}
