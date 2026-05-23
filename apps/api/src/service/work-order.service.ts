import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PriceListBrand,
  PriceListItem,
  PriceListItemDocument,
  Product,
  ProductDocument,
  SerialEvent,
  SerialEventDocument,
  SerialUnit,
  SerialUnitDocument,
  Store,
  StoreDocument,
  TaxCategory,
  TaxCategoryDocument,
  WorkOrder,
  WorkOrderDocument,
} from '@lz3c/db';
import { formatPriceListLabel } from './price-list.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { CompanyService } from '../company/company.service';
import { SmsService } from '../notification/sms.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { canTransition, SMS_ON_ENTER } from './work-order.transitions';
import {
  WorkOrderReceiptCopy,
  WorkOrderReceiptService,
} from './work-order-receipt.service';

@Injectable()
export class WorkOrderService {
  constructor(
    @InjectModel(WorkOrder.name) private woModel: Model<WorkOrderDocument>,
    @InjectModel(SerialUnit.name) private serialModel: Model<SerialUnitDocument>,
    @InjectModel(SerialEvent.name) private eventModel: Model<SerialEventDocument>,
    @InjectModel(PriceListItem.name) private priceModel: Model<PriceListItemDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,
    private companyService: CompanyService,
    private docSeq: DocumentSequenceService,
    private sms: SmsService,
    private receiptService: WorkOrderReceiptService,
  ) {}

  async list(
    userId: string,
    companyId: string,
    storeId: string,
    status?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
    };
    if (status) filter.status = status;
    return this.woModel.find(filter).sort({ updatedAt: -1 }).lean();
  }

  async listPayableForPos(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const repairProduct = await this.ensureRepairServiceProduct(companyId);
    const orders = await this.woModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        status: 'awaiting_payment',
      })
      .sort({ updatedAt: -1 })
      .lean();
    return {
      repairProductId: repairProduct._id.toString(),
      orders,
    };
  }

  private async ensureRepairServiceProduct(companyId: string) {
    const cid = new Types.ObjectId(companyId);
    const existing = await this.productModel.findOne({
      companyId: cid,
      productType: 'service',
      skuCode: 'REPAIR-SVC',
    });
    if (existing) return existing;

    const tax =
      (await this.taxModel.findOne({ companyId: cid, isDefault: true }).lean()) ??
      (await this.taxModel.findOne({ companyId: cid }).lean());
    if (!tax) throw new BadRequestException('No tax category for repair product');

    return this.productModel.create({
      companyId: cid,
      productType: 'service',
      name: 'Repair service',
      skuCode: 'REPAIR-SVC',
      costPrice: 0,
      retailPrice: 0,
      taxCategoryId: tax._id,
    });
  }

  async getOne(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const wo = await this.woModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .lean();
    if (!wo) throw new NotFoundException('Work order not found');
    return wo;
  }

  async getReceiptHtml(
    userId: string,
    companyId: string,
    storeId: string,
    id: string,
    copy: WorkOrderReceiptCopy,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const wo = await this.woModel
      .findOne({
        _id: id,
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
      })
      .lean();
    if (!wo) throw new NotFoundException('Work order not found');

    const store = await this.storeModel.findById(storeId).lean();
    if (!store) throw new NotFoundException('Store not found');

    const printedAt = new Date().toLocaleString('en-IE', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const expectedCompletion = wo.expectedCompletionAt
      ? new Date(wo.expectedCompletionAt).toLocaleDateString('en-IE')
      : undefined;

    const isCustomer = copy === 'customer';

    return this.receiptService.render({
      copyLabel: isCustomer ? 'CUSTOMER COPY' : 'REPAIR COPY',
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.phone,
      storeEmail: store.email,
      docNumber: wo.docNumber,
      printedAt,
      customerPhone: wo.customerPhone ?? '',
      customerName: wo.customerName,
      deviceBrand: wo.deviceBrand,
      deviceModel: wo.deviceModel,
      imeiSn: wo.imeiSn ?? wo.serialSn,
      issueDescription: wo.issueDescription,
      priceIncVat: wo.quotedPriceIncVat,
      showPrice: isCustomer,
      repairLocation: wo.repairLocation,
      expectedCompletion,
      repairTerms: isCustomer ? store.repairTerms : undefined,
      notes: isCustomer ? undefined : wo.notes,
    });
  }

  async create(
    userId: string,
    companyId: string,
    storeId: string,
    dto: CreateWorkOrderDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const repairLocation = dto.repairLocation?.trim() || undefined;
    const flowType =
      dto.flowType ?? (repairLocation ? 'send_out' : 'in_store');

    let serialUnitId: Types.ObjectId | undefined;
    let serialSn = dto.imeiSn?.trim() || undefined;
    if (dto.serialUnitId) {
      const serial = await this.serialModel.findOne({
        _id: dto.serialUnitId,
        companyId: cid,
      });
      if (!serial) throw new BadRequestException('Serial unit not found');
      serialUnitId = serial._id;
      serialSn = serial.sn;
    }

    const deviceBrand = dto.deviceBrand?.trim() || undefined;
    const deviceModel = dto.deviceModel?.trim() || undefined;
    let issueDescription = dto.issueDescription?.trim() || undefined;
    let lines = dto.lines ?? [];
    let quoted = dto.quotedPriceIncVat;

    if (dto.priceListItemId) {
      const item = await this.priceModel
        .findOne({ _id: dto.priceListItemId, companyId: cid, isActive: true })
        .populate({
          path: 'modelId',
          populate: { path: 'brandId', model: PriceListBrand.name },
        })
        .lean();
      if (!item) throw new BadRequestException('Price list item not found');
      const flat = item as typeof item & { brand?: string };
      const legacyModelName =
        typeof (flat as { model?: unknown }).model === 'string'
          ? (flat as { model: string }).model
          : '';
      const populated = flat.modelId as
        | { name: string; brandId?: { name: string } }
        | Types.ObjectId
        | null
        | undefined;
      let brandName = flat.brand ?? deviceBrand ?? '';
      let deviceName = legacyModelName || deviceModel || '';
      if (populated && typeof populated === 'object' && 'name' in populated) {
        deviceName = populated.name;
        const b = populated.brandId;
        if (b && typeof b === 'object' && 'name' in b) brandName = b.name;
      }
      const issue = flat.issue?.trim() ?? '';
      if (!issueDescription) issueDescription = issue;
      const desc =
        brandName && deviceName && issue
          ? formatPriceListLabel(brandName, deviceName, issue)
          : issue || issueDescription || 'Repair';
      if (!lines.length) {
        lines = [{ description: desc, priceIncVat: flat.priceIncVat }];
      }
      if (quoted == null) quoted = flat.priceIncVat;
    }

    if (quoted == null) {
      quoted = lines.reduce((s, l) => s + l.priceIncVat, 0);
    }

    const docNumber = await this.docSeq.next(companyId, 'work_order');

    return this.woModel.create({
      companyId: cid,
      storeId: new Types.ObjectId(storeId),
      docNumber,
      flowType,
      status: 'draft',
      serialUnitId,
      serialSn,
      deviceBrand,
      deviceModel,
      imeiSn: dto.imeiSn?.trim() || undefined,
      repairLocation,
      expectedCompletionAt: dto.expectedCompletionAt
        ? new Date(dto.expectedCompletionAt)
        : undefined,
      priceListItemId: dto.priceListItemId
        ? new Types.ObjectId(dto.priceListItemId)
        : undefined,
      customerId: dto.customerId
        ? new Types.ObjectId(dto.customerId)
        : undefined,
      customerPhone: dto.customerPhone.trim(),
      customerName: dto.customerName?.trim() || undefined,
      issueDescription,
      lines,
      quotedPriceIncVat: quoted,
      notes: dto.notes?.trim() || undefined,
    });
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateWorkOrderDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const wo = await this.woModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!wo) throw new NotFoundException('Work order not found');
    if (!['draft', 'in_progress', 'returned', 'awaiting_payment'].includes(wo.status)) {
      throw new BadRequestException('Cannot edit work order in current status');
    }
    if (dto.lines) wo.lines = dto.lines;
    if (dto.quotedPriceIncVat != null) wo.quotedPriceIncVat = dto.quotedPriceIncVat;
    if (dto.issueDescription != null) wo.issueDescription = dto.issueDescription;
    if (dto.notes != null) wo.notes = dto.notes;
    if (dto.customerPhone != null) wo.customerPhone = dto.customerPhone;
    await wo.save();
    return wo;
  }

  async transition(
    userId: string,
    companyId: string,
    id: string,
    dto: TransitionWorkOrderDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const wo = await this.woModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!wo) throw new NotFoundException('Work order not found');

    if (!canTransition(wo.flowType, wo.status, dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${wo.status} to ${dto.status} (${wo.flowType})`,
      );
    }

    const prev = wo.status;
    wo.status = dto.status;

    if (wo.serialUnitId) {
      if (dto.status === 'in_progress' || dto.status === 'in_repair') {
        await this.setSerialRepair(wo.serialUnitId, userId, wo._id);
      }
      if (dto.status === 'completed') {
        await this.setSerialFromRepair(wo.serialUnitId, userId, wo._id);
      }
      if (dto.status === 'cancelled' && prev !== 'draft') {
        await this.setSerialFromRepair(wo.serialUnitId, userId, wo._id);
      }
    }

    if (dto.paymentOrderId) {
      wo.paymentOrderId = new Types.ObjectId(dto.paymentOrderId);
    }
    if (dto.completionResult) {
      wo.completionResult = dto.completionResult;
    }

    await wo.save();
    await this.maybeSendSms(wo);

    return wo;
  }

  private async setSerialRepair(
    serialUnitId: Types.ObjectId,
    userId: string,
    woId: Types.ObjectId,
  ) {
    const unit = await this.serialModel.findById(serialUnitId);
    if (!unit || unit.status === 'sold') return;
    const from = unit.status;
    unit.status = 'in_repair';
    await unit.save();
    await this.eventModel.create({
      serialUnitId: unit._id,
      type: 'work_order',
      fromStatus: from,
      toStatus: 'in_repair',
      refType: 'work_order',
      refId: woId,
      byUserId: new Types.ObjectId(userId),
    });
  }

  private async setSerialFromRepair(
    serialUnitId: Types.ObjectId,
    userId: string,
    woId: Types.ObjectId,
  ) {
    const unit = await this.serialModel.findById(serialUnitId);
    if (!unit || unit.status !== 'in_repair') return;
    unit.status = 'in_stock';
    await unit.save();
    await this.eventModel.create({
      serialUnitId: unit._id,
      type: 'work_order_done',
      fromStatus: 'in_repair',
      toStatus: 'in_stock',
      refType: 'work_order',
      refId: woId,
      byUserId: new Types.ObjectId(userId),
    });
  }

  private async maybeSendSms(wo: WorkOrderDocument) {
    const trigger = SMS_ON_ENTER[wo.status];
    if (!trigger || !wo.customerPhone) return;

    const price = wo.quotedPriceIncVat.toFixed(2);
    if (trigger === 'price_confirm') {
      await this.sms.send(
        wo.customerPhone,
        `[LZ3C] Repair ${wo.docNumber}: please confirm price €${price}. Reply or visit store to pay.`,
      );
    } else if (trigger === 'ready') {
      await this.sms.send(
        wo.customerPhone,
        `[LZ3C] Repair ${wo.docNumber} is ready for collection. Thank you!`,
      );
    }
  }
}
