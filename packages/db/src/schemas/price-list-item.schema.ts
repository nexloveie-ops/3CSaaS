import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceListItemDocument = HydratedDocument<PriceListItem>;

@Schema({ timestamps: true, collection: 'price_list_items' })
export class PriceListItem {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PriceListModel', index: true })
  modelId?: Types.ObjectId;

  /** Legacy flat rows (pre catalog setup). */
  @Prop({ trim: true })
  brand?: string;

  @Prop({ trim: true })
  model?: string;

  @Prop({ required: true, trim: true })
  issue!: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  serviceProductId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TaxCategory', required: true })
  taxCategoryId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  priceIncVat!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export const PriceListItemSchema = SchemaFactory.createForClass(PriceListItem);
PriceListItemSchema.index({ companyId: 1, modelId: 1, issue: 1 });
PriceListItemSchema.index({ companyId: 1, brand: 1, model: 1, issue: 1 });
