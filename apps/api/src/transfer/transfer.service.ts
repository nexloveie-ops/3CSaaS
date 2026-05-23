import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Company,
  CompanyDocument,
  Product,
  ProductDocument,
  SerialUnit,
  SerialUnitDocument,
  Store,
  StoreDocument,
  TransferOrder,
  TransferOrderDocument,
} from '@lz3c/db';
import { AuditService } from '../common/services/audit.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransitionTransferDto } from './dto/transition-transfer.dto';
import { TransferPickListService } from './transfer-pick-list.service';

const TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['received'],
};

@Injectable()
export class TransferService {
  constructor(
    @InjectModel(TransferOrder.name)
    private transferModel: Model<TransferOrderDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(SerialUnit.name) private serialModel: Model<SerialUnitDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private companyService: CompanyService,
    private pickList: TransferPickListService,
    private docSeq: DocumentSequenceService,
    private inventoryService: InventoryService,
    private audit: AuditService,
  ) {}

  async list(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.transferModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async create(
    userId: string,
    companyId: string,
    fromStoreId: string,
    dto: CreateTransferDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    if (fromStoreId === dto.toStoreId) {
      throw new BadRequestException('Cannot transfer to same store');
    }

    const lines = [];
    for (const line of dto.lines) {
      const product = await this.productModel.findOne({
        _id: line.productId,
        companyId: new Types.ObjectId(companyId),
      });
      if (!product) throw new NotFoundException(`Product ${line.productId}`);
      lines.push({
        productId: product._id,
        productName: product.name,
        quantity: line.quantity,
        unitCostPreTax: product.costPrice,
        serialUnitId: line.serialUnitId
          ? new Types.ObjectId(line.serialUnitId)
          : undefined,
      });
    }

    const docNumber = await this.docSeq.next(companyId, 'transfer');
    const tr = await this.transferModel.create({
      companyId: new Types.ObjectId(companyId),
      docNumber,
      fromStoreId: new Types.ObjectId(fromStoreId),
      toStoreId: new Types.ObjectId(dto.toStoreId),
      lines,
      createdByUserId: new Types.ObjectId(userId),
    });

    void this.audit.log({
      companyId,
      userId,
      storeId: fromStoreId,
      action: 'transfer.create',
      entityType: 'transfer',
      entityId: tr._id.toString(),
      metadata: { docNumber, toStoreId: dto.toStoreId },
    });

    return tr;
  }

  async transition(
    userId: string,
    companyId: string,
    id: string,
    dto: TransitionTransferDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const tr = await this.transferModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!tr) throw new NotFoundException('Transfer not found');
    if (!TRANSITIONS[tr.status]?.includes(dto.status)) {
      throw new BadRequestException(`Invalid transition ${tr.status} -> ${dto.status}`);
    }

    if (dto.status === 'received') {
      for (const line of tr.lines) {
        if (line.serialUnitId) {
          const unit = await this.serialModel.findById(line.serialUnitId);
          if (unit) {
            unit.currentStoreId = tr.toStoreId;
            await unit.save();
          }
        } else {
          await this.inventoryService.decrementStock(
            companyId,
            tr.fromStoreId.toString(),
            line.productId.toString(),
            line.quantity,
          );
          await this.inventoryService.adjustQty(
            companyId,
            tr.toStoreId.toString(),
            line.productId.toString(),
            line.quantity,
          );
        }
      }
    }

    const prevStatus = tr.status;
    tr.status = dto.status;
    await tr.save();

    void this.audit.log({
      companyId,
      userId,
      storeId: tr.fromStoreId.toString(),
      action: 'transfer.transition',
      entityType: 'transfer',
      entityId: tr._id.toString(),
      metadata: { from: prevStatus, to: dto.status, docNumber: tr.docNumber },
    });

    return tr;
  }

  async getPickListHtml(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const tr = await this.transferModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!tr) throw new NotFoundException('Transfer not found');

    const [fromStore, toStore, company] = await Promise.all([
      this.storeModel.findById(tr.fromStoreId).lean(),
      this.storeModel.findById(tr.toStoreId).lean(),
      this.companyModel.findById(companyId).lean(),
    ]);

    return this.pickList.render({
      docNumber: tr.docNumber,
      status: tr.status,
      companyName: company?.name ?? 'Company',
      fromStoreName: fromStore?.name ?? tr.fromStoreId.toString(),
      toStoreName: toStore?.name ?? tr.toStoreId.toString(),
      createdAt: (tr as { createdAt?: Date }).createdAt,
      lines: tr.lines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
      })),
    });
  }
}
