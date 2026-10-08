import { IsMongoId, IsNumber, Min } from 'class-validator';

export class StockInBuyInDto {
  @IsNumber()
  @Min(0.01)
  retailPrice!: number;

  @IsMongoId()
  catalogCategoryId!: string;

  @IsMongoId()
  taxCategoryId!: string;
}
