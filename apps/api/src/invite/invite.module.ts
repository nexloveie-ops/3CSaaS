import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { InviteController } from './invite.controller';

@Module({
  imports: [CompanyModule],
  controllers: [InviteController],
})
export class InviteModule {}
