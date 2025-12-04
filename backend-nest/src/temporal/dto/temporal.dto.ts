import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTemporalFactDto {
  @IsString() @IsNotEmpty() subject: string;
  @IsString() @IsNotEmpty() predicate: string;
  @IsString() @IsNotEmpty() object: string;
  @IsOptional() @IsInt() valid_from?: number;
  @IsOptional() @IsInt() valid_to?: number;
  @IsOptional() @IsNumber() confidence?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateTemporalFactDto {
  @IsOptional() @IsString() object?: string;
  @IsOptional() @IsInt() valid_to?: number;
  @IsOptional() @IsNumber() confidence?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class QueryTemporalDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() predicate?: string;
  @IsOptional() @IsString() object?: string;
  @IsOptional() @IsInt() at?: number;
  @IsOptional() @IsInt() from?: number;
  @IsOptional() @IsInt() to?: number;
  @IsOptional() @IsNumber() min_confidence?: number;
}

export class CurrentFactDto {
  @IsString() @IsNotEmpty() subject: string;
  @IsString() @IsNotEmpty() predicate: string;
}

export class TimelineDto {
  @IsString() @IsNotEmpty() subject: string;
  @IsOptional() @IsString() predicate?: string;
}

export class SubjectFactsDto {
  @IsString() @IsNotEmpty() subject: string;
  @IsOptional() @IsBoolean() include_historical?: boolean;
}

export class SearchDto {
  @IsString() @IsNotEmpty() pattern: string;
  @IsOptional() @IsIn(['subject', 'predicate', 'object']) field?:
    | 'subject'
    | 'predicate'
    | 'object';
  @IsOptional() @IsInt() at?: number;
}

export class CompareDto {
  @IsString() @IsNotEmpty() subject: string;
  @IsInt() time1: number;
  @IsInt() time2: number;
}

export class DecayDto {
  @IsOptional() @IsInt() @Min(1) window_days?: number;
}

export class VolatileDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}
