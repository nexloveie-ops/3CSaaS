import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CatalogCategory,
  CatalogCategoryDocument,
  Product,
  ProductDocument,
} from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreateCatalogCategoryDto } from './dto/create-catalog-category.dto';
import { UpdateCatalogCategoryDto } from './dto/update-catalog-category.dto';

@Injectable()
export class CatalogCategoryService {
  constructor(
    @InjectModel(CatalogCategory.name)
    private catalogModel: Model<CatalogCategoryDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private companyService: CompanyService,
  ) {}

  async list(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.catalogModel
      .find({ companyId: new Types.ObjectId(companyId), isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
  }

  async create(userId: string, companyId: string, dto: CreateCatalogCategoryDto) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const existing = await this.catalogModel.findOne({
      companyId: cid,
      name: dto.name.trim(),
    });
    if (existing) {
      throw new BadRequestException('Catalog category already exists');
    }
    let sortOrder = dto.sortOrder;
    if (sortOrder == null) {
      const last = await this.catalogModel
        .findOne({ companyId: cid })
        .sort({ sortOrder: -1 })
        .lean();
      sortOrder = (last?.sortOrder ?? 0) + 1;
    }
    return this.catalogModel.create({
      companyId: cid,
      name: dto.name.trim(),
      sortOrder,
    });
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateCatalogCategoryDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    if (dto.name) {
      const clash = await this.catalogModel.findOne({
        companyId: cid,
        name: dto.name.trim(),
        _id: { $ne: id },
      });
      if (clash) throw new BadRequestException('Catalog category already exists');
    }
    const doc = await this.catalogModel.findOneAndUpdate(
      { _id: id, companyId: cid, isActive: true },
      { $set: dto.name ? { ...dto, name: dto.name.trim() } : dto },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Catalog category not found');
    return doc;
  }

  async remove(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const inUse = await this.productModel.countDocuments({
      companyId: cid,
      catalogCategoryId: new Types.ObjectId(id),
      isActive: true,
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Cannot delete category while products are assigned to it',
      );
    }
    const doc = await this.catalogModel.findOneAndUpdate(
      { _id: id, companyId: cid },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Catalog category not found');
    return { deleted: true };
  }

  async assertBelongsToCompany(companyId: string, catalogCategoryId: string) {
    const cat = await this.catalogModel.findOne({
      _id: catalogCategoryId,
      companyId: new Types.ObjectId(companyId),
      isActive: true,
    });
    if (!cat) throw new BadRequestException('Invalid catalog category');
    return cat;
  }
}
