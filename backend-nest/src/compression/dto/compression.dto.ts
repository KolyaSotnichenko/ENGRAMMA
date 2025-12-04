import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CompressDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsIn(['semantic', 'syntactic', 'aggressive'])
  algorithm?: 'semantic' | 'syntactic' | 'aggressive';
}

export class BatchDto {
  @IsArray()
  texts: string[];

  @IsOptional()
  @IsIn(['semantic', 'syntactic', 'aggressive'])
  algorithm?: 'semantic' | 'syntactic' | 'aggressive';
}

export class AnalyzeDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}
