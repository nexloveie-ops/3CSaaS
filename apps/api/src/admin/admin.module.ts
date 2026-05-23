import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema, Plan, PlanSchema, User, UserSchema } from '@lz3c/db';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';

@Module({
  imports: [
    CommonModule,
    MaintenanceModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, SuperAdminGuard],
  exports: [AdminService, SuperAdminGuard],
})
export class AdminModule {}
