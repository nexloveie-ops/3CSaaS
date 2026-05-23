import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TransferOrderDocument = HydratedDocument<TransferOrder>;

@Schema({ _id: false })
export class TransferLine {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitCostPreTax!: number;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })
  serialUnitId?: Types.ObjectId;
}

export const TransferLineSchema = SchemaFactory.createForClass(TransferLine);

@Schema({ timestamps: true, collection: 'transfer_orders' })
export class TransferOrder {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  docNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  fromStoreId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  toStoreId!: Types.ObjectId;

  @Prop({
    default: 'draft',
    enum: ['draft', 'confirmed', 'shipped', 'received', 'cancelled'],
  })
  status!: string;

  @Prop({ type: [TransferLineSchema], default: [] })
  lines!: TransferLine[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdByUserId?: Types.ObjectId;
}

export const TransferOrderSchema = SchemaFactory.createForClass(TransferOrder);
TransferOrderSchema.index({ companyId: 1, docNumber: 1 }, { unique: true });
