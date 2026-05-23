import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Company,
  CompanySchema,
  Order,
  OrderSchema,
  Product,
  ProductSchema,
  Store,
  StoreSchema,
  TaxCategory,
  TaxCategorySchema,
  WorkOrder,
  WorkOrderSchema,
} from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { CompanyModule } from '../company/company.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReportModule } from '../report/report.module';
import { PosController } from './pos.controller';
import { PosReceiptPdfService } from './pos-receipt-pdf.service';
import { PosReceiptService } from './pos-receipt.service';
import { PosService } from './pos.service';

@Module({
  imports: [
    CommonModule,
    CompanyModule,
    InventoryModule,
    ReportModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: Store.name, schema: StoreSchema },
      { name: Company.name, schema: CompanySchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
    ]),
  ],
  controllers: [PosController],
  providers: [PosService, PosReceiptService, PosReceiptPdfService],
  exports: [PosService],
})
export class PosModule {}
