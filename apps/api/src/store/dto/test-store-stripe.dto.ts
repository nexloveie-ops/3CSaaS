import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TestStoreStripeDto {
  @IsString()
  @MaxLength(500)
  stripePublishableKey!: string;

  @IsString()
  @MaxLength(500)
  stripeSecretKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stripeLocationId?: string;
}
