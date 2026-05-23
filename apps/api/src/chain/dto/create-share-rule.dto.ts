import { IsEnum, IsMongoId, IsNumber, Min } from 'class-validator';

export class CreateShareRuleDto {
  @IsMongoId()
  sourceStoreId!: string;

  @IsEnum(['quantity', 'percent'])
  mode!: string;

  @IsNumber()
  @Min(0)
  value!: number;
}
