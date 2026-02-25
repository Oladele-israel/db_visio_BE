import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client'; // your custom output path
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Create the adapter using your DATABASE_URL from .env
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    // Pass it to super() — this satisfies the "non-empty options" requirement
    super({
      adapter,
      // Optional: add logging, errorFormat, etc. if you want
      // log: ['query', 'info', 'warn', 'error'], // useful for debugging
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}