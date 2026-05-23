import { IsEnum } from 'class-validator';

export class UpdateB2bPaymentDto {
  @IsEnum(['unpaid', 'paid'])
  paymentStatus!: string;

  @IsEnum(['cash', 'card', 'other', 'bank_transfer'])
  paymentMethod!: string;
}
