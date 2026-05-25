import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { InboundNewProductDto } from './inbound-new-product.dto';

export class InboundLineDto {
  @ValidateIf((o: InboundLineDto) => !o.newProduct)
  @IsMongoId()
  productId?: string;

  @ValidateIf((o: InboundLineDto) => !o.productId)
  @ValidateNested()
  @Type(() => InboundNewProductDto)
  newProduct?: InboundNewProductDto;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  /** Set store on-hand to this value before applying receive quantity. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockOnHand?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class CreateInboundDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InboundLineDto)
  lines!: InboundLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsString()
  @MinLength(1)
  supplier!: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}
