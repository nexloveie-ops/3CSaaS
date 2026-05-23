import { IsIn, IsString } from 'class-validator';
import { SUPPORTED_LOCALES } from '@lz3c/shared';

export class UpdateLocaleDto {
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale!: string;
}
