import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument, Types } from 'mongoose';



export type PreorderDocument = HydratedDocument<Preorder>;



@Schema({ _id: false })

export class PreorderLine {

  @Prop({ required: true, trim: true })

  productName!: string;



  @Prop({ default: 1, min: 1 })

  quantity!: number;



  @Prop({ min: 0 })

  estimatedPriceIncVat?: number;



  @Prop({ type: Types.ObjectId, ref: 'CatalogCategory' })

  catalogCategoryId?: Types.ObjectId;



  @Prop({ type: Types.ObjectId, ref: 'TaxCategory' })

  taxCategoryId?: Types.ObjectId;



  /** Legacy catalog lines */

  @Prop({ type: Types.ObjectId, ref: 'Product' })

  productId?: Types.ObjectId;



  @Prop({ min: 0 })

  unitPriceIncVat?: number;



  @Prop({ type: Types.ObjectId, ref: 'SerialUnit' })

  serialUnitId?: Types.ObjectId;

}



export const PreorderLineSchema = SchemaFactory.createForClass(PreorderLine);



@Schema({ timestamps: true, collection: 'preorders' })

export class Preorder {

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })

  companyId!: Types.ObjectId;



  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })

  storeId!: Types.ObjectId;



  @Prop({ required: true, trim: true })

  docNumber!: string;



  @Prop({

    required: true,

    default: 'pending',

    enum: [

      'pending',

      'arrived',

      'completed',

      'cancelled',

      // legacy

      'draft',

      'deposit_paid',

      'ready',

      'converted_to_sale',

      'closed',

    ],

  })

  status!: string;



  @Prop({ required: true, trim: true })

  customerPhone!: string;



  @Prop({ trim: true })

  customerName?: string;



  @Prop({ trim: true, lowercase: true })

  customerEmail?: string;



  /** YYYY-MM-DD */

  @Prop({ trim: true })

  expectedArrivalDate?: string;



  @Prop({ type: Types.ObjectId, ref: 'Customer' })

  customerId?: Types.ObjectId;



  @Prop({ type: [PreorderLineSchema], default: [] })

  lines!: PreorderLine[];



  @Prop({ default: 0, min: 0 })

  depositAmount!: number;



  @Prop({ default: 0, min: 0 })

  totalIncVat!: number;



  @Prop({ default: 'cash', enum: ['cash', 'card', 'other'] })

  depositPaymentMethod?: string;



  @Prop({ type: Types.ObjectId, ref: 'Order' })

  saleOrderId?: Types.ObjectId;



  @Prop({ type: Types.ObjectId, ref: 'Order' })

  creditNoteId?: Types.ObjectId;



  @Prop()

  arrivedAt?: Date;



  @Prop()

  completedAt?: Date;



  @Prop({ enum: ['email', 'sms', 'both'] })

  notifiedVia?: string;



  @Prop()

  notifiedAt?: Date;

}



export const PreorderSchema = SchemaFactory.createForClass(Preorder);

PreorderSchema.index({ companyId: 1, docNumber: 1 }, { unique: true });

PreorderSchema.index({ storeId: 1, status: 1, updatedAt: -1 });

