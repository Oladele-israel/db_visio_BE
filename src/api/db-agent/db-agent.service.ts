// src/db-agent/db-agent.service.ts
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { DbType, User } from 'generated/prisma/client'
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent'
import { CreateDbConnectDataDto, QueryParams, TraverseRelationDto } from './dto/db-agent.dto'
import * as bcrypt from 'bcrypt'
import { DbAgentRepository } from './repositories/db-agent.repository'
import { HashingService } from 'src/common/hashing/hashing.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import type { Cache } from 'cache-manager'

@Injectable()
export class DbAgentService {
  private readonly logger = new Logger(DbAgentService.name)

  constructor(
    private readonly dbAgent: VisioAgentService,
    private readonly dbAgentRepo: DbAgentRepository,
    private readonly hash: HashingService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // ─── Health ──────────────────────────────────────────────────────────────

  async testHello() {
    return this.dbAgent.testHello()
  }

  // ─── Connection CRUD ─────────────────────────────────────────────────────

  async createUserDbCreds(user: User, data: CreateDbConnectDataDto) {
    const encryptedPass = this.hash.encrypt(data.password)

    const dbTypeMap: Record<string, DbType> = {
      postgres: DbType.POSTGRES,
      mysql:    DbType.MYSQL,
      sqlite:   DbType.SQLITE,
      mssql:    DbType.MSSQL,
    }

    const connection = await this.dbAgentRepo.create({
      data: {
        name:              data.name,
        type:              dbTypeMap[data.type],
        host:              data.host,
        port:              data.port,
        database:          data.database,
        username:          data.username,
        encryptedPassword: encryptedPass,
        ssl:               data.ssl ?? false,
        user: { connect: { id: user.id } },
      },
    })

    return { success: true, data: connection }
  }

  async getAllUserDbCreds(user: User, page = 1, limit = 10) {
    const safePage  = Math.max(page, 1)
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const skip      = (safePage - 1) * safeLimit

    const [data, total] = await Promise.all([
      this.dbAgentRepo.findMany({
        where:   { userId: user.id },
        skip,
        take:    safeLimit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, host: true,
          port: true, database: true, username: true,
          ssl: true, isActive: true, createdAt: true,
        },
      }),
      this.dbAgentRepo.count({ where: { userId: user.id } }),
    ])

    return {
      data,
      meta: {
        total,
        page:       safePage,
        limit:      safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    }
  }

  async getSingleDbCred(user: User, connectionId: string) {
    const connection = await this.dbAgentRepo.findFirst({
      where:  { id: connectionId, userId: user.id },
      select: {
        id: true, name: true, type: true, host: true,
        port: true, database: true, username: true,
        ssl: true, isActive: true, createdAt: true, updatedAt: true,
      },
    })

    if (!connection) throw new NotFoundException('Connection not found')
    return connection
  }

  async updateUserDbCred(user: User, data: any, connectionId: string) {
    const dataToUpdate: any = { ...data }

    if (data.password) {
      dataToUpdate.encryptedPassword = this.hash.encrypt(data.password)
      delete dataToUpdate.password
    }

    return this.dbAgentRepo.update({
      where: { id: connectionId, userId: user.id },
      data:  dataToUpdate,
    })
  }

  async deleteUserDbCred(user: User, connectionId: string) {
    const connection = await this.getSingleDbCred(user, connectionId)
    return this.dbAgentRepo.delete({ where: { id: connection.id } })
  }

  // ─── Session ─────────────────────────────────────────────────────────────

  async connectUserDbConnection(user: User, connectionId: string) {
    const connection = await this.dbAgentRepo.findFirst({
      where: { id: connectionId, userId: user.id },
    })
    if (!connection) throw new NotFoundException('Connection not found')

    const cacheKey = this.getSessionCacheKey(user.id, connectionId)

    // Always create a fresh session — never reuse a cached one blindly.
    // Reusing a cached sessionId risks pointing at a dead agent-side connection.
    // Bust the old schema cache first so stale schema is never served after reconnect.
    const existingSessionId = await this.cacheManager.get<string>(cacheKey)
    if (existingSessionId) {
      this.logger.debug(
        `Invalidating stale schema cache for session ${existingSessionId} before reconnect`,
      )
      try {
        await this.dbAgent.invalidateSchemaCache(existingSessionId)
      } catch (err) {
        // Best-effort — don't block reconnection if agent is temporarily unreachable
        this.logger.warn(
          `Could not invalidate schema cache for old session: ${err.message}`,
        )
      }
      await this.cacheManager.del(cacheKey)
    }

    const decryptedPassword = this.hash.decrypt(connection.encryptedPassword)

    // FIX: was sending `user:` — ConnectDbPayload requires `username:`
    const result = await this.dbAgent.connectToDb({
      type:     connection.type.toLowerCase(),
      host:     connection.host,
      port:     connection.port,
      database: connection.database,
      user: connection.username,   // was `user:` — wrong key
      password: decryptedPassword,
      ssl:      connection.ssl,
    })

    // Cache the new sessionId for 7 days (matches agent-side TTL)
    await this.cacheManager.set(cacheKey, result.sessionId, 604_800_000)

    return {
      success:   true,
      sessionId: result.sessionId,
      message:   'new session created',
    }
  }

  // ─── Schema ──────────────────────────────────────────────────────────────

  async getDatabaseSchema(user: User, connectionId: string) {
    await this.ensureConnectionBelongsToUser(user, connectionId)
    const sessionId = await this.getActiveSessionOrThrow(user, connectionId)

    this.logger.debug(`Fetching schema using session ${sessionId}`)

    const schema = await this.dbAgent.getDbSchema(sessionId)
    return { success: true, data: schema }
  }

  async invalidateConnectionSchema(user: User, connectionId: string) {
    await this.ensureConnectionBelongsToUser(user, connectionId)
    const sessionId = await this.getActiveSessionOrThrow(user, connectionId)

    await this.dbAgent.invalidateSchemaCache(sessionId)
    return { success: true, invalidated: true }
  }

  // ─── Relations ────────────────────────────────────────────────────────────

  async getTableRelations(user: User, connectionId: string, table: string) {
    await this.ensureConnectionBelongsToUser(user, connectionId)
    const sessionId = await this.getActiveSessionOrThrow(user, connectionId)

    this.logger.debug(
      `Fetching relations for table ${table} using session ${sessionId}`,
    )

    const relations = await this.dbAgent.getTableRelation(sessionId, table)
    return { success: true, data: relations }
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  async queryTable(
    user: User,
    connectionId: string,
    table: string,
    body: Omit<QueryParams, 'tableName'>,
  ) {
    await this.ensureConnectionBelongsToUser(user, connectionId)
    const sessionId = await this.getActiveSessionOrThrow(user, connectionId)

    // FIX: tableName goes in the URL only (handled by VisioAgentService.queryTable).
    // The old code merged { tableName: table, ...body } into the payload, which
    // sent tableName redundantly in the body — the agent now ignores it there.
    const result = await this.dbAgent.queryTable(sessionId, table, body)
    return { success: true, data: result }
  }

  /**
   * Replaces the old queryRelations() entirely.
   *
   * The frontend sends the full traversal descriptor resolved from the
   * relation metadata + the clicked row — we forward it directly to the
   * agent. No server-side FK guessing.
   */
  async traverseRelation(
    user: User,
    connectionId: string,
    body: TraverseRelationDto,
  ) {
    await this.ensureConnectionBelongsToUser(user, connectionId)
    const sessionId = await this.getActiveSessionOrThrow(user, connectionId)

    const result = await this.dbAgent.traverseRelation(sessionId, body)
    return { success: true, data: result }
  }

  /**
   * Convenience method that wraps the GET row-relations endpoint.
   * Prefer traverseRelation() for all programmatic use — this is kept
   * for any direct REST calls that already have all identifiers in the URL.
   */
  async getRowRelations(
    user: User,
    connectionId: string,
    sourceTable: string,
    idColumn: string,
    idValue: string,
    relationType: 'belongsTo' | 'hasMany',
    targetTable: string,
    targetColumn: string,
  ) {
    await this.ensureConnectionBelongsToUser(user, connectionId)
    const sessionId = await this.getActiveSessionOrThrow(user, connectionId)

    // FIX: old signature was (sessionId, table, pk, relationTable) — missing
    // idColumn, relationType, and targetColumn entirely, so the agent always
    // filtered by the wrong column.
    const result = await this.dbAgent.getRowRelations(sessionId, {
      sourceTable,
      idColumn,
      idValue,
      relationType,
      targetTable,
      targetColumn,
    })

    return { success: true, data: result }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getSessionCacheKey(userId: string, connectionId: string): string {
    return `agent:session:${userId}:${connectionId}`
  }

  private async getActiveSessionOrThrow(
    user: User,
    connectionId: string,
  ): Promise<string> {
    const cacheKey = this.getSessionCacheKey(user.id, connectionId)
    const sessionId = await this.cacheManager.get<string>(cacheKey)

    if (!sessionId) {
      throw new BadRequestException(
        'No active session. Please reconnect your database.',
      )
    }

    return sessionId
  }

  private async ensureConnectionBelongsToUser(
    user: User,
    connectionId: string,
  ) {
    const connection = await this.dbAgentRepo.findFirst({
      where: { id: connectionId, userId: user.id },
    })

    if (!connection) throw new NotFoundException('Connection not found')
    return connection
  }
}