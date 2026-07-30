import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateB2bCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  registrationNumber!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vatNumber?: string;
}
