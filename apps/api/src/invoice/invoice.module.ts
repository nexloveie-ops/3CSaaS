import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema, Invoice, InvoiceSchema } from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceController } from './invoice.controller';
import { InvoiceBuilderService } from './invoice-builder.service';
import { InvoiceHtmlService } from './invoice-html.service';
import { InvoicePdfService } from './invoice-pdf.service';
@Module({
  imports: [
    CommonModule,
    CompanyModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceBuilderService, InvoiceHtmlService, InvoicePdfService],
  exports: [InvoiceBuilderService, InvoiceHtmlService, InvoicePdfService],
})
export class InvoiceModule {}
