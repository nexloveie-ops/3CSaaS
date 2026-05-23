import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_LOCALES } from '@lz3c/shared';

export class UpdateCompanyLocaleDto {
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  defaultLocale?: string;

  @IsOptional()
  @IsArray()
  @IsIn([...SUPPORTED_LOCALES], { each: true })
  enabledLocales?: string[];

  @IsOptional()
  @IsObject()
  localeOverrides?: Record<string, Record<string, unknown>>;
}
