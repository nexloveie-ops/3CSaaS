import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Product,
  ProductDocument,
  SerialEvent,
  SerialEventDocument,
  SerialUnit,
  SerialUnitDocument,
} from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreateSerialDto } from './dto/create-serial.dto';
import { ReplaceSerialDto } from './dto/replace-serial.dto';
import { UpdateSerialStatusDto } from './dto/update-serial-status.dto';

@Injectable()
export class SerialService {
  constructor(
    @InjectModel(SerialUnit.name) private serialModel: Model<SerialUnitDocument>,
    @InjectModel(SerialEvent.name) private eventModel: Model<SerialEventDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private companyService: CompanyService,
  ) {}

  async listByStore(
    userId: string,
    companyId: string,
    storeId: string,
    status?: string,
    productId?: string,
    q?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      currentStoreId: new Types.ObjectId(storeId),
    };
    if (status) filter.status = status;
    if (productId) filter.productId = new Types.ObjectId(productId);
    const term = q?.trim();
    if (term) {
      filter.sn = { $regex: escapeRegex(term), $options: 'i' };
    }
    return this.serialModel
      .find(filter)
      .populate(
        'productId',
        'name productType retailPrice costPrice variantDimensions catalogCategoryId',
      )
      .lean();
  }

  async getBySn(userId: string, companyId: string, sn: string) {
    await this.companyService.assertMember(userId, companyId);
    const unit = await this.serialModel
      .findOne({ companyId: new Types.ObjectId(companyId), sn })
      .populate('productId')
      .lean();
    if (!unit) throw new NotFoundException('Serial not found');
    const events = await this.eventModel
      .find({ serialUnitId: unit._id })
      .sort({ createdAt: -1 })
      .lean();
    return { unit, events };
  }

  async create(userId: string, companyId: string, dto: CreateSerialDto) {
    await this.companyService.assertMember(userId, companyId);
    const product = await this.productModel.findOne({
      _id: dto.productId,
      companyId: new Types.ObjectId(companyId),
      productType: 'serialized',
    });
    if (!product) {
      throw new BadRequestException('Product must be serialized type');
    }

    const unit = await this.serialModel.create({
      companyId: new Types.ObjectId(companyId),
      productId: new Types.ObjectId(dto.productId),
      sn: dto.sn.trim(),
      status: dto.status ?? 'in_stock',
      purchaseCost: dto.purchaseCost ?? product.costPrice,
      currentStoreId: new Types.ObjectId(dto.storeId),
      notes: dto.notes,
    });

    await this.logEvent(unit._id, 'created', undefined, unit.status, userId);
    return unit;
  }

  async updateStatus(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateSerialStatusDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const unit = await this.serialModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!unit) throw new NotFoundException('Serial not found');

    const from = unit.status;
    unit.status = dto.status;
    if (dto.notes) unit.notes = dto.notes;
    await unit.save();

    await this.logEvent(unit._id, 'status_change', from, dto.status, userId);
    return unit;
  }

  async replace(
    userId: string,
    companyId: string,
    oldId: string,
    dto: ReplaceSerialDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const oldUnit = await this.serialModel.findOne({
      _id: oldId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!oldUnit) throw new NotFoundException('Serial not found');

    const newUnit = await this.serialModel.create({
      companyId: oldUnit.companyId,
      productId: oldUnit.productId,
      sn: dto.newSn.trim(),
      status: dto.status ?? 'in_stock',
      purchaseCost: dto.purchaseCost ?? oldUnit.purchaseCost,
      currentStoreId: dto.storeId
        ? new Types.ObjectId(dto.storeId)
        : oldUnit.currentStoreId,
      replacesSnId: oldUnit._id,
      notes: dto.notes,
    });

    oldUnit.replacedBySnId = newUnit._id;
    oldUnit.status = 'written_off';
    await oldUnit.save();

    await this.logEvent(oldUnit._id, 'replaced', oldUnit.status, 'written_off', userId);
    await this.logEvent(newUnit._id, 'created_from_replace', undefined, newUnit.status, userId, oldUnit._id);

    return { oldUnit, newUnit };
  }

  private async logEvent(
    serialUnitId: Types.ObjectId,
    type: string,
    fromStatus: string | undefined,
    toStatus: string,
    userId: string,
    refId?: Types.ObjectId,
  ) {
    await this.eventModel.create({
      serialUnitId,
      type,
      fromStatus,
      toStatus,
      refType: refId ? 'serial_unit' : undefined,
      refId,
      byUserId: new Types.ObjectId(userId),
    });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
