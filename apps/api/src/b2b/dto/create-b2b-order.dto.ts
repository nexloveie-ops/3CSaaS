import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class B2bLineDto {
  @IsMongoId()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitWholesalePreTax?: number;

  @IsOptional()
  @IsMongoId()
  serialUnitId?: string;
}

export class CreateB2bOrderDto {
  @IsMongoId()
  buyerStoreId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => B2bLineDto)
  lines!: B2bLineDto[];
}
