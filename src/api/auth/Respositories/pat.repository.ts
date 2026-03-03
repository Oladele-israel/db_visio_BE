import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/api/database/prisma.service';

@Injectable()
export class PATRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(args: Prisma.PersonalAccessTokenCreateArgs) {
    return this.prisma.personalAccessToken.create(args);
  }

  async findUnique(args: Prisma.PersonalAccessTokenFindUniqueArgs) {
    return this.prisma.personalAccessToken.findUnique(args);
  }

  async findMany(args: Prisma.PersonalAccessTokenFindManyArgs) {
    return this.prisma.personalAccessToken.findMany(args);
  }

  async update(args: Prisma.PersonalAccessTokenUpdateArgs) {
    return this.prisma.personalAccessToken.update(args);
  }
}