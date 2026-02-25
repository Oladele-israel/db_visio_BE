import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { User } from 'generated/prisma/client';
import { CurrentUser } from 'src/common/decorators/auth.decorator';
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor';
import { DbAgentService } from './db-agent.service';
import { CreateDbConnectDataDto } from './dto/db-agent.dto';

@UseInterceptors(AuthInterceptor)
@Controller('db-agent')
export class DbAgentController {

    private readonly logger = new Logger(DbAgentController.name);

    constructor(
        private readonly dbAgent: DbAgentService,
    ) { }

    @Get('test')
    async testHandShake(@CurrentUser() user: User) {
        this.logger.log(`Handshake test by user: ${user.id}`);
        return this.dbAgent.testHello();
    }

    @Post()
    async create(
        @CurrentUser() user: User,
        @Body() dto: CreateDbConnectDataDto,
    ) {
        this.logger.log(`Creating DB connection for user: ${user.id}`);
        return this.dbAgent.createUserDbCreds(user, dto);
    }

    @Get()
    async getAll(
        @CurrentUser() user: User,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.dbAgent.getAllUserDbCreds(
            user,
            Number(page) || 1,
            Number(limit) || 10,
        );
    }

    @Get(':id')
    async getSingle(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        return this.dbAgent.getSingleDbCred(user, id);
    }

    @Patch(':id')
    async update(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() dto: CreateDbConnectDataDto,
    ) {
        this.logger.log(`Updating DB connection ${id} for user ${user.id}`);
        return this.dbAgent.updateUserDbCred(user, dto, id);
    }

    @Delete(':id')
    async delete(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        this.logger.log(`Deleting DB connection ${id} for user ${user.id}`);
        return this.dbAgent.deleteUserDbCred(user, id);
    }
}
