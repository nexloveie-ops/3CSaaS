import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  B2bCustomer,
  B2bCustomerSchema,
  B2bOrder,
  B2bOrderSchema,
  Company,
  CompanySchema,
  Order,
  OrderSchema,
  Product,
  ProductSchema,
  SerialUnit,
  SerialUnitSchema,
  Store,
  StoreSchema,
  TaxCategory,
  TaxCategorySchema,
} from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { CompanyModule } from '../company/company.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { B2bCustomerController } from './b2b-customer.controller';
import { B2bCustomerService } from './b2b-customer.service';
import { B2bController } from './b2b.controller';
import { B2bService } from './b2b.service';

@Module({
  imports: [
    CommonModule,
    CompanyModule,
    InventoryModule,
    InvoiceModule,
    MongooseModule.forFeature([
      { name: B2bOrder.name, schema: B2bOrderSchema },
      { name: B2bCustomer.name, schema: B2bCustomerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: Store.name, schema: StoreSchema },
      { name: Company.name, schema: CompanySchema },
      { name: SerialUnit.name, schema: SerialUnitSchema },
    ]),
  ],
  controllers: [B2bController, B2bCustomerController],
  providers: [B2bService, B2bCustomerService],
  exports: [B2bService, B2bCustomerService],
})
export class B2bModule {}
