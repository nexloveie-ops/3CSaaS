import { IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsIn(['admin', 'manager', 'cashier', 'warehouse_staff'])
  role?: string;

  @IsOptional()
  @IsMongoId()
  storeId?: string;
}
