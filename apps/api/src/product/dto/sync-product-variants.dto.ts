import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class VariantDimensionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  values!: string[];
}

export class VariantLineDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  variantValues!: string[];

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @IsString()
  skuCode?: string;
}

export class SyncProductVariantsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(3)
  @Type(() => VariantDimensionDto)
  dimensions!: VariantDimensionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantLineDto)
  variants!: VariantLineDto[];
}
