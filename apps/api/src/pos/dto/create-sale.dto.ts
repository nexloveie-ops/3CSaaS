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

  MinLength,

  ValidateNested,

} from 'class-validator';



export class SaleLineDto {

  @IsOptional()

  @IsMongoId()

  productId?: string;



  /** Quick sale / custom line (not from inventory). */

  @IsOptional()

  @IsString()

  @MinLength(1)

  adHocDescription?: string;



  @IsOptional()

  @IsMongoId()

  taxCategoryId?: string;



  @IsOptional()

  @IsMongoId()

  catalogCategoryId?: string;



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


