import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema } from '@lz3c/db';
import { CommonModule } from '../common/common.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [
    CommonModule,
    MongooseModule.forFeature([{ name: Company.name, schema: CompanySchema }]),
  ],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
