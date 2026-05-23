import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Company,
  CompanySchema,
  CompanyInvite,
  CompanyInviteSchema,
  Membership,
  MembershipSchema,
  TaxCategory,
  TaxCategorySchema,
  User,
  UserSchema,
} from '@lz3c/db';
import { CompanyController } from './company.controller';
import { CompanyInviteService } from './company-invite.service';
import { CompanyService } from './company.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyInvite.name, schema: CompanyInviteSchema },
    ]),
  ],
  controllers: [CompanyController],
  providers: [CompanyService, CompanyInviteService],
  exports: [CompanyService, CompanyInviteService, MongooseModule],
})
export class CompanyModule {}
