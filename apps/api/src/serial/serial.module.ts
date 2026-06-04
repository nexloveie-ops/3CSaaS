import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InventoryPosition,
  InventoryPositionSchema,
  Product,
  ProductSchema,
  SerialEvent,
  SerialEventSchema,
  SerialUnit,
  SerialUnitSchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { SerialController } from './serial.controller';
import { SerialService } from './serial.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: SerialUnit.name, schema: SerialUnitSchema },
      { name: SerialEvent.name, schema: SerialEventSchema },
      { name: Product.name, schema: ProductSchema },
      { name: InventoryPosition.name, schema: InventoryPositionSchema },
    ]),
  ],
  controllers: [SerialController],
  providers: [SerialService],
  exports: [SerialService],
})
export class SerialModule {}
