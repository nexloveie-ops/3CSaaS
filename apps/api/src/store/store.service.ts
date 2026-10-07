import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument, Store, StoreDocument } from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { feieOpen } from '../printing/feie.client';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateTerminalPaymentDto } from './dto/create-terminal-payment.dto';
import { TestStoreFeieDto } from './dto/test-store-feie.dto';
import { TestStoreStripeDto } from './dto/test-store-stripe.dto';
import { UpdateStoreProfileDto } from './dto/update-store-profile.dto';

@Injectable()
export class StoreService {
  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private companyService: CompanyService,
  ) {}

  async create(userId: string, companyId: string, dto: CreateStoreDto) {
    await this.companyService.assertMember(userId, companyId);
    return this.storeModel.create({
      companyId: new Types.ObjectId(companyId),
      name: dto.name,
      address: dto.address,
      warehouseEnabled: dto.warehouseEnabled ?? false,
    });
  }

  async listByCompany(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    const bound = await this.companyService.resolveBoundStoreId(userId, companyId);
    const filter: { companyId: Types.ObjectId; _id?: Types.ObjectId } = {
      companyId: new Types.ObjectId(companyId),
    };
    if (bound) filter._id = new Types.ObjectId(bound);
    return this.storeModel.find(filter).lean();
  }

  async getOne(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const role = await this.companyService.resolveRole(userId, companyId, storeId);
    const query = this.storeModel.findOne({
      _id: storeId,
      companyId: new Types.ObjectId(companyId),
    });
    if (role === 'admin' || role === 'manager') {
      query.select('+stripeSecretKey +stripeApiKey');
    }
    const store = await query.lean();
    if (!store) throw new NotFoundException('Store not found');
    const saved = store as typeof store & { stripeApiKey?: string; stripeSecretKey?: string };
    if (!saved.stripeSecretKey && saved.stripeApiKey) {
      saved.stripeSecretKey = saved.stripeApiKey;
    }
    delete saved.stripeApiKey;
    return saved;
  }

  async updateProfile(
    userId: string,
    companyId: string,
    storeId: string,
    dto: UpdateStoreProfileDto,
  ) {
    const role = await this.companyService.resolveRole(userId, companyId, storeId);
    if (role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only admins and managers can update store profile');
    }
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel
      .findOne({
        _id: storeId,
        companyId: new Types.ObjectId(companyId),
      })
      .select('+stripeSecretKey +stripeApiKey');
    if (!store) throw new NotFoundException('Store not found');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Store name is required');
      store.name = name;
    }
    if (dto.address !== undefined) store.address = dto.address.trim() || undefined;
    if (dto.phone !== undefined) store.phone = dto.phone.trim() || undefined;
    if (dto.email !== undefined) store.email = dto.email.trim() || undefined;
    if (dto.stripePublishableKey !== undefined) {
      store.stripePublishableKey = dto.stripePublishableKey.trim() || undefined;
    }
    if (dto.stripeSecretKey !== undefined) {
      store.stripeSecretKey = dto.stripeSecretKey.trim() || undefined;
      store.stripeApiKey = undefined;
    }
    if (dto.stripeLocationId !== undefined) {
      store.stripeLocationId = dto.stripeLocationId.trim() || undefined;
    }
    if (dto.feiePrinterSn !== undefined) {
      store.feiePrinterSn = dto.feiePrinterSn.trim() || undefined;
    }
    if (dto.warehouseEnabled !== undefined) store.warehouseEnabled = dto.warehouseEnabled;
    await store.save();
    return store;
  }

  async testStripe(
    userId: string,
    companyId: string,
    storeId: string,
    dto: TestStoreStripeDto,
  ) {
    const role = await this.companyService.resolveRole(userId, companyId, storeId);
    if (role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only admins and managers can test Stripe');
    }
    await this.companyService.assertStoreAccess(userId, companyId, storeId);

    const publishable = dto.stripePublishableKey.trim();
    const secret = dto.stripeSecretKey.trim();
    const locationId = dto.stripeLocationId?.trim() ?? '';
    const publishableMode = stripeKeyMode(publishable, 'pk');
    const secretMode = stripeKeyMode(secret, 'secret');
    if (!publishableMode) throw new BadRequestException('stripe_publishable_format');
    if (!secretMode) throw new BadRequestException('stripe_secret_format');
    if (publishableMode !== secretMode) throw new BadRequestException('stripe_mode_mismatch');
    if (locationId && !/^tml_[A-Za-z0-9]+$/.test(locationId)) {
      throw new BadRequestException('stripe_location_format');
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    // Confirms the secret key. The location is checked only when one is provided.
    const client = new Stripe(secret);
    try {
      await client.balance.retrieve();
    } catch {
      throw new BadRequestException('stripe_secret_rejected');
    }

    let locationName: string | undefined;
    if (locationId) {
      try {
        const location = await client.terminal.locations.retrieve(locationId);
        locationName = location.display_name || locationId;
      } catch {
        throw new BadRequestException('stripe_location_invalid');
      }
    }

    return { ok: true as const, mode: publishableMode, locationName };
  }

  async testFeie(
    userId: string,
    companyId: string,
    storeId: string,
    dto: TestStoreFeieDto,
  ) {
    const role = await this.companyService.resolveRole(userId, companyId, storeId);
    if (role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only admins and managers can test the printer');
    }
    await this.companyService.assertStoreAccess(userId, companyId, storeId);

    const company = await this.companyModel.findById(companyId).select('+feieUkey').lean();
    if (!company) throw new NotFoundException('Company not found');
    const user = company.feieUser?.trim();
    const ukey = company.feieUkey?.trim();
    if (!user || !ukey) throw new BadRequestException('feie_not_configured');

    const sn = dto.feiePrinterSn.trim();
    let result: { ret?: number; msg?: string; data?: string };
    try {
      result = await feieOpen(user, ukey, { apiname: 'Open_queryPrinterStatus', sn });
    } catch {
      throw new BadRequestException('feie_unreachable');
    }
    if (result.ret !== 0) {
      throw new BadRequestException(result.msg?.trim() || 'feie_rejected');
    }
    return { ok: true as const, status: String(result.data ?? '').trim() || 'ok' };
  }

  async updateRepairTerms(
    userId: string,
    companyId: string,
    storeId: string,
    repairTerms: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel.findOne({
      _id: storeId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!store) throw new NotFoundException('Store not found');
    store.repairTerms = repairTerms.trim();
    await store.save();
    return store;
  }

  async updateSalesTerms(
    userId: string,
    companyId: string,
    storeId: string,
    salesTerms: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel.findOne({
      _id: storeId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!store) throw new NotFoundException('Store not found');
    store.salesTerms = salesTerms.trim();
    await store.save();
    return store;
  }

  /** Short-lived Stripe Terminal token. The store secret key never leaves the server. */
  async createTerminalConnectionToken(userId: string, companyId: string, storeId: string) {
    const { client, locationId } = await this.storeStripe(userId, companyId, storeId);
    try {
      const token = await client.terminal.connectionTokens.create({ location: locationId });
      return { secret: token.secret };
    } catch {
      throw new BadRequestException('stripe_connection_token_failed');
    }
  }

  /** Card-present PaymentIntent on the store's own Stripe account. Amount is euros. */
  async createTerminalPaymentIntent(
    userId: string,
    companyId: string,
    storeId: string,
    dto: CreateTerminalPaymentDto,
  ) {
    const { client } = await this.storeStripe(userId, companyId, storeId);
    const amount = Math.round(dto.amount * 100);
    try {
      const intent = await client.paymentIntents.create({
        amount,
        currency: 'eur',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        metadata: { companyId, storeId },
      });
      if (!intent.client_secret) {
        throw new BadRequestException('stripe_payment_intent_failed');
      }
      return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('stripe_payment_intent_failed');
    }
  }

  private async storeStripe(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel
      .findOne({
        _id: storeId,
        companyId: new Types.ObjectId(companyId),
      })
      .select('+stripeSecretKey +stripeApiKey');
    if (!store) throw new NotFoundException('Store not found');
    const secret = (store.stripeSecretKey || store.stripeApiKey || '').trim();
    const locationId = store.stripeLocationId?.trim() ?? '';
    if (!secret) throw new BadRequestException('stripe_not_configured');
    if (!locationId) throw new BadRequestException('stripe_location_missing');
    if (!/^tml_[A-Za-z0-9]+$/.test(locationId)) {
      throw new BadRequestException('stripe_location_format');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    return { client: new Stripe(secret), locationId };
  }
}

function stripeKeyMode(key: string, kind: 'pk' | 'secret'): 'test' | 'live' | null {
  const pattern =
    kind === 'pk'
      ? /^pk_(test|live)_[A-Za-z0-9]+$/
      : /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/;
  const match = key.match(pattern);
  if (!match) return null;
  return match[1] === 'live' ? 'live' : 'test';
}
