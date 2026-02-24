import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/api/database/prisma.service';

@Injectable()
export class UsersRepository {

    constructor(private readonly prisma: PrismaService) { }

    public async create(query: Prisma.UserCreateArgs) {
        return this.prisma.user.create(query)
    }

    public async findUnique(query: Prisma.UserFindUniqueArgs) {
        return this.prisma.user.findUnique(query);
    }

    public async findFirst(query: Prisma.UserFindFirstArgs) {
        return this.prisma.user.findFirst(query);
    }

    public async findMany(query: Prisma.UserFindManyArgs) {
        return this.prisma.user.findMany(query);
    }

    public async update(query: Prisma.UserUpdateArgs) {
        return this.prisma.user.update(query);
    }

    public async delete(query: Prisma.UserDeleteArgs) {
        return this.prisma.user.delete(query);
    }

    public async count(query: Prisma.UserCountArgs = {}) {
        return this.prisma.user.count(query);
    }

}
