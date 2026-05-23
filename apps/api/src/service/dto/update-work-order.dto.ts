import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { WorkOrderLineDto } from './work-order-line.dto';

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  issueDescription?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quotedPriceIncVat?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderLineDto)
  lines?: WorkOrderLineDto[];
}
