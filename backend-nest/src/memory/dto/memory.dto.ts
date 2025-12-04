// d:\Projects\openmemory\backend-nest\src\memory\memory.dto.ts
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddMemoryDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  user_id?: string;
}

export class QueryFiltersDto {
  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsInt()
  min_score?: number;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsBoolean()
  use_graph?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  graph_depth?: number;
}

export class QueryMemoryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  k?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryFiltersDto)
  filters?: QueryFiltersDto;
}

export class PatchMemoryDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  user_id?: string;
}

export class IngestDto {
  @IsString()
  @IsNotEmpty()
  content_type: string;

  @IsNotEmpty()
  data: string | Buffer;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  user_id?: string;
}

export class IngestUrlDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  user_id?: string;
}
