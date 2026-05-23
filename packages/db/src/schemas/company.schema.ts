import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ timestamps: true, collection: 'companies' })
export class Company {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  legalName?: string;

  @Prop({ trim: true })
  vatNumber?: string;

  /** Company / trade registration number (shown on repair receipts). */
  @Prop({ trim: true })
  registrationNumber?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  contactName?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ trim: true })
  bankAccount?: string;

  @Prop({ default: 'en' })
  defaultLocale!: string;

  @Prop({ type: [String], default: ['en', 'zh'] })
  enabledLocales!: string[];

  /** Per-locale UI string overrides, e.g. { zh: { nav: { products: '货品' } } } */
  @Prop({ type: Object, default: {} })
  localeOverrides!: Record<string, Record<string, unknown>>;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  stripeSubscriptionId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Plan' })
  planId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['active', 'past_due', 'read_only', 'cancelled'],
    default: 'active',
  })
  subscriptionStatus!: string;

  @Prop({ type: [String], default: ['core', 'pos', 'inventory'] })
  enabledModules!: string[];

  @Prop({
    type: [String],
    default: ['in_stock', 'reserved', 'sold', 'in_repair', 'damaged', 'written_off'],
  })
  serialStatuses!: string[];

  /** Optional HTTPS endpoint for event webhooks (audit-backed events). */
  @Prop({ trim: true })
  webhookUrl?: string;

  /** Delete audit events older than this many days (manual/dev purge). */
  @Prop({ default: 365, min: 30 })
  auditRetentionDays!: number;

  /** Optional paragraph shown in invite emails (max 500 chars). */
  @Prop({ trim: true, maxlength: 500 })
  inviteEmailNote?: string;

  @Prop({ trim: true, maxlength: 500 })
  inviteEmailNoteZh?: string;

  @Prop()
  lastAuditPurgeAt?: Date;

  @Prop({ default: 0, min: 0 })
  lastAuditPurgeDeleted?: number;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
