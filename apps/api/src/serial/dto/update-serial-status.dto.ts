import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSerialStatusDto {
  @IsString()
  @MinLength(1)
  status!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
