import { IsArray, IsMongoId } from 'class-validator';

export class UpdateWarehouseScopeDto {
  @IsArray()
  @IsMongoId({ each: true })
  allowedStoreIds!: string[];
}
