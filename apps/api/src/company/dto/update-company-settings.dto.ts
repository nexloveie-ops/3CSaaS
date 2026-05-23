import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  auditRetentionDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteEmailNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteEmailNoteZh?: string;
}
