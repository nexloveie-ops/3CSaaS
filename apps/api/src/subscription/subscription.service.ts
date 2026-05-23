import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument, Plan, PlanDocument } from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { StripeService } from './stripe.service';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private companyService: CompanyService,
    private stripeService: StripeService,
  ) {}

  async listPublicPlans() {
    const count = await this.planModel.countDocuments();
    if (count === 0) {
      await this.planModel.insertMany([
        {
          name: 'Free',
          slug: 'free',
          moduleIds: ['core', 'pos', 'inventory'],
          priceMonthlyCents: 0,
          isFree: true,
          isActive: true,
        },
        {
          name: 'Professional',
          slug: 'pro',
          moduleIds: [
            'core',
            'pos',
            'inventory',
            'serialized',
            'service',
            'preorder',
            'report',
            'crm',
          ],
          priceMonthlyCents: 4900,
          isActive: true,
        },
        {
          name: 'Enterprise',
          slug: 'enterprise',
          moduleIds: [
            'core',
            'pos',
            'inventory',
            'serialized',
            'service',
            'preorder',
            'report',
            'b2b',
            'warehouse',
            'chain',
            'crm',
          ],
          priceMonthlyCents: 9900,
          isActive: true,
        },
      ]);
    }
    return this.planModel.find({ isActive: true }).sort({ priceMonthlyCents: 1 }).lean();
  }

  async getCompanyBilling(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    const company = await this.companyModel.findById(companyId).populate('planId').lean();
    if (!company) throw new NotFoundException();
    return {
      subscriptionStatus: company.subscriptionStatus,
      enabledModules: company.enabledModules,
      plan: company.planId,
      stripeEnabled: this.stripeService.isEnabled(),
    };
  }

  async checkout(
    userId: string,
    companyId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const [company, plan] = await Promise.all([
      this.companyModel.findById(companyId),
      this.planModel.findById(planId),
    ]);
    if (!company || !plan) throw new NotFoundException('Company or plan not found');
    if (!plan.isActive) throw new NotFoundException('Plan not available');

    return this.stripeService.createCheckoutSession(
      company,
      plan,
      successUrl,
      cancelUrl,
    );
  }

  async activateFreePlan(userId: string, companyId: string, planId: string) {
    await this.companyService.assertMember(userId, companyId);
    const [company, plan] = await Promise.all([
      this.companyModel.findById(companyId),
      this.planModel.findById(planId),
    ]);
    if (!company || !plan?.isFree) throw new NotFoundException();
    return this.stripeService.applyPlan(company, plan, 'active');
  }

  /** Dev/smoke only when Stripe is disabled */
  async applyDevPlan(
    userId: string,
    companyId: string,
    planId: string,
    subscriptionStatus = 'active',
  ) {
    await this.companyService.assertMember(userId, companyId);
    const [company, plan] = await Promise.all([
      this.companyModel.findById(companyId),
      this.planModel.findById(planId),
    ]);
    if (!company || !plan?.isActive) throw new NotFoundException('Company or plan not found');
    return this.stripeService.applyPlan(company, plan, subscriptionStatus);
  }
}
