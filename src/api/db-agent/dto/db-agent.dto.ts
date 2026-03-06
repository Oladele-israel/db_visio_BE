// dto/create-db-connection.dto.ts
import { IsString, IsNumber, Min, IsNotEmpty, IsBoolean, IsOptional, IsIn, ValidateNested, IsObject, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateDbConnectDataDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    @IsIn(['postgres', 'mysql', 'sqlite', 'mssql'])
    type: string;

    @IsString()
    @IsNotEmpty()
    host: string;

    @IsNumber()
    @Min(1)
    @IsNotEmpty()
    @Transform(({ value }) => parseInt(value, 10))
    port: number;

    @IsString()
    @IsNotEmpty()
    database: string;

    @IsString()
    @IsNotEmpty()
    username: string;

    @IsString()
    @IsNotEmpty()
    password: string;

    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    ssl?: boolean;
}

class OrderByDto {
  @IsString()
  @IsNotEmpty()
  column: string

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc'
}

export class QueryParams {
  @IsString()
  @IsNotEmpty()
  tableName: string

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => OrderByDto)
  orderBy?: OrderByDto

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>
}

/**
 * Replaces RelationQueryInput entirely.
 * Matches TraverseRelationPayload on VisioAgentService exactly.
 */
export class TraverseRelationDto {
  @IsString()
  @IsNotEmpty()
  sourceTable: string

  @IsString()
  @IsNotEmpty()
  sourceColumn: string

  // string | number — accept both, agent handles coercion
  @IsNotEmpty()
  sourceValue: string | number

  @IsIn(['belongsTo', 'hasMany'])
  relationType: 'belongsTo' | 'hasMany'

  @IsString()
  @IsNotEmpty()
  targetTable: string

  @IsString()
  @IsNotEmpty()
  targetColumn: string

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number
}