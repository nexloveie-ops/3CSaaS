import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DailySummary,
  DailySummarySchema,
  Order,
  OrderSchema,
  TaxCategory,
  TaxCategorySchema,
  WorkOrder,
  WorkOrderSchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
      { name: DailySummary.name, schema: DailySummarySchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
