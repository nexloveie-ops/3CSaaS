import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BuyIn,
  BuyInSchema,
  CatalogCategory,
  CatalogCategorySchema,
  InventoryPosition,
  InventoryPositionSchema,
  Product,
  ProductSchema,
  SerialEvent,
  SerialEventSchema,
  SerialUnit,
  SerialUnitSchema,
  TaxCategory,
  TaxCategorySchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { BuyInController } from './buy-in.controller';
import { BuyInService } from './buy-in.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: BuyIn.name, schema: BuyInSchema },
      { name: CatalogCategory.name, schema: CatalogCategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: SerialUnit.name, schema: SerialUnitSchema },
      { name: SerialEvent.name, schema: SerialEventSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: InventoryPosition.name, schema: InventoryPositionSchema },
    ]),
  ],
  controllers: [BuyInController],
  providers: [BuyInService],
})
export class BuyInModule {}
