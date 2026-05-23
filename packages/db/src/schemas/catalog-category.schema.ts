import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CatalogCategoryDocument = HydratedDocument<CatalogCategory>;

@Schema({ timestamps: true, collection: 'catalog_categories' })
export class CatalogCategory {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CatalogCategorySchema = SchemaFactory.createForClass(CatalogCategory);
CatalogCategorySchema.index({ companyId: 1, name: 1 }, { unique: true });
