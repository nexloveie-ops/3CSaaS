import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
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
  /** Quantity refund used by the web receipt screen. */
  @ValidateIf((dto: CreateRefundDto) => dto.amount == null)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  lines?: RefundLineDto[];

  /** Money refund. Posted to today's totals with the chosen tender. */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ValidateIf((dto: CreateRefundDto) => dto.amount != null)
  @IsIn(['cash', 'card'])
  paymentMethod?: 'cash' | 'card';

  /** Products included in a money refund. Already refunded lines are rejected. */
  @ValidateIf((dto: CreateRefundDto) => dto.amount != null)
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  lineIndexes?: number[];
}
