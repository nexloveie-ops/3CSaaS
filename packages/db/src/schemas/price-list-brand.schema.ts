import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceListBrandDocument = HydratedDocument<PriceListBrand>;

@Schema({ timestamps: true, collection: 'price_list_brands' })
export class PriceListBrand {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const PriceListBrandSchema = SchemaFactory.createForClass(PriceListBrand);
PriceListBrandSchema.index({ companyId: 1, name: 1 }, { unique: true });
