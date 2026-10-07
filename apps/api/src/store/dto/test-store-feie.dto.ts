import { IsString, MaxLength, MinLength } from 'class-validator';

export class TestStoreFeieDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  feiePrinterSn!: string;
}
