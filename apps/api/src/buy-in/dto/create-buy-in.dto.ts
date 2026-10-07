import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateBuyInDto {
  @IsString()
  @MinLength(1)
  brand!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsString()
  @MinLength(1)
  capacity!: string;

  @IsString()
  @MinLength(1)
  color!: string;

  @IsString()
  @MinLength(1)
  imeiSn!: string;

  @IsNumber()
  @Min(0)
  buyPrice!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsIn(['cash', 'bank_transfer'])
  paymentMethod!: 'cash' | 'bank_transfer';
}
