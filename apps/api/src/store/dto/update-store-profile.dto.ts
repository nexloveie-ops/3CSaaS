import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStoreProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsBoolean()
  warehouseEnabled?: boolean;

  /** Stripe publishable key (pk_test_… / pk_live_…). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  stripePublishableKey?: string;

  /** Stripe secret or restricted key (sk_… / rk_…). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  stripeSecretKey?: string;

  /** Stripe Terminal location id (tml_…). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stripeLocationId?: string;

  /** Feie printer SN for this store. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  feiePrinterSn?: string;
}
