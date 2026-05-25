import { IsString, MaxLength } from 'class-validator';

export class UpdateStoreSalesTermsDto {
  @IsString()
  @MaxLength(4000)
  salesTerms!: string;
}
