import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AuthLoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(64)
  login: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(256)
  password: string;
}

export class AuthBootstrapDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(64)
  login: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(256)
  password: string;
}
