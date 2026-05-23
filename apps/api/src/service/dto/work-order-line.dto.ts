import { IsNumber, IsString, Min } from 'class-validator';

export class WorkOrderLineDto {
  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  priceIncVat!: number;
}
