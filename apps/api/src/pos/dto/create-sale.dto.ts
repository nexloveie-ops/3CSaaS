import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleLineDto {
  @IsMongoId()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceIncVat?: number;

  @IsOptional()
  @IsMongoId()
  serialUnitId?: string;

  @IsOptional()
  @IsString()
  sn?: string;

  @IsOptional()
  @IsMongoId()
  workOrderId?: string;
}

export class CreateSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines!: SaleLineDto[];

  @IsOptional()
  @IsEnum(['cash', 'card', 'mixed', 'other'])
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cardAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountTendered?: number;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  workOrderIds?: string[];
}
