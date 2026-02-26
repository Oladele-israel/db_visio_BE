import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { User } from 'generated/prisma/client';
import { CurrentUser } from 'src/common/decorators/auth.decorator';
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor';
import { DbAgentService } from './db-agent.service';
import { CreateDbConnectDataDto, QueryParams, RelationQueryInput } from './dto/db-agent.dto';

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

    @Post(':id/connect')
    async connectToDatabase(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        this.logger.log(`User ${user.id} connecting to DB connection ${id}`);

        return this.dbAgent.connectUserDbConnection(user, id);
    }

    @Get(':id/schema')
    async getSchema(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        this.logger.log(
            `User ${user.id} fetching schema for connection ${id}`,
        );

        return this.dbAgent.getDatabaseSchema(user, id);
    }

    @Get(':id/relation/:table')
    async getTableRelations(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Param('table') table: string,
    ) {
        this.logger.log(
            `User ${user.id} fetching relations for table ${table} on connection ${id}`,
        );

        return this.dbAgent.getTableRelations(user, id, table);
    }

    @Post(':id/relations/query')
    async queryRelations(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() body: RelationQueryInput,
    ) {
        return this.dbAgent.queryRelations(user, id, body);
    }

    @Post(':id/:table/query')
    async queryTable(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Param('table') table: string,
        @Body() body: Omit<QueryParams, 'tableName'>,
    ) {
        return this.dbAgent.queryTable(user, id, table, body);
    }

    @Get(':id/:table/rows/:pk/relations/:relationTable')
    async getRowRelations(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Param('table') table: string,
        @Param('pk') pk: string,
        @Param('relationTable') relationTable: string,
    ) {
        return this.dbAgent.getRowRelations(
            user,
            id,
            table,
            pk,
            relationTable,
        );
    }
}
