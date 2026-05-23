import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStoreProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}
