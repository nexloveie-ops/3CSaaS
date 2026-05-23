import { IsEnum } from 'class-validator';

export class TransitionTransferDto {
  @IsEnum(['confirmed', 'shipped', 'received', 'cancelled'])
  status!: string;
}
