import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class CreateTerminalPaymentDto {
  /** Amount in euros, including VAT. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  amount!: number;
}
