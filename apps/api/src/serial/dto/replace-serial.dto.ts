import { IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ReplaceSerialDto {
  @IsString()
  @MinLength(1)
  newSn!: string;

  @IsOptional()
  @IsMongoId()
  storeId?: string;

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
