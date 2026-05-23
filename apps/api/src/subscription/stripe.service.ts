import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument, Plan, PlanDocument } from '@lz3c/db';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: {
    customers: { create: (p: unknown) => Promise<{ id: string }> };
    checkout: {
      sessions: {
        create: (p: unknown) => Promise<{ url: string; id: string }>;
      };
    };
    subscriptions: { retrieve: (id: string) => Promise<{ status: string }> };
    webhooks: { constructEvent: (body: Buffer, sig: string, secret: string) => unknown };
  } | null = null;

  constructor(
    private config: ConfigService,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
  ) {
    const key = config.get('STRIPE_SECRET_KEY');
    if (key) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Stripe = require('stripe');
        this.stripe = new Stripe(key, { apiVersion: '2024-11-20.acacia' });
      } catch {
        this.logger.warn('Stripe SDK not available');
      }
    }
  }

  isEnabled() {
    return !!this.stripe;
  }

  async ensureCustomer(company: CompanyDocument): Promise<string> {
    if (company.stripeCustomerId) return company.stripeCustomerId;

    if (!this.stripe) {
      const mockId = `mock_cus_${company._id}`;
      company.stripeCustomerId = mockId;
      await company.save();
      return mockId;
    }

    const customer = await this.stripe.customers.create({
      name: company.name,
      email: company.contactEmail,
      metadata: { companyId: company._id.toString() },
    });
    company.stripeCustomerId = customer.id;
    await company.save();
    return customer.id;
  }

  async createCheckoutSession(
    company: CompanyDocument,
    plan: PlanDocument,
    successUrl: string,
    cancelUrl: string,
  ) {
    const customerId = await this.ensureCustomer(company);

    if (!this.stripe || plan.isFree || !plan.stripePriceId) {
      await this.applyPlan(company, plan, 'active');
      return {
        mode: 'dev' as const,
        url: successUrl,
        message: 'Plan activated (Stripe not configured or free plan)',
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        companyId: company._id.toString(),
        planId: plan._id.toString(),
      },
    });

    return { mode: 'stripe' as const, url: session.url, sessionId: session.id };
  }

  async applyPlan(
    company: CompanyDocument,
    plan: PlanDocument,
    status: string,
  ) {
    company.planId = plan._id;
    company.enabledModules = plan.moduleIds;
    company.subscriptionStatus = status;
    await company.save();
    return company;
  }

  async handleWebhookEvent(event: {
    type: string;
    data: { object: Record<string, unknown> };
  }) {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata as { companyId?: string; planId?: string } | undefined;
      if (meta?.companyId && meta?.planId) {
        const [company, plan] = await Promise.all([
          this.companyModel.findById(meta.companyId),
          this.planModel.findById(meta.planId),
        ]);
        if (company && plan) {
          await this.applyPlan(company, plan, 'active');
          if (session.subscription) {
            company.stripeSubscriptionId = String(session.subscription);
            await company.save();
          }
        }
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object;
      const company = await this.companyModel.findOne({
        stripeSubscriptionId: sub.id,
      });
      if (company) {
        const status = sub.status as string;
        if (status === 'active' || status === 'trialing') {
          company.subscriptionStatus = 'active';
        } else if (status === 'past_due') {
          company.subscriptionStatus = 'past_due';
        } else {
          company.subscriptionStatus = 'read_only';
        }
        await company.save();
      }
    }
  }

  constructWebhookEvent(body: Buffer, signature: string) {
    if (!this.stripe) throw new Error('Stripe not configured');
    const secret = this.config.get('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(body, signature, secret);
  }
}
