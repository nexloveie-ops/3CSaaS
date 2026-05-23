import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PriceListBrand,
  PriceListBrandDocument,
  PriceListIssueTemplate,
  PriceListIssueTemplateDocument,
  PriceListItem,
  PriceListItemDocument,
  PriceListModel,
  PriceListModelDocument,
  TaxCategory,
  TaxCategoryDocument,
} from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { BulkPriceMatrixDto } from './dto/bulk-price-matrix.dto';
import { CreatePriceListBrandDto } from './dto/create-price-list-brand.dto';
import { CreatePriceListIssueTemplateDto } from './dto/create-price-list-issue-template.dto';
import { CreatePriceListModelDto } from './dto/create-price-list-model.dto';

export function formatPriceListLabel(
  brand: string,
  model: string,
  issue: string,
): string {
  return `${brand.trim()} ${model.trim()} — ${issue.trim()}`;
}

@Injectable()
export class PriceListService {
  constructor(
    @InjectModel(PriceListBrand.name) private brandModel: Model<PriceListBrandDocument>,
    @InjectModel(PriceListModel.name)
    private catalogDeviceModel: Model<PriceListModelDocument>,
    @InjectModel(PriceListIssueTemplate.name)
    private issueTemplateModel: Model<PriceListIssueTemplateDocument>,
    @InjectModel(PriceListItem.name) private priceModel: Model<PriceListItemDocument>,
    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,
    private companyService: CompanyService,
  ) {}

  async listBrands(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.brandModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
  }

  async createBrand(userId: string, companyId: string, dto: CreatePriceListBrandDto) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const name = dto.name.trim();
    const exists = await this.brandModel.findOne({ companyId: cid, name });
    if (exists) throw new BadRequestException('Brand already exists');
    const last = await this.brandModel.findOne({ companyId: cid }).sort({ sortOrder: -1 }).lean();
    return this.brandModel.create({
      companyId: cid,
      name,
      sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    });
  }

  async deleteBrand(userId: string, companyId: string, brandId: string) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const bid = new Types.ObjectId(brandId);
    const models = await this.catalogDeviceModel.find({ companyId: cid, brandId: bid }).lean();
    const modelIds = models.map((m) => m._id);
    if (modelIds.length) {
      await this.priceModel.updateMany(
        { companyId: cid, modelId: { $in: modelIds } },
        { $set: { isActive: false } },
      );
    }
    await this.catalogDeviceModel.deleteMany({ companyId: cid, brandId: bid });
    const res = await this.brandModel.deleteOne({ _id: bid, companyId: cid });
    if (!res.deletedCount) throw new NotFoundException('Brand not found');
    return { deleted: true };
  }

  async listModels(userId: string, companyId: string, brandId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.catalogDeviceModel
      .find({
        companyId: new Types.ObjectId(companyId),
        brandId: new Types.ObjectId(brandId),
      })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
  }

  async createModel(
    userId: string,
    companyId: string,
    brandId: string,
    dto: CreatePriceListModelDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const bid = new Types.ObjectId(brandId);
    const brand = await this.brandModel.findOne({ _id: bid, companyId: cid });
    if (!brand) throw new NotFoundException('Brand not found');
    const name = dto.name.trim();
    const exists = await this.catalogDeviceModel.findOne({ companyId: cid, brandId: bid, name });
    if (exists) throw new BadRequestException('Model already exists for this brand');
    const last = await this.catalogDeviceModel
      .findOne({ companyId: cid, brandId: bid })
      .sort({ sortOrder: -1 })
      .lean();
    return this.catalogDeviceModel.create({
      companyId: cid,
      brandId: bid,
      name,
      sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    });
  }

  async deleteModel(userId: string, companyId: string, modelId: string) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const mid = new Types.ObjectId(modelId);
    await this.priceModel.updateMany(
      { companyId: cid, modelId: mid },
      { $set: { isActive: false } },
    );
    const res = await this.catalogDeviceModel.deleteOne({ _id: mid, companyId: cid });
    if (!res.deletedCount) throw new NotFoundException('Model not found');
    return { deleted: true };
  }

  async listIssueTemplates(userId: string, companyId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.issueTemplateModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ kind: 1, sortOrder: 1, label: 1 })
      .lean();
  }

  async createIssueTemplate(
    userId: string,
    companyId: string,
    dto: CreatePriceListIssueTemplateDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const label = dto.label.trim();
    const existing = await this.issueTemplateModel.findOne({ companyId: cid, label });
    if (existing) return existing;
    const last = await this.issueTemplateModel
      .findOne({ companyId: cid })
      .sort({ sortOrder: -1 })
      .lean();
    return this.issueTemplateModel.create({
      companyId: cid,
      label,
      kind: dto.kind ?? 'template',
      sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    });
  }

  async deleteIssueTemplate(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const res = await this.issueTemplateModel.deleteOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!res.deletedCount) throw new NotFoundException('Issue template not found');
    return { deleted: true };
  }

  async getMatrix(userId: string, companyId: string, brandId: string) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const bid = new Types.ObjectId(brandId);
    const brand = await this.brandModel.findOne({ _id: bid, companyId: cid }).lean();
    if (!brand) throw new NotFoundException('Brand not found');

    const models = await this.catalogDeviceModel
      .find({ companyId: cid, brandId: bid })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const modelIds = models.map((m) => m._id);
    const templates = await this.issueTemplateModel
      .find({ companyId: cid })
      .sort({ kind: 1, sortOrder: 1, label: 1 })
      .lean();

    const prices = await this.priceModel
      .find({
        companyId: cid,
        modelId: { $in: modelIds },
        isActive: true,
      })
      .lean();

    const issueSet = new Map<string, { label: string; kind: string }>();
    for (const t of templates) {
      issueSet.set(t.label, { label: t.label, kind: t.kind });
    }
    for (const p of prices) {
      if (!issueSet.has(p.issue)) {
        issueSet.set(p.issue, { label: p.issue, kind: 'custom' });
      }
    }

    const issues = [...issueSet.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'template' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    const priceMap: Record<string, Record<string, number>> = {};
    for (const m of models) {
      priceMap[String(m._id)] = {};
    }
    for (const p of prices) {
      const mid = String(p.modelId);
      if (!priceMap[mid]) priceMap[mid] = {};
      priceMap[mid][p.issue] = p.priceIncVat;
    }

    return {
      brand,
      models,
      issues,
      prices: priceMap,
    };
  }

  async bulkSaveMatrix(
    userId: string,
    companyId: string,
    dto: BulkPriceMatrixDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const bid = new Types.ObjectId(dto.brandId);
    const brand = await this.brandModel.findOne({ _id: bid, companyId: cid }).lean();
    if (!brand) throw new NotFoundException('Brand not found');

    const tax = await this.taxModel.findOne({ companyId: cid, isActive: true }).lean();
    if (!tax) throw new BadRequestException('No tax category configured');

    let saved = 0;
    for (const entry of dto.entries) {
      const issue = entry.issue.trim();
      if (!issue) continue;

      await this.issueTemplateModel.updateOne(
        { companyId: cid, label: issue },
        {
          $setOnInsert: {
            companyId: cid,
            label: issue,
            kind: entry.kind === 'template' ? 'template' : 'custom',
            sortOrder: 999,
          },
        },
        { upsert: true },
      );

      const model = await this.catalogDeviceModel.findOne({
        _id: entry.modelId,
        companyId: cid,
        brandId: bid,
      });
      if (!model) continue;

      if (entry.priceIncVat == null || Number(entry.priceIncVat) < 0) {
        await this.priceModel.updateOne(
          { companyId: cid, modelId: model._id, issue },
          { $set: { isActive: false } },
        );
        continue;
      }

      const priceIncVat = Number(entry.priceIncVat);
      const name = formatPriceListLabel(brand.name, model.name, issue);
      await this.priceModel.findOneAndUpdate(
        { companyId: cid, modelId: model._id, issue },
        {
          $set: {
            companyId: cid,
            modelId: model._id,
            brand: brand.name,
            model: model.name,
            issue,
            name,
            priceIncVat,
            taxCategoryId: tax._id,
            isActive: true,
          },
        },
        { upsert: true, new: true },
      );
      saved++;
    }

    if (dto.newIssues?.length) {
      for (const label of dto.newIssues) {
        const trimmed = label.trim();
        if (!trimmed) continue;
        await this.createIssueTemplate(userId, companyId, {
          label: trimmed,
          kind: 'custom',
        });
      }
    }

    return { saved };
  }

  /** Flat list for repairs dropdown and legacy clients. */
  async list(userId: string, companyId: string): Promise<
    {
      _id: Types.ObjectId;
      brand: string;
      model: string;
      issue: string;
      name: string;
      priceIncVat: number;
    }[]
  > {
    await this.companyService.assertMember(userId, companyId);
    const cid = new Types.ObjectId(companyId);
    const rows = await this.priceModel
      .find({ companyId: cid, isActive: true })
      .populate({
        path: 'modelId',
        populate: { path: 'brandId', model: PriceListBrand.name },
      })
      .sort({ brand: 1, model: 1, issue: 1 })
      .lean();

    return rows.map((row) => {
      const flat = row as typeof row & { brand?: string };
      const legacyModelName =
        typeof (flat as { model?: unknown }).model === 'string'
          ? (flat as { model: string }).model
          : '';
      const populated = flat.modelId as
        | {
            name: string;
            brandId?: { name: string };
          }
        | Types.ObjectId
        | null
        | undefined;

      let brandName = flat.brand ?? '';
      let deviceName = legacyModelName;
      if (populated && typeof populated === 'object' && 'name' in populated) {
        deviceName = populated.name;
        const b = populated.brandId;
        if (b && typeof b === 'object' && 'name' in b) {
          brandName = b.name;
        }
      }

      const issue = flat.issue?.trim() ?? '';
      const name =
        flat.name?.trim() ||
        (brandName && deviceName && issue
          ? formatPriceListLabel(brandName, deviceName, issue)
          : issue);

      return {
        _id: flat._id,
        brand: brandName || '—',
        model: deviceName || '—',
        issue,
        name,
        priceIncVat: flat.priceIncVat,
      };
    });
  }
}
