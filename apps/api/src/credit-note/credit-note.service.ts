import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Company,
  CompanyDocument,
  Order,
  OrderDocument,
  Preorder,
  PreorderDocument,
  Store,
  StoreDocument,
} from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreditNotePrintService } from './credit-note-print.service';

@Injectable()
export class CreditNoteService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Preorder.name) private preorderModel: Model<PreorderDocument>,
    private companyService: CompanyService,
    private print: CreditNotePrintService,
  ) {}

  async list(userId: string, companyId: string, storeId?: string) {
    await this.companyService.assertMember(userId, companyId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      docType: 'credit_note',
    };
    if (storeId) filter.storeId = new Types.ObjectId(storeId);
    return this.orderModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }

  async getOne(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const doc = await this.orderModel
      .findOne({
        _id: id,
        companyId: new Types.ObjectId(companyId),
        docType: 'credit_note',
      })
      .lean();
    if (!doc) throw new NotFoundException('Credit note not found');
    return doc;
  }

  async getPrintHtml(userId: string, companyId: string, id: string) {
    const doc = await this.getOne(userId, companyId, id);
    const company = await this.companyModel.findById(companyId).lean();
    const store = await this.storeModel.findById(doc.storeId).lean();
    let preorderDocNumber: string | undefined;
    if (doc.sourcePreorderId) {
      const pre = await this.preorderModel.findById(doc.sourcePreorderId).lean();
      preorderDocNumber = pre?.docNumber;
    }
    return this.print.render({
      docNumber: doc.docNumber,
      companyName: company?.name ?? 'Company',
      storeName: store?.name ?? 'Store',
      businessDate: doc.businessDate ?? '',
      totalIncVat: doc.totalIncVat,
      paymentMethod: doc.paymentMethod,
      preorderDocNumber,
      lines: doc.lines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        lineTotalIncVat: l.lineTotalIncVat,
      })),
    });
  }
}
