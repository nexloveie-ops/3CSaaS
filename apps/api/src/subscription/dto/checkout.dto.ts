import { IsString, MinLength } from 'class-validator';

export class CheckoutDto {
  @IsString()
  @MinLength(1)
  planId!: string;

  @IsString()
  successUrl!: string;

  @IsString()
  cancelUrl!: string;
}
