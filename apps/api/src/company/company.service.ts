import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Company,
  CompanyDocument,
  Membership,
  MembershipDocument,
  TaxCategory,
  TaxCategoryDocument,
  User,
  UserDocument,
} from '@lz3c/db';
import { isValidLocale, resolveBoundStoreId as resolveBoundStoreIdFromMemberships } from '@lz3c/shared';
import { AuditService } from '../common/services/audit.service';
import { AuditPurgeNotifyService } from '../notification/audit-purge-notify.service';
import { WebhookService } from '../notification/webhook.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyLocaleDto } from './dto/update-company-locale.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Membership.name)
    private membershipModel: Model<MembershipDocument>,
    @InjectModel(TaxCategory.name)
    private taxCategoryModel: Model<TaxCategoryDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private audit: AuditService,
    private webhook: WebhookService,
    private purgeNotify: AuditPurgeNotifyService,
  ) {}

  async create(userId: string, dto: CreateCompanyDto) {
    const company = await this.companyModel.create({
      name: dto.name,
      legalName: dto.legalName,
      vatNumber: dto.vatNumber,
      address: dto.address,
      enabledModules:
        dto.enabledModules ??
        ['core', 'pos', 'inventory', 'serialized', 'service', 'preorder', 'report', 'crm'],
      subscriptionStatus: 'active',
    });

    await this.membershipModel.create({
      userId: new Types.ObjectId(userId),
      companyId: company._id,
      role: 'admin',
    });

    await this.seedDefaultTaxCategories(company._id);

    return company;
  }

  private async seedDefaultTaxCategories(companyId: Types.ObjectId) {
    const defaults = [
      { name: '0% VAT', scheme: 'zero', isDefault: false },
      { name: '13.5% VAT (Services)', scheme: 'standard_13_5', isDefault: false },
      { name: '23% VAT (New goods)', scheme: 'standard_23', isDefault: true },
      { name: 'Margin VAT (Second-hand)', scheme: 'margin_23', isDefault: false },
    ];
    await this.taxCategoryModel.insertMany(
      defaults.map((d) => ({ ...d, companyId, isActive: true })),
    );
  }

  async listForUser(userId: string) {
    const memberships = await this.membershipModel.find({
      userId: new Types.ObjectId(userId),
    });
    const companyIds = memberships.map((m) => m.companyId);
    return this.companyModel.find({ _id: { $in: companyIds } }).lean();
  }

  async getOne(userId: string, companyId: string) {
    await this.assertMember(userId, companyId);
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async assertMember(userId: string, companyId: string) {
    const m = await this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!m) throw new ForbiddenException('Not a member of this company');
    return m;
  }

  /** Store-bound membership (cashier / warehouse_staff). null = company-wide access. */
  async resolveBoundStoreId(userId: string, companyId: string): Promise<string | null> {
    const memberships = await this.membershipModel
      .find({
        userId: new Types.ObjectId(userId),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    return resolveBoundStoreIdFromMemberships(
      memberships.map((m) => ({
        role: m.role,
        companyId: m.companyId?.toString(),
        storeId: m.storeId?.toString() ?? null,
      })),
      companyId,
    );
  }

  /** Enforce single-store access for store-bound roles. */
  async assertStoreAccess(
    userId: string,
    companyId: string,
    storeId?: string,
  ): Promise<void> {
    await this.assertMember(userId, companyId);
    const bound = await this.resolveBoundStoreId(userId, companyId);
    if (!bound) return;
    if (!storeId) {
      throw new ForbiddenException('Store context required for your role');
    }
    if (storeId !== bound) {
      throw new ForbiddenException('Access limited to your assigned store');
    }
  }

  /** Effective role for company + optional store context. */
  async resolveRole(userId: string, companyId: string, storeId?: string) {
    const memberships = await this.membershipModel.find({
      userId: new Types.ObjectId(userId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!memberships.length) {
      throw new ForbiddenException('Not a member of this company');
    }

    const companyAdmin = memberships.find((m) => m.role === 'admin' && !m.storeId);
    if (companyAdmin) return 'admin';

    const bound = resolveBoundStoreIdFromMemberships(
      memberships.map((m) => ({
        role: m.role,
        companyId: m.companyId?.toString(),
        storeId: m.storeId?.toString() ?? null,
      })),
      companyId,
    );
    if (bound) {
      if (!storeId) {
        const storeMem = memberships.find((m) => m.storeId?.toString() === bound);
        return storeMem?.role ?? 'cashier';
      }
      if (storeId !== bound) {
        throw new ForbiddenException('Access limited to your assigned store');
      }
      const storeMem = memberships.find((m) => m.storeId?.toString() === bound);
      if (storeMem) return storeMem.role;
      throw new ForbiddenException('Access limited to your assigned store');
    }

    if (storeId) {
      const storeMem = memberships.find(
        (m) => m.storeId?.toString() === storeId,
      );
      if (storeMem) return storeMem.role;
    }

    const rank = { admin: 4, manager: 3, warehouse_staff: 2, cashier: 1 };
    const best = memberships.reduce((a, b) =>
      (rank[a.role as keyof typeof rank] ?? 0) >= (rank[b.role as keyof typeof rank] ?? 0) ? a : b,
    );
    return best.role;
  }

  async addMember(
    actorUserId: string,
    companyId: string,
    dto: { email: string; role: string; storeId?: string },
  ) {
    const actor = await this.assertMember(actorUserId, companyId);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only company admins can add members');
    }

    const allowed = ['admin', 'manager', 'cashier', 'warehouse_staff'];
    if (!allowed.includes(dto.role)) {
      throw new BadRequestException('Invalid role');
    }
    if (['cashier', 'warehouse_staff'].includes(dto.role) && !dto.storeId) {
      throw new BadRequestException('storeId required for cashier and warehouse_staff');
    }

    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (!user) throw new NotFoundException('User not found — ask them to register first');

    const existing = await this.membershipModel.findOne({
      userId: user._id,
      companyId: new Types.ObjectId(companyId),
      ...(dto.storeId
        ? { storeId: new Types.ObjectId(dto.storeId) }
        : { $or: [{ storeId: { $exists: false } }, { storeId: null }] }),
    });
    if (existing) throw new ConflictException('Membership already exists');

    const membership = await this.membershipModel.create({
      userId: user._id,
      companyId: new Types.ObjectId(companyId),
      storeId: dto.storeId ? new Types.ObjectId(dto.storeId) : undefined,
      role: dto.role,
    });

    void this.audit.log({
      companyId,
      userId: actorUserId,
      storeId: dto.storeId,
      action: 'company.member_add',
      entityType: 'membership',
      entityId: membership._id.toString(),
      metadata: { email: dto.email, role: dto.role },
    });

    return membership;
  }

  async updateLocale(
    userId: string,
    companyId: string,
    dto: UpdateCompanyLocaleDto,
  ) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can update locale settings');
    }
    if (dto.defaultLocale && !isValidLocale(dto.defaultLocale)) {
      throw new BadRequestException('Invalid defaultLocale');
    }
    const company = await this.companyModel.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    if (dto.defaultLocale) company.defaultLocale = dto.defaultLocale;
    if (dto.enabledLocales) company.enabledLocales = dto.enabledLocales;
    if (dto.localeOverrides) company.localeOverrides = dto.localeOverrides;
    await company.save();
    return company;
  }

  async updateProfile(
    userId: string,
    companyId: string,
    dto: UpdateCompanyProfileDto,
  ) {
    const role = await this.resolveRole(userId, companyId);
    if (role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only admins and managers can update company profile');
    }
    const company = await this.companyModel.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    if (dto.legalName !== undefined) company.legalName = dto.legalName.trim() || undefined;
    if (dto.registrationNumber !== undefined) {
      company.registrationNumber = dto.registrationNumber.trim() || undefined;
    }
    if (dto.vatNumber !== undefined) company.vatNumber = dto.vatNumber.trim() || undefined;
    if (dto.address !== undefined) company.address = dto.address.trim() || undefined;
    if (dto.contactPhone !== undefined) {
      company.contactPhone = dto.contactPhone.trim() || undefined;
    }
    if (dto.contactEmail !== undefined) {
      company.contactEmail = dto.contactEmail.trim() || undefined;
    }
    await company.save();
    return company;
  }

  async updateSettings(
    userId: string,
    companyId: string,
    dto: UpdateCompanySettingsDto,
  ) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can update settings');
    }
    const company = await this.companyModel.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    if (dto.webhookUrl !== undefined) {
      company.webhookUrl = dto.webhookUrl?.trim() || undefined;
    }
    if (dto.auditRetentionDays !== undefined) {
      company.auditRetentionDays = dto.auditRetentionDays;
    }
    if (dto.inviteEmailNote !== undefined) {
      company.inviteEmailNote = dto.inviteEmailNote?.trim() || undefined;
    }
    if (dto.inviteEmailNoteZh !== undefined) {
      company.inviteEmailNoteZh = dto.inviteEmailNoteZh?.trim() || undefined;
    }
    await company.save();
    return company;
  }

  async getMaintenanceStatus(userId: string, companyId: string) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can view maintenance status');
    }
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) throw new NotFoundException('Company not found');
    return {
      auditRetentionDays: company.auditRetentionDays ?? 365,
      lastAuditPurgeAt: company.lastAuditPurgeAt?.toISOString() ?? null,
      lastAuditPurgeDeleted: company.lastAuditPurgeDeleted ?? 0,
      serverAutoPurgeEnabled: process.env.AUDIT_AUTO_PURGE === '1',
    };
  }

  async listWebhookDeliveries(
    userId: string,
    companyId: string,
    filters?: { event?: string; status?: 'success' | 'failed' },
  ) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can view webhook deliveries');
    }
    return this.webhook.listDeliveries(companyId, { limit: 50, ...filters });
  }

  async getWebhookDelivery(userId: string, companyId: string, deliveryId: string) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can view webhook deliveries');
    }
    return this.webhook.getDelivery(companyId, deliveryId);
  }

  async retryWebhookDelivery(
    userId: string,
    companyId: string,
    deliveryId: string,
  ) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can retry webhooks');
    }
    return this.webhook.retryDelivery(companyId, deliveryId);
  }

  async retryAllFailedWebhooks(
    userId: string,
    companyId: string,
    filters?: { event?: string },
  ) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can retry webhooks');
    }
    return this.webhook.retryAllFailed(companyId, filters);
  }

  async exportWebhookDeliveriesCsv(
    userId: string,
    companyId: string,
    filters?: { event?: string; status?: 'success' | 'failed' },
  ) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can export webhook deliveries');
    }
    return this.webhook.exportCsv(companyId, { ...filters, limit: 500 });
  }

  async purgeAudit(userId: string, companyId: string) {
    const m = await this.assertMember(userId, companyId);
    if (m.role !== 'admin') {
      throw new ForbiddenException('Only company admins can purge audit logs');
    }
    const company = await this.companyModel.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');
    const r = await this.audit.purgeOlderThan(company.auditRetentionDays ?? 365, companyId);
    company.lastAuditPurgeAt = new Date();
    company.lastAuditPurgeDeleted = r.deleted;
    await company.save();
    const notify = await this.purgeNotify.notifyCompanyAdmins(
      companyId,
      company.name,
      r.deleted,
      r.cutoff,
    );
    return {
      ...r,
      lastAuditPurgeAt: company.lastAuditPurgeAt.toISOString(),
      lastAuditPurgeDeleted: company.lastAuditPurgeDeleted,
      notify,
    };
  }
}
