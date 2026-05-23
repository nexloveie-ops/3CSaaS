import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentSequenceDocument = HydratedDocument<DocumentSequence>;

@Schema({ collection: 'document_sequences' })
export class DocumentSequence {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  docType!: string;

  @Prop({ required: true })
  year!: number;

  @Prop({ required: true, default: 0 })
  lastNumber!: number;
}

export const DocumentSequenceSchema =
  SchemaFactory.createForClass(DocumentSequence);
DocumentSequenceSchema.index({ companyId: 1, docType: 1, year: 1 }, { unique: true });
