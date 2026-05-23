import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTaxCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(['zero', 'standard_13_5', 'standard_23', 'margin_23'])
  scheme!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
