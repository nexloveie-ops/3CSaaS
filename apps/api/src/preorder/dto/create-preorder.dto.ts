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

export class PreorderLineDto {
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
}

export class CreatePreorderDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreorderLineDto)
  lines!: PreorderLineDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
}
