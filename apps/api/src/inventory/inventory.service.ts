import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InboundReceipt,
  InboundReceiptDocument,
  InventoryPosition,
  InventoryPositionDocument,
  Product,
  ProductDocument,
  SerialEvent,
  SerialEventDocument,
  SerialUnit,
  SerialUnitDocument,
  StoreProductSetting,
  StoreProductSettingDocument,
} from '@lz3c/db';
import { AuditService } from '../common/services/audit.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { CompanyService } from '../company/company.service';
import { ProductService } from '../product/product.service';
import { CreateInboundDto, InboundLineDto } from './dto/create-inbound.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryPosition.name)
    private positionModel: Model<InventoryPositionDocument>,
    @InjectModel(InboundReceipt.name)
    private inboundModel: Model<InboundReceiptDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(SerialUnit.name) private serialModel: Model<SerialUnitDocument>,
    @InjectModel(SerialEvent.name) private eventModel: Model<SerialEventDocument>,
    @InjectModel(StoreProductSetting.name)
    private storeProductSettingModel: Model<StoreProductSettingDocument>,
    private companyService: CompanyService,
    private productService: ProductService,
    private docSeq: DocumentSequenceService,
    private audit: AuditService,
  ) {}

  async listPositions(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.positionModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
      })
      .populate({
        path: 'productId',
        select:
          'name productType skuCode retailPrice costPrice parentProductId variantValues',
        populate: { path: 'parentProductId', select: 'name' },
      })
      .lean();
  }

  async listStoreCatalog(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const companyOid = new Types.ObjectId(companyId);
    const storeOid = new Types.ObjectId(storeId);

    const products = await this.productModel
      .find({
        companyId: companyOid,
        productType: { $ne: 'service' },
      })
      .populate('catalogCategoryId', 'name')
      .populate('parentProductId', 'name')
      .sort({ name: 1 })
      .lean();

    const parentIdsWithVariants = new Set(
      products
        .filter((p) => (p.variantDimensions?.length ?? 0) > 0)
        .map((p) => p._id.toString()),
    );

    const sellable = products.filter((p) => {
      if (parentIdsWithVariants.has(p._id.toString())) return false;
      return true;
    });

    const sellableIds = sellable.map((p) => p._id);
    const positions = await this.positionModel
      .find({
        companyId: companyOid,
        storeId: storeOid,
        productId: { $in: sellableIds },
      })
      .lean();
    const qtyByProduct = new Map(
      positions.map((p) => [p.productId.toString(), p.quantity]),
    );

    const serializedIds = sellable
      .filter((p) => p.productType === 'serialized')
      .map((p) => p._id);
    const serialCounts =
      serializedIds.length > 0
        ? await this.serialModel.aggregate<{ _id: Types.ObjectId; count: number }>([
            {
              $match: {
                companyId: companyOid,
                currentStoreId: storeOid,
                productId: { $in: serializedIds },
                status: 'in_stock',
              },
            },
            { $group: { _id: '$productId', count: { $sum: 1 } } },
          ])
        : [];
    const serialQtyByProduct = new Map(
      serialCounts.map((row) => [row._id.toString(), row.count]),
    );

    const settings = await this.loadSettingsMap(
      storeId,
      sellable.map((p) => p._id.toString()),
    );

    return sellable.map((p) => {
      const id = p._id.toString();
      const quantity =
        p.productType === 'serialized'
          ? (serialQtyByProduct.get(id) ?? 0)
          : (qtyByProduct.get(id) ?? 0);
      const parent =
        p.parentProductId && typeof p.parentProductId === 'object'
          ? (p.parentProductId as { name?: string }).name
          : undefined;
      const category =
        p.catalogCategoryId && typeof p.catalogCategoryId === 'object'
          ? (p.catalogCategoryId as { _id?: Types.ObjectId; name?: string }).name
          : undefined;
      const catalogCategoryId =
        p.catalogCategoryId && typeof p.catalogCategoryId === 'object'
          ? (p.catalogCategoryId as { _id?: Types.ObjectId })._id?.toString()
          : p.catalogCategoryId
            ? String(p.catalogCategoryId)
            : null;
      const setting = settings.get(id);
      return {
        productId: id,
        name: p.name,
        parentName: parent,
        variantValues: p.variantValues ?? [],
        productType: p.productType,
        skuCode: p.skuCode,
        category,
        catalogCategoryId,
        retailPrice: p.retailPrice,
        wholesalePrice: p.wholesalePrice,
        costPrice: p.costPrice,
        posSalable: setting?.posSalable ?? true,
        chainShareEnabled: setting?.chainShareEnabled ?? false,
        quantity,
        quantityReadOnly: p.productType === 'serialized',
      };
    });
  }

  async updateStoreProductSetting(
    userId: string,
    companyId: string,
    storeId: string,
    productId: string,
    dto: { posSalable?: boolean; chainShareEnabled?: boolean },
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const role = await this.companyService.resolveRole(userId, companyId, storeId);

    const product = await this.productModel.findOne({
      _id: productId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.chainShareEnabled !== undefined && role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only store managers can change group sharing');
    }
    if (
      dto.chainShareEnabled === true &&
      (product.wholesalePrice == null || product.wholesalePrice <= 0)
    ) {
      throw new BadRequestException(
        'Set a wholesale price before sharing with group stores',
      );
    }
    if (dto.posSalable === undefined && dto.chainShareEnabled === undefined) {
      throw new BadRequestException('No changes provided');
    }

    const $set: Partial<StoreProductSetting> = {};
    if (dto.posSalable !== undefined) $set.posSalable = dto.posSalable;
    if (dto.chainShareEnabled !== undefined) $set.chainShareEnabled = dto.chainShareEnabled;

    const doc = await this.storeProductSettingModel.findOneAndUpdate(
      {
        storeId: new Types.ObjectId(storeId),
        productId: new Types.ObjectId(productId),
      },
      {
        $set,
        $setOnInsert: {
          companyId: new Types.ObjectId(companyId),
          storeId: new Types.ObjectId(storeId),
          productId: new Types.ObjectId(productId),
        },
      },
      { upsert: true, new: true },
    );

    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'inventory.store_product_setting',
      entityType: 'store_product_setting',
      entityId: productId,
      metadata: dto,
    });

    return {
      productId,
      posSalable: doc.posSalable,
      chainShareEnabled: doc.chainShareEnabled,
    };
  }

  async assertPosSalable(companyId: string, storeId: string, productId: string) {
    const setting = await this.storeProductSettingModel.findOne({
      storeId: new Types.ObjectId(storeId),
      productId: new Types.ObjectId(productId),
    });
    if (setting && !setting.posSalable) {
      throw new BadRequestException('Product is not available for sale at this store');
    }
  }

  async chainShareEnabledIds(storeId: string, productIds: Types.ObjectId[]) {
    if (!productIds.length) return new Set<string>();
    const rows = await this.storeProductSettingModel
      .find({
        storeId: new Types.ObjectId(storeId),
        productId: { $in: productIds },
        chainShareEnabled: true,
      })
      .select('productId')
      .lean();
    return new Set(rows.map((r) => r.productId.toString()));
  }

  async loadSettingsMap(storeId: string, productIds: string[]) {
    if (!productIds.length) return new Map<string, { posSalable: boolean; chainShareEnabled: boolean }>();
    const rows = await this.storeProductSettingModel
      .find({
        storeId: new Types.ObjectId(storeId),
        productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean();
    return new Map(
      rows.map((r) => [
        r.productId.toString(),
        { posSalable: r.posSalable !== false, chainShareEnabled: !!r.chainShareEnabled },
      ]),
    );
  }

  async setPositionQuantity(
    userId: string,
    companyId: string,
    storeId: string,
    productId: string,
    quantity: number,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const product = await this.productModel.findOne({
      _id: productId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.productType === 'serialized') {
      throw new BadRequestException('Serialized stock is managed via serial numbers');
    }
    if (product.productType === 'service') {
      throw new BadRequestException('Service products have no stock');
    }

    await this.positionModel.findOneAndUpdate(
      {
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        productId: new Types.ObjectId(productId),
      },
      { $set: { quantity } },
      { upsert: true, new: true },
    );

    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'inventory.set_quantity',
      entityType: 'inventory_position',
      entityId: productId,
      metadata: { quantity },
    });

    return { productId, quantity };
  }

  async listInbound(
    userId: string,
    companyId: string,
    storeId: string,
    from?: string,
    to?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
    };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) {
        const d = new Date(from);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException('Invalid from date');
        }
        d.setHours(0, 0, 0, 0);
        range.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException('Invalid to date');
        }
        d.setHours(23, 59, 59, 999);
        range.$lte = d;
      }
      filter.$or = [
        { receivedAt: range },
        { receivedAt: { $exists: false }, createdAt: range },
        { receivedAt: null, createdAt: range },
      ];
    }
    return this.inboundModel
      .find(filter)
      .sort({ receivedAt: -1, createdAt: -1 })
      .populate('lines.productId', 'name productType skuCode')
      .lean();
  }

  async createInbound(
    userId: string,
    companyId: string,
    storeId: string,
    dto: CreateInboundDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const docNumber = await this.docSeq.next(companyId, 'inbound');
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) {
      throw new BadRequestException('Invalid receivedAt');
    }

    const resolvedLines: {
      productId: string;
      quantity: number;
      unitCost?: number;
      retailPrice?: number;
      stockOnHand?: number;
      serialNumbers?: string[];
    }[] = [];

    for (const line of dto.lines) {
      const productId = await this.resolveLineProductId(
        userId,
        companyId,
        line,
      );
      resolvedLines.push({
        productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        retailPrice: line.retailPrice,
        stockOnHand: line.stockOnHand,
        serialNumbers: line.serialNumbers,
      });
    }

    for (const line of resolvedLines) {
      const product = await this.productModel.findOne({
        _id: line.productId,
        companyId: new Types.ObjectId(companyId),
      });
      if (!product) throw new NotFoundException(`Product ${line.productId} not found`);
      if (product.variantDimensions?.length) {
        throw new BadRequestException(
          `Receive stock per variant SKU, not template: ${product.name}`,
        );
      }

      const productUpdates: { costPrice?: number; retailPrice?: number } = {};
      if (line.unitCost !== undefined) productUpdates.costPrice = line.unitCost;
      if (line.retailPrice !== undefined) productUpdates.retailPrice = line.retailPrice;
      if (Object.keys(productUpdates).length > 0) {
        await this.productModel.updateOne({ _id: product._id }, { $set: productUpdates });
      }

      const unitCost = line.unitCost ?? product.costPrice;

      if (line.stockOnHand !== undefined && product.productType !== 'serialized') {
        await this.positionModel.findOneAndUpdate(
          {
            companyId: new Types.ObjectId(companyId),
            storeId: new Types.ObjectId(storeId),
            productId: product._id,
          },
          { $set: { quantity: line.stockOnHand } },
          { upsert: true },
        );
      }

      if (product.productType === 'serialized') {
        if (!line.serialNumbers?.length) {
          throw new BadRequestException(
            `Serial numbers required for ${product.name}`,
          );
        }
        if (line.serialNumbers.length !== line.quantity) {
          throw new BadRequestException('Serial count must match quantity');
        }
        for (const sn of line.serialNumbers) {
          const existing = await this.serialModel.findOne({
            companyId: new Types.ObjectId(companyId),
            sn: sn.trim(),
          });
          if (existing) {
            throw new BadRequestException(`SN already exists: ${sn}`);
          }
          const unit = await this.serialModel.create({
            companyId: new Types.ObjectId(companyId),
            productId: product._id,
            sn: sn.trim(),
            status: 'in_stock',
            purchaseCost: unitCost,
            currentStoreId: new Types.ObjectId(storeId),
          });
          await this.eventModel.create({
            serialUnitId: unit._id,
            type: 'inbound',
            toStatus: 'in_stock',
            byUserId: new Types.ObjectId(userId),
          });
        }
        await this.adjustQty(companyId, storeId, line.productId, line.quantity);
      } else if (product.productType !== 'service') {
        await this.adjustQty(companyId, storeId, line.productId, line.quantity);
      }
    }

    const receipt = await this.inboundModel.create({
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docNumber,
      supplier: dto.supplier.trim(),
      receivedAt,
      lines: resolvedLines.map((l) => ({
        productId: new Types.ObjectId(l.productId),
        quantity: l.quantity,
        unitCost: l.unitCost,
        serialNumbers: l.serialNumbers,
      })),
      createdByUserId: new Types.ObjectId(userId),
      notes: dto.notes?.trim() || undefined,
    });

    void this.audit.log({
      companyId,
      userId,
      storeId,
      action: 'inventory.inbound',
      entityType: 'inbound_receipt',
      entityId: receipt._id.toString(),
      metadata: { docNumber, lineCount: dto.lines.length, supplier: dto.supplier },
    });

    return receipt;
  }

  private async resolveLineProductId(
    userId: string,
    companyId: string,
    line: InboundLineDto,
  ): Promise<string> {
    if (line.productId && line.newProduct) {
      throw new BadRequestException('Line must have productId or newProduct, not both');
    }
    if (!line.productId && !line.newProduct) {
      throw new BadRequestException('Line must have productId or newProduct');
    }
    if (line.productId) return line.productId;

    const np = line.newProduct!;
    const created = await this.productService.create(userId, companyId, {
      productType: np.productType,
      name: np.name.trim(),
      taxCategoryId: np.taxCategoryId,
      costPrice: np.costPrice,
      catalogCategoryId: np.catalogCategoryId,
      retailPrice: np.retailPrice,
      skuCode: np.skuCode,
    });
    return created._id.toString();
  }

  async adjustQty(
    companyId: string,
    storeId: string,
    productId: string,
    delta: number,
  ) {
    await this.positionModel.findOneAndUpdate(
      {
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        productId: new Types.ObjectId(productId),
      },
      { $inc: { quantity: delta } },
      { upsert: true, new: true },
    );
  }

  async decrementStock(
    companyId: string,
    storeId: string,
    productId: string,
    qty: number,
    serialUnitId?: string,
  ) {
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found');

    if (product.productType === 'serialized') {
      if (!serialUnitId) {
        throw new BadRequestException('serialUnitId required for serialized sale');
      }
      const unit = await this.serialModel.findOneAndUpdate(
        {
          _id: serialUnitId,
          companyId: new Types.ObjectId(companyId),
          currentStoreId: new Types.ObjectId(storeId),
          status: 'in_stock',
        },
        { status: 'sold' },
        { new: true },
      );
      if (!unit) throw new BadRequestException('Serial not available for sale');
      await this.eventModel.create({
        serialUnitId: unit._id,
        type: 'sold',
        fromStatus: 'in_stock',
        toStatus: 'sold',
      });
    } else if (product.productType !== 'service') {
      const pos = await this.positionModel.findOne({
        storeId: new Types.ObjectId(storeId),
        productId: new Types.ObjectId(productId),
      });
      if (!pos || pos.quantity < qty) {
        throw new BadRequestException(`Insufficient stock for ${product.name}`);
      }
      pos.quantity -= qty;
      await pos.save();
    }
  }

  async restoreStock(
    companyId: string,
    storeId: string,
    productId: string,
    qty: number,
    serialUnitId?: string,
    userId?: string,
  ) {
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found');

    if (product.productType === 'serialized') {
      if (!serialUnitId) {
        throw new BadRequestException('serialUnitId required for serialized return');
      }
      const unit = await this.serialModel.findOneAndUpdate(
        {
          _id: serialUnitId,
          companyId: new Types.ObjectId(companyId),
          currentStoreId: new Types.ObjectId(storeId),
          status: 'sold',
        },
        { status: 'in_stock' },
        { new: true },
      );
      if (!unit) throw new BadRequestException('Serial not found as sold at this store');
      await this.eventModel.create({
        serialUnitId: unit._id,
        type: 'return',
        fromStatus: 'sold',
        toStatus: 'in_stock',
        byUserId: userId ? new Types.ObjectId(userId) : undefined,
      });
      await this.adjustQty(companyId, storeId, productId, qty);
    } else if (product.productType !== 'service') {
      await this.adjustQty(companyId, storeId, productId, qty);
    }
  }
}
