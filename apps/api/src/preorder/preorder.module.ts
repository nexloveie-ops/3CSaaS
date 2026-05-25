import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import {

  Order,

  OrderSchema,

  Preorder,

  PreorderSchema,

  Product,

  ProductSchema,

  Store,

  StoreSchema,

  TaxCategory,

  TaxCategorySchema,

} from '@lz3c/db';

import { CommonModule } from '../common/common.module';

import { CompanyModule } from '../company/company.module';

import { InventoryModule } from '../inventory/inventory.module';

import { NotificationModule } from '../notification/notification.module';

import { PosModule } from '../pos/pos.module';

import { PreorderController } from './preorder.controller';

import { PreorderService } from './preorder.service';



@Module({

  imports: [

    CommonModule,

    CompanyModule,

    NotificationModule,

    InventoryModule,

    PosModule,

    MongooseModule.forFeature([

      { name: Preorder.name, schema: PreorderSchema },

      { name: Order.name, schema: OrderSchema },

      { name: Product.name, schema: ProductSchema },

      { name: TaxCategory.name, schema: TaxCategorySchema },

      { name: Store.name, schema: StoreSchema },

    ]),

  ],

  controllers: [PreorderController],

  providers: [PreorderService],

})

export class PreorderModule {}


