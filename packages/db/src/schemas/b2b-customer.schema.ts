import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type B2bCustomerDocument = HydratedDocument<B2bCustomer>;

@Schema({ timestamps: true, collection: 'b2b_customers' })
export class B2bCustomer {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  /** Company / trade name */
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  registrationNumber!: string;

  @Prop({ required: true, trim: true })
  address!: string;

  @Prop({ required: true, trim: true })
  email!: string;

  @Prop({ required: true, trim: true })
  phone!: string;

  @Prop({ trim: true })
  vatNumber?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const B2bCustomerSchema = SchemaFactory.createForClass(B2bCustomer);
B2bCustomerSchema.index({ companyId: 1, name: 1 });
