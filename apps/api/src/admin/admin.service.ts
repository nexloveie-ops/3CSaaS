import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument, Plan, PlanDocument } from '@lz3c/db';
import { MODULE_IDS } from '@lz3c/shared';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  listModules() {
    return MODULE_IDS.map((id) => ({ id, name: id.replace(/_/g, ' ') }));
  }

  async listPlans() {
    return this.planModel.find().sort({ priceMonthlyCents: 1 }).lean();
  }

  async createPlan(dto: CreatePlanDto) {
    return this.planModel.create({
      ...dto,
      moduleIds: dto.moduleIds ?? ['core', 'pos', 'inventory'],
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findByIdAndUpdate(id, { $set: dto }, { new: true });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async seedDefaultPlans() {
    const count = await this.planModel.countDocuments();
    if (count > 0) return { seeded: false, count };

    await this.planModel.insertMany([
      {
        name: 'Free',
        slug: 'free',
        moduleIds: ['core', 'pos', 'inventory'],
        priceMonthlyCents: 0,
        isFree: true,
        description: 'Basic POS and inventory',
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
        description: 'Full store operations',
      },
      {
        name: 'Enterprise',
        slug: 'enterprise',
        moduleIds: MODULE_IDS as unknown as string[],
        priceMonthlyCents: 9900,
        description: 'All modules incl. B2B, chain, warehouse',
      },
    ]);
    return { seeded: true, count: 3 };
  }

  async updateCompany(id: string, dto: UpdateCompanySubscriptionDto) {
    const company = await this.companyModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!company) throw new NotFoundException('Company not found');

    if (dto.planId) {
      const plan = await this.planModel.findById(dto.planId);
      if (plan) {
        company.enabledModules = plan.moduleIds;
        company.planId = plan._id;
        if (plan.isFree) company.subscriptionStatus = 'active';
        await company.save();
      }
    }
    return company;
  }

  async listCompanies() {
    return this.companyModel.find().select('name subscriptionStatus enabledModules planId stripeCustomerId').lean();
  }
}
