import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateChainDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
