import { IsInt, Min } from 'class-validator';

export class SetPositionQuantityDto {
  @IsInt()
  @Min(0)
  quantity!: number;
}
