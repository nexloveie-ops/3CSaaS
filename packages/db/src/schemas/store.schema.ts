import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoreDocument = HydratedDocument<Store>;

@Schema({ timestamps: true, collection: 'stores' })
export class Store {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  email?: string;

  /** Terms & conditions on repair intake receipts (editable by store staff). */
  @Prop({ trim: true, maxlength: 4000 })
  repairTerms?: string;

  @Prop({ default: false })
  warehouseEnabled!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const StoreSchema = SchemaFactory.createForClass(Store);
