import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  B2bCustomer,
  B2bCustomerDocument,
  Company,
  CompanyDocument,
  Order,
  OrderDocument,
  Product,
  ProductDocument,
  Store,
  StoreDocument,
  TaxCategory,
  TaxCategoryDocument,
  WorkOrder,
  WorkOrderDocument,
} from '@lz3c/db';
import { canTransition } from '../service/work-order.transitions';
import { calculateLineTax, TaxScheme, taxSchemeReportLabel } from '@lz3c/shared';
import { AuditService } from '../common/services/audit.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportService } from '../report/report.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import {
  buildReceiptPaymentLines,
  formatPaymentMethodLabel,
  orderNetRevenue,
  resolveSalePayment,
} from './payment.util';
import { FeiePrintService } from '../printing/feie-print.service';
import { renderSaleTicket } from '../printing/tickets';
import { PosReceiptService } from './pos-receipt.service';

@Injectable()
export class PosService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(WorkOrder.name) private woModel: Model<WorkOrderDocument>,
    @InjectModel(B2bCustomer.name)
    private b2bCustomerModel: Model<B2bCustomerDocument>,
    private companyService: CompanyService,
    private inventoryService: InventoryService,
    private docSeq: DocumentSequenceService,
    private receiptService: PosReceiptService,
    private feie: FeiePrintService,
    private audit: AuditService,
    private reportService: ReportService,
  ) {}

  async getOrder(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const order = await this.orderModel
      .findOne({
        _id: orderId,
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        docType: { $in: ['receipt', 'invoice_b2b'] },
      })
      .lean();
    if (!order) throw new NotFoundException('Receipt not found');
    return order;
  }

  async recordB2bInvoicePayment(
    userId: string,
    companyId: string,
    orderId: string,
    dto: { paidAt: string; paymentMethod: string; amount: number },
  ) {
    await this.companyService.assertMember(userId, companyId);
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      docType: 'invoice_b2b',
      status: 'completed',
    });
    if (!order) throw new NotFoundException('B2B invoice not found');

    const currentStatus =
      order.paymentStatus === 'paid' || order.paymentStatus === 'partial'
        ? order.paymentStatus
        : 'unpaid';
    if (currentStatus === 'paid') {
      throw new BadRequestException('Invoice is already paid');
    }

    const amount = Math.round(Number(dto.amount) * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const paidAt = new Date(dto.paidAt);
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('Invalid payment date');
    }

    const total = Number(order.totalIncVat) || 0;
    const paymentStatus = amount + 0.001 >= total ? 'paid' : 'partial';

    order.paymentStatus = paymentStatus;
    order.paymentMethod = dto.paymentMethod;
    order.paidAmount = amount;
    order.paidAt = paidAt;
    await order.save();

    void this.audit.log({
      companyId,
      userId,
      action: 'pos.b2b_payment',
      entityType: 'order',
      entityId: order._id.toString(),
      metadata: {
        docNumber: order.docNumber,
        paymentStatus,
        paymentMethod: dto.paymentMethod,
        paidAmount: amount,
        paidAt: paidAt.toISOString(),
      },
    });

    return {
      _id: order._id,
      docNumber: order.docNumber,
      totalIncVat: order.totalIncVat,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      paidAmount: order.paidAmount,
      paidAt: order.paidAt,
    };
  }

  async getReceiptHtml(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
    opts?: { forPdf?: boolean },
  ) {
    const order = await this.getOrder(userId, companyId, storeId, orderId);
    if (order.docType === 'invoice_b2b') {
      return this.renderB2bInvoiceHtml(companyId, order, { forPdf: opts?.forPdf });
    }
    const store = await this.storeModel.findById(storeId).lean();
    return this.receiptService.render({
      docNumber: order.docNumber,
      businessDate: order.businessDate ?? new Date().toISOString().slice(0, 10),
      paymentMethod: order.paymentMethod,
      paymentMethodLabel: formatPaymentMethodLabel(order.paymentMethod),
      paymentLines: buildReceiptPaymentLines(order),
      storeName: store?.name ?? 'Store',
      storeAddress: store?.address,
      storePhone: store?.phone,
      storeEmail: store?.email,
      lines: order.lines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        unitPriceIncVat: l.unitPriceIncVat,
        lineTotalIncVat: l.lineTotalIncVat,
        sn: l.sn,
      })),
      totalIncVat: order.totalIncVat,
      salesTerms: store?.salesTerms,
    });
  }

  /** Retail receipt only. Repair failures never reach this path. */
  async printFeie(userId: string, companyId: string, storeId: string, orderId: string) {
    const order = await this.getOrder(userId, companyId, storeId, orderId);
    if (order.docType !== 'receipt') {
      throw new BadRequestException('Only retail receipts can be sent to the Feie printer');
    }
    const store = await this.storeModel.findById(storeId).lean();
    const content = renderSaleTicket({
      storeName: store?.name ?? 'Store',
      storeAddress: store?.address,
      storePhone: store?.phone,
      docNumber: order.docNumber,
      businessDate: order.businessDate ?? new Date().toISOString().slice(0, 10),
      lines: order.lines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        lineTotalIncVat: l.lineTotalIncVat,
        sn: l.sn,
      })),
      totalIncVat: order.totalIncVat,
      paymentLines: buildReceiptPaymentLines(order),
      salesTerms: store?.salesTerms,
    });
    return this.feie.print(companyId, storeId, content);
  }

  private async renderB2bInvoiceHtml(
    companyId: string,
    order: {
      docNumber: string;
      businessDate?: string;
      totalIncVat: number;
      totalVat: number;
      b2bCustomerId?: Types.ObjectId;
      b2bCustomerName?: string;
      lines: {
        productId?: Types.ObjectId;
        productName: string;
        quantity: number;
        unitPriceIncVat: number;
        lineTotalIncVat: number;
        taxScheme?: string;
        costPreTax?: number;
        sn?: string;
      }[];
    },
    opts?: { forPdf?: boolean },
  ) {
    const [company, buyer] = await Promise.all([
      this.companyModel.findById(companyId).lean(),
      order.b2bCustomerId
        ? this.b2bCustomerModel.findById(order.b2bCustomerId).lean()
        : Promise.resolve(null),
    ]);
    if (!company) throw new NotFoundException('Company not found');

    const productIds = order.lines
      .map((l) => l.productId)
      .filter((id): id is Types.ObjectId => !!id);
    const products = productIds.length
      ? await this.productModel
          .find({ _id: { $in: productIds }, companyId: new Types.ObjectId(companyId) })
          .lean()
      : [];
    const invoiceNameByProductId = new Map(
      products.map((p) => [String(p._id), this.invoiceProductName(p)]),
    );

    const vatByScheme = new Map<string, { label: string; net: number; vat: number }>();
    let subtotalPreTax = 0;
    let totalVat = 0;
    const isPreview = order.docNumber === 'PREVIEW';

    const lines = order.lines.map((l) => {
      const scheme = (l.taxScheme ?? 'standard_23') as TaxScheme;
      const lineGross = l.lineTotalIncVat ?? l.unitPriceIncVat * l.quantity;
      const tax =
        scheme === 'margin_23'
          ? {
              netPreTax: Math.round(lineGross * 100) / 100,
              vatAmount: 0,
              gross: Math.round(lineGross * 100) / 100,
            }
          : calculateLineTax({
              scheme,
              salePriceIncVat: l.unitPriceIncVat,
              perspective: 'retail',
              quantity: l.quantity,
            });
      const vatLabel = taxSchemeReportLabel(scheme);
      subtotalPreTax += tax.netPreTax;
      totalVat += tax.vatAmount;

      const bucket = vatByScheme.get(scheme) ?? { label: vatLabel, net: 0, vat: 0 };
      bucket.net += tax.netPreTax;
      bucket.vat += tax.vatAmount;
      vatByScheme.set(scheme, bucket);

      const productName =
        (l.productId && invoiceNameByProductId.get(String(l.productId))) ||
        this.invoiceProductName({ name: l.productName });

      return {
        productName,
        quantity: l.quantity,
        unitPriceIncVat: l.unitPriceIncVat,
        lineTotalIncVat: l.lineTotalIncVat,
        lineNetPreTax: tax.netPreTax,
        lineVat: tax.vatAmount,
        vatLabel,
        sn: l.sn,
      };
    });

    return this.receiptService.renderB2bInvoice({
      docNumber: order.docNumber,
      businessDate: order.businessDate ?? new Date().toISOString().slice(0, 10),
      seller: {
        name: company.name,
        legalName: company.legalName,
        vatNumber: company.vatNumber,
        registrationNumber: company.registrationNumber,
        address: company.address,
        contactPhone: company.contactPhone,
        contactEmail: company.contactEmail,
        bankAccount: company.bankAccount,
      },
      buyer: {
        name: buyer?.name ?? order.b2bCustomerName ?? 'Customer',
        registrationNumber: buyer?.registrationNumber,
        vatNumber: buyer?.vatNumber,
        address: buyer?.address,
        phone: buyer?.phone,
        email: buyer?.email,
      },
      lines,
      vatBreakdown: Array.from(vatByScheme.values()).map((v) => ({
        label: v.label,
        net: Math.round(v.net * 100) / 100,
        vat: Math.round(v.vat * 100) / 100,
      })),
      subtotalPreTax: Math.round(subtotalPreTax * 100) / 100,
      totalIncVat: order.totalIncVat,
      totalVat: Math.round(totalVat * 100) / 100,
      statusLabel: opts?.forPdf
        ? undefined
        : isPreview
          ? 'Draft preview'
          : 'Awaiting payment',
      showConfirmSend: isPreview && !opts?.forPdf,
      omitToolbar: !!opts?.forPdf,
    });
  }

  async getB2bCustomerEmail(companyId: string, b2bCustomerId: string) {
    const buyer = await this.getB2bCustomer(companyId, b2bCustomerId);
    return buyer?.email;
  }

  async getB2bCustomer(companyId: string, b2bCustomerId: string) {
    const buyer = await this.b2bCustomerModel
      .findOne({
        _id: b2bCustomerId,
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!buyer) return null;
    return {
      name: buyer.name,
      email: buyer.email?.trim() || undefined,
    };
  }

  async getCompanyDisplayName(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) return 'Company';
    return (company.legalName || company.name || 'Company').trim();
  }

  /**
   * Build B2B invoice HTML from cart lines without creating an order or changing stock.
   */
  async previewB2bInvoice(
    userId: string,
    companyId: string,
    storeId: string,
    dto: { b2bCustomerId: string; lines: {
      productId?: string;
      adHocDescription?: string;
      taxCategoryId?: string;
      costPreTax?: number;
      quantity: number;
      unitPriceIncVat?: number;
      sn?: string;
      workOrderId?: string;
    }[] },
  ): Promise<string> {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line required');
    }

    const buyer = await this.b2bCustomerModel
      .findOne({
        _id: dto.b2bCustomerId,
        companyId: new Types.ObjectId(companyId),
        isActive: true,
      })
      .lean();
    if (!buyer) {
      throw new BadRequestException('B2B customer not found');
    }

    const orderLines: {
      productId?: Types.ObjectId;
      productName: string;
      quantity: number;
      unitPriceIncVat: number;
      lineTotalIncVat: number;
      taxScheme: string;
      costPreTax?: number;
      sn?: string;
    }[] = [];
    let totalIncVat = 0;
    let totalVat = 0;

    for (const line of dto.lines) {
      if (line.adHocDescription?.trim()) {
        if (!line.taxCategoryId) {
          throw new BadRequestException('Tax category required for quick sale lines');
        }
        const tax = await this.taxModel
          .findOne({
            _id: line.taxCategoryId,
            companyId: new Types.ObjectId(companyId),
          })
          .lean();
        if (!tax) throw new BadRequestException('Tax category missing');

        const unitPrice = line.unitPriceIncVat ?? 0;
        const lineGross = unitPrice * line.quantity;
        const taxResult = calculateLineTax({
          scheme: tax.scheme as TaxScheme,
          salePriceIncVat: unitPrice,
          costPreTax: line.costPreTax,
          perspective: 'retail',
          quantity: line.quantity,
        });
        totalIncVat += lineGross;
        totalVat += taxResult.vatAmount;
        orderLines.push({
          productName: line.adHocDescription.trim(),
          quantity: line.quantity,
          unitPriceIncVat: unitPrice,
          lineTotalIncVat: lineGross,
          taxScheme: tax.scheme,
          costPreTax: line.costPreTax,
          sn: line.sn,
        });
        continue;
      }

      if (!line.productId) {
        throw new BadRequestException('Each line needs productId or adHocDescription');
      }

      const product = await this.productModel
        .findOne({
          _id: line.productId,
          companyId: new Types.ObjectId(companyId),
        })
        .lean();
      if (!product) throw new BadRequestException(`Product ${line.productId} not found`);

      const tax = await this.taxModel.findById(product.taxCategoryId).lean();
      if (!tax) throw new BadRequestException('Tax category missing');

      const unitPrice =
        line.unitPriceIncVat ?? product.retailPrice ?? product.costPrice;
      const lineGross = unitPrice * line.quantity;
      const taxResult = calculateLineTax({
        scheme: tax.scheme as TaxScheme,
        salePriceIncVat: unitPrice,
        costPreTax: product.costPrice,
        perspective: 'retail',
        quantity: line.quantity,
      });

      const lineLabel = line.workOrderId
        ? await this.workOrderLineName(line.workOrderId, this.invoiceProductName(product))
        : this.invoiceProductName(product);

      totalIncVat += lineGross;
      totalVat += taxResult.vatAmount;
      orderLines.push({
        productId: product._id,
        productName: lineLabel,
        quantity: line.quantity,
        unitPriceIncVat: unitPrice,
        lineTotalIncVat: lineGross,
        taxScheme: tax.scheme,
        costPreTax: product.costPrice,
        sn: line.sn,
      });
    }

    return this.renderB2bInvoiceHtml(companyId, {
      docNumber: 'PREVIEW',
      businessDate: new Date().toISOString().slice(0, 10),
      totalIncVat: Math.round(totalIncVat * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      b2bCustomerId: buyer._id,
      b2bCustomerName: buyer.name,
      lines: orderLines,
    });
  }

  async searchReceipts(
    userId: string,
    companyId: string,
    storeId: string,
    query: { from?: string; to?: string; q?: string },
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const from = query.from?.trim() ?? '';
    const to = query.to?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      throw new BadRequestException('Choose a valid date range');
    }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    if (span > 366) throw new BadRequestException('Date range cannot exceed 366 days');

    const company = new Types.ObjectId(companyId);
    const store = new Types.ObjectId(storeId);
    const filter: Record<string, unknown> = {
      companyId: company,
      storeId: store,
      docType: 'receipt',
      status: 'completed',
      businessDate: { $gte: from, $lte: to },
    };

    const term = query.q?.trim() ?? '';
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: Record<string, unknown>[] = [
        { docNumber: rx },
        { b2bCustomerName: rx },
        { 'lines.productName': rx },
        { 'lines.sn': rx },
      ];
      const products = await this.productModel
        .find({ companyId: company, barcode: rx })
        .select('_id')
        .limit(50)
        .lean();
      if (products.length) {
        or.push({ 'lines.productId': { $in: products.map((p) => p._id) } });
      }
      const workOrders = await this.woModel
        .find({
          companyId: company,
          $or: [
            { customerName: rx },
            { customerPhone: rx },
            { imeiSn: rx },
            { serialSn: rx },
            { docNumber: rx },
          ],
        })
        .select('_id')
        .limit(200)
        .lean();
      if (workOrders.length) {
        or.push({ 'lines.workOrderId': { $in: workOrders.map((w) => w._id) } });
      }
      filter.$or = or;
    }

    const orders = await this.orderModel
      .find(filter)
      .sort({ businessDate: -1, createdAt: -1 })
      .limit(80)
      .lean();

    const ids = orders.map((o) => o._id);
    const [notes, workOrders] = await Promise.all([
      ids.length
        ? this.orderModel
            .find({ sourceOrderId: { $in: ids }, docType: 'credit_note' })
            .select('sourceOrderId totalIncVat')
            .lean()
        : [],
      this.workOrdersFor(orders),
    ]);
    const refundedByOrder = new Map<string, number>();
    for (const note of notes) {
      const key = String(note.sourceOrderId);
      refundedByOrder.set(key, round2((refundedByOrder.get(key) ?? 0) + note.totalIncVat));
    }

    return orders.map((o) => {
      const refunded = refundedByOrder.get(String(o._id)) ?? 0;
      const customer = this.customerFor(o, workOrders);
      return {
        _id: String(o._id),
        docNumber: o.docNumber,
        businessDate: o.businessDate,
        totalIncVat: o.totalIncVat,
        refundedTotalIncVat: refunded,
        refundableAmount: round2(Math.max(0, o.totalIncVat - refunded)),
        refundStatus: lineRefundStatus(o.lines),
        paymentMethod: o.paymentMethod,
        customerName: customer.name,
        customerPhone: customer.phone,
        summary: o.lines
          .map((line) => (line.sn ? `${line.productName} ${line.sn}` : line.productName))
          .join(', '),
      };
    });
  }

  async listToday(
    userId: string,
    companyId: string,
    storeId: string,
  ): Promise<Record<string, unknown>[]> {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const businessDate = new Date().toISOString().slice(0, 10);
    const orders = await this.orderModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        businessDate,
        docType: 'receipt',
        status: 'completed',
      })
      .sort({ createdAt: -1 })
      .lean();

    return orders.map((o) => {
      const net = orderNetRevenue(o);
      return {
        ...o,
        netTotalIncVat: net,
        refundedTotalIncVat: round2(o.totalIncVat - net),
      };
    });
  }

  async getReceiptDetail(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.getOrder(userId, companyId, storeId, orderId);
    const creditNotes = await this.orderModel
      .find({
        companyId: new Types.ObjectId(companyId),
        sourceOrderId: order._id,
        docType: 'credit_note',
      })
      .sort({ createdAt: -1 })
      .lean();

    const lines = order.lines.map((line, index) => {
      const refunded = line.refundedQuantity ?? 0;
      const refundable = line.quantity - refunded;
      const unit = line.quantity > 0 ? line.lineTotalIncVat / line.quantity : 0;
      return {
        lineIndex: index,
        productId: line.productId ? String(line.productId) : undefined,
        productName: line.productName,
        quantity: line.quantity,
        refundedQuantity: refunded,
        refundableQuantity: refundable,
        refundableAmount: round2(Math.max(0, unit * refundable)),
        unitPriceIncVat: line.unitPriceIncVat,
        lineTotalIncVat: line.lineTotalIncVat,
        sn: line.sn,
        workOrderId: line.workOrderId ? String(line.workOrderId) : undefined,
      };
    });

    const refundedMoney = round2(creditNotes.reduce((sum, cn) => sum + cn.totalIncVat, 0));
    const customer = this.customerFor(order, await this.workOrdersFor([order]));

    return {
      ...order,
      netTotalIncVat: round2(Math.max(0, order.totalIncVat - refundedMoney)),
      refundedTotalIncVat: refundedMoney,
      refundableAmount: round2(Math.max(0, order.totalIncVat - refundedMoney)),
      refundStatus: lineRefundStatus(order.lines),
      customerName: customer.name,
      customerPhone: customer.phone,
      lines,
      creditNotes: creditNotes.map((cn) => ({
        _id: String(cn._id),
        docNumber: cn.docNumber,
        totalIncVat: cn.totalIncVat,
        createdAt: cn.createdAt,
      })),
    };
  }

  async createRefund(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
    dto: CreateRefundDto,
  ): Promise<Record<string, unknown>> {
    if (dto.amount != null) {
      return this.refundByAmount(
        userId,
        companyId,
        storeId,
        orderId,
        dto.amount,
        dto.paymentMethod,
        dto.lineIndexes ?? [],
      );
    }
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docType: 'receipt',
      status: 'completed',
    });
    if (!order) throw new NotFoundException('Receipt not found');
    if (!dto.lines?.length) throw new BadRequestException('Refund lines or amount required');

    const refundLines: {
      index: number;
      qty: number;
      line: (typeof order.lines)[0];
      refundAmount: number;
    }[] = [];

    for (const req of dto.lines ?? []) {
      const line = order.lines[req.lineIndex];
      if (!line) {
        throw new BadRequestException(`Invalid line index ${req.lineIndex}`);
      }
      const already = line.refundedQuantity ?? 0;
      const max = line.quantity - already;
      if (req.quantity > max) {
        throw new BadRequestException(
          `Cannot refund ${req.quantity} of ${line.productName} (max ${max})`,
        );
      }
      const unit = line.lineTotalIncVat / line.quantity;
      refundLines.push({
        index: req.lineIndex,
        qty: req.quantity,
        line,
        refundAmount: round2(unit * req.quantity),
      });
    }

    const refundTotal = round2(
      refundLines.reduce((s, r) => s + r.refundAmount, 0),
    );
    if (refundTotal <= 0) {
      throw new BadRequestException('Refund total must be positive');
    }
    const remainingMoney = await this.remainingRefundable(order._id, order.totalIncVat);
    if (refundTotal - remainingMoney > 0.001) {
      throw new BadRequestException(
        `Refund exceeds the remaining €${remainingMoney.toFixed(2)}`,
      );
    }

    const gross = order.totalIncVat;
    const cashRefund =
      gross > 0 ? round2((order.cashAmount / gross) * refundTotal) : 0;
    const cardRefund = round2(refundTotal - cashRefund);

    for (const r of refundLines) {
      order.lines[r.index].refundedQuantity =
        (order.lines[r.index].refundedQuantity ?? 0) + r.qty;

      const product = await this.productModel.findById(r.line.productId);
      if (product && product.productType !== 'service') {
        await this.inventoryService.restoreStock(
          companyId,
          storeId,
          String(r.line.productId),
          r.qty,
          r.line.serialUnitId ? String(r.line.serialUnitId) : undefined,
          userId,
        );
      }

      if (r.line.workOrderId) {
        const wo = await this.woModel.findById(r.line.workOrderId);
        if (wo && wo.status === 'completed') {
          wo.status = 'awaiting_payment';
          wo.paymentOrderId = undefined;
          await wo.save();
        }
      }
    }

    order.markModified('lines');
    await order.save();

    const cnNumber = await this.docSeq.next(companyId, 'credit_note');
    const creditNote = await this.orderModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docNumber: cnNumber,
      docType: 'credit_note',
      status: 'completed',
      sourceOrderId: order._id,
      lines: refundLines.map((r) => ({
        productId: r.line.productId,
        productName: r.line.productName,
        quantity: r.qty,
        unitPriceIncVat: r.line.unitPriceIncVat,
        taxScheme: r.line.taxScheme,
        costPreTax: r.line.costPreTax,
        serialUnitId: r.line.serialUnitId,
        sn: r.line.sn,
        lineTotalIncVat: r.refundAmount,
        refundedQuantity: 0,
        workOrderId: r.line.workOrderId,
      })),
      subtotalIncVat: refundTotal,
      totalVat: 0,
      totalIncVat: refundTotal,
      paymentMethod: order.paymentMethod,
      cashAmount: cashRefund,
      cardAmount: cardRefund,
      businessDate: order.businessDate,
      createdByUserId: new Types.ObjectId(userId),
    });

    void this.reportService.regenerate(
      userId,
      companyId,
      storeId,
      order.businessDate,
    );

    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'pos.refund',
      entityType: 'order',
      entityId: order._id.toString(),
      metadata: {
        receipt: order.docNumber,
        creditNote: cnNumber,
        refundTotal,
      },
    });

    return {
      receipt: await this.getReceiptDetail(userId, companyId, storeId, orderId),
      creditNote: {
        _id: String(creditNote._id),
        docNumber: creditNote.docNumber,
        totalIncVat: creditNote.totalIncVat,
      },
    };
  }

  private async refundByAmount(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
    rawAmount: number,
    paymentMethod: string | undefined,
    lineIndexes: number[],
  ): Promise<Record<string, unknown>> {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    if (paymentMethod !== 'cash' && paymentMethod !== 'card') {
      throw new BadRequestException('Choose cash or card');
    }
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docType: 'receipt',
      status: 'completed',
    });
    if (!order) throw new NotFoundException('Receipt not found');
    if (!lineIndexes.length) throw new BadRequestException('Select at least one product');

    const seen = new Set<number>();
    const selected: {
      index: number;
      line: (typeof order.lines)[0];
      qty: number;
      remaining: number;
    }[] = [];
    for (const index of lineIndexes) {
      if (seen.has(index)) continue;
      seen.add(index);
      const line = order.lines[index];
      if (!line) throw new BadRequestException(`Invalid line index ${index}`);
      const already = line.refundedQuantity ?? 0;
      const qty = line.quantity - already;
      if (qty <= 0) {
        throw new BadRequestException(`${line.productName} has already been refunded`);
      }
      const unit = line.quantity > 0 ? line.lineTotalIncVat / line.quantity : 0;
      selected.push({ index, line, qty, remaining: round2(unit * qty) });
    }

    const amount = round2(rawAmount);
    const selectedTotal = round2(selected.reduce((sum, row) => sum + row.remaining, 0));
    const remaining = await this.remainingRefundable(order._id, order.totalIncVat);
    const cap = round2(Math.min(selectedTotal, remaining));
    if (amount - cap > 0.001) {
      throw new BadRequestException(`Refund exceeds the selected €${cap.toFixed(2)}`);
    }
    const today = new Date().toISOString().slice(0, 10);
    const creditLines = this.creditLinesForSelection(selected, amount);

    for (const row of selected) {
      order.lines[row.index].refundedQuantity = order.lines[row.index].quantity;
      const product = row.line.productId
        ? await this.productModel.findById(row.line.productId)
        : null;
      if (product && product.productType !== 'service') {
        await this.inventoryService.restoreStock(
          companyId,
          storeId,
          String(row.line.productId),
          row.qty,
          row.line.serialUnitId ? String(row.line.serialUnitId) : undefined,
          userId,
        );
      }
      if (row.line.workOrderId) {
        const wo = await this.woModel.findById(row.line.workOrderId);
        if (wo && wo.status === 'completed') {
          wo.status = 'awaiting_payment';
          wo.paymentOrderId = undefined;
          await wo.save();
        }
      }
    }
    order.markModified('lines');
    await order.save();

    const cnNumber = await this.docSeq.next(companyId, 'credit_note');
    const creditNote = await this.orderModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docNumber: cnNumber,
      docType: 'credit_note',
      status: 'completed',
      sourceOrderId: order._id,
      lines: creditLines,
      subtotalIncVat: amount,
      totalVat: 0,
      totalIncVat: amount,
      paymentMethod,
      cashAmount: paymentMethod === 'cash' ? amount : 0,
      cardAmount: paymentMethod === 'card' ? amount : 0,
      businessDate: today,
      createdByUserId: new Types.ObjectId(userId),
    });

    void this.reportService.regenerate(userId, companyId, storeId, today);
    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'pos.refund',
      entityType: 'order',
      entityId: order._id.toString(),
      metadata: {
        receipt: order.docNumber,
        creditNote: cnNumber,
        refundTotal: amount,
        paymentMethod,
        businessDate: today,
      },
    });

    return {
      receipt: await this.getReceiptDetail(userId, companyId, storeId, orderId),
      creditNote: {
        _id: String(creditNote._id),
        docNumber: creditNote.docNumber,
        totalIncVat: creditNote.totalIncVat,
      },
    };
  }

  private creditLinesForSelection(
    selected: {
      line: OrderDocument['lines'][number];
      qty: number;
      remaining: number;
    }[],
    amount: number,
  ) {
    const base = selected.reduce((sum, row) => sum + row.remaining, 0);
    let left = amount;
    return selected
      .map((row, index) => {
        const share =
          index === selected.length - 1 || base <= 0
            ? left
            : round2((amount * row.remaining) / base);
        left = round2(left - share);
        return {
          productId: row.line.productId,
          productName: row.line.productName,
          quantity: row.qty,
          unitPriceIncVat: row.qty > 0 ? round2(share / row.qty) : share,
          taxScheme: row.line.taxScheme,
          costPreTax: row.line.costPreTax,
          serialUnitId: row.line.serialUnitId,
          sn: row.line.sn,
          lineTotalIncVat: share,
          refundedQuantity: 0,
          workOrderId: row.line.workOrderId,
        };
      })
      .filter((line) => line.lineTotalIncVat > 0);
  }

  private async remainingRefundable(orderId: Types.ObjectId, totalIncVat: number) {
    const notes = await this.orderModel
      .find({ sourceOrderId: orderId, docType: 'credit_note', status: 'completed' })
      .select('totalIncVat')
      .lean();
    const refunded = round2(notes.reduce((sum, note) => sum + note.totalIncVat, 0));
    return round2(Math.max(0, totalIncVat - refunded));
  }

  private async workOrdersFor(
    orders: { lines: { workOrderId?: Types.ObjectId | null }[] }[],
  ) {
    const ids = orders.flatMap((order) =>
      order.lines.map((line) => line.workOrderId).filter((id): id is Types.ObjectId => !!id),
    );
    if (!ids.length) return new Map<string, { customerName?: string; customerPhone?: string }>();
    const rows = await this.woModel
      .find({ _id: { $in: ids } })
      .select('customerName customerPhone')
      .lean();
    return new Map(rows.map((row) => [String(row._id), row]));
  }

  private customerFor(
    order: {
      b2bCustomerName?: string;
      lines: { workOrderId?: Types.ObjectId | null }[];
    },
    workOrders: Map<string, { customerName?: string; customerPhone?: string }>,
  ) {
    for (const line of order.lines) {
      if (!line.workOrderId) continue;
      const wo = workOrders.get(String(line.workOrderId));
      if (wo?.customerName || wo?.customerPhone) {
        return { name: wo.customerName, phone: wo.customerPhone };
      }
    }
    return { name: order.b2bCustomerName, phone: undefined as string | undefined };
  }

  async createSale(
    userId: string,
    companyId: string,
    storeId: string,
    dto: CreateSaleDto,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line required');
    }

    let b2bCustomer: { _id: Types.ObjectId; name: string } | null = null;
    if (dto.b2bCustomerId) {
      const found = await this.b2bCustomerModel
        .findOne({
          _id: dto.b2bCustomerId,
          companyId: new Types.ObjectId(companyId),
          isActive: true,
        })
        .lean();
      if (!found) {
        throw new BadRequestException('B2B customer not found');
      }
      b2bCustomer = { _id: found._id, name: found.name };
    }

    const isB2b = !!b2bCustomer;
    const docType = isB2b ? 'invoice_b2b' : 'receipt';
    const docNumber = await this.docSeq.next(companyId, docType);
    const businessDate = new Date().toISOString().slice(0, 10);
    const orderLines = [];
    let subtotalIncVat = 0;
    let totalVat = 0;

    const workOrderIds = new Set(dto.workOrderIds ?? []);

    for (const line of dto.lines) {
      if (line.workOrderId) {
        workOrderIds.add(line.workOrderId);
      }

      if (line.adHocDescription?.trim()) {
        if (!line.taxCategoryId) {
          throw new BadRequestException('Tax category required for quick sale lines');
        }
        const tax = await this.taxModel.findOne({
          _id: line.taxCategoryId,
          companyId: new Types.ObjectId(companyId),
        }).lean();
        if (!tax) throw new BadRequestException('Tax category missing');

        const unitPrice = line.unitPriceIncVat ?? 0;
        const lineGross = unitPrice * line.quantity;
        const taxResult = calculateLineTax({
          scheme: tax.scheme as TaxScheme,
          salePriceIncVat: unitPrice,
          costPreTax: line.costPreTax,
          perspective: 'retail',
          quantity: line.quantity,
        });

        subtotalIncVat += lineGross;
        totalVat += taxResult.vatAmount;

        orderLines.push({
          productName: line.adHocDescription.trim(),
          quantity: line.quantity,
          unitPriceIncVat: unitPrice,
          taxScheme: tax.scheme,
          costPreTax: line.costPreTax,
          lineTotalIncVat: lineGross,
          adHoc: true,
          catalogCategoryId: line.catalogCategoryId
            ? new Types.ObjectId(line.catalogCategoryId)
            : undefined,
        });
        continue;
      }

      if (!line.productId) {
        throw new BadRequestException('Each line needs productId or adHocDescription');
      }

      const product = await this.productModel
        .findOne({
          _id: line.productId,
          companyId: new Types.ObjectId(companyId),
        })
        .lean();
      if (!product) throw new BadRequestException(`Product ${line.productId} not found`);

      await this.inventoryService.assertPosSalable(companyId, storeId, line.productId);

      if (product.productType === 'serialized') {
        if (!line.serialUnitId || !line.sn?.trim()) {
          throw new BadRequestException(
            'IMEI/SN required for serialized products',
          );
        }
      }

      const tax = await this.taxModel.findById(product.taxCategoryId).lean();
      if (!tax) throw new BadRequestException('Tax category missing');

      const unitPrice =
        line.unitPriceIncVat ?? product.retailPrice ?? product.costPrice;

      if (line.workOrderId) {
        const wo = await this.woModel.findOne({
          _id: line.workOrderId,
          companyId: new Types.ObjectId(companyId),
          storeId: new Types.ObjectId(storeId),
          status: 'awaiting_payment',
        });
        if (!wo) {
          throw new BadRequestException(
            `Work order ${line.workOrderId} is not awaiting payment`,
          );
        }
        if (Math.abs(unitPrice - wo.quotedPriceIncVat) > 0.01) {
          throw new BadRequestException(
            `Work order ${wo.docNumber} price must match quoted €${wo.quotedPriceIncVat.toFixed(2)}`,
          );
        }
      }

      const lineGross = unitPrice * line.quantity;

      const taxResult = calculateLineTax({
        scheme: tax.scheme as TaxScheme,
        salePriceIncVat: unitPrice,
        costPreTax: product.costPrice,
        perspective: 'retail',
        quantity: line.quantity,
      });

      subtotalIncVat += lineGross;
      totalVat += taxResult.vatAmount;

      if (product.productType !== 'service') {
        await this.inventoryService.decrementStock(
          companyId,
          storeId,
          line.productId,
          line.quantity,
          line.serialUnitId,
        );
      }

      const catalogName = isB2b
        ? this.invoiceProductName(product)
        : product.name;
      const lineLabel = line.workOrderId
        ? await this.workOrderLineName(line.workOrderId, catalogName)
        : catalogName;

      orderLines.push({
        productId: product._id,
        productName: lineLabel,
        quantity: line.quantity,
        unitPriceIncVat: unitPrice,
        taxScheme: tax.scheme,
        costPreTax: product.costPrice,
        serialUnitId: line.serialUnitId
          ? new Types.ObjectId(line.serialUnitId)
          : undefined,
        sn: line.sn,
        lineTotalIncVat: lineGross,
        workOrderId: line.workOrderId
          ? new Types.ObjectId(line.workOrderId)
          : undefined,
      });
    }

    const payment = isB2b
      ? {
          paymentMethod: 'other',
          cashAmount: 0,
          cardAmount: 0,
          paymentMethodLabel: formatPaymentMethodLabel('other'),
        }
      : resolveSalePayment(dto, subtotalIncVat);

    const order = await this.orderModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docNumber,
      docType,
      status: 'completed',
      lines: orderLines,
      subtotalIncVat,
      totalVat,
      totalIncVat: subtotalIncVat,
      paymentMethod: payment.paymentMethod,
      cashAmount: payment.cashAmount,
      cardAmount: payment.cardAmount,
      amountTendered: payment.amountTendered,
      changeGiven: payment.changeGiven,
      ...(isB2b ? { paymentStatus: 'unpaid', paidAmount: 0 } : {}),
      customerId: dto.customerId
        ? new Types.ObjectId(dto.customerId)
        : undefined,
      b2bCustomerId: b2bCustomer?._id,
      b2bCustomerName: b2bCustomer?.name,
      createdByUserId: new Types.ObjectId(userId),
      businessDate,
    });

    for (const woId of workOrderIds) {
      await this.completeWorkOrderAfterSale(
        companyId,
        storeId,
        userId,
        woId,
        order._id,
      );
    }

    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'pos.sale',
      entityType: 'order',
      entityId: order._id.toString(),
      metadata: {
        docNumber,
        docType,
        totalIncVat: order.totalIncVat,
        paymentMethod: order.paymentMethod,
        cashAmount: order.cashAmount,
        cardAmount: order.cardAmount,
        workOrderIds: [...workOrderIds],
        b2bCustomerId: b2bCustomer?._id.toString(),
        b2bCustomerName: b2bCustomer?.name,
      },
    });

    return order;
  }

  /** English label for B2B invoices — never return Chinese characters. */
  private invoiceProductName(product: {
    name: string;
    nameEn?: string;
    skuCode?: string;
    _id?: { toString(): string };
  }) {
    const cjk = /[\u3400-\u9FFF]/;
    const en = product.nameEn?.trim();
    if (en && !cjk.test(en)) return en;
    if (!cjk.test(product.name)) return product.name;
    const latinOnly = product.name.replace(cjk, ' ').replace(/\s+/g, ' ').trim();
    if (latinOnly) return latinOnly;
    if (product.skuCode?.trim()) return `Item ${product.skuCode.trim()}`;
    return product._id ? `Product ${product._id.toString().slice(-6)}` : 'Product';
  }

  private async workOrderLineName(workOrderId: string, fallback: string) {
    const wo = await this.woModel.findById(workOrderId).lean();
    if (!wo) return fallback;
    const parts = [wo.docNumber, wo.issueDescription].filter(Boolean);
    return parts.join(' — ') || fallback;
  }

  private async completeWorkOrderAfterSale(
    companyId: string,
    storeId: string,
    userId: string,
    workOrderId: string,
    orderId: Types.ObjectId,
  ) {
    const wo = await this.woModel.findOne({
      _id: workOrderId,
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!wo) throw new BadRequestException('Work order not found');
    if (wo.status !== 'awaiting_payment') {
      throw new BadRequestException(`Work order ${wo.docNumber} is not awaiting payment`);
    }
    if (!canTransition(wo.flowType, wo.status, 'completed')) {
      throw new BadRequestException(`Cannot complete work order ${wo.docNumber}`);
    }
    wo.status = 'completed';
    wo.paymentOrderId = orderId;
    await wo.save();
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineRefundStatus(lines: { quantity: number; refundedQuantity?: number }[]): string {
  if (!lines.length) return 'open';
  const open = lines.filter((line) => line.quantity - (line.refundedQuantity ?? 0) > 0).length;
  if (open === 0) return 'refunded';
  if (open === lines.length) return 'open';
  return 'partial';
}
