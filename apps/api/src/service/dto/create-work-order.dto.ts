import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { WorkOrderLineDto } from './work-order-line.dto';

export { WorkOrderLineDto } from './work-order-line.dto';

export class CreateWorkOrderDto {
  @IsOptional()
  @IsEnum(['in_store', 'send_out'])
  flowType?: string;

  @IsOptional()
  @IsMongoId()
  serialUnitId?: string;

  @IsNotEmpty()
  @IsString()
  customerPhone!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsString()
  deviceBrand?: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  imeiSn?: string;

  @IsOptional()
  @IsString()
  issueDescription?: string;

  @IsOptional()
  @IsMongoId()
  priceListItemId?: string;

  @IsOptional()
  @IsString()
  repairLocation?: string;

  @IsOptional()
  @IsDateString()
  expectedCompletionAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderLineDto)
  lines?: WorkOrderLineDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  quotedPriceIncVat?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
