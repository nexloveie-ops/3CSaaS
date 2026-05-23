import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCatalogCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
