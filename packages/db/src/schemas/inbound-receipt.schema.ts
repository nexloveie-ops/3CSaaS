import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InboundReceiptDocument = HydratedDocument<InboundReceipt>;

@Schema({ _id: false })
export class InboundLine {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ min: 0 })
  unitCost?: number;

  @Prop({ type: [String], default: [] })
  serialNumbers?: string[];
}

export const InboundLineSchema = SchemaFactory.createForClass(InboundLine);

@Schema({ timestamps: true, collection: 'inbound_receipts' })
export class InboundReceipt {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  docNumber!: string;

  @Prop({ type: [InboundLineSchema], default: [] })
  lines!: InboundLine[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdByUserId?: Types.ObjectId;

  @Prop()
  notes?: string;

  @Prop({ trim: true })
  supplier?: string;

  @Prop({ type: Date })
  receivedAt?: Date;
}

export const InboundReceiptSchema = SchemaFactory.createForClass(InboundReceipt);
InboundReceiptSchema.index({ companyId: 1, docNumber: 1 }, { unique: true });
