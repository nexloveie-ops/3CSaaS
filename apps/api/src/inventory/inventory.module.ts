import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InboundReceipt,
  InboundReceiptSchema,
  InventoryPosition,
  InventoryPositionSchema,
  Product,
  ProductSchema,
  SerialEvent,
  SerialEventSchema,
  SerialUnit,
  SerialUnitSchema,
} from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { CompanyModule } from '../company/company.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    CommonModule,
    CompanyModule,
    MongooseModule.forFeature([
      { name: InventoryPosition.name, schema: InventoryPositionSchema },
      { name: InboundReceipt.name, schema: InboundReceiptSchema },
      { name: Product.name, schema: ProductSchema },
      { name: SerialUnit.name, schema: SerialUnitSchema },
      { name: SerialEvent.name, schema: SerialEventSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
