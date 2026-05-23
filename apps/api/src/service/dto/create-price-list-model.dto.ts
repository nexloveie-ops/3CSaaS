import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePriceListModelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
