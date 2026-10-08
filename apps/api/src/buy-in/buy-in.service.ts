import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  BuyIn,
  BuyInDocument,
  CatalogCategory,
  CatalogCategoryDocument,
  InventoryPosition,
  InventoryPositionDocument,
  Product,
  ProductDocument,
  SerialEvent,
  SerialEventDocument,
  SerialUnit,
  SerialUnitDocument,
  TaxCategory,
  TaxCategoryDocument,
} from '@lz3c/db';
import { Model, Types } from 'mongoose';
import { readFile } from 'fs/promises';
import { resolve, sep } from 'path';
import { CompanyService } from '../company/company.service';
import { FileStorageService } from '../storage/file-storage.service';
import { CreateBuyInDto } from './dto/create-buy-in.dto';
import { StockInBuyInDto } from './dto/stock-in-buy-in.dto';

const SLOTS = [1, 2, 3] as const;

@Injectable()
export class BuyInService {
  constructor(
    @InjectModel(BuyIn.name) private buyInModel: Model<BuyInDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(SerialUnit.name) private serialModel: Model<SerialUnitDocument>,
    @InjectModel(SerialEvent.name) private eventModel: Model<SerialEventDocument>,
    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,
    @InjectModel(CatalogCategory.name)
    private catalogModel: Model<CatalogCategoryDocument>,
    @InjectModel(InventoryPosition.name)
    private positionModel: Model<InventoryPositionDocument>,
    private companyService: CompanyService,
    private storage: FileStorageService,
  ) {}

  async create(
    userId: string,
    companyId: string,
    storeId: string,
    dto: CreateBuyInDto,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const row = await this.buyInModel.create({
      ...this.fields(dto),
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      photoSlots: [],
      status: 'draft',
      createdBy: new Types.ObjectId(userId),
    });
    return row.toObject();
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    dto: CreateBuyInDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const row = await this.findDraft(companyId, id);
    Object.assign(row, this.fields(dto));
    await row.save();
    return row.toObject();
  }

  async list(userId: string, companyId: string, storeId: string, status?: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      status: status || 'pending_inspection',
    };
    return this.buyInModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async history(userId: string, companyId: string, storeId: string, q: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const query = q.trim();
    if (!query) return [];
    const rows = await this.buyInModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        status: { $in: ['pending_inspection', 'stocked'] },
      })
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    const folded = query.toLowerCase();
    const digits = query.replace(/\D/g, '');
    return rows.filter((row) => this.matchesHistory(row, folded, digits)).slice(0, 80);
  }

  async get(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Buy-in not found');
    const row = await this.buyInModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .lean();
    if (!row) throw new NotFoundException('Buy-in not found');
    return row;
  }

  async savePhoto(
    userId: string,
    companyId: string,
    id: string,
    slot: number,
    jpeg: Buffer,
  ) {
    await this.companyService.assertMember(userId, companyId);
    if (!SLOTS.includes(slot as (typeof SLOTS)[number])) {
      throw new BadRequestException('Photo slot must be 1, 2, or 3');
    }
    const row = await this.findDraft(companyId, id);
    if (jpeg.length < 32 || jpeg.length > 2_500_000 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new BadRequestException('Photo must be a JPEG');
    }
    await this.storage.save(this.photoKey(companyId, id, slot), jpeg, 'image/jpeg');
    const slots = new Set(row.photoSlots ?? []);
    slots.add(slot);
    row.photoSlots = [...slots].sort((a, b) => a - b);
    await row.save();
    return { slot };
  }

  async readPhoto(userId: string, companyId: string, id: string, slot: number) {
    await this.companyService.assertMember(userId, companyId);
    const row = await this.buyInModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .select({ photoSlots: 1 })
      .lean();
    if (!row) throw new NotFoundException('Buy-in not found');
    if (!row.photoSlots?.includes(slot)) throw new NotFoundException('Photo not found');
    const stored = await this.storage.read(this.photoKey(companyId, id, slot));
    if (stored) return stored;
    try {
      return await readFile(this.legacyPhotoFile(companyId, id, slot));
    } catch {
      throw new NotFoundException('Photo not found');
    }
  }

  async complete(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const row = await this.findDraft(companyId, id);
    if (!SLOTS.every((slot) => row.photoSlots?.includes(slot))) {
      throw new BadRequestException('Buy-in needs all 3 photos');
    }
    const sn = row.imeiSn.trim();
    const duplicate = await this.serialModel.findOne({
      companyId: new Types.ObjectId(companyId),
      sn,
    });
    if (duplicate) throw new BadRequestException(`SN already exists: ${sn}`);

    const tax = await this.taxModel
      .findOne({
        companyId: new Types.ObjectId(companyId),
        scheme: 'margin_23',
        isActive: true,
      })
      .lean();
    if (!tax) {
      throw new BadRequestException('Add a Margin VAT tax category first');
    }

    const name = [row.brand, row.model, row.capacity, row.color]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ');
    const product = await this.productModel.create({
      companyId: row.companyId,
      productType: 'serialized',
      name,
      taxCategoryId: tax._id,
      costPrice: row.buyPrice,
      isActive: false,
    });
    const unit = await this.serialModel.create({
      companyId: row.companyId,
      productId: product._id,
      sn,
      status: 'pending_inspection',
      purchaseCost: row.buyPrice,
      currentStoreId: row.storeId,
      notes: row.notes,
    });
    await this.eventModel.create({
      serialUnitId: unit._id,
      type: 'buy_in',
      toStatus: 'pending_inspection',
      refType: 'buy_in',
      refId: row._id,
      byUserId: new Types.ObjectId(userId),
    });
    row.productId = product._id;
    row.serialUnitId = unit._id;
    row.status = 'pending_inspection';
    await row.save();
    return row.toObject();
  }

  async stockIn(
    userId: string,
    companyId: string,
    id: string,
    dto: StockInBuyInDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const row = await this.buyInModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!row) throw new NotFoundException('Buy-in not found');
    if (row.status !== 'pending_inspection' || !row.productId || !row.serialUnitId) {
      throw new BadRequestException('Only a checked device can be stocked');
    }
    const unit = await this.serialModel.findById(row.serialUnitId);
    if (!unit || unit.status !== 'pending_inspection') {
      throw new BadRequestException('Serial is not waiting for inspection');
    }
    const catalog = await this.catalogModel.findOne({
      _id: dto.catalogCategoryId,
      companyId: row.companyId,
      isActive: true,
    });
    if (!catalog) throw new BadRequestException('Catalog not found');
    const tax = await this.taxModel.findOne({
      _id: dto.taxCategoryId,
      companyId: row.companyId,
      isActive: true,
    });
    if (!tax) throw new BadRequestException('VAT category not found');
    await this.productModel.updateOne(
      { _id: row.productId },
      {
        $set: {
          retailPrice: dto.retailPrice,
          catalogCategoryId: catalog._id,
          taxCategoryId: tax._id,
          isActive: true,
        },
      },
    );
    const from = unit.status;
    unit.status = 'in_stock';
    await unit.save();
    await this.positionModel.findOneAndUpdate(
      {
        companyId: row.companyId,
        storeId: row.storeId,
        productId: row.productId,
      },
      { $inc: { quantity: 1 } },
      { upsert: true },
    );
    await this.eventModel.create({
      serialUnitId: unit._id,
      type: 'buy_in_stocked',
      fromStatus: from,
      toStatus: 'in_stock',
      refType: 'buy_in',
      refId: row._id,
      byUserId: new Types.ObjectId(userId),
    });
    row.retailPrice = dto.retailPrice;
    row.status = 'stocked';
    await row.save();
    return row.toObject();
  }

  private fields(dto: CreateBuyInDto) {
    return {
      brand: dto.brand.trim(),
      model: dto.model.trim(),
      capacity: dto.capacity.trim(),
      color: dto.color.trim(),
      imeiSn: dto.imeiSn.trim(),
      customerName: dto.customerName.trim(),
      customerPhone: dto.customerPhone.trim(),
      buyPrice: dto.buyPrice,
      notes: dto.notes?.trim() || undefined,
      paymentMethod: dto.paymentMethod,
    };
  }

  private matchesHistory(
    row: {
      brand?: string;
      model?: string;
      capacity?: string;
      color?: string;
      notes?: string;
      imeiSn?: string;
      customerName?: string;
      customerPhone?: string;
    },
    folded: string,
    digits: string,
  ) {
    const description = [row.brand, row.model, row.capacity, row.color, row.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (description.includes(folded)) return true;
    if ((row.customerName ?? '').toLowerCase().includes(folded)) return true;
    const imei = (row.imeiSn ?? '').toLowerCase();
    if (imei.includes(folded)) return true;
    if (digits.length >= 5 && imei.replace(/\D/g, '').includes(digits)) return true;
    const phone = (row.customerPhone ?? '').replace(/\D/g, '');
    return digits.length >= 3 && phone.includes(digits);
  }

  private async findDraft(companyId: string, id: string) {
    const row = await this.buyInModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!row) throw new NotFoundException('Buy-in not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Buy-in is already finished');
    }
    return row;
  }

  /** gs://3cios/buyin/{company}/{buy-in}/{slot}.jpg — bucket name comes from GCS_BUCKET. */
  private photoKey(companyId: string, id: string, slot: number) {
    this.assertPhotoIds(companyId, id, slot);
    return `buyin/${companyId}/${id}/${slot}.jpg`;
  }

  private legacyPhotoFile(companyId: string, id: string, slot: number) {
    this.assertPhotoIds(companyId, id, slot);
    const root = resolve(process.cwd(), 'data', 'buy-in-photos');
    const file = resolve(root, companyId, id, `${slot}.jpg`);
    if (!file.startsWith(root + sep)) throw new BadRequestException('Invalid photo');
    return file;
  }

  private assertPhotoIds(companyId: string, id: string, slot: number) {
    if (!/^[a-f0-9]{24}$/.test(companyId) || !/^[a-f0-9]{24}$/.test(id)) {
      throw new BadRequestException('Invalid buy-in');
    }
    if (!SLOTS.includes(slot as (typeof SLOTS)[number])) {
      throw new BadRequestException('Invalid photo');
    }
  }
}
