import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Order,
  OrderDocument,
  Preorder,
  PreorderDocument,
  Product,
  ProductDocument,
  TaxCategory,
  TaxCategoryDocument,
} from '@lz3c/db';
import { calculateLineTax, TaxScheme } from '@lz3c/shared';
import { AuditService } from '../common/services/audit.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { WebhookService } from '../notification/webhook.service';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { PosService } from '../pos/pos.service';
import { CreatePreorderDto } from './dto/create-preorder.dto';
import { PayDepositDto } from './dto/pay-deposit.dto';
import { ConvertPreorderDto } from './dto/convert-preorder.dto';

@Injectable()
export class PreorderService {
  constructor(
    @InjectModel(Preorder.name) private preorderModel: Model<PreorderDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,
    private companyService: CompanyService,
    private docSeq: DocumentSequenceService,
    private posService: PosService,
    private inventoryService: InventoryService,
    private audit: AuditService,
    private webhook: WebhookService,
  ) {}

  async list(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.preorderModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
      })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async create(
    userId: string,
    companyId: string,
    storeId: string,
    dto: CreatePreorderDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const docNumber = await this.docSeq.next(companyId, 'preorder');
    const lines = await this.buildLines(companyId, dto.lines);
    const totalIncVat = lines.reduce(
      (s, l) => s + l.unitPriceIncVat * l.quantity,
      0,
    );

    return this.preorderModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docNumber,
      status: 'draft',
      customerId: dto.customerId
        ? new Types.ObjectId(dto.customerId)
        : undefined,
      lines,
      depositAmount: dto.depositAmount ?? 0,
      totalIncVat,
    });
  }

  async payDeposit(
    userId: string,
    companyId: string,
    storeId: string,
    id: string,
    dto: PayDepositDto,
  ) {
    const pre = await this.getEditable(userId, companyId, id);
    if (pre.status !== 'draft') {
      throw new BadRequestException('Deposit only on draft preorders');
    }
    const deposit = dto.amount ?? pre.depositAmount;
    if (deposit <= 0) throw new BadRequestException('Deposit amount required');
    if (deposit > pre.totalIncVat) {
      throw new BadRequestException('Deposit cannot exceed total');
    }

    pre.depositAmount = deposit;
    pre.depositPaymentMethod = dto.paymentMethod ?? 'cash';
    pre.status = 'deposit_paid';
    await pre.save();
    return pre;
  }

  async markReady(userId: string, companyId: string, id: string) {
    const pre = await this.getEditable(userId, companyId, id);
    if (pre.status !== 'deposit_paid') {
      throw new BadRequestException('Only deposit_paid can become ready');
    }
    pre.status = 'ready';
    await pre.save();
    return pre;
  }

  async convert(
    userId: string,
    companyId: string,
    storeId: string,
    id: string,
    dto: ConvertPreorderDto,
  ) {
    const pre = await this.getEditable(userId, companyId, id);
    if (!['deposit_paid', 'ready'].includes(pre.status)) {
      throw new BadRequestException('Cannot convert in current status');
    }

    const balance = Math.max(0, pre.totalIncVat - pre.depositAmount);
    const ratio = pre.totalIncVat > 0 ? balance / pre.totalIncVat : 1;

    if (balance > 0) {
      const saleLines = pre.lines.map((l) => ({
        productId: l.productId.toString(),
        quantity: l.quantity,
        unitPriceIncVat: Math.round(l.unitPriceIncVat * ratio * 100) / 100,
        serialUnitId: l.serialUnitId?.toString(),
      }));
      const order = await this.posService.createSale(userId, companyId, storeId, {
        paymentMethod: dto.paymentMethod ?? 'cash',
        customerId: pre.customerId?.toString(),
        lines: saleLines,
      });
      pre.saleOrderId = order._id;
    } else {
      for (const line of pre.lines) {
        await this.inventoryService.decrementStock(
          companyId,
          storeId,
          line.productId.toString(),
          line.quantity,
          line.serialUnitId?.toString(),
        );
      }
    }

    pre.status = pre.saleOrderId ? 'converted_to_sale' : 'closed';
    await pre.save();
    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'preorder.convert',
      entityType: 'preorder',
      entityId: pre._id.toString(),
      metadata: { docNumber: pre.docNumber, saleOrderId: pre.saleOrderId?.toString() },
    });
    void this.webhook.dispatch(companyId, 'preorder.convert', {
      entityType: 'preorder',
      entityId: pre._id.toString(),
      docNumber: pre.docNumber,
    });
    return pre;
  }

  async cancel(userId: string, companyId: string, storeId: string, id: string) {
    const pre = await this.getEditable(userId, companyId, id);
    if (['converted_to_sale', 'closed', 'cancelled'].includes(pre.status)) {
      throw new BadRequestException('Already finalized');
    }

    if (pre.status === 'deposit_paid' || pre.status === 'ready') {
      const cn = await this.issueCreditNote(userId, companyId, storeId, pre);
      pre.creditNoteId = cn._id;
      void this.audit.log({
        companyId,
        userId,
        storeId,
        action: 'credit_note.issue',
        entityType: 'credit_note',
        entityId: cn._id.toString(),
        metadata: { preorderId: pre._id.toString(), docNumber: cn.docNumber },
      });
      void this.webhook.dispatch(companyId, 'credit_note.issue', {
        entityType: 'credit_note',
        entityId: cn._id.toString(),
        preorderId: pre._id.toString(),
      });
    }

    pre.status = 'cancelled';
    await pre.save();
    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'preorder.cancel',
      entityType: 'preorder',
      entityId: pre._id.toString(),
      metadata: { docNumber: pre.docNumber },
    });
    void this.webhook.dispatch(companyId, 'preorder.cancel', {
      entityType: 'preorder',
      entityId: pre._id.toString(),
      docNumber: pre.docNumber,
    });
    return pre;
  }

  private async issueCreditNote(
    userId: string,
    companyId: string,
    storeId: string,
    pre: PreorderDocument,
  ) {
    const firstLine = pre.lines[0];
    const product = firstLine
      ? await this.productModel.findById(firstLine.productId)
      : null;
    const tax = product
      ? await this.taxModel.findById(product.taxCategoryId)
      : await this.taxModel.findOne({
          companyId: new Types.ObjectId(companyId),
          scheme: 'standard_13_5',
        });

    const docNumber = await this.docSeq.next(companyId, 'credit_note');
    const amount = pre.depositAmount;
    const taxResult = calculateLineTax({
      scheme: (tax?.scheme ?? 'standard_13_5') as TaxScheme,
      salePriceIncVat: amount,
      perspective: 'retail',
    });

    return this.orderModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      sourcePreorderId: pre._id,
      docNumber,
      docType: 'credit_note',
      status: 'completed',
      lines: [
        {
          productId: firstLine?.productId ?? new Types.ObjectId(),
          productName: `Preorder ${pre.docNumber} deposit refund`,
          quantity: 1,
          unitPriceIncVat: amount,
          taxScheme: tax?.scheme ?? 'standard_13_5',
          lineTotalIncVat: amount,
        },
      ],
      subtotalIncVat: amount,
      totalVat: taxResult.vatAmount,
      totalIncVat: amount,
      paymentMethod: pre.depositPaymentMethod ?? 'cash',
      createdByUserId: new Types.ObjectId(userId),
      businessDate: new Date().toISOString().slice(0, 10),
    });
  }

  private async buildLines(
    companyId: string,
    lines: CreatePreorderDto['lines'],
  ) {
    const built = [];
    for (const line of lines) {
      const product = await this.productModel.findOne({
        _id: line.productId,
        companyId: new Types.ObjectId(companyId),
      });
      if (!product) throw new NotFoundException(`Product ${line.productId}`);
      built.push({
        productId: product._id,
        productName: product.name,
        quantity: line.quantity,
        unitPriceIncVat: line.unitPriceIncVat ?? product.retailPrice ?? 0,
        serialUnitId: line.serialUnitId
          ? new Types.ObjectId(line.serialUnitId)
          : undefined,
      });
    }
    return built;
  }

  private async getEditable(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const pre = await this.preorderModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!pre) throw new NotFoundException('Preorder not found');
    return pre;
  }
}
