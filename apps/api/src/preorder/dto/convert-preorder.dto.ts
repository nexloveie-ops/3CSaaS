import { IsEnum, IsOptional } from 'class-validator';

export class ConvertPreorderDto {
  @IsOptional()
  @IsEnum(['cash', 'card', 'other'])
  paymentMethod?: string;
}
