import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument, WebhookDelivery, WebhookDeliveryDocument } from '@lz3c/db';

export const WEBHOOK_EVENT_TYPES = [
  'pos.sale',
  'b2b.create',
  'b2b.transition',
  'transfer.transition',
  'company.invite',
  'company.invite_accept',
  'preorder.convert',
  'preorder.cancel',
  'credit_note.issue',
] as const;

const WEBHOOK_ACTIONS = new Set<string>(WEBHOOK_EVENT_TYPES);

const RETRY_DELAYS_MS = [0, 500, 1500];

export type WebhookDeliveryFilter = {
  limit?: number;
  event?: string;
  status?: 'success' | 'failed';
};

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(WebhookDelivery.name)
    private deliveryModel: Model<WebhookDeliveryDocument>,
  ) {}

  shouldNotify(action: string) {
    return WEBHOOK_ACTIONS.has(action);
  }

  private buildFilter(companyId: string | undefined, opts?: WebhookDeliveryFilter) {
    const filter: Record<string, unknown> = {};
    if (companyId) filter.companyId = new Types.ObjectId(companyId);
    if (opts?.event) filter.event = opts.event;
    if (opts?.status) filter.status = opts.status;
    return filter;
  }

  async listDeliveries(companyId: string, opts?: WebhookDeliveryFilter) {
    const limit = Math.min(opts?.limit ?? 50, 100);
    return this.deliveryModel
      .find(this.buildFilter(companyId, opts))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async getDelivery(companyId: string, deliveryId: string) {
    const row = await this.deliveryModel
      .findOne({
        _id: deliveryId,
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!row) throw new NotFoundException('Webhook delivery not found');
    return row;
  }

  async listGlobalDeliveries(companyId?: string, opts?: WebhookDeliveryFilter) {
    const limit = Math.min(opts?.limit ?? 50, 100);
    const match = this.buildFilter(companyId, opts);
    return this.deliveryModel.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: '_co',
        },
      },
      {
        $addFields: {
          companyName: { $arrayElemAt: ['$_co.name', 0] },
        },
      },
      { $project: { _co: 0 } },
    ]);
  }

  async exportCsv(companyId: string, opts?: WebhookDeliveryFilter): Promise<string> {
    const rows = await this.listDeliveries(companyId, { ...opts, limit: 500 });
    const header =
      'createdAt,event,status,attempts,httpStatus,url,lastError,entityType,entityId';
    const lines = rows.map((r) => {
      const p = (r.payload ?? {}) as Record<string, string>;
      const created = (r as { createdAt?: Date }).createdAt ?? new Date();
      return [
        new Date(created).toISOString(),
        csvCell(r.event),
        csvCell(r.status),
        r.attempts,
        r.httpStatus ?? '',
        csvCell(r.url),
        csvCell(r.lastError ?? ''),
        csvCell(p.entityType ?? ''),
        csvCell(p.entityId ?? ''),
      ].join(',');
    });
    return [header, ...lines].join('\n');
  }

  async retryAllFailed(companyId: string, opts?: WebhookDeliveryFilter) {
    const failed = await this.listDeliveries(companyId, {
      ...opts,
      status: 'failed',
      limit: 20,
    });
    let succeeded = 0;
    let stillFailed = 0;
    for (const row of failed) {
      const r = await this.retryDelivery(companyId, row._id.toString());
      if (r.dispatched) succeeded++;
      else stillFailed++;
    }
    return { attempted: failed.length, succeeded, stillFailed };
  }

  async retryDelivery(companyId: string, deliveryId: string) {
    const row = await this.deliveryModel
      .findOne({
        _id: deliveryId,
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!row) throw new NotFoundException('Webhook delivery not found');
    if (row.status !== 'failed') {
      throw new BadRequestException('Only failed deliveries can be retried');
    }
    return this.dispatch(companyId, row.event, {
      ...(row.payload ?? {}),
      retriedFrom: deliveryId,
    });
  }

  async dispatch(
    companyId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ dispatched: boolean; mode: string; attempts: number }> {
    if (!WEBHOOK_ACTIONS.has(event)) {
      return { dispatched: false, mode: 'skipped_action', attempts: 0 };
    }

    const company = await this.companyModel
      .findById(companyId)
      .select('webhookUrl name')
      .lean();
    const url = company?.webhookUrl?.trim();
    if (!url) {
      return { dispatched: false, mode: 'no_url', attempts: 0 };
    }

    const body = JSON.stringify({
      event,
      companyId,
      companyName: company?.name,
      at: new Date().toISOString(),
      ...payload,
    });

    let lastError = '';
    let httpStatus: number | undefined;
    let attempts = 0;

    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      if (RETRY_DELAYS_MS[i] > 0) {
        await sleep(RETRY_DELAYS_MS[i]);
      }
      attempts++;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-LZ3C-Event': event,
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        httpStatus = res.status;
        if (res.ok) {
          await this.deliveryModel.create({
            companyId: new Types.ObjectId(companyId),
            event,
            url,
            status: 'success',
            httpStatus: res.status,
            attempts,
            payload: {
              entityType: payload.entityType,
              entityId: payload.entityId,
              retriedFrom: payload.retriedFrom,
            },
          });
          return { dispatched: true, mode: 'http', attempts };
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }

    this.logger.warn(`Webhook ${url} failed after ${attempts} attempts: ${lastError}`);
    await this.deliveryModel.create({
      companyId: new Types.ObjectId(companyId),
      event,
      url,
      status: 'failed',
      httpStatus,
      attempts,
      lastError,
      payload: {
        entityType: payload.entityType,
        entityId: payload.entityId,
        retriedFrom: payload.retriedFrom,
      },
    });
    return { dispatched: false, mode: 'error', attempts };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function csvCell(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
