import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  B2bOrder,
  B2bOrderSchema,
  Company,
  CompanySchema,
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
      { name: Product.name, schema: ProductSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: Store.name, schema: StoreSchema },
      { name: Company.name, schema: CompanySchema },
      { name: SerialUnit.name, schema: SerialUnitSchema },
    ]),
  ],
  controllers: [B2bController],
  providers: [B2bService],
  exports: [B2bService],
})
export class B2bModule {}
