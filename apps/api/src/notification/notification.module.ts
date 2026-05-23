import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Company,
  CompanySchema,
  Membership,
  MembershipSchema,
  User,
  UserSchema,
  WebhookDelivery,
  WebhookDeliverySchema,
} from '@lz3c/db';
import { AuditPurgeNotifyService } from './audit-purge-notify.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WebhookService } from './webhook.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: WebhookDelivery.name, schema: WebhookDeliverySchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [SmsService, EmailService, WebhookService, AuditPurgeNotifyService],
  exports: [SmsService, EmailService, WebhookService, AuditPurgeNotifyService],
})
export class NotificationModule {}
