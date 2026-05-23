import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class PayDepositDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(['cash', 'card', 'other'])
  paymentMethod?: string;
}
