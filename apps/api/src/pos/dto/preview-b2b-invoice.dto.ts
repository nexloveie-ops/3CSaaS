import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PreviewB2bInvoiceLineDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adHocDescription?: string;

  @IsOptional()
  @IsMongoId()
  taxCategoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPreTax?: number;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceIncVat?: number;

  @IsOptional()
  @IsString()
  sn?: string;

  @IsOptional()
  @IsMongoId()
  serialUnitId?: string;

  @IsOptional()
  @IsMongoId()
  workOrderId?: string;
}

/** Draft B2B invoice preview — does not create an order or change stock. */
export class PreviewB2bInvoiceDto {
  @IsMongoId()
  b2bCustomerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreviewB2bInvoiceLineDto)
  lines!: PreviewB2bInvoiceLineDto[];
}
