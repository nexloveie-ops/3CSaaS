import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MatrixPriceEntryDto {
  @IsMongoId()
  modelId!: string;

  @IsString()
  @MinLength(1)
  issue!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceIncVat?: number | null;

  @IsOptional()
  @IsEnum(['template', 'custom'])
  kind?: 'template' | 'custom';
}

export class BulkPriceMatrixDto {
  @IsMongoId()
  brandId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatrixPriceEntryDto)
  entries!: MatrixPriceEntryDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  newIssues?: string[];
}
