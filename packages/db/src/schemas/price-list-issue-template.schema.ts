import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceListIssueTemplateDocument = HydratedDocument<PriceListIssueTemplate>;

@Schema({ timestamps: true, collection: 'price_list_issue_templates' })
export class PriceListIssueTemplate {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  label!: string;

  /** template = predefined column; custom = added while pricing */
  @Prop({ required: true, enum: ['template', 'custom'], default: 'template' })
  kind!: 'template' | 'custom';

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const PriceListIssueTemplateSchema =
  SchemaFactory.createForClass(PriceListIssueTemplate);
PriceListIssueTemplateSchema.index({ companyId: 1, label: 1 }, { unique: true });
