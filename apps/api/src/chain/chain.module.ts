import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Chain,
  ChainSchema,
  InventoryPosition,
  InventoryPositionSchema,
  Product,
  ProductSchema,
  StockShareRule,
  StockShareRuleSchema,
  Store,
  StoreSchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { ChainController } from './chain.controller';
import { ChainService } from './chain.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: Chain.name, schema: ChainSchema },
      { name: StockShareRule.name, schema: StockShareRuleSchema },
      { name: Store.name, schema: StoreSchema },
      { name: InventoryPosition.name, schema: InventoryPositionSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [ChainController],
  providers: [ChainService],
})
export class ChainModule {}
