import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreProfileDto } from './dto/update-store-profile.dto';

@Injectable()
export class StoreService {
  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private companyService: CompanyService,
  ) {}

  async create(userId: string, companyId: string, dto: CreateStoreDto) {
    await this.companyService.assertMember(userId, companyId);
    return this.storeModel.create({
      companyId: new Types.ObjectId(companyId),
      name: dto.name,
      address: dto.address,
      warehouseEnabled: dto.warehouseEnabled ?? false,
    });
  }

  async listByCompany(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    const bound = await this.companyService.resolveBoundStoreId(userId, companyId);
    const filter: { companyId: Types.ObjectId; _id?: Types.ObjectId } = {
      companyId: new Types.ObjectId(companyId),
    };
    if (bound) filter._id = new Types.ObjectId(bound);
    return this.storeModel.find(filter).lean();
  }

  async getOne(userId: string, companyId: string, storeId: string) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel
      .findOne({
        _id: storeId,
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async updateProfile(
    userId: string,
    companyId: string,
    storeId: string,
    dto: UpdateStoreProfileDto,
  ) {
    const role = await this.companyService.resolveRole(userId, companyId, storeId);
    if (role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only admins and managers can update store profile');
    }
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel.findOne({
      _id: storeId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!store) throw new NotFoundException('Store not found');

    if (dto.address !== undefined) store.address = dto.address.trim() || undefined;
    if (dto.phone !== undefined) store.phone = dto.phone.trim() || undefined;
    if (dto.email !== undefined) store.email = dto.email.trim() || undefined;
    await store.save();
    return store;
  }

  async updateRepairTerms(
    userId: string,
    companyId: string,
    storeId: string,
    repairTerms: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const store = await this.storeModel.findOne({
      _id: storeId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!store) throw new NotFoundException('Store not found');
    store.repairTerms = repairTerms.trim();
    await store.save();
    return store;
  }
}
