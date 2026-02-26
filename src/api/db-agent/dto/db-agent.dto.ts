// dto/create-db-connection.dto.ts
import { IsString, IsNumber, Min, IsNotEmpty, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

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

export interface RelationQueryInput {
  sourceTable: string
  sourceWhere: Record<string, any>
  targetTable: string
  options?: {
    limit?: number
    offset?: number
    orderBy?: string
  }
}

export interface QueryParams {
  tableName: string
  limit?: number
  offset?: number
  orderBy?: {
    column: string
    direction: 'asc' | 'desc'
  }
  filters?: {
    [columnName: string]: any
  }
}