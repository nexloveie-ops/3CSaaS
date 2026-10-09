import { BadRequestException, Injectable } from '@nestjs/common';
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
    const range = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      businessDate: { $gte: from, $lte: to },
      status: 'completed',
    };
    const [orders, creditNotes] = await Promise.all([
      this.orderModel.find({ ...range, docType: 'receipt' }).lean(),
      this.orderModel.find({ ...range, docType: 'credit_note' }).lean(),
    ]);

    const taxCategories = await this.taxModel
      .find({ companyId: new Types.ObjectId(companyId), isActive: true })
      .lean();

    let turnoverIncVat = 0;
    let vatTotal = 0;
    let costTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let tapTotal = 0;
    let otherTotal = 0;
    let itemsSold = 0;
    let repairRevenueIncVat = 0;

    const byTax = new Map<
      string,
      { revenueIncVat: number; vat: number; revenueExVat: number; cost: number }
    >();

    const apply = (order: (typeof orders)[number], sign: number) => {
      const split = grossPaymentSplit(order);
      cashTotal += sign * split.cash;
      cardTotal += sign * split.card;
      tapTotal += sign * split.tap;
      otherTotal += sign * split.other;

      for (const line of order.lines) {
        const figures = lineFigures(line);
        if (figures.gross <= 0 && figures.items <= 0) continue;
        turnoverIncVat += sign * figures.gross;
        itemsSold += sign * figures.items;
        if (line.workOrderId) repairRevenueIncVat += sign * figures.gross;
        vatTotal += sign * figures.vat;
        costTotal += sign * figures.cost;

        const scheme = (line.taxScheme || 'standard_23') as TaxScheme;
        const bucket = byTax.get(scheme) ?? {
          revenueIncVat: 0,
          vat: 0,
          revenueExVat: 0,
          cost: 0,
        };
        bucket.revenueIncVat += sign * figures.gross;
        bucket.vat += sign * figures.vat;
        bucket.revenueExVat += sign * figures.net;
        bucket.cost += sign * figures.cost;
        byTax.set(scheme, bucket);
      }
    };
    for (const order of orders) apply(order, 1);
    for (const note of creditNotes) apply(note, -1);

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
        tap: round2(tapTotal),
        other: round2(otherTotal),
        total: round2(turnoverIncVat),
      },
      repairRevenueIncVat: round2(repairRevenueIncVat),
      taxBreakdown: buildTaxBreakdown(taxCategories, byTax),
      openWorkOrders,
    };
  }

  async getSalesLines(
    userId: string,
    companyId: string,
    storeId: string,
    from: string,
    to: string,
    scheme: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const allowed = ['zero', 'standard_13_5', 'standard_23', 'margin_23'];
    if (!allowed.includes(scheme)) {
      throw new BadRequestException('Unknown tax category');
    }
    const range = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      businessDate: { $gte: from, $lte: to },
      status: 'completed',
    };
    const [orders, creditNotes] = await Promise.all([
      this.orderModel.find({ ...range, docType: 'receipt' }).lean(),
      this.orderModel.find({ ...range, docType: 'credit_note' }).lean(),
    ]);

    const lines: {
      id: string;
      docNumber: string;
      businessDate: string;
      docType: string;
      productName: string;
      quantity: number;
      unitPriceIncVat: number;
      lineTotalIncVat: number;
      sn?: string;
    }[] = [];
    const push = (
      order: (typeof orders)[number],
      sign: number,
    ) => {
      order.lines.forEach((line, index) => {
        const lineScheme = line.taxScheme || 'standard_23';
        if (lineScheme !== scheme) return;
        const figures = lineFigures(line);
        if (figures.gross <= 0 && figures.items <= 0) return;
        lines.push({
          id: `${String(order._id)}:${index}`,
          docNumber: order.docNumber,
          businessDate: order.businessDate ?? '',
          docType: order.docType,
          productName: line.productName,
          quantity: sign * figures.items,
          unitPriceIncVat: line.unitPriceIncVat,
          lineTotalIncVat: round2(sign * figures.gross),
          sn: line.sn?.trim() || undefined,
        });
      });
    };
    for (const order of orders) push(order, 1);
    for (const note of creditNotes) push(note, -1);
    lines.sort((a, b) => {
      const byDate = b.businessDate.localeCompare(a.businessDate);
      if (byDate) return byDate;
      return b.docNumber.localeCompare(a.docNumber);
    });

    return {
      scheme,
      label: taxSchemeReportLabel(scheme),
      from,
      to,
      lines,
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

    const day = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      businessDate: date,
      status: 'completed',
    };
    const [orders, creditNotes] = await Promise.all([
      this.orderModel.find({ ...day, docType: 'receipt' }),
      this.orderModel.find({ ...day, docType: 'credit_note' }),
    ]);

    let salesTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let tapTotal = 0;
    let otherTotal = 0;

    const applySplit = (
      order: { paymentMethod: string; totalIncVat: number; cashAmount?: number; cardAmount?: number },
      sign: number,
    ) => {
      const split = grossPaymentSplit(order);
      salesTotal += sign * (split.cash + split.card + split.tap + split.other);
      cashTotal += sign * split.cash;
      cardTotal += sign * split.card;
      tapTotal += sign * split.tap;
      otherTotal += sign * split.other;
    };
    for (const order of orders) applySplit(order, 1);
    for (const note of creditNotes) applySplit(note, -1);

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
        tapTotal: round2(tapTotal),
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

    const [orders, creditNotes] = await Promise.all([
      this.orderModel.find({
        companyId: new Types.ObjectId(companyId),
        businessDate: date,
        docType: 'receipt',
        status: 'completed',
      }),
      this.orderModel.find({
        companyId: new Types.ObjectId(companyId),
        businessDate: date,
        docType: 'credit_note',
        status: 'completed',
      }),
    ]);

    let marginEstimate = 0;
    const addMargin = (lines: { lineTotalIncVat: number; quantity: number; taxScheme?: string; costPreTax?: number; workOrderId?: unknown }[], sign: number) => {
      for (const line of lines) {
        const figures = lineFigures(line);
        marginEstimate += sign * (figures.gross - figures.cost);
      }
    };
    for (const order of orders) addMargin(order.lines, 1);
    for (const note of creditNotes) addMargin(note.lines, -1);

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

    const dayFilter = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      businessDate: date,
      status: 'completed' as const,
    };
    const [orders, creditNotes] = await Promise.all([
      this.orderModel.find({ ...dayFilter, docType: 'receipt' }).sort({ docNumber: 1 }).lean(),
      this.orderModel.find({ ...dayFilter, docType: 'credit_note' }).sort({ docNumber: 1 }).lean(),
    ]);

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

    const pushLines = (
      docs: typeof orders,
      sign: number,
    ) => {
      for (const o of docs) {
        for (const line of o.lines) {
          const figures = lineFigures(line);
          if (figures.gross <= 0 && figures.items <= 0) continue;
          lines.push([
            o.docNumber,
            o.paymentMethod,
            line.productName,
            String(sign * figures.items),
            String(round2(sign * figures.gross)),
            line.sn ?? '',
          ]);
        }
      }
    };
    pushLines(orders, 1);
    pushLines(creditNotes, -1);

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
    const creditFilter = { ...q, docType: 'credit_note' };
    const creditNotes = await this.orderModel
      .find(creditFilter)
      .sort({ businessDate: 1, docNumber: 1 })
      .lean();

    const lines: string[][] = [
      ['from', 'to', from, to],
      ['docNumber', 'businessDate', 'storeId', 'paymentMethod', 'productName', 'quantity', 'lineTotalIncVat', 'sn'],
    ];

    let total = 0;
    const pushRange = (docs: typeof orders, sign: number) => {
      for (const o of docs) {
        for (const line of o.lines) {
          const figures = lineFigures(line);
          if (figures.gross <= 0 && figures.items <= 0) continue;
          total += sign * figures.gross;
          lines.push([
            o.docNumber,
            o.businessDate ?? '',
            o.storeId.toString(),
            o.paymentMethod,
            line.productName,
            String(sign * figures.items),
            String(round2(sign * figures.gross)),
            line.sn ?? '',
          ]);
        }
      }
    };
    pushRange(orders, 1);
    pushRange(creditNotes, -1);
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

function grossPaymentSplit(order: {
  paymentMethod: string;
  totalIncVat: number;
  cashAmount?: number;
  cardAmount?: number;
}): { cash: number; card: number; tap: number; other: number } {
  if (order.paymentMethod === 'tap_to_pay') {
    return { cash: 0, card: 0, tap: order.totalIncVat, other: 0 };
  }
  const cash = order.cashAmount ?? 0;
  const card = order.cardAmount ?? 0;
  if (cash > 0 || card > 0) {
    const covered = round2(cash + card);
    const remainder = round2(Math.max(0, order.totalIncVat - covered));
    const other =
      order.paymentMethod === 'other' ||
      order.paymentMethod === 'bank_transfer' ||
      order.paymentMethod === 'mixed'
        ? remainder
        : 0;
    return { cash, card, tap: 0, other };
  }
  if (order.paymentMethod === 'card') return { cash: 0, card: order.totalIncVat, tap: 0, other: 0 };
  if (order.paymentMethod === 'cash') return { cash: order.totalIncVat, card: 0, tap: 0, other: 0 };
  return { cash: 0, card: 0, tap: 0, other: order.totalIncVat };
}

function lineFigures(line: {
  quantity: number;
  lineTotalIncVat: number;
  taxScheme?: string;
  costPreTax?: number;
  workOrderId?: unknown;
}): { gross: number; vat: number; net: number; cost: number; items: number } {
  const gross = line.lineTotalIncVat;
  if (gross <= 0 && line.quantity <= 0) {
    return { gross: 0, vat: 0, net: 0, cost: 0, items: 0 };
  }
  const taxQty = line.quantity > 0 ? line.quantity : 1;
  const unit = gross / taxQty;
  const scheme = (line.taxScheme || 'standard_23') as TaxScheme;
  const tax = calculateLineTax({
    scheme,
    salePriceIncVat: unit,
    costPreTax: line.costPreTax ?? 0,
    perspective: 'retail',
    quantity: taxQty,
  });
  const items = line.quantity > 0 ? line.quantity : 0;
  const cost = items > 0 ? effectiveLineCost(line, items, tax.netPreTax) : 0;
  return { gross, vat: tax.vatAmount, net: tax.netPreTax, cost, items };
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
