import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InvoiceDocument = HydratedDocument<Invoice>;

@Schema({ _id: false })
export class InvoiceParty {
  @Prop({ required: true })
  name!: string;

  @Prop()
  legalName?: string;

  @Prop()
  vatNumber?: string;

  @Prop()
  address?: string;

  @Prop()
  contactName?: string;

  @Prop()
  contactPhone?: string;

  @Prop()
  contactEmail?: string;

  @Prop()
  bankAccount?: string;
}

export const InvoicePartySchema = SchemaFactory.createForClass(InvoiceParty);

@Schema({ _id: false })
export class InvoiceLine {
  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPricePreTax!: number;

  @Prop({ required: true, min: 0 })
  lineNetPreTax!: number;

  @Prop({ default: 0 })
  lineVat!: number;
}

export const InvoiceLineSchema = SchemaFactory.createForClass(InvoiceLine);

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  docNumber!: string;

  @Prop({ required: true, enum: ['invoice_b2b_seller', 'invoice_b2b_buyer'] })
  docType!: string;

  @Prop({ required: true, enum: ['seller', 'buyer'] })
  perspective!: string;

  @Prop({ type: Types.ObjectId, ref: 'B2bOrder' })
  b2bOrderId?: Types.ObjectId;

  @Prop({ type: InvoicePartySchema, required: true })
  seller!: InvoiceParty;

  @Prop({ type: InvoicePartySchema, required: true })
  buyer!: InvoiceParty;

  @Prop({ type: [InvoiceLineSchema], default: [] })
  lines!: InvoiceLine[];

  @Prop({ default: 0 })
  subtotalPreTax!: number;

  @Prop({ default: 0 })
  totalVat!: number;

  @Prop({ default: 0 })
  totalPayable!: number;

  /** Storage key, e.g. invoices/{companyId}/{invoiceId}.pdf */
  @Prop()
  pdfStorageKey?: string;

  @Prop()
  pdfGeneratedAt?: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ companyId: 1, docNumber: 1 }, { unique: true });
