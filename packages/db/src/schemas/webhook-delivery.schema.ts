import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebhookDeliveryDocument = HydratedDocument<WebhookDelivery>;

@Schema({ timestamps: true, collection: 'webhook_deliveries' })
export class WebhookDelivery {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  event!: string;

  @Prop({ required: true, trim: true })
  url!: string;

  @Prop({ required: true, enum: ['success', 'failed'] })
  status!: string;

  @Prop()
  httpStatus?: number;

  @Prop({ required: true, default: 1, min: 1 })
  attempts!: number;

  @Prop({ trim: true })
  lastError?: string;

  @Prop({ type: Object })
  payload?: Record<string, unknown>;
}

export const WebhookDeliverySchema = SchemaFactory.createForClass(WebhookDelivery);
WebhookDeliverySchema.index({ companyId: 1, createdAt: -1 });
