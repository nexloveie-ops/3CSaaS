import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
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
    ]),
  ],
  controllers: [SerialController],
  providers: [SerialService],
  exports: [SerialService],
})
export class SerialModule {}
