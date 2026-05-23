import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import {
  Company,
  CompanyDocument,
  CompanyInvite,
  CompanyInviteDocument,
  Membership,
  MembershipDocument,
  User,
  UserDocument,
} from '@lz3c/db';
import { AuditService } from '../common/services/audit.service';
import { EmailService } from '../notification/email.service';
import {
  inviteEmailPlain,
  inviteEmailSubject,
  renderInviteEmail,
  resolveInviteNote,
} from '../notification/templates/invite-email';
import { CompanyService } from './company.service';

@Injectable()
export class CompanyInviteService {
  constructor(
    @InjectModel(CompanyInvite.name)
    private inviteModel: Model<CompanyInviteDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Membership.name)
    private membershipModel: Model<MembershipDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private companyService: CompanyService,
    private emailService: EmailService,
    private audit: AuditService,
  ) {}

  private inviteUrl(token: string) {
    const base = process.env.WEB_APP_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/accept-invite?token=${token}`;
  }

  async previewInviteEmail(
    actorUserId: string,
    companyId: string,
    dto: { email: string; role: string; storeId?: string; locale?: 'en' | 'zh' },
  ) {
    const actor = await this.companyService.assertMember(actorUserId, companyId);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only company admins can preview invites');
    }

    const company = await this.companyModel.findById(companyId).lean();
    const companyName = company?.name ?? 'LZ3C';
    const locale = dto.locale ?? company?.defaultLocale;
    const customNote = company ? resolveInviteNote(company, locale) : undefined;
    const expiresLabel = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const url = this.inviteUrl('000000000000000000000000000000000000000000');

    return {
      locale,
      subject: inviteEmailSubject(companyName, locale),
      text: inviteEmailPlain({
        companyName,
        role: dto.role,
        inviteUrl: url,
        expiresAt: expiresLabel,
        locale,
        customNote,
      }),
      html: renderInviteEmail({
        companyName,
        role: dto.role,
        inviteUrl: url,
        expiresAt: expiresLabel,
        locale,
        customNote,
      }),
    };
  }

  async createInvite(
    actorUserId: string,
    companyId: string,
    dto: { email: string; role: string; storeId?: string; locale?: 'en' | 'zh' },
  ) {
    const actor = await this.companyService.assertMember(actorUserId, companyId);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only company admins can invite members');
    }

    if (['cashier', 'warehouse_staff'].includes(dto.role) && !dto.storeId) {
      throw new BadRequestException('storeId required for cashier and warehouse_staff');
    }

    const email = dto.email.toLowerCase().trim();
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.inviteModel.create({
      companyId: new Types.ObjectId(companyId),
      email,
      role: dto.role,
      storeId: dto.storeId ? new Types.ObjectId(dto.storeId) : undefined,
      token,
      invitedByUserId: new Types.ObjectId(actorUserId),
      expiresAt,
    });

    const company = await this.companyModel.findById(companyId).lean();
    const url = this.inviteUrl(token);
    const expiresLabel = expiresAt.toISOString().slice(0, 10);
    const companyName = company?.name ?? 'LZ3C';
    const locale = dto.locale ?? company?.defaultLocale;
    const customNote = company ? resolveInviteNote(company, locale) : undefined;
    const emailResult = await this.emailService.sendPlain({
      to: email,
      subject: inviteEmailSubject(companyName, locale),
      text: inviteEmailPlain({
        companyName,
        role: dto.role,
        inviteUrl: url,
        expiresAt: expiresLabel,
        locale,
        customNote,
      }),
      html: renderInviteEmail({
        companyName,
        role: dto.role,
        inviteUrl: url,
        expiresAt: expiresLabel,
        locale,
        customNote,
      }),
    });

    void this.audit.log({
      companyId,
      userId: actorUserId,
      storeId: dto.storeId,
      action: 'company.invite',
      entityType: 'company_invite',
      entityId: invite._id.toString(),
      metadata: { email, role: dto.role },
    });

    return {
      _id: invite._id,
      token,
      inviteUrl: url,
      expiresAt,
      email: emailResult,
    };
  }

  async preview(token: string) {
    const invite = await this.inviteModel.findOne({ token }).lean();
    if (!invite) throw new NotFoundException('Invite not found');
    const company = await this.companyModel.findById(invite.companyId).lean();
    const expired = invite.expiresAt < new Date();
    const accepted = !!invite.acceptedAt;
    return {
      companyName: company?.name ?? 'Company',
      email: invite.email,
      role: invite.role,
      expired,
      accepted,
      valid: !expired && !accepted,
    };
  }

  async acceptInvite(userId: string, token: string) {
    const invite = await this.inviteModel.findOne({ token });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.acceptedAt) throw new BadRequestException('Invite already accepted');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite expired');

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.email.toLowerCase() !== invite.email) {
      throw new BadRequestException('Invite email does not match your account');
    }

    const existing = await this.membershipModel.findOne({
      userId: user._id,
      companyId: invite.companyId,
      ...(invite.storeId
        ? { storeId: invite.storeId }
        : { $or: [{ storeId: { $exists: false } }, { storeId: null }] }),
    });
    if (existing) throw new BadRequestException('Already a member');

    const membership = await this.membershipModel.create({
      userId: user._id,
      companyId: invite.companyId,
      storeId: invite.storeId,
      role: invite.role,
    });

    invite.acceptedAt = new Date();
    invite.acceptedByUserId = new Types.ObjectId(userId);
    await invite.save();

    void this.audit.log({
      companyId: invite.companyId.toString(),
      userId,
      storeId: invite.storeId?.toString(),
      action: 'company.invite_accept',
      entityType: 'company_invite',
      entityId: invite._id.toString(),
      metadata: { email: invite.email, role: invite.role },
    });

    const company = await this.companyModel.findById(invite.companyId).lean();
    return {
      membership,
      companyId: invite.companyId.toString(),
      companyName: company?.name,
      role: invite.role,
    };
  }

  async listPending(actorUserId: string, companyId: string) {
    const actor = await this.companyService.assertMember(actorUserId, companyId);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only company admins can list invites');
    }

    return this.inviteModel
      .find({
        companyId: new Types.ObjectId(companyId),
        acceptedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .select('email role storeId expiresAt createdAt')
      .lean();
  }

  async revokeInvite(actorUserId: string, companyId: string, inviteId: string) {
    const actor = await this.companyService.assertMember(actorUserId, companyId);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only company admins can revoke invites');
    }

    const deleted = await this.inviteModel.findOneAndDelete({
      _id: inviteId,
      companyId: new Types.ObjectId(companyId),
      acceptedAt: { $exists: false },
    });
    if (!deleted) throw new NotFoundException('Pending invite not found');
    return { revoked: true };
  }
}
