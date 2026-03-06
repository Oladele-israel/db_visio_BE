// src/visio-agent/visio-agent.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

// ─── Param shapes ────────────────────────────────────────────────────────────

export interface ConnectDbPayload {
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface QueryTablePayload {
  limit?: number;
  offset?: number;
  orderBy?: { column: string; direction: 'asc' | 'desc' };
  filters?: Record<string, any>;
}

/**
 * Matches TraverseParams in query.types.ts on the db-agent side.
 *
 * belongsTo example — get the user who owns transaction 99:
 *   sourceTable=transactions, sourceColumn=user_id, sourceValue=99
 *   relationType=belongsTo,   targetTable=users,        targetColumn=id
 *
 * hasMany example — get all transactions for user 5:
 *   sourceTable=users,  sourceColumn=id, sourceValue=5
 *   relationType=hasMany, targetTable=transactions, targetColumn=user_id
 */
export interface TraverseRelationPayload {
  sourceTable: string;
  sourceColumn: string;
  sourceValue: string | number;
  relationType: 'belongsTo' | 'hasMany';
  targetTable: string;
  targetColumn: string;
  limit?: number;
  offset?: number;
}

/**
 * Params for the convenience GET endpoint.
 * Use this when you already know all column names from the relation descriptor.
 */
export interface GetRowRelationsParams {
  sourceTable: string;
  idColumn: string;               // actual column name — never the string "pk"
  idValue: string | number;
  relationType: 'belongsTo' | 'hasMany';
  targetTable: string;
  targetColumn: string;           // FK column on the target table
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class VisioAgentService {
  private readonly baseUrl: string;
  private readonly xApiKey: string;
  private readonly logger = new Logger(VisioAgentService.name);

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow<string>('VISIO_AGENT_BASE_URL');
    this.xApiKey = this.configService.getOrThrow<string>('VISIO_AGENT_X_API_KEY');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Shared headers for every request.
   * sessionId is optional — connect() doesn't have one yet.
   */
  private headers(sessionId?: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.xApiKey,
      ...(sessionId ? { 'x-session-id': sessionId } : {}),
    };
  }

  /**
   * Extracts the real error from an Axios failure and re-throws it as an
   * HttpException that preserves the upstream status code and message.
   * This prevents the gateway from always returning 400 when the db-agent
   * returned 401, 404, 503, etc.
   */
  private handleError(error: unknown, context: string): never {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ message?: string }>;
      const status  = axiosErr.response?.status  ?? HttpStatus.SERVICE_UNAVAILABLE;
      const message = axiosErr.response?.data?.message ?? axiosErr.message;
      this.logger.error(`[${context}] ${status} — ${message}`);
      throw new HttpException(message, status);
    }
    this.logger.error(`[${context}] Unexpected error`, error);
    throw new HttpException('Unexpected error contacting db agent', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  /** GET / — smoke-test that the db-agent is reachable */
  public async testHello(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/`, {
        headers: this.headers(),
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'testHello');
    }
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  /**
   * POST /db/connect
   * Establishes a new database session.
   * Returns { status: 'connected', sessionId: string }
   */
  public async connectToDb(data: ConnectDbPayload): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/db/connect`,
        data,
        { headers: this.headers() },
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'connectToDb');
    }
  }

  // ─── Schema ────────────────────────────────────────────────────────────────

  /**
   * GET /schema
   * Returns all tables and their columns for the session.
   * Results are cached on the db-agent for 1 hour per sessionId.
   *
   * Response: Table[] — each Table has { name, columns: Column[] }
   * Column includes isPrimaryKey, isUnique, isIdentifier flags.
   */
  public async getDbSchema(sessionId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/schema`, {
        headers: this.headers(sessionId),
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'getDbSchema');
    }
  }

  /**
   * DELETE /schema/cache
   * Invalidates the schema cache for this session.
   * Call this after DDL changes (ALTER TABLE, CREATE TABLE, etc.)
   * so the next GET /schema reflects the real current state.
   *
   * Response: { invalidated: true }
   */
  public async invalidateSchemaCache(sessionId: string): Promise<any> {
    try {
      const response = await axios.delete(`${this.baseUrl}/schema/cache`, {
        headers: this.headers(sessionId),
      });
      this.logger.debug(`Schema cache invalidated for session ${sessionId}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'invalidateSchemaCache');
    }
  }

  // ─── Relations ─────────────────────────────────────────────────────────────

  /**
   * GET /relation/:table
   * Returns all relations for a table — both directions.
   *
   * belongsTo: this table has a FK column pointing to another table
   *   { type: 'belongsTo', fromTable, fromColumn (FK), toTable, toColumn (ref) }
   *
   * hasMany: another table has a FK pointing to this table
   *   { type: 'hasMany', fromTable (parent), fromColumn (parent id),
   *                      toTable  (child),   toColumn  (child FK)  }
   *
   * Response: { table: string, relations: Relation[] }
   */
  public async getTableRelation(sessionId: string, table: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/relation/${table}`, {
        headers: this.headers(sessionId),
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'getTableRelation');
    }
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  /**
   * POST /query/:table/query
   * General table query with optional filters, ordering, and pagination.
   *
   * Body: QueryTablePayload
   *   limit?   — max rows, default 20, max 100
   *   offset?  — for pagination
   *   orderBy? — { column, direction: 'asc' | 'desc' }
   *   filters? — { columnName: value } — AND-combined equality filters
   *
   * Response: { columns: string[], rows: Record<string,any>[], total: number }
   * `total` is the COUNT(*) for the same filters — use it to drive pagination.
   */
  public async queryTable(
    sessionId: string,
    tableName: string,
    payload: QueryTablePayload,
  ): Promise<any> {
    try {
      // FIX: tableName moves to the URL only — removed from body to avoid
      // the old pattern where payload.tableName was sent in both places.
      const response = await axios.post(
        `${this.baseUrl}/query/${tableName}/query`,
        payload,
        { headers: this.headers(sessionId) },
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'queryTable');
    }
  }

  /**
   * POST /query/relation/traverse
   * Traverse a relation from a known row value.
   *
   * This replaces the old POST /query/relations/query endpoint entirely.
   *
   * The caller resolves sourceColumn/sourceValue from the relation descriptor
   * + the actual row — the db-agent executes a single targeted query and
   * never fetches source rows to derive FK values.
   *
   * Body: TraverseRelationPayload
   *
   * Example — all transactions for user 5:
   * {
   *   sourceTable:  'users',
   *   sourceColumn: 'id',
   *   sourceValue:  5,
   *   relationType: 'hasMany',
   *   targetTable:  'transactions',
   *   targetColumn: 'user_id',
   *   limit:        20,
   *   offset:       0,
   * }
   *
   * Example — user who owns transaction 99:
   * {
   *   sourceTable:  'transactions',
   *   sourceColumn: 'user_id',
   *   sourceValue:  99,
   *   relationType: 'belongsTo',
   *   targetTable:  'users',
   *   targetColumn: 'id',
   * }
   *
   * Response: { columns: string[], rows: Record<string,any>[], total: number }
   */
  public async traverseRelation(
    sessionId: string,
    payload: TraverseRelationPayload,
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/query/relation/traverse`,
        payload,
        { headers: this.headers(sessionId) },
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'traverseRelation');
    }
  }

  /**
   * GET /query/:table/rows/:idColumn/:idValue/related/:relationType/:targetTable/:targetColumn
   * Convenience REST endpoint — use when all column names are already known.
   * Prefer traverseRelation() for programmatic use since it's a POST with
   * a typed body and is easier to construct safely.
   *
   * Example — all transactions for user 5:
   *   getRowRelations({
   *     sourceTable:  'users',
   *     idColumn:     'id',
   *     idValue:      5,
   *     relationType: 'hasMany',
   *     targetTable:  'transactions',
   *     targetColumn: 'user_id',
   *   })
   *   → GET /query/users/rows/id/5/related/hasMany/transactions/user_id
   */
public async getRowRelations(
  sessionId: string,
  params: GetRowRelationsParams,
): Promise<any> {
  const { sourceTable, idColumn, idValue, relationType, targetTable, targetColumn } = params
  try {
    const url = `${this.baseUrl}/query/${sourceTable}/rows/${idColumn}/${idValue}/related/${relationType}/${targetTable}/${targetColumn}`
    const response = await axios.get(url, {
      headers: this.headers(sessionId),  // session now forwarded to agent
    })
    return response.data
  } catch (error) {
    this.handleError(error, 'getRowRelations')
  }
}
}