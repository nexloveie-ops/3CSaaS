import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema, Plan, PlanSchema } from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, StripeService],
  exports: [SubscriptionService, StripeService],
})
export class SubscriptionModule {}
