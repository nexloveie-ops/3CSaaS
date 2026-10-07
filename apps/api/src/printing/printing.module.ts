import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Store, StoreSchema } from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { FeiePrintService } from './feie-print.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }]),
  ],
  providers: [FeiePrintService],
  exports: [FeiePrintService],
})
export class PrintingModule {}
