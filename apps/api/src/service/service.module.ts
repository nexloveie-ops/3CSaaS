import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PriceListBrand,
  PriceListBrandSchema,
  PriceListIssueTemplate,
  PriceListIssueTemplateSchema,
  PriceListItem,
  PriceListItemSchema,
  PriceListModel,
  PriceListModelSchema,
  Product,
  ProductSchema,
  SerialEvent,
  SerialEventSchema,
  SerialUnit,
  SerialUnitSchema,
  Store,
  StoreSchema,
  TaxCategory,
  TaxCategorySchema,
  WorkOrder,
  WorkOrderSchema,
} from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { CompanyModule } from '../company/company.module';
import { NotificationModule } from '../notification/notification.module';
import { PriceListController } from './price-list.controller';
import { PriceListService } from './price-list.service';
import { WorkOrderController } from './work-order.controller';
import { WorkOrderReceiptService } from './work-order-receipt.service';
import { WorkOrderService } from './work-order.service';

@Module({
  imports: [
    CommonModule,
    CompanyModule,
    NotificationModule,
    MongooseModule.forFeature([
      { name: PriceListBrand.name, schema: PriceListBrandSchema },
      { name: PriceListModel.name, schema: PriceListModelSchema },
      { name: PriceListIssueTemplate.name, schema: PriceListIssueTemplateSchema },
      { name: PriceListItem.name, schema: PriceListItemSchema },
      { name: Product.name, schema: ProductSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
      { name: Store.name, schema: StoreSchema },
      { name: SerialUnit.name, schema: SerialUnitSchema },
      { name: SerialEvent.name, schema: SerialEventSchema },
    ]),
  ],
  controllers: [PriceListController, WorkOrderController],
  providers: [PriceListService, WorkOrderReceiptService, WorkOrderService],
  exports: [WorkOrderService],
})
export class ServiceModule {}
