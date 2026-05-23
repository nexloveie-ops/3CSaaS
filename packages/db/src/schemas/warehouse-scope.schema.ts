import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WarehouseScopeDocument = HydratedDocument<WarehouseScope>;

@Schema({ timestamps: true, collection: 'warehouse_scopes' })
export class WarehouseScope {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, unique: true })
  warehouseStoreId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Store' }], default: [] })
  allowedStoreIds!: Types.ObjectId[];
}

export const WarehouseScopeSchema = SchemaFactory.createForClass(WarehouseScope);
