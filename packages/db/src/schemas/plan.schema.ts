import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlanDocument = HydratedDocument<Plan>;

@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true })
  slug!: string;

  @Prop({ type: [String], default: [] })
  moduleIds!: string[];

  /** Monthly price in EUR cents (Stripe) */
  @Prop({ default: 0 })
  priceMonthlyCents!: number;

  @Prop()
  stripePriceId?: string;

  @Prop({ default: false })
  isFree!: boolean;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  description?: string;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
