import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SerialEventDocument = HydratedDocument<SerialEvent>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'serial_events' })
export class SerialEvent {
  @Prop({ type: Types.ObjectId, ref: 'SerialUnit', required: true, index: true })
  serialUnitId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop()
  fromStatus?: string;

  @Prop()
  toStatus?: string;

  @Prop()
  refType?: string;

  @Prop({ type: Types.ObjectId })
  refId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  byUserId?: Types.ObjectId;
}

export const SerialEventSchema = SchemaFactory.createForClass(SerialEvent);
SerialEventSchema.index({ serialUnitId: 1, createdAt: -1 });
