import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TaxCategory, TaxCategorySchema } from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: TaxCategory.name, schema: TaxCategorySchema },
    ]),
  ],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
