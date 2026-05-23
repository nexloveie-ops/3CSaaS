import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaxCategory, TaxCategoryDocument } from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreateTaxCategoryDto } from './dto/create-tax-category.dto';
import { UpdateTaxCategoryDto } from './dto/update-tax-category.dto';

@Injectable()
export class TaxService {
  constructor(
    @InjectModel(TaxCategory.name)
    private taxModel: Model<TaxCategoryDocument>,
    private companyService: CompanyService,
  ) {}

  async list(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.taxModel
      .find({ companyId: new Types.ObjectId(companyId), isActive: true })
      .lean();
  }

  async create(userId: string, companyId: string, dto: CreateTaxCategoryDto) {
    await this.companyService.assertMember(userId, companyId);
    if (dto.isDefault) {
      await this.taxModel.updateMany(
        { companyId: new Types.ObjectId(companyId) },
        { isDefault: false },
      );
    }
    return this.taxModel.create({
      companyId: new Types.ObjectId(companyId),
      name: dto.name,
      scheme: dto.scheme,
      isDefault: dto.isDefault ?? false,
    });
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateTaxCategoryDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    if (dto.isDefault) {
      await this.taxModel.updateMany(
        { companyId: new Types.ObjectId(companyId) },
        { isDefault: false },
      );
    }
    const doc = await this.taxModel.findOneAndUpdate(
      { _id: id, companyId: new Types.ObjectId(companyId) },
      { $set: dto },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Tax category not found');
    return doc;
  }
}
