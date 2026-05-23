import { IsEmail, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'manager', 'cashier', 'warehouse_staff'])
  role!: string;

  @IsOptional()
  @IsMongoId()
  storeId?: string;
}
