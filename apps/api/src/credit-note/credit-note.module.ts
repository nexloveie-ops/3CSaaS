import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Company,
  CompanySchema,
  Order,
  OrderSchema,
  Preorder,
  PreorderSchema,
  Store,
  StoreSchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { CreditNoteController } from './credit-note.controller';
import { CreditNotePrintService } from './credit-note-print.service';
import { CreditNoteService } from './credit-note.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Store.name, schema: StoreSchema },
      { name: Preorder.name, schema: PreorderSchema },
    ]),
  ],
  controllers: [CreditNoteController],
  providers: [CreditNoteService, CreditNotePrintService],
})
export class CreditNoteModule {}
