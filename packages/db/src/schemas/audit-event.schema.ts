import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

@Schema({ timestamps: true, collection: 'audit_events' })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store' })
  storeId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  action!: string;

  @Prop({ required: true, trim: true })
  entityType!: string;

  @Prop({ trim: true })
  entityId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
AuditEventSchema.index({ companyId: 1, createdAt: -1 });
