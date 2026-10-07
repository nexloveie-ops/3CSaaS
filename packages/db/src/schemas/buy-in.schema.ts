import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BuyInDocument = HydratedDocument<BuyIn>;

@Schema({ timestamps: true, collection: 'buy_ins' })
export class BuyIn {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  brand!: string;

  @Prop({ required: true, trim: true })
  model!: string;

  @Prop({ required: true, trim: true })
  capacity!: string;

  @Prop({ required: true, trim: true })
  color!: string;

  @Prop({ required: true, trim: true })
  imeiSn!: string;

  @Prop({ required: true, trim: true })
  customerName!: string;

  @Prop({ required: true, trim: true })
  customerPhone!: string;

  @Prop({ required: true, min: 0 })
  buyPrice!: number;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, enum: ['cash', 'bank_transfer'] })
  paymentMethod!: string;

  /** 1 = buy-in form, 2 = IMEI, 3 = phone with the form. */
  @Prop({ type: [Number], default: [] })
  photoSlots!: number[];

  @Prop({
    required: true,
    enum: ['draft', 'pending_inspection', 'stocked'],
    default: 'draft',
    index: true,
  })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  productId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })
  serialUnitId?: Types.ObjectId;

  @Prop({ min: 0 })
  retailPrice?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const BuyInSchema = SchemaFactory.createForClass(BuyIn);
BuyInSchema.index({ companyId: 1, storeId: 1, status: 1, createdAt: -1 });
