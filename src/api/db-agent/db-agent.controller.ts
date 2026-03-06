// src/db-agent/db-agent.controller.ts
import {
  Body, Controller, Delete, Get, Logger,
  Param, Patch, Post, Query, UseInterceptors,
} from '@nestjs/common'
import { User } from 'generated/prisma/client'
import { CurrentUser } from 'src/common/decorators/auth.decorator'
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor'
import { DbAgentService } from './db-agent.service'
import { CreateDbConnectDataDto, QueryParams, TraverseRelationDto } from './dto/db-agent.dto'

@UseInterceptors(AuthInterceptor)
@Controller('db-agent')
export class DbAgentController {
  private readonly logger = new Logger(DbAgentController.name)

  constructor(private readonly dbAgent: DbAgentService) {}

  // ─── Health ──────────────────────────────────────────────────────────────

  @Get('test')
  async testHandShake(@CurrentUser() user: User) {
    this.logger.log(`Handshake test by user: ${user.id}`)
    return this.dbAgent.testHello()
  }

  // ─── Connection CRUD ─────────────────────────────────────────────────────

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateDbConnectDataDto,
  ) {
    this.logger.log(`Creating DB connection for user: ${user.id}`)
    return this.dbAgent.createUserDbCreds(user, dto)
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
    )
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    this.logger.log(`Updating DB connection ${id} for user ${user.id}`)
    return this.dbAgent.updateUserDbCred(user, dto, id)
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    this.logger.log(`Deleting DB connection ${id} for user ${user.id}`)
    return this.dbAgent.deleteUserDbCred(user, id)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ⚠️  ROUTE ORDERING — read before touching anything below
  //
  // NestJS/Express resolves routes in declaration order, top to bottom.
  // A wildcard segment like :table will greedily consume any literal string
  // that appears in the same position in a later route.
  //
  // WRONG order (causes silent misrouting):
  //   @Post(':id/:table/query')             ← :table matches "query"
  //   @Post(':id/query/relation/traverse')  ← never reached
  //
  // CORRECT order (most-specific literals first):
  //   1.  schema/cache/:id          — literal "schema/cache"
  //   2.  :id/connect               — literal "connect"
  //   3.  :id/schema                — literal "schema"
  //   4.  :id/query/relation/traverse — literal "query/relation/traverse" ← BEFORE :table
  //   5.  :id/relation/:table       — one wildcard after known prefix
  //   6.  :id/:table/query          — :table wildcard ← must come AFTER #4
  //   7.  :id/:table/rows/...       — :table wildcard ← must come AFTER #4
  //   8.  :id                       — pure wildcard, always last
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Schema cache invalidation — "schema/cache" must be before :id
  @Delete('schema/cache/:id')
  async invalidateSchemaCache(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    this.logger.log(
      `User ${user.id} invalidating schema cache for connection ${id}`,
    )
    return this.dbAgent.invalidateConnectionSchema(user, id)
  }

  // 2. Connect — literal "connect" segment, before :table wildcard routes
  @Post(':id/connect')
  async connectToDatabase(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    this.logger.log(`User ${user.id} connecting to DB connection ${id}`)
    return this.dbAgent.connectUserDbConnection(user, id)
  }

  // 3. Schema fetch — literal "schema" segment, before :table wildcard routes
  @Get(':id/schema')
  async getSchema(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    this.logger.log(`User ${user.id} fetching schema for connection ${id}`)
    return this.dbAgent.getDatabaseSchema(user, id)
  }

  // 4. ── Traverse relation ──────────────────────────────────────────────────
  //
  // POST /db-agent/:id/query/relation/traverse
  //
  // MUST be declared before @Post(':id/:table/query') — the segment "query"
  // in this URL would otherwise be consumed by :table in the route below,
  // silently routing this request to queryTable() with table="query".
  //
  // Replaces the old POST :id/relations/query endpoint entirely.
  // The frontend sends the full traversal descriptor; no server-side FK guessing.
  //
  // Body: TraverseRelationDto
  //   sourceTable, sourceColumn, sourceValue — identifies the source row value
  //   relationType — 'belongsTo' | 'hasMany'
  //   targetTable, targetColumn — where to query
  //   limit?, offset?
  @Post(':id/query/relation/traverse')
  async traverseRelation(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: TraverseRelationDto,
  ) {
    this.logger.log(
      `User ${user.id} traversing ${body.relationType} relation ` +
      `${body.sourceTable} → ${body.targetTable} on connection ${id}`,
    )
    return this.dbAgent.traverseRelation(user, id, body)
  }

  // 5. Relations for a table — one wildcard after known "relation" prefix
  @Get(':id/relation/:table')
  async getTableRelations(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('table') table: string,
  ) {
    this.logger.log(
      `User ${user.id} fetching relations for table ${table} on connection ${id}`,
    )
    return this.dbAgent.getTableRelations(user, id, table)
  }

  // 6. General table query — :table wildcard, declared AFTER literal routes
  @Post(':id/:table/query')
  async queryTable(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('table') table: string,
    @Body() body: Omit<QueryParams, 'tableName'>,
  ) {
    this.logger.log(
      `User ${user.id} querying table ${table} on connection ${id}`,
    )
    return this.dbAgent.queryTable(user, id, table, body)
  }

  // 7. ── Row relations convenience GET ─────────────────────────────────────
  //
  // GET /db-agent/:id/:table/rows/:idColumn/:idValue/related/:relationType/:targetTable/:targetColumn
  //
  // All identifiers are explicit URL params — nothing hardcoded to "pk".
  // FIX: old route was /:pk/relations/:relationTable which was missing
  // idColumn, relationType, and targetColumn, making the agent-side query
  // always filter by the wrong column.
  //
  // Example — all transactions for user 5:
  //   GET /db-agent/abc/users/rows/id/5/related/hasMany/transactions/user_id
  //
  // Example — user who owns transaction 99:
  //   GET /db-agent/abc/transactions/rows/id/99/related/belongsTo/users/id
  @Get(':id/:table/rows/:idColumn/:idValue/related/:relationType/:targetTable/:targetColumn')
  async getRowRelations(
    @CurrentUser() user: User,
    @Param('id')           id:           string,
    @Param('table')        table:        string,
    @Param('idColumn')     idColumn:     string,
    @Param('idValue')      idValue:      string,
    @Param('relationType') relationType: string,
    @Param('targetTable')  targetTable:  string,
    @Param('targetColumn') targetColumn: string,
  ) {
    if (relationType !== 'belongsTo' && relationType !== 'hasMany') {
      throw new Error('relationType must be "belongsTo" or "hasMany"')
    }

    this.logger.log(
      `User ${user.id} fetching ${relationType} relations ` +
      `${table}.${idColumn}=${idValue} → ${targetTable}.${targetColumn} on connection ${id}`,
    )

    return this.dbAgent.getRowRelations(
      user,
      id,
      table,
      idColumn,
      idValue,
      relationType as 'belongsTo' | 'hasMany',
      targetTable,
      targetColumn,
    )
  }

  // 8. Single connection fetch — pure :id wildcard, always last
  @Get(':id')
  async getSingle(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.dbAgent.getSingleDbCred(user, id)
  }
}