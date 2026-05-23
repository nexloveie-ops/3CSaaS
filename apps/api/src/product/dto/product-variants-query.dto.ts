import { IsOptional, IsString } from 'class-validator';

export class ProductVariantsQueryDto {
  @IsOptional()
  @IsString()
  storeId?: string;
}
