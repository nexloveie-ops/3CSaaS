import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaxCategoryDocument = HydratedDocument<TaxCategory>;

@Schema({ timestamps: true, collection: 'tax_categories' })
export class TaxCategory {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    required: true,
    enum: ['zero', 'standard_13_5', 'standard_23', 'margin_23'],
  })
  scheme!: string;

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const TaxCategorySchema = SchemaFactory.createForClass(TaxCategory);
TaxCategorySchema.index({ companyId: 1, name: 1 }, { unique: true });
