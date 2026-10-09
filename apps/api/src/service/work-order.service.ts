import { randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve, sep } from 'path';
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
import { formatPriceListLabel, PriceListService } from './price-list.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { CompanyService } from '../company/company.service';
import { FileStorageService } from '../storage/file-storage.service';
import { SmsService } from '../notification/sms.service';
import { FeiePrintService } from '../printing/feie-print.service';
import { renderRepairShopTicket, renderRepairTickets } from '../printing/tickets';
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
    private priceList: PriceListService,
    private docSeq: DocumentSequenceService,
    private sms: SmsService,
    private receiptService: WorkOrderReceiptService,
    private feie: FeiePrintService,
    private storage: FileStorageService,
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

  private async repairServiceTaxCategory(companyId: Types.ObjectId) {
    const servicesTax = await this.taxModel
      .findOne({ companyId, scheme: 'standard_13_5', isActive: true })
      .lean();
    if (servicesTax) return servicesTax;

    const defaultTax = await this.taxModel
      .findOne({ companyId, isDefault: true, isActive: true })
      .lean();
    if (defaultTax) return defaultTax;

    return this.taxModel.findOne({ companyId, isActive: true }).lean();
  }

  private async ensureRepairServiceProduct(companyId: string) {
    const cid = new Types.ObjectId(companyId);
    const tax = await this.repairServiceTaxCategory(cid);
    if (!tax) throw new BadRequestException('No tax category for repair product');

    const existing = await this.productModel.findOne({
      companyId: cid,
      productType: 'service',
      skuCode: 'REPAIR-SVC',
    });
    if (existing) {
      if (!existing.taxCategoryId?.equals(tax._id)) {
        existing.taxCategoryId = tax._id;
        await existing.save();
      }
      return existing;
    }

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
      photoDataUrls: isCustomer ? undefined : await this.photoDataUrls(wo),
    });
  }

  /** Prints the customer copy and the shop copy on the store's Feie printer. */
  async printFeie(userId: string, companyId: string, storeId: string, id: string) {
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
    const ticket = {
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.phone,
      docNumber: wo.docNumber,
      printedAt,
      customerPhone: wo.customerPhone ?? '',
      customerName: wo.customerName,
      deviceBrand: wo.deviceBrand,
      deviceModel: wo.deviceModel,
      imeiSn: wo.imeiSn ?? wo.serialSn,
      issueDescription: wo.issueDescription,
      priceIncVat: wo.quotedPriceIncVat,
      repairLocation: wo.repairLocation,
      expectedCompletion: wo.expectedCompletionAt
        ? new Date(wo.expectedCompletionAt).toLocaleDateString('en-IE')
        : undefined,
      repairTerms: store.repairTerms,
      notes: wo.notes,
      photoCount: wo.photoIds?.length ?? 0,
    };
    await this.feie.print(companyId, storeId, renderRepairTickets(ticket));
    return this.feie.print(companyId, storeId, renderRepairShopTicket(ticket));
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
    if (flowType === 'send_out' && !repairLocation) {
      throw new BadRequestException('Send-out repair needs a repair location');
    }

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
        lines = [{ description: desc, priceIncVat: quoted ?? flat.priceIncVat }];
      }
      if (quoted == null) quoted = flat.priceIncVat;
    }

    if (quoted == null) {
      quoted = lines.reduce((s, l) => s + l.priceIncVat, 0);
    }

    const savedPriceId = await this.priceList.rememberOrderQuote(companyId, {
      brand: deviceBrand,
      model: deviceModel,
      issue: issueDescription,
      price: dto.quotedPriceIncVat,
    });

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
      priceListItemId:
        savedPriceId ??
        (dto.priceListItemId ? new Types.ObjectId(dto.priceListItemId) : undefined),
      customerId: dto.customerId
        ? new Types.ObjectId(dto.customerId)
        : undefined,
      customerPhone: dto.customerPhone.trim(),
      notifySms: dto.notifySms === true,
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
    if (
      !['draft', 'in_progress', 'sent_out', 'in_repair', 'returned', 'awaiting_payment'].includes(
        wo.status,
      )
    ) {
      throw new BadRequestException('Cannot edit work order in current status');
    }
    if (dto.lines) wo.lines = dto.lines;
    let priceChanged = false;
    if (dto.quotedPriceIncVat != null) {
      const next = Math.round(dto.quotedPriceIncVat * 100) / 100;
      priceChanged = Math.abs(wo.quotedPriceIncVat - next) > 0.009;
      wo.quotedPriceIncVat = next;
      if (wo.lines.length === 1) wo.lines[0].priceIncVat = next;
    }
    let issueChanged = false;
    if (dto.issueDescription != null) {
      const nextIssue = dto.issueDescription.trim();
      issueChanged = (wo.issueDescription ?? '').trim() !== nextIssue;
      wo.issueDescription = nextIssue || undefined;
    }
    if (dto.notes != null) wo.notes = dto.notes;
    if (dto.customerPhone != null) wo.customerPhone = dto.customerPhone;
    await wo.save();

    const changed = priceChanged || issueChanged;
    if (changed) {
      try {
        await this.priceList.rememberOrderQuote(companyId, {
          brand: wo.deviceBrand,
          model: wo.deviceModel,
          issue: wo.issueDescription,
          price: wo.quotedPriceIncVat,
        });
      } catch {
        // The work-order price is already saved. A catalog miss must not block the text.
      }
    }

    let smsSent = false;
    if (changed && wo.customerPhone) {
      const price = wo.quotedPriceIncVat.toFixed(2);
      const issue = wo.issueDescription?.trim();
      const shop = await this.smsStoreName(wo.storeId);
      const body = issue
        ? `[${shop}] Repair ${wo.docNumber}: ${issue}. Price: €${price}.`
        : `[${shop}] The price for repair ${wo.docNumber} is now €${price}.`;
      const result = await this.sms.send(wo.customerPhone, body);
      smsSent = result.sent;
    }
    return { ...wo.toObject(), smsSent, priceChanged: changed };
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
    const smsSent = await this.maybeSendSms(wo);

    return { ...wo.toObject(), smsSent };
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

  async addPhoto(userId: string, companyId: string, id: string, jpeg: Buffer) {
    await this.companyService.assertMember(userId, companyId);
    const wo = await this.woModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!wo) throw new NotFoundException('Work order not found');
    if (['completed', 'cancelled'].includes(wo.status)) {
      throw new BadRequestException('Cannot add photos to a closed work order');
    }
    if ((wo.photoIds?.length ?? 0) >= 6) {
      throw new BadRequestException('A work order can have at most 6 photos');
    }
    if (jpeg.length < 32 || jpeg.length > 2_500_000 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new BadRequestException('Photo must be a JPEG');
    }
    const photoId = randomBytes(12).toString('hex');
    await this.storage.save(
      this.photoKey(companyId, wo._id.toString(), photoId),
      jpeg,
      'image/jpeg',
    );
    wo.photoIds = [...(wo.photoIds ?? []), photoId];
    await wo.save();
    return { photoId };
  }

  async readPhoto(userId: string, companyId: string, id: string, photoId: string) {
    await this.companyService.assertMember(userId, companyId);
    const wo = await this.woModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .select({ photoIds: 1 })
      .lean();
    if (!wo) throw new NotFoundException('Work order not found');
    if (!wo.photoIds?.includes(photoId)) throw new NotFoundException('Photo not found');
    try {
      return await this.readPhotoBytes(companyId, id, photoId);
    } catch {
      throw new NotFoundException('Photo not found');
    }
  }

  /** gs://3cios/repair/{company}/{order}/{photo}.jpg */
  private photoKey(companyId: string, orderId: string, photoId: string) {
    this.assertPhotoIds(companyId, orderId, photoId);
    return `repair/${companyId}/${orderId}/${photoId}.jpg`;
  }

  private async readPhotoBytes(companyId: string, orderId: string, photoId: string) {
    const stored = await this.storage.read(this.photoKey(companyId, orderId, photoId));
    if (stored) return stored;
    return readFile(this.legacyPhotoFile(companyId, orderId, photoId));
  }

  private legacyPhotoFile(companyId: string, orderId: string, photoId: string) {
    this.assertPhotoIds(companyId, orderId, photoId);
    const root = resolve(process.cwd(), 'data', 'work-order-photos');
    const file = resolve(root, companyId, orderId, `${photoId}.jpg`);
    if (!file.startsWith(root + sep)) throw new BadRequestException('Invalid photo');
    return file;
  }

  private assertPhotoIds(companyId: string, orderId: string, photoId: string) {
    if (!/^[a-f0-9]{24}$/.test(companyId) || !/^[a-f0-9]{24}$/.test(orderId)) {
      throw new BadRequestException('Invalid work order');
    }
    if (!/^[a-f0-9]{24}$/.test(photoId)) throw new BadRequestException('Invalid photo');
  }

  private async photoDataUrls(wo: {
    companyId: Types.ObjectId;
    _id: Types.ObjectId;
    photoIds?: string[];
  }) {
    const urls: string[] = [];
    for (const photoId of wo.photoIds ?? []) {
      try {
        const bytes = await this.readPhotoBytes(
          wo.companyId.toString(),
          wo._id.toString(),
          photoId,
        );
        urls.push(`data:image/jpeg;base64,${bytes.toString('base64')}`);
      } catch {
        // A missing file should not stop the shop receipt.
      }
    }
    return urls;
  }

  private async smsStoreName(storeId?: Types.ObjectId | null): Promise<string> {
    if (!storeId) return 'Store';
    const store = await this.storeModel.findById(storeId).select('name').lean();
    return store?.name?.trim() || 'Store';
  }

  private async maybeSendSms(wo: WorkOrderDocument): Promise<boolean> {
    const trigger = SMS_ON_ENTER[wo.status];
    if (!trigger || !wo.notifySms || !wo.customerPhone) return false;

    const price = wo.quotedPriceIncVat.toFixed(2);
    const shop = await this.smsStoreName(wo.storeId);
    const result = await this.sms.send(
      wo.customerPhone,
      `[${shop}] Repair ${wo.docNumber} is ready. Please collect it in store. Charge: €${price}.`,
    );
    return result.sent;
  }
}
