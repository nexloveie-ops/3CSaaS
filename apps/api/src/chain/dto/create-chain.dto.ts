import { IsArray, IsMongoId, IsString, MinLength } from 'class-validator';

export class CreateChainDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @IsMongoId({ each: true })
  storeIds!: string[];
}
