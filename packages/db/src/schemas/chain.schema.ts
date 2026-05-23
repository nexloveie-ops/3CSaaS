import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChainDocument = HydratedDocument<Chain>;

@Schema({ timestamps: true, collection: 'chains' })
export class Chain {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Store' }], default: [] })
  memberStoreIds!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Company' }], default: [] })
  memberCompanyIds!: Types.ObjectId[];
}

export const ChainSchema = SchemaFactory.createForClass(Chain);

@Schema({ timestamps: true, collection: 'stock_share_rules' })
export class StockShareRule {
  @Prop({ type: Types.ObjectId, ref: 'Chain', required: true, index: true })
  chainId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  sourceStoreId!: Types.ObjectId;

  @Prop({ required: true, enum: ['quantity', 'percent'] })
  mode!: string;

  @Prop({ required: true, min: 0 })
  value!: number;
}

export const StockShareRuleSchema = SchemaFactory.createForClass(StockShareRule);
export type StockShareRuleDocument = HydratedDocument<StockShareRule>;

@Schema({ timestamps: true, collection: 'daily_summaries' })
export class DailySummary {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  businessDate!: string;

  @Prop({ default: 0 })
  salesTotal!: number;

  @Prop({ default: 0 })
  salesCount!: number;

  @Prop({ default: 0 })
  cashTotal!: number;

  @Prop({ default: 0 })
  cardTotal!: number;

  @Prop({ default: 0 })
  otherTotal!: number;

  @Prop({ default: 0 })
  openWorkOrders!: number;
}

export const DailySummarySchema = SchemaFactory.createForClass(DailySummary);
export type DailySummaryDocument = HydratedDocument<DailySummary>;
DailySummarySchema.index({ storeId: 1, businessDate: 1 }, { unique: true });
