import { IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateSerialDto {
  @IsMongoId()
  productId!: string;

  @IsMongoId()
  storeId!: string;

  @IsString()
  @MinLength(1)
  sn!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
