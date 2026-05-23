import { IsEnum } from 'class-validator';

export class TransitionB2bDto {
  @IsEnum(['confirmed', 'shipped', 'received', 'invoiced', 'cancelled'])
  status!: string;
}
