import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type B2bOrderDocument = HydratedDocument<B2bOrder>;

@Schema({ _id: false })
export class B2bOrderLine {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitWholesalePreTax!: number;

  @Prop({ required: true, min: 0 })
  costPreTax!: number;

  @Prop({ required: true })
  taxScheme!: string;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })
  serialUnitId?: Types.ObjectId;
}

export const B2bOrderLineSchema = SchemaFactory.createForClass(B2bOrderLine);

@Schema({ timestamps: true, collection: 'b2b_orders' })
export class B2bOrder {
  @Prop({ required: true, trim: true })
  docNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  sellerCompanyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  sellerStoreId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  buyerCompanyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  buyerStoreId!: Types.ObjectId;

  @Prop({
    default: 'draft',
    enum: ['draft', 'confirmed', 'shipped', 'received', 'invoiced', 'cancelled'],
  })
  status!: string;

  @Prop({ default: 'unpaid', enum: ['unpaid', 'paid'] })
  paymentStatus!: string;

  @Prop({ enum: ['cash', 'card', 'other', 'bank_transfer'] })
  paymentMethod?: string;

  @Prop({ type: [B2bOrderLineSchema], default: [] })
  lines!: B2bOrderLine[];

  @Prop({ default: 0 })
  totalNetPreTax!: number;

  @Prop({ type: Types.ObjectId, ref: 'Invoice' })
  sellerInvoiceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Invoice' })
  buyerInvoiceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdByUserId?: Types.ObjectId;
}

export const B2bOrderSchema = SchemaFactory.createForClass(B2bOrder);
B2bOrderSchema.index({ sellerCompanyId: 1, docNumber: 1 }, { unique: true });
