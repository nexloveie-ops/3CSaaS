import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class InboundNewProductDto {
  @IsEnum(['serialized', 'simple', 'sku'])
  productType!: 'serialized' | 'simple' | 'sku';

  @IsString()
  @MinLength(1)
  name!: string;

  @IsMongoId()
  taxCategoryId!: string;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsOptional()
  @IsMongoId()
  catalogCategoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @IsString()
  skuCode?: string;
}
