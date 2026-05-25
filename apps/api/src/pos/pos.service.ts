import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
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
import { calculateLineTax, TaxScheme } from '@lz3c/shared';
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
    private companyService: CompanyService,
    private inventoryService: InventoryService,
    private docSeq: DocumentSequenceService,
    private receiptService: PosReceiptService,
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
        docType: 'receipt',
      })
      .lean();
    if (!order) throw new NotFoundException('Receipt not found');
    return order;
  }

  async getReceiptHtml(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ) {
    const order = await this.getOrder(userId, companyId, storeId, orderId);
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
      return {
        lineIndex: index,
        productId: String(line.productId),
        productName: line.productName,
        quantity: line.quantity,
        refundedQuantity: refunded,
        refundableQuantity: refundable,
        unitPriceIncVat: line.unitPriceIncVat,
        lineTotalIncVat: line.lineTotalIncVat,
        sn: line.sn,
        workOrderId: line.workOrderId ? String(line.workOrderId) : undefined,
      };
    });

    return {
      ...order,
      netTotalIncVat: orderNetRevenue(order),
      refundedTotalIncVat: round2(order.totalIncVat - orderNetRevenue(order)),
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
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docType: 'receipt',
      status: 'completed',
    });
    if (!order) throw new NotFoundException('Receipt not found');

    const refundLines: {
      index: number;
      qty: number;
      line: (typeof order.lines)[0];
      refundAmount: number;
    }[] = [];

    for (const req of dto.lines) {
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

    const docNumber = await this.docSeq.next(companyId, 'receipt');
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

      const lineLabel = line.workOrderId
        ? await this.workOrderLineName(line.workOrderId, product.name)
        : product.name;

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

    const payment = resolveSalePayment(dto, subtotalIncVat);

    const order = await this.orderModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docNumber,
      docType: 'receipt',
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
      customerId: dto.customerId
        ? new Types.ObjectId(dto.customerId)
        : undefined,
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
        totalIncVat: order.totalIncVat,
        paymentMethod: order.paymentMethod,
        cashAmount: order.cashAmount,
        cardAmount: order.cardAmount,
        workOrderIds: [...workOrderIds],
      },
    });

    return order;
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
