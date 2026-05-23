import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InventoryPositionDocument = HydratedDocument<InventoryPosition>;

@Schema({ timestamps: true, collection: 'inventory_positions' })
export class InventoryPosition {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, min: 0, default: 0 })
  quantity!: number;
}

export const InventoryPositionSchema =
  SchemaFactory.createForClass(InventoryPosition);
InventoryPositionSchema.index({ storeId: 1, productId: 1 }, { unique: true });
