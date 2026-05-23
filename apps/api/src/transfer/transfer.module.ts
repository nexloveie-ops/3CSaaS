import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Company,
  CompanySchema,
  Product,
  ProductSchema,
  SerialUnit,
  SerialUnitSchema,
  Store,
  StoreSchema,
  TransferOrder,
  TransferOrderSchema,
} from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { CompanyModule } from '../company/company.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TransferController } from './transfer.controller';
import { TransferPickListPdfService } from './transfer-pick-list-pdf.service';
import { TransferPickListService } from './transfer-pick-list.service';
import { TransferService } from './transfer.service';

@Module({
  imports: [
    CommonModule,
    CompanyModule,
    InventoryModule,
    MongooseModule.forFeature([
      { name: TransferOrder.name, schema: TransferOrderSchema },
      { name: Product.name, schema: ProductSchema },
      { name: SerialUnit.name, schema: SerialUnitSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [TransferController],
  providers: [TransferService, TransferPickListService, TransferPickListPdfService],
})
export class TransferModule {}
