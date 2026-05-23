import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument } from '@lz3c/db';
import { AuditService } from '../common/services/audit.service';

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);
  private lastAuditPurgeAt: string | null = null;
  private lastAuditPurgeDeleted = 0;
  private lastAuditPurgeCompanies = 0;

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private audit: AuditService,
  ) {}

  onModuleInit() {
    if (process.env.AUDIT_AUTO_PURGE !== '1') return;
    const hours = Math.max(1, Number(process.env.AUDIT_AUTO_PURGE_HOURS ?? 24));
    this.logger.log(`Audit auto-purge enabled (every ${hours}h)`);
    setInterval(() => void this.purgeAllCompanies(), hours * 3600_000);
  }

  getStatus() {
    return {
      auditAutoPurgeEnabled: process.env.AUDIT_AUTO_PURGE === '1',
      auditAutoPurgeHours: Math.max(1, Number(process.env.AUDIT_AUTO_PURGE_HOURS ?? 24)),
      lastAuditPurgeAt: this.lastAuditPurgeAt,
      lastAuditPurgeDeleted: this.lastAuditPurgeDeleted,
      lastAuditPurgeCompanies: this.lastAuditPurgeCompanies,
    };
  }

  async purgeAllCompanies() {
    const companies = await this.companyModel.find().select('_id auditRetentionDays name').lean();
    let total = 0;
    const now = new Date();
    for (const c of companies) {
      const days = c.auditRetentionDays ?? 365;
      const r = await this.audit.purgeOlderThan(days, c._id.toString());
      total += r.deleted;
      await this.companyModel.updateOne(
        { _id: c._id },
        { lastAuditPurgeAt: now, lastAuditPurgeDeleted: r.deleted },
      );
    }
    this.lastAuditPurgeAt = now.toISOString();
    this.lastAuditPurgeDeleted = total;
    this.lastAuditPurgeCompanies = companies.length;
    this.logger.log(
      `Audit auto-purge: ${total} events removed across ${companies.length} companies`,
    );
    return { companies: companies.length, deleted: total, at: this.lastAuditPurgeAt };
  }
}
