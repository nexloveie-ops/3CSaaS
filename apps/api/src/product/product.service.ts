import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InventoryPosition,
  InventoryPositionDocument,
  Product,
  ProductDocument,
  TaxCategory,
  TaxCategoryDocument,
} from '@lz3c/db';
import {
  MAX_VARIANT_DIMENSIONS,
  buildVariantDisplayName,
  variantCombinationKey,
} from '@lz3c/shared';
import { CompanyService } from '../company/company.service';
import { CatalogCategoryService } from './catalog-category.service';
import { CreateProductDto } from './dto/create-product.dto';
import { SyncProductVariantsDto } from './dto/sync-product-variants.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(InventoryPosition.name)
    private positionModel: Model<InventoryPositionDocument>,
    @InjectModel(TaxCategory.name)
    private taxModel: Model<TaxCategoryDocument>,
    private companyService: CompanyService,
    private catalogCategoryService: CatalogCategoryService,
  ) {}

  async list(
    userId: string,
    companyId: string,
    productType?: string,
    catalogCategoryId?: string,
    q?: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const companyOid = new Types.ObjectId(companyId);
    const filter: Record<string, unknown> = {
      companyId: companyOid,
      isActive: true,
      $or: [
        { parentProductId: null },
        { parentProductId: { $exists: false } },
      ],
    };
    if (productType) filter.productType = productType;
    if (catalogCategoryId) {
      filter.catalogCategoryId = new Types.ObjectId(catalogCategoryId);
    }
    const term = q?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const matches = await this.productModel
        .find({
          companyId: companyOid,
          isActive: true,
          $or: [{ name: rx }, { skuCode: rx }],
        })
        .select('_id parentProductId')
        .lean();
      const parentIds = new Set<string>();
      for (const m of matches) {
        if (m.parentProductId) parentIds.add(String(m.parentProductId));
        else parentIds.add(String(m._id));
      }
      if (!parentIds.size) {
        return [];
      }
      filter._id = {
        $in: [...parentIds].map((id) => new Types.ObjectId(id)),
      };
    }
    const products = await this.productModel
      .find(filter)
      .populate('taxCategoryId')
      .populate('catalogCategoryId', 'name')
      .lean();

    const parentIds = products
      .filter((p) => p.variantDimensions?.length)
      .map((p) => p._id);
    if (!parentIds.length) return products;

    const children = await this.productModel
      .find({
        companyId: new Types.ObjectId(companyId),
        parentProductId: { $in: parentIds },
        isActive: true,
      })
      .select('parentProductId retailPrice costPrice')
      .lean();

    const rangeByParent = new Map<string, { min: number; max: number }>();
    for (const child of children) {
      const price = child.retailPrice ?? child.costPrice;
      const pid = String(child.parentProductId);
      const cur = rangeByParent.get(pid);
      if (!cur) {
        rangeByParent.set(pid, { min: price, max: price });
      } else {
        cur.min = Math.min(cur.min, price);
        cur.max = Math.max(cur.max, price);
      }
    }

    return products.map((p) => {
      const range = rangeByParent.get(String(p._id));
      if (!range) return p;
      return {
        ...p,
        variantPriceMin: range.min,
        variantPriceMax: range.max,
      };
    });
  }

  async getOne(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const p = await this.productModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .populate('taxCategoryId')
      .populate('catalogCategoryId', 'name')
      .lean();
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async listVariantChildren(
    userId: string,
    companyId: string,
    parentId: string,
  ) {
    const parent = await this.getParentProduct(userId, companyId, parentId);
    const children = await this.productModel
      .find({
        companyId: new Types.ObjectId(companyId),
        parentProductId: parent._id,
        isActive: true,
      })
      .sort({ name: 1 })
      .lean();
    return { parent, variants: children };
  }

  async listVariantsInStockForStore(
    userId: string,
    companyId: string,
    storeId: string,
    parentId: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const parent = await this.getParentProduct(userId, companyId, parentId);
    const dims = parent.variantDimensions ?? [];
    if (!dims.length) {
      throw new BadRequestException('Product has no variants');
    }

    const children = await this.productModel
      .find({
        companyId: new Types.ObjectId(companyId),
        parentProductId: parent._id,
        isActive: true,
      })
      .lean();

    if (!children.length) {
      return {
        parent: {
          _id: parent._id.toString(),
          name: parent.name,
          variantDimensions: dims,
        },
        variants: [] as Array<{
          _id: string;
          name: string;
          variantValues: string[];
          costPrice: number;
          retailPrice?: number;
          quantity: number;
        }>,
      };
    }

    const childIds = children.map((c) => c._id);
    const positions = await this.positionModel
      .find({
        companyId: new Types.ObjectId(companyId),
        storeId: new Types.ObjectId(storeId),
        productId: { $in: childIds },
        quantity: { $gt: 0 },
      })
      .lean();

    const qtyByProduct = new Map(
      positions.map((p) => [p.productId.toString(), p.quantity]),
    );

    const variants = children
      .filter((c) => qtyByProduct.has(c._id.toString()))
      .map((c) => ({
        _id: c._id.toString(),
        name: c.name,
        variantValues: c.variantValues ?? [],
        costPrice: c.costPrice,
        retailPrice: c.retailPrice,
        quantity: qtyByProduct.get(c._id.toString())!,
      }));

    return {
      parent: {
        _id: parent._id.toString(),
        name: parent.name,
        variantDimensions: dims,
      },
      variants,
    };
  }

  async syncVariants(
    userId: string,
    companyId: string,
    parentId: string,
    dto: SyncProductVariantsDto,
  ) {
    const parent = await this.getParentProduct(userId, companyId, parentId);
    if (parent.productType !== 'simple') {
      throw new BadRequestException('Only simple products support variants');
    }
    this.assertValidDimensions(dto.dimensions);

    const dimCount = dto.dimensions.length;
    const seen = new Set<string>();
    for (const line of dto.variants) {
      if (line.variantValues.length !== dimCount) {
        throw new BadRequestException(
          'Each variant must have a value for every dimension',
        );
      }
      const key = variantCombinationKey(line.variantValues);
      if (seen.has(key)) {
        throw new BadRequestException('Duplicate variant combination');
      }
      seen.add(key);
    }

    await this.productModel.updateOne(
      { _id: parent._id },
      { $set: { variantDimensions: dto.dimensions } },
    );

    const existing = await this.productModel.find({
      companyId: new Types.ObjectId(companyId),
      parentProductId: parent._id,
    });

    const existingByKey = new Map(
      existing.map((e) => [
        variantCombinationKey(e.variantValues ?? []),
        e,
      ]),
    );

    const keepIds = new Set<string>();

    for (const line of dto.variants) {
      const key = variantCombinationKey(line.variantValues);
      const name = buildVariantDisplayName(parent.name, line.variantValues);
      const prev = existingByKey.get(key);
      if (prev) {
        await this.productModel.updateOne(
          { _id: prev._id },
          {
            $set: {
              name,
              variantValues: line.variantValues,
              costPrice: line.costPrice,
              retailPrice: line.retailPrice,
              skuCode: line.skuCode,
              isActive: true,
            },
          },
        );
        keepIds.add(prev._id.toString());
      } else {
        const created = await this.productModel.create({
          companyId: parent.companyId,
          productType: 'simple',
          name,
          parentProductId: parent._id,
          variantValues: line.variantValues,
          catalogCategoryId: parent.catalogCategoryId,
          taxCategoryId: parent.taxCategoryId,
          costPrice: line.costPrice,
          retailPrice: line.retailPrice,
          skuCode: line.skuCode,
          isActive: true,
        });
        keepIds.add(created._id.toString());
      }
    }

    const deactivateIds = existing
      .filter((e) => !keepIds.has(e._id.toString()))
      .map((e) => e._id);

    if (deactivateIds.length) {
      await this.productModel.updateMany(
        { _id: { $in: deactivateIds } },
        { $set: { isActive: false } },
      );
    }

    return this.listVariantChildren(userId, companyId, parentId);
  }

  async create(userId: string, companyId: string, dto: CreateProductDto) {
    await this.companyService.assertMember(userId, companyId);
    await this.assertTax(companyId, dto.taxCategoryId);
    if (dto.productType === 'sku' && !dto.skuCode) {
      throw new BadRequestException('skuCode required for sku products');
    }
    if (dto.parentProductId) {
      throw new BadRequestException('Use variant sync on parent product');
    }
    if (dto.variantDimensions?.length) {
      if (dto.productType !== 'simple') {
        throw new BadRequestException('Variants only for simple products');
      }
      this.assertValidDimensions(dto.variantDimensions);
    }
    let catalogCategoryId: Types.ObjectId | undefined;
    if (dto.catalogCategoryId) {
      await this.catalogCategoryService.assertBelongsToCompany(
        companyId,
        dto.catalogCategoryId,
      );
      catalogCategoryId = new Types.ObjectId(dto.catalogCategoryId);
    }
    return this.productModel.create({
      ...dto,
      companyId: new Types.ObjectId(companyId),
      taxCategoryId: new Types.ObjectId(dto.taxCategoryId),
      catalogCategoryId,
      variantDimensions: dto.variantDimensions?.length
        ? dto.variantDimensions
        : undefined,
    });
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateProductDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const current = await this.productModel.findOne({
      _id: id,
      companyId: new Types.ObjectId(companyId),
    });
    if (!current) throw new NotFoundException('Product not found');
    if (current.parentProductId) {
      throw new BadRequestException('Edit variant via parent sync');
    }
    if (dto.taxCategoryId) await this.assertTax(companyId, dto.taxCategoryId);
    if (dto.catalogCategoryId) {
      await this.catalogCategoryService.assertBelongsToCompany(
        companyId,
        dto.catalogCategoryId,
      );
    }
    const update: Record<string, unknown> = { ...dto };
    if (dto.taxCategoryId) {
      update.taxCategoryId = new Types.ObjectId(dto.taxCategoryId);
    }
    if (dto.catalogCategoryId !== undefined) {
      update.catalogCategoryId = dto.catalogCategoryId
        ? new Types.ObjectId(dto.catalogCategoryId)
        : null;
    }
    const doc = await this.productModel.findOneAndUpdate(
      { _id: id, companyId: new Types.ObjectId(companyId) },
      { $set: update },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Product not found');
    return doc;
  }

  private async getParentProduct(
    userId: string,
    companyId: string,
    parentId: string,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const parent = await this.productModel.findOne({
      _id: parentId,
      companyId: new Types.ObjectId(companyId),
      $or: [
        { parentProductId: null },
        { parentProductId: { $exists: false } },
      ],
    });
    if (!parent) throw new NotFoundException('Parent product not found');
    return parent;
  }

  private assertValidDimensions(
    dimensions: { name: string; values: string[] }[],
  ) {
    if (!dimensions.length || dimensions.length > MAX_VARIANT_DIMENSIONS) {
      throw new BadRequestException(
        `Between 1 and ${MAX_VARIANT_DIMENSIONS} variant dimensions required`,
      );
    }
    for (const d of dimensions) {
      if (!d.name?.trim()) {
        throw new BadRequestException('Dimension name required');
      }
      const vals = d.values.map((v) => v.trim()).filter(Boolean);
      if (!vals.length) {
        throw new BadRequestException(`Dimension "${d.name}" needs values`);
      }
    }
  }

  private async assertTax(companyId: string, taxCategoryId: string) {
    const t = await this.taxModel.findOne({
      _id: taxCategoryId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!t) throw new BadRequestException('Invalid tax category');
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
