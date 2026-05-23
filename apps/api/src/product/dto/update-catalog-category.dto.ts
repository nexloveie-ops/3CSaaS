import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCatalogCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
