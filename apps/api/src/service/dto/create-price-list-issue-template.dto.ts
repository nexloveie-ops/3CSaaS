import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePriceListIssueTemplateDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsEnum(['template', 'custom'])
  kind?: 'template' | 'custom';

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
