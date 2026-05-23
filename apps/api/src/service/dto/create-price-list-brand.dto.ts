import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePriceListBrandDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
