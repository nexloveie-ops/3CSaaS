import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoreProductSettingDocument = HydratedDocument<StoreProductSetting>;

/** Per-store product flags: POS sell toggle (cashier) and chain share (store manager). */
@Schema({ timestamps: true, collection: 'store_product_settings' })
export class StoreProductSetting {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  /** Cashier: available to sell at POS (product always visible in catalog). */
  @Prop({ default: true })
  posSalable!: boolean;

  /** Store manager: visible and sellable to chain / group member stores. */
  @Prop({ default: false })
  chainShareEnabled!: boolean;
}

export const StoreProductSettingSchema =
  SchemaFactory.createForClass(StoreProductSetting);
StoreProductSettingSchema.index({ storeId: 1, productId: 1 }, { unique: true });
