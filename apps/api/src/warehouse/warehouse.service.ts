import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InventoryPosition,
  InventoryPositionDocument,
  Product,
  ProductDocument,
  Store,
  StoreDocument,
  WarehouseScope,
  WarehouseScopeDocument,
} from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { UpdateWarehouseScopeDto } from './dto/update-warehouse-scope.dto';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectModel(WarehouseScope.name)
    private scopeModel: Model<WarehouseScopeDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(InventoryPosition.name)
    private positionModel: Model<InventoryPositionDocument>,
    private companyService: CompanyService,
  ) {}

  async getScope(userId: string, companyId: string, warehouseStoreId: string) {
    await this.companyService.assertMember(userId, companyId);
    return this.scopeModel.findOne({
      warehouseStoreId: new Types.ObjectId(warehouseStoreId),
      companyId: new Types.ObjectId(companyId),
    });
  }

  async updateScope(
    userId: string,
    companyId: string,
    warehouseStoreId: string,
    dto: UpdateWarehouseScopeDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const store = await this.storeModel.findOne({
      _id: warehouseStoreId,
      companyId: new Types.ObjectId(companyId),
      warehouseEnabled: true,
    });
    if (!store) throw new NotFoundException('Warehouse store not found');

    return this.scopeModel.findOneAndUpdate(
      { warehouseStoreId: store._id },
      {
        companyId: new Types.ObjectId(companyId),
        allowedStoreIds: dto.allowedStoreIds.map((id) => new Types.ObjectId(id)),
      },
      { upsert: true, new: true },
    );
  }

  /** Catalog for buyer store: SKU + qty + wholesale (or cost if same company). */
  async catalogForBuyer(
    userId: string,
    buyerCompanyId: string,
    buyerStoreId: string,
    warehouseStoreId: string,
  ) {
    await this.companyService.assertMember(userId, buyerCompanyId);
    const scope = await this.scopeModel.findOne({
      warehouseStoreId: new Types.ObjectId(warehouseStoreId),
    });
    if (
      !scope?.allowedStoreIds.some((id) =>
        id.equals(new Types.ObjectId(buyerStoreId)),
      )
    ) {
      throw new NotFoundException('Store not authorized for this warehouse');
    }

    const warehouseStore = await this.storeModel.findById(warehouseStoreId);
    const sameCompany = warehouseStore?.companyId.equals(
      new Types.ObjectId(buyerCompanyId),
    );

    const positions = await this.positionModel
      .find({ storeId: new Types.ObjectId(warehouseStoreId), quantity: { $gt: 0 } })
      .populate('productId', 'name skuCode productType wholesalePrice costPrice')
      .lean();

    return positions.map((p) => {
      const prod = p.productId as unknown as {
        _id: Types.ObjectId;
        name: string;
        skuCode?: string;
        productType: string;
        wholesalePrice?: number;
        costPrice: number;
      };
      return {
        productId: prod._id,
        name: prod.name,
        skuCode: prod.skuCode,
        quantity: p.quantity,
        pricePreTax: sameCompany
          ? prod.costPrice
          : (prod.wholesalePrice ?? prod.costPrice),
        priceLabel: sameCompany ? 'cost' : 'wholesale',
      };
    });
  }
}
