import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, Min } from 'class-validator';

export class RecordB2bInvoicePaymentDto {
  @IsDateString()
  paidAt!: string;

  @IsEnum(['cash', 'card', 'bank_transfer', 'other'])
  paymentMethod!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}
