import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

export class RefundLineDto {
  @IsInt()
  @Min(0)
  lineIndex!: number;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateRefundDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  lines!: RefundLineDto[];
}
