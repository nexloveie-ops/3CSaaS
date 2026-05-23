import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { MODULE_IDS } from '@lz3c/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(
    private subscriptionService: SubscriptionService,
    private stripeService: StripeService,
  ) {}

  @Get('modules')
  listModules() {
    return MODULE_IDS.map((id) => ({
      id,
      name: id.replace(/_/g, ' '),
    }));
  }

  @Get('plans')
  listPlans() {
    return this.subscriptionService.listPublicPlans();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('billing')
  billing(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.subscriptionService.getCompanyBilling(user.userId, companyId);
  }

  @UseGuards(AuthGuard('jwt'), ReadOnlyGuard)
  @Post('checkout')
  checkout(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.subscriptionService.checkout(
      user.userId,
      companyId,
      dto.planId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @UseGuards(AuthGuard('jwt'), ReadOnlyGuard)
  @Post('activate-free')
  activateFree(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() body: { planId: string },
  ) {
    return this.subscriptionService.activateFreePlan(
      user.userId,
      companyId,
      body.planId,
    );
  }

  /** Apply any plan without Stripe (local dev / smoke tests only) */
  @UseGuards(AuthGuard('jwt'))
  @Post('dev/apply-plan')
  devApplyPlan(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() body: { planId: string; subscriptionStatus?: string },
  ) {
    if (this.stripeService.isEnabled()) {
      throw new ForbiddenException('Dev plan apply disabled when Stripe is configured');
    }
    return this.subscriptionService.applyDevPlan(
      user.userId,
      companyId,
      body.planId,
      body.subscriptionStatus ?? 'active',
    );
  }

  /** Stripe webhook — no auth; requires raw body middleware in main.ts */
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const sig = req.headers['stripe-signature'] as string;
    if (this.stripeService.isEnabled() && sig) {
      const event = this.stripeService.constructWebhookEvent(
        req.rawBody as Buffer,
        sig,
      ) as { type: string; data: { object: Record<string, unknown> } };
      await this.stripeService.handleWebhookEvent(event);
      return { received: true };
    }
    return { received: false, reason: 'stripe_disabled' };
  }
}
