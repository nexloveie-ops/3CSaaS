import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderLine {
  @Prop({ type: Types.ObjectId, ref: 'Product' })
  productId?: Types.ObjectId;

  @Prop({ default: false })
  adHoc?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'CatalogCategory' })
  catalogCategoryId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  productName!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPriceIncVat!: number;

  @Prop({ required: true })
  taxScheme!: string;

  @Prop({ min: 0 })
  costPreTax?: number;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })
  serialUnitId?: Types.ObjectId;

  @Prop()
  sn?: string;

  @Prop({ default: 0 })
  lineTotalIncVat!: number;

  @Prop({ default: 0, min: 0 })
  refundedQuantity!: number;

  @Prop({ type: Types.ObjectId, ref: 'WorkOrder' })
  workOrderId?: Types.ObjectId;
}

export const OrderLineSchema = SchemaFactory.createForClass(OrderLine);

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  docNumber!: string;

  @Prop({ default: 'receipt', enum: ['receipt', 'invoice_b2b', 'credit_note'] })
  docType!: string;

  @Prop({ default: 'completed', enum: ['draft', 'completed', 'cancelled'] })
  status!: string;

  @Prop({ type: [OrderLineSchema], default: [] })
  lines!: OrderLine[];

  @Prop({ default: 0 })
  subtotalIncVat!: number;

  @Prop({ default: 0 })
  totalVat!: number;

  @Prop({ default: 0 })
  totalIncVat!: number;

  @Prop({
    required: true,
    enum: ['cash', 'card', 'mixed', 'other'],
    default: 'cash',
  })
  paymentMethod!: string;

  /** Cash portion (cash-only or mixed). */
  @Prop({ min: 0, default: 0 })
  cashAmount!: number;

  /** Card portion (card-only or mixed). */
  @Prop({ min: 0, default: 0 })
  cardAmount!: number;

  /** Cash received from customer (cash sales). */
  @Prop({ min: 0 })
  amountTendered?: number;

  /** Change returned (cash sales). */
  @Prop({ min: 0 })
  changeGiven?: number;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdByUserId?: Types.ObjectId;

  @Prop()
  businessDate?: string;

  @Prop()
  pdfStorageKey?: string;

  @Prop()
  pdfGeneratedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Preorder' })
  sourcePreorderId?: Types.ObjectId;

  /** Receipt refunded by this credit note. */
  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  sourceOrderId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ companyId: 1, docNumber: 1 }, { unique: true });
OrderSchema.index({ storeId: 1, businessDate: 1 });
OrderSchema.index({ sourceOrderId: 1 });
