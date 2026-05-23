import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Membership, MembershipDocument, User, UserDocument } from '@lz3c/db';
import {
  auditPurgeEmailText,
  renderAuditPurgeEmail,
} from './templates/audit-purge-email';
import { EmailService } from './email.service';

@Injectable()
export class AuditPurgeNotifyService {
  private readonly logger = new Logger(AuditPurgeNotifyService.name);

  constructor(
    @InjectModel(Membership.name)
    private membershipModel: Model<MembershipDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private email: EmailService,
  ) {}

  async notifyCompanyAdmins(
    companyId: string,
    companyName: string,
    deleted: number,
    cutoff: string,
  ): Promise<{ enabled: boolean; recipients: number; mode?: string }> {
    if (process.env.AUDIT_PURGE_NOTIFY !== '1') {
      return { enabled: false, recipients: 0 };
    }

    const memberships = await this.membershipModel
      .find({ companyId: new Types.ObjectId(companyId), role: 'admin' })
      .lean();
    const userIds = memberships.map((m) => m.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('email')
      .lean();
    const emails = [...new Set(users.map((u) => u.email).filter(Boolean))];
    if (!emails.length) {
      return { enabled: true, recipients: 0, mode: 'no_recipients' };
    }

    const at = new Date().toISOString();
    const subject = `[LZ3C] Audit purge — ${companyName}`;
    const text = auditPurgeEmailText({ companyName, deleted, cutoff, at });
    const html = renderAuditPurgeEmail({ companyName, deleted, cutoff, at });
    let mode = 'mock';
    for (const to of emails) {
      const r = await this.email.sendPlain({ to, subject, text, html });
      mode = r.mode;
    }
    this.logger.log(`Audit purge notify: ${emails.length} admin(s) for ${companyName}`);
    return { enabled: true, recipients: emails.length, mode };
  }
}
