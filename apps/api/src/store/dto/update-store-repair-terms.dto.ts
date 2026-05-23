import { IsString, MaxLength } from 'class-validator';

export class UpdateStoreRepairTermsDto {
  @IsString()
  @MaxLength(4000)
  repairTerms!: string;
}
