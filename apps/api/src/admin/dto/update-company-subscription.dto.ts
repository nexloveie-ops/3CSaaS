import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCompanySubscriptionDto {
  @IsOptional()
  @IsEnum(['active', 'past_due', 'read_only', 'cancelled'])
  subscriptionStatus?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @IsOptional()
  @IsString()
  planId?: string;
}
