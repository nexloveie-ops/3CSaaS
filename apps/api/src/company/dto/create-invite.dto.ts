import { IsEmail, IsIn, IsMongoId, IsOptional } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'manager', 'cashier', 'warehouse_staff'])
  role!: string;

  @IsOptional()
  @IsMongoId()
  storeId?: string;

  /** Preview only: override email locale (en/zh). */
  @IsOptional()
  @IsIn(['en', 'zh'])
  locale?: 'en' | 'zh';
}
