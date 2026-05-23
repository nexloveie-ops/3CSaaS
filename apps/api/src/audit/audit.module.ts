import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { AuditController } from './audit.controller';

@Module({
  imports: [CompanyModule],
  controllers: [AuditController],
})
export class AuditModule {}
