import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceListModelDocument = HydratedDocument<PriceListModel>;

@Schema({ timestamps: true, collection: 'price_list_models' })
export class PriceListModel {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PriceListBrand', required: true, index: true })
  brandId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const PriceListModelSchema = SchemaFactory.createForClass(PriceListModel);
PriceListModelSchema.index({ companyId: 1, brandId: 1, name: 1 }, { unique: true });
