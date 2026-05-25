import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DailySummary,
  DailySummaryDocument,
  Order,
  OrderDocument,
  TaxCategory,
  TaxCategoryDocument,
  WorkOrder,
  WorkOrderDocument,
} from '@lz3c/db';
import { calculateLineTax, taxSchemeReportLabel, type TaxScheme } from '@lz3c/shared';
import { CompanyService } from '../company/company.service';
import { lineNetRevenue, orderNetPaymentSplit } from '../pos/payment.util';

/** When a repair receipt line has no cost, assume 50% gross margin on net (ex-VAT) revenue. */
const REPAIR_DEFAULT_PROFIT_MARGIN = 0.5;

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(WorkOrder.name) private woModel: Model<WorkOrderDocument>,
    @InjectModel(DailySummary.name)
    private summaryModel: Model<DailySummaryDocument>,
    @InjectModel(TaxCategory.name)
    private taxModel: Model<TaxCategoryDocument>,
    private companyService: CompanyService,
  ) {}

  async getSalesSummary(
    userId: string,
    companyId: string,
    storeId: string,
    from: string,
    to: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const orders = await this.orderModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        businessDate: { $gte: from, $lte: to },
        docType: 'receipt',
        status: 'completed',
      })
      .lean();

    const taxCategories = await this.taxModel
      .find({ companyId: new Types.ObjectId(companyId), isActive: true })
      .lean();

    let turnoverIncVat = 0;
    let vatTotal = 0;
    let costTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let otherTotal = 0;
    let itemsSold = 0;
    let repairRevenueIncVat = 0;

    const byTax = new Map<
      string,
      { revenueIncVat: number; vat: number; revenueExVat: number; cost: number }
    >();

    for (const o of orders) {
      const split = orderNetPaymentSplit(o);
      cashTotal += split.cash;
      cardTotal += split.card;
      otherTotal += split.other;

      for (const line of o.lines) {
        const refunded = line.refundedQuantity ?? 0;
        const remaining = line.quantity - refunded;
        if (remaining <= 0) continue;

        const net = lineNetRevenue(line);
        turnoverIncVat += net;
        itemsSold += remaining;
        if (line.workOrderId) repairRevenueIncVat += net;

        const unitGross = line.lineTotalIncVat / line.quantity;
        const scheme = (line.taxScheme || 'standard_23') as TaxScheme;
        const tax = calculateLineTax({
          scheme,
          salePriceIncVat: unitGross,
          costPreTax: line.costPreTax ?? 0,
          perspective: 'retail',
          quantity: remaining,
        });
        vatTotal += tax.vatAmount;
        const lineCost = effectiveLineCost(line, remaining, tax.netPreTax);
        costTotal += lineCost;

        const bucket = byTax.get(scheme) ?? {
          revenueIncVat: 0,
          vat: 0,
          revenueExVat: 0,
          cost: 0,
        };
        bucket.revenueIncVat += net;
        bucket.vat += tax.vatAmount;
        bucket.revenueExVat += tax.netPreTax;
        bucket.cost += lineCost;
        byTax.set(scheme, bucket);
      }
    }

    const turnoverExVat = turnoverIncVat - vatTotal;
    const grossProfit = turnoverExVat - costTotal;

    const openWorkOrders = await this.woModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      status: { $nin: ['completed', 'cancelled'] },
    });

    return {
      from,
      to,
      receiptCount: orders.length,
      itemsSold,
      turnoverIncVat: round2(turnoverIncVat),
      turnoverExVat: round2(turnoverExVat),
      vatTotal: round2(vatTotal),
      costTotal: round2(costTotal),
      grossProfit: round2(grossProfit),
      profitMarginPct:
        turnoverExVat > 0 ? round2((grossProfit / turnoverExVat) * 100) : 0,
      payments: {
        cash: round2(cashTotal),
        card: round2(cardTotal),
        other: round2(otherTotal),
        total: round2(turnoverIncVat),
      },
      repairRevenueIncVat: round2(repairRevenueIncVat),
      taxBreakdown: buildTaxBreakdown(taxCategories, byTax),
      openWorkOrders,
    };
  }

  async regenerate(
    userId: string,
    companyId: string,
    storeId: string,
    businessDate?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const date = businessDate ?? new Date().toISOString().slice(0, 10);

    const orders = await this.orderModel.find({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      businessDate: date,
      docType: 'receipt',
      status: 'completed',
    });

    let salesTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let otherTotal = 0;

    for (const o of orders) {
      const split = orderNetPaymentSplit(o);
      salesTotal += split.cash + split.card + split.other;
      cashTotal += split.cash;
      cardTotal += split.card;
      otherTotal += split.other;
    }

    const openWorkOrders = await this.woModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      status: { $nin: ['completed', 'cancelled'] },
    });

    return this.summaryModel.findOneAndUpdate(
      {
        storeId: new Types.ObjectId(storeId),
        businessDate: date,
      },
      {
        companyId: new Types.ObjectId(companyId),
        salesTotal: round2(salesTotal),
        salesCount: orders.length,
        cashTotal: round2(cashTotal),
        cardTotal: round2(cardTotal),
        otherTotal: round2(otherTotal),
        openWorkOrders,
      },
      { upsert: true, new: true },
    );
  }

  async getSummary(
    userId: string,
    companyId: string,
    storeId: string,
    businessDate?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const date = businessDate ?? new Date().toISOString().slice(0, 10);
    let summary = await this.summaryModel.findOne({
      storeId: new Types.ObjectId(storeId),
      businessDate: date,
    });
    if (!summary) {
      summary = await this.regenerate(userId, companyId, storeId, date);
    }
    return summary;
  }

  async companyRollup(userId: string, companyId: string, businessDate?: string) {
    await this.companyService.assertMember(userId, companyId);
    const date = businessDate ?? new Date().toISOString().slice(0, 10);

    const summaries = await this.summaryModel.find({
      companyId: new Types.ObjectId(companyId),
      businessDate: date,
    });

    const orders = await this.orderModel.find({
      companyId: new Types.ObjectId(companyId),
      businessDate: date,
      docType: 'receipt',
      status: 'completed',
    });

    let marginEstimate = 0;
    for (const o of orders) {
      for (const line of o.lines) {
        const refunded = line.refundedQuantity ?? 0;
        const remaining = line.quantity - refunded;
        if (remaining <= 0) continue;
        const net = lineNetRevenue(line);
        const cost = (line.costPreTax ?? 0) * remaining;
        marginEstimate += net - cost;
      }
    }

    return {
      businessDate: date,
      storeCount: summaries.length,
      salesTotal: round2(summaries.reduce((s, x) => s + x.salesTotal, 0)),
      salesCount: summaries.reduce((s, x) => s + x.salesCount, 0),
      cashTotal: round2(summaries.reduce((s, x) => s + x.cashTotal, 0)),
      cardTotal: round2(summaries.reduce((s, x) => s + x.cardTotal, 0)),
      openWorkOrders: summaries.reduce((s, x) => s + x.openWorkOrders, 0),
      marginEstimate: round2(marginEstimate),
      stores: summaries,
    };
  }

  async exportDailyCsv(
    userId: string,
    companyId: string,
    storeId: string,
    businessDate?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const date = businessDate ?? new Date().toISOString().slice(0, 10);
    const summary = await this.getSummary(userId, companyId, storeId, date);

    const orders = await this.orderModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        businessDate: date,
        docType: 'receipt',
        status: 'completed',
      })
      .sort({ docNumber: 1 })
      .lean();

    const lines: string[][] = [
      ['section', 'field', 'value'],
      ['summary', 'businessDate', date],
      ['summary', 'salesTotal', String(summary.salesTotal)],
      ['summary', 'salesCount', String(summary.salesCount)],
      ['summary', 'cashTotal', String(summary.cashTotal)],
      ['summary', 'cardTotal', String(summary.cardTotal)],
      ['summary', 'otherTotal', String(summary.otherTotal)],
      ['summary', 'openWorkOrders', String(summary.openWorkOrders)],
      [],
      ['docNumber', 'paymentMethod', 'productName', 'quantity', 'lineTotalIncVat', 'sn'],
    ];

    for (const o of orders) {
      for (const line of o.lines) {
        const refunded = line.refundedQuantity ?? 0;
        const remaining = line.quantity - refunded;
        if (remaining <= 0) continue;
        lines.push([
          o.docNumber,
          o.paymentMethod,
          line.productName,
          String(remaining),
          String(lineNetRevenue(line)),
          line.sn ?? '',
        ]);
      }
    }

    return lines.map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  async exportCompanyCsv(userId: string, companyId: string, businessDate?: string) {
    const rollup = await this.companyRollup(userId, companyId, businessDate);
    const lines: string[][] = [
      ['section', 'field', 'value'],
      ['company', 'businessDate', rollup.businessDate],
      ['company', 'salesTotal', String(rollup.salesTotal)],
      ['company', 'salesCount', String(rollup.salesCount)],
      ['company', 'cashTotal', String(rollup.cashTotal)],
      ['company', 'cardTotal', String(rollup.cardTotal)],
      ['company', 'marginEstimate', String(rollup.marginEstimate)],
      ['company', 'storeCount', String(rollup.storeCount)],
      [],
      ['storeId', 'salesTotal', 'salesCount', 'cashTotal', 'cardTotal', 'openWorkOrders'],
    ];

    for (const s of rollup.stores as { storeId: Types.ObjectId; salesTotal: number; salesCount: number; cashTotal: number; cardTotal: number; openWorkOrders: number }[]) {
      lines.push([
        s.storeId.toString(),
        String(s.salesTotal),
        String(s.salesCount),
        String(s.cashTotal),
        String(s.cardTotal),
        String(s.openWorkOrders),
      ]);
    }

    return lines.map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  async exportRangeCsv(
    userId: string,
    companyId: string,
    from: string,
    to: string,
    storeId?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const q: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      businessDate: { $gte: from, $lte: to },
      docType: 'receipt',
      status: 'completed',
    };
    if (storeId) q.storeId = new Types.ObjectId(storeId);

    const orders = await this.orderModel.find(q).sort({ businessDate: 1, docNumber: 1 }).lean();

    const lines: string[][] = [
      ['from', 'to', from, to],
      ['docNumber', 'businessDate', 'storeId', 'paymentMethod', 'productName', 'quantity', 'lineTotalIncVat', 'sn'],
    ];

    let total = 0;
    for (const o of orders) {
      for (const line of o.lines) {
        const net = lineNetRevenue(line);
        if (net <= 0) continue;
        const refunded = line.refundedQuantity ?? 0;
        const remaining = line.quantity - refunded;
        total += net;
        lines.push([
          o.docNumber,
          o.businessDate ?? '',
          o.storeId.toString(),
          o.paymentMethod,
          line.productName,
          String(remaining),
          String(net),
          line.sn ?? '',
        ]);
      }
    }
    lines.push([]);
    lines.push(['totalSales', String(round2(total)), 'receiptCount', String(orders.length)]);

    return lines.map((row) => row.map(csvEscape).join(',')).join('\n');
  }
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function effectiveLineCost(
  line: { workOrderId?: unknown; costPreTax?: number },
  quantity: number,
  revenueExVat: number,
): number {
  const recorded = (line.costPreTax ?? 0) * quantity;
  if (line.workOrderId && recorded <= 0) {
    return round2(revenueExVat * (1 - REPAIR_DEFAULT_PROFIT_MARGIN));
  }
  return recorded;
}

function buildTaxBreakdown(
  taxCategories: { name: string; scheme: string }[],
  byTax: Map<
    string,
    { revenueIncVat: number; vat: number; revenueExVat: number; cost: number }
  >,
) {
  const empty = () => ({
    revenueIncVat: 0,
    vat: 0,
    revenueExVat: 0,
    cost: 0,
  });
  const seen = new Set<string>();
  const rows = taxCategories
    .filter((cat) => cat.scheme !== 'zero')
    .map((cat) => {
      seen.add(cat.scheme);
      const row = byTax.get(cat.scheme) ?? empty();
      return {
        scheme: cat.scheme,
        label: taxSchemeReportLabel(cat.scheme),
        revenueIncVat: round2(row.revenueIncVat),
        vat: round2(row.vat),
        revenueExVat: round2(row.revenueExVat),
        cost: round2(row.cost),
        profit: round2(row.revenueExVat - row.cost),
      };
    });

  for (const [scheme, row] of byTax.entries()) {
    if (seen.has(scheme) || scheme === 'zero') continue;
    rows.push({
      scheme,
      label: taxSchemeReportLabel(scheme),
      revenueIncVat: round2(row.revenueIncVat),
      vat: round2(row.vat),
      revenueExVat: round2(row.revenueExVat),
      cost: round2(row.cost),
      profit: round2(row.revenueExVat - row.cost),
    });
  }

  return rows.sort((a, b) => b.revenueIncVat - a.revenueIncVat);
}
