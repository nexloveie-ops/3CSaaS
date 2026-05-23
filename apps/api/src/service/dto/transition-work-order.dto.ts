import { IsEnum, IsMongoId, IsOptional } from 'class-validator';

export class TransitionWorkOrderDto {
  @IsEnum([
    'in_progress',
    'sent_out',
    'in_repair',
    'returned',
    'awaiting_payment',
    'completed',
    'cancelled',
  ])
  status!: string;

  @IsOptional()
  @IsMongoId()
  paymentOrderId?: string;

  @IsOptional()
  @IsEnum(['successful', 'failed'])
  completionResult?: string;
}
