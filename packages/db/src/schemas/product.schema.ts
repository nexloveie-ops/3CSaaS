import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['serialized', 'sku', 'simple', 'service'],
  })
  productType!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  skuCode?: string;

  @Prop({ trim: true })
  category?: string;

  @Prop({ type: Types.ObjectId, ref: 'CatalogCategory', index: true })
  catalogCategoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TaxCategory', required: true })
  taxCategoryId!: Types.ObjectId;

  /** Pre-tax cost — required for all products */
  @Prop({ required: true, min: 0 })
  costPrice!: number;

  /** Pre-tax wholesale (warehouse / B2B) */
  @Prop({ min: 0 })
  wholesalePrice?: number;

  /** Tax-included retail price */
  @Prop({ min: 0 })
  retailPrice?: number;

  @Prop({ default: true })
  isActive!: boolean;

  /** Parent simple product when this row is a variant SKU */
  @Prop({ type: Types.ObjectId, ref: 'Product', index: true })
  parentProductId?: Types.ObjectId;

  /** Up to 3 option axes on parent only, e.g. Model / Type / Color */
  @Prop({
    type: [
      {
        name: { type: String, required: true },
        values: { type: [String], required: true },
      },
    ],
    default: undefined,
  })
  variantDimensions?: { name: string; values: string[] }[];

  /** Selected value per axis on variant rows (same order as parent.variantDimensions) */
  @Prop({ type: [String], default: undefined })
  variantValues?: string[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ companyId: 1, skuCode: 1 }, { sparse: true });
ProductSchema.index({ companyId: 1, productType: 1 });
ProductSchema.index({ companyId: 1, parentProductId: 1 });
