import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SUPPORTED_LOCALES } from '@lz3c/shared';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale?: string;
}
