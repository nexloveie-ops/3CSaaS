import { Global, Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AuditEvent,
  AuditEventSchema,
  Company,
  CompanySchema,
  DocumentSequence,
  DocumentSequenceSchema,
  User,
  UserSchema,
} from '@lz3c/db';
import { AuditService } from './services/audit.service';
import { DocumentSequenceService } from './services/document-sequence.service';
import { PdfBrowserService } from './services/pdf-browser.service';
import { ReadOnlyGuard } from './guards/read-only.guard';
import { RolesGuard } from './guards/roles.guard';
import { SubscriptionGuard } from './guards/subscription.guard';
import { CompanyModule } from '../company/company.module';

@Global()
@Module({
  imports: [
    forwardRef(() => CompanyModule),
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: DocumentSequence.name, schema: DocumentSequenceSchema },
      { name: AuditEvent.name, schema: AuditEventSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    DocumentSequenceService,
    AuditService,
    PdfBrowserService,
    ReadOnlyGuard,
    RolesGuard,
    SubscriptionGuard,
  ],
  exports: [
    DocumentSequenceService,
    AuditService,
    PdfBrowserService,
    ReadOnlyGuard,
    RolesGuard,
    SubscriptionGuard,
    MongooseModule,
  ],
})
export class CommonModule {}
