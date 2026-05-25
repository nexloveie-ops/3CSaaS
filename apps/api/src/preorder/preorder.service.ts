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

  Store,

  StoreDocument,

  TaxCategory,

  TaxCategoryDocument,

} from '@lz3c/db';

import { calculateLineTax, TaxScheme } from '@lz3c/shared';

import { AuditService } from '../common/services/audit.service';

import { DocumentSequenceService } from '../common/services/document-sequence.service';

import { EmailService } from '../notification/email.service';

import { SmsService } from '../notification/sms.service';

import { WebhookService } from '../notification/webhook.service';

import { CompanyService } from '../company/company.service';

import { InventoryService } from '../inventory/inventory.service';

import { PosService } from '../pos/pos.service';

import { CreatePreorderDto } from './dto/create-preorder.dto';

import { PayDepositDto } from './dto/pay-deposit.dto';

import { ConvertPreorderDto } from './dto/convert-preorder.dto';

import { MarkPreorderArrivedDto } from './dto/mark-preorder-arrived.dto';



@Injectable()

export class PreorderService {

  constructor(

    @InjectModel(Preorder.name) private preorderModel: Model<PreorderDocument>,

    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,

    @InjectModel(Product.name) private productModel: Model<ProductDocument>,

    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,

    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,

    private companyService: CompanyService,

    private docSeq: DocumentSequenceService,

    private posService: PosService,

    private inventoryService: InventoryService,

    private audit: AuditService,

    private webhook: WebhookService,

    private sms: SmsService,

    private email: EmailService,

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

    const lines = dto.lines.map((l) => ({

      productName: l.productName.trim(),

      quantity: l.quantity ?? 1,

      estimatedPriceIncVat: l.estimatedPriceIncVat,

      catalogCategoryId: l.catalogCategoryId

        ? new Types.ObjectId(l.catalogCategoryId)

        : undefined,

      taxCategoryId: l.taxCategoryId

        ? new Types.ObjectId(l.taxCategoryId)

        : undefined,

    }));

    const totalIncVat = lines.reduce(

      (s, l) => s + (l.estimatedPriceIncVat ?? 0) * l.quantity,

      0,

    );



    const doc = await this.preorderModel.create({

      companyId: new Types.ObjectId(companyId),

      storeId: new Types.ObjectId(storeId),

      docNumber,

      status: 'pending',

      customerPhone: dto.customerPhone.trim(),

      customerName: dto.customerName?.trim() || undefined,

      customerEmail: dto.customerEmail?.trim().toLowerCase() || undefined,

      expectedArrivalDate: dto.expectedArrivalDate,

      lines,

      depositAmount: 0,

      totalIncVat,

    });



    void this.audit.log({

      companyId,

      userId,

      storeId,

      action: 'preorder.create',

      entityType: 'preorder',

      entityId: doc._id.toString(),

      metadata: { docNumber: doc.docNumber },

    });



    return doc;

  }



  async markArrived(

    userId: string,

    companyId: string,

    storeId: string,

    id: string,

    dto: MarkPreorderArrivedDto,

  ) {

    const pre = await this.getEditable(userId, companyId, id);

    if (!['pending', 'draft', 'deposit_paid', 'ready'].includes(pre.status)) {

      throw new BadRequestException('Cannot mark arrived in current status');

    }



    const store = await this.storeModel.findById(storeId).lean();

    const storeName = store?.name ?? 'our store';

    const itemNames = pre.lines.map((l) => l.productName).join(', ');

    const text = `Your order (${pre.docNumber}) is ready for pickup at ${storeName}: ${itemNames}. Please bring this message when you visit.`;



    const results: { email?: { sent: boolean }; sms?: { sent: boolean } } = {};



    if (dto.notifyVia === 'email' || dto.notifyVia === 'both') {

      if (!pre.customerEmail) {

        throw new BadRequestException('Customer email is required for email notification');

      }

      results.email = await this.email.sendPlain({

        to: pre.customerEmail,

        subject: `Ready for pickup — ${pre.docNumber}`,

        text,

      });

    }



    if (dto.notifyVia === 'sms' || dto.notifyVia === 'both') {

      results.sms = await this.sms.send(pre.customerPhone, text);

    }



    pre.status = 'arrived';

    pre.arrivedAt = new Date();

    pre.notifiedVia = dto.notifyVia;

    pre.notifiedAt = new Date();

    await pre.save();



    void this.audit.log({

      companyId,

      userId,

      storeId,

      action: 'preorder.arrived',

      entityType: 'preorder',

      entityId: pre._id.toString(),

      metadata: { docNumber: pre.docNumber, notifyVia: dto.notifyVia },

    });



    return { preorder: pre.toObject(), notification: results };

  }



  async markCompleted(userId: string, companyId: string, storeId: string, id: string) {

    const pre = await this.getEditable(userId, companyId, id);

    if (pre.status !== 'arrived' && pre.status !== 'ready') {

      throw new BadRequestException('Only arrived pre-orders can be completed');

    }

    pre.status = 'completed';

    pre.completedAt = new Date();

    await pre.save();

    void this.audit.log({

      companyId,

      userId,

      storeId,

      action: 'preorder.completed',

      entityType: 'preorder',

      entityId: pre._id.toString(),

      metadata: { docNumber: pre.docNumber },

    });

    return pre;

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

      const saleLines = pre.lines

        .filter((l) => l.productId)

        .map((l) => ({

          productId: l.productId!.toString(),

          quantity: l.quantity,

          unitPriceIncVat: Math.round((l.unitPriceIncVat ?? 0) * ratio * 100) / 100,

          serialUnitId: l.serialUnitId?.toString(),

        }));

      if (saleLines.length) {

        const order = await this.posService.createSale(userId, companyId, storeId, {

          paymentMethod: dto.paymentMethod ?? 'cash',

          customerId: pre.customerId?.toString(),

          lines: saleLines,

        });

        pre.saleOrderId = order._id;

      }

    } else {

      for (const line of pre.lines) {

        if (!line.productId) continue;

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

    return pre;

  }



  async cancel(userId: string, companyId: string, storeId: string, id: string) {

    const pre = await this.getEditable(userId, companyId, id);

    if (['converted_to_sale', 'closed', 'cancelled', 'completed'].includes(pre.status)) {

      throw new BadRequestException('Already finalized');

    }



    if (pre.status === 'deposit_paid' || pre.status === 'ready') {

      const cn = await this.issueCreditNote(userId, companyId, storeId, pre);

      pre.creditNoteId = cn._id;

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

    return pre;

  }



  private async issueCreditNote(

    userId: string,

    companyId: string,

    storeId: string,

    pre: PreorderDocument,

  ) {

    const firstLine = pre.lines[0];

    const product = firstLine?.productId

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

