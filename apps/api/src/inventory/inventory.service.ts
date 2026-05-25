import {
  BadRequestException,
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
