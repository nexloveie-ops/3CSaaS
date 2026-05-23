import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import {

  AuditEvent,

  AuditEventDocument,

  Company,

  CompanyDocument,

  User,

  UserDocument,

} from '@lz3c/db';
import { WebhookService } from '../../notification/webhook.service';

export type AuditLogInput = {

  companyId: string;

  userId: string;

  storeId?: string;

  action: string;

  entityType: string;

  entityId?: string;

  metadata?: Record<string, unknown>;

};



export type AuditListOpts = {

  from?: string;

  to?: string;

  limit?: number;

  before?: string;

  action?: string;

  companyId?: string;

};



export type AuditListResult = {

  events: Record<string, unknown>[];

  nextCursor: string | null;

};



@Injectable()

export class AuditService {

  constructor(

    @InjectModel(AuditEvent.name) private auditModel: Model<AuditEventDocument>,

    @InjectModel(User.name) private userModel: Model<UserDocument>,

    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private webhook: WebhookService,
  ) {}



  async log(input: AuditLogInput) {
    const doc = await this.auditModel.create({
      companyId: new Types.ObjectId(input.companyId),
      userId: new Types.ObjectId(input.userId),
      storeId: input.storeId ? new Types.ObjectId(input.storeId) : undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    });

    if (this.webhook.shouldNotify(input.action)) {
      void this.webhook.dispatch(input.companyId, input.action, {
        entityType: input.entityType,
        entityId: input.entityId,
        storeId: input.storeId,
        metadata: input.metadata,
      });
    }

    return doc;
  }

  async purgeOlderThan(olderThanDays: number, companyId?: string) {
    const days = Math.max(30, olderThanDays);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const q: Record<string, unknown> = { createdAt: { $lt: cutoff } };
    if (companyId) q.companyId = new Types.ObjectId(companyId);
    const result = await this.auditModel.deleteMany(q);
    return { deleted: result.deletedCount, cutoff: cutoff.toISOString(), olderThanDays: days };
  }



  private buildQuery(opts: AuditListOpts): Record<string, unknown> {

    const q: Record<string, unknown> = {};

    if (opts.companyId) {

      q.companyId = new Types.ObjectId(opts.companyId);

    }

    if (opts.action) q.action = opts.action;



    const createdAt: Record<string, Date> = {};

    if (opts.before) createdAt.$lt = new Date(opts.before);

    if (opts.from) createdAt.$gte = new Date(opts.from);

    if (opts.to) createdAt.$lte = new Date(`${opts.to}T23:59:59.999Z`);

    if (Object.keys(createdAt).length) q.createdAt = createdAt;



    return q;

  }



  async listActions(companyId: string, opts: { from?: string; to?: string }) {

    const q = this.buildQuery({ companyId, from: opts.from, to: opts.to });

    return this.auditModel.distinct('action', q).then((a) => a.sort());

  }



  async list(companyId: string, opts: AuditListOpts): Promise<AuditListResult> {

    return this.fetchPage(this.buildQuery({ ...opts, companyId }), opts.limit);

  }



  async listGlobal(opts: AuditListOpts): Promise<AuditListResult> {

    return this.fetchPage(this.buildQuery(opts), opts.limit, true);

  }

  async exportCsv(companyId: string, opts: AuditListOpts): Promise<string> {
    const q = this.buildQuery({ ...opts, companyId });
    const rows = await this.auditModel.find(q).sort({ createdAt: -1 }).limit(5000).lean();

    const userIds = [...new Set(rows.map((e) => e.userId.toString()))];
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
          .select('email displayName')
          .lean()
      : [];
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const header = [
      'createdAt',
      'action',
      'entityType',
      'entityId',
      'userEmail',
      'userDisplayName',
      'storeId',
      'metadata',
    ];
    const dataRows = rows.map((e) => {
      const u = userMap.get(e.userId.toString());
      const createdAt = (e as { createdAt?: Date }).createdAt;
      return [
        createdAt ? new Date(createdAt).toISOString() : '',
        e.action,
        e.entityType,
        e.entityId ?? '',
        u?.email ?? '',
        u?.displayName ?? '',
        e.storeId?.toString() ?? '',
        e.metadata ? JSON.stringify(e.metadata) : '',
      ];
    });

    return [header, ...dataRows].map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  private async fetchPage(

    q: Record<string, unknown>,

    limitOpt?: number,

    includeCompanyName = false,

  ): Promise<AuditListResult> {

    const limit = Math.min(limitOpt ?? 50, 100);



    const rows = await this.auditModel

      .find(q)

      .sort({ createdAt: -1 })

      .limit(limit + 1)

      .lean();



    const hasMore = rows.length > limit;

    const page = hasMore ? rows.slice(0, limit) : rows;

    const last = page[page.length - 1];

    const lastAt = (last as { createdAt?: Date } | undefined)?.createdAt;

    const nextCursor = hasMore && lastAt ? new Date(lastAt).toISOString() : null;



    const userIds = [...new Set(page.map((e) => e.userId.toString()))];

    const users = userIds.length

      ? await this.userModel

          .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })

          .select('email displayName')

          .lean()

      : [];

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));



    let companyMap = new Map<string, string>();

    if (includeCompanyName) {

      const companyIds = [...new Set(page.map((e) => e.companyId.toString()))];

      const companies = await this.companyModel

        .find({ _id: { $in: companyIds.map((id) => new Types.ObjectId(id)) } })

        .select('name')

        .lean();

      companyMap = new Map(companies.map((c) => [c._id.toString(), c.name]));

    }



    const events = page.map((e) => {

      const u = userMap.get(e.userId.toString());

      const cid = e.companyId.toString();

      return {

        _id: e._id.toString(),

        companyId: cid,

        companyName: companyMap.get(cid),

        userId: e.userId.toString(),

        storeId: e.storeId?.toString(),

        action: e.action,

        entityType: e.entityType,

        entityId: e.entityId,

        metadata: e.metadata,

        createdAt: (e as { createdAt?: Date }).createdAt,

        updatedAt: (e as { updatedAt?: Date }).updatedAt,

        userEmail: u?.email,

        userDisplayName: u?.displayName,

      };

    });



    return { events, nextCursor };

  }

}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}


