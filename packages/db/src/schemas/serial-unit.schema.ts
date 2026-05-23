import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SerialUnitDocument = HydratedDocument<SerialUnit>;

@Schema({ timestamps: true, collection: 'serial_units' })
export class SerialUnit {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  sn!: string;

  @Prop({ required: true, default: 'in_stock' })
  status!: string;

  @Prop({ required: true, min: 0 })
  purchaseCost!: number;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  currentStoreId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })
  replacesSnId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })
  replacedBySnId?: Types.ObjectId;

  @Prop()
  notes?: string;
}

export const SerialUnitSchema = SchemaFactory.createForClass(SerialUnit);
SerialUnitSchema.index({ companyId: 1, sn: 1 }, { unique: true });
