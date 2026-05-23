import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkOrderDocument = HydratedDocument<WorkOrder>;

@Schema({ _id: false })
export class WorkOrderLine {
  @Prop({ trim: true })
  description!: string;

  @Prop({ min: 0 })
  priceIncVat!: number;
}

export const WorkOrderLineSchema = SchemaFactory.createForClass(WorkOrderLine);

@Schema({ timestamps: true, collection: 'work_orders' })
export class WorkOrder {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  docNumber!: string;

  @Prop({ required: true, enum: ['in_store', 'send_out'] })
  flowType!: string;

  @Prop({
    required: true,
    default: 'draft',
    enum: [
      'draft',
      'in_progress',
      'sent_out',
      'in_repair',
      'returned',
      'awaiting_payment',
      'completed',
      'cancelled',
    ],
  })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit', index: true })
  serialUnitId?: Types.ObjectId;

  /** Customer device IMEI/SN or linked inventory serial display. */
  @Prop({ trim: true })
  serialSn?: string;

  @Prop({ trim: true })
  deviceBrand?: string;

  @Prop({ trim: true })
  deviceModel?: string;

  @Prop({ trim: true })
  imeiSn?: string;

  /** External repair shop; empty means in-store (self) repair. */
  @Prop({ trim: true })
  repairLocation?: string;

  @Prop()
  expectedCompletionAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'PriceListItem' })
  priceListItemId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ trim: true })
  customerPhone?: string;

  @Prop({ trim: true })
  customerName?: string;

  @Prop()
  issueDescription?: string;

  @Prop({ type: [WorkOrderLineSchema], default: [] })
  lines!: WorkOrderLine[];

  @Prop({ default: 0, min: 0 })
  quotedPriceIncVat!: number;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  paymentOrderId?: Types.ObjectId;

  /** Set when repair is marked complete from in_progress / returned. */
  @Prop({ enum: ['successful', 'failed'] })
  completionResult?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedToUserId?: Types.ObjectId;

  @Prop()
  notes?: string;
}

export const WorkOrderSchema = SchemaFactory.createForClass(WorkOrder);
WorkOrderSchema.index({ companyId: 1, docNumber: 1 }, { unique: true });
WorkOrderSchema.index({ storeId: 1, status: 1 });
