import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateStoreProductSettingDto {
  @IsOptional()
  @IsBoolean()
  posSalable?: boolean;

  @IsOptional()
  @IsBoolean()
  chainShareEnabled?: boolean;
}
