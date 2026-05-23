import { IsArray, IsMongoId } from 'class-validator';

export class UpdateChainMembersDto {
  @IsArray()
  @IsMongoId({ each: true })
  storeIds!: string[];
}
