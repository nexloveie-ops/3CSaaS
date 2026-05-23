import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InventoryPosition,
  InventoryPositionSchema,
  Product,
  ProductSchema,
  Store,
  StoreSchema,
  WarehouseScope,
  WarehouseScopeSchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: WarehouseScope.name, schema: WarehouseScopeSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: InventoryPosition.name, schema: InventoryPositionSchema },
    ]),
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService],
})
export class WarehouseModule {}
