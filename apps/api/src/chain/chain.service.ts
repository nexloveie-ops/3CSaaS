import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Chain,
  ChainDocument,
  InventoryPosition,
  InventoryPositionDocument,
  StockShareRule,
  StockShareRuleDocument,
  Store,
  StoreDocument,
} from '@lz3c/db';
import { AuditService } from '../common/services/audit.service';
import { CreateChainDto } from './dto/create-chain.dto';
import { CompanyService } from '../company/company.service';
import { CreateShareRuleDto } from './dto/create-share-rule.dto';
import { UpdateChainDto } from './dto/update-chain.dto';
import { UpdateChainMembersDto } from './dto/update-chain-members.dto';

export type ChainMemberView = {
  storeId: Types.ObjectId;
  storeName: string;
  companyName: string;
};

export type ChainListItem = {
  _id: Types.ObjectId;
  name: string;
  memberStoreIds: Types.ObjectId[];
  memberCompanyIds: Types.ObjectId[];
  members: ChainMemberView[];
};

@Injectable()
export class ChainService {
  constructor(
    private companyService: CompanyService,
    @InjectModel(Chain.name) private chainModel: Model<ChainDocument>,
    @InjectModel(StockShareRule.name)
    private ruleModel: Model<StockShareRuleDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(InventoryPosition.name)
    private positionModel: Model<InventoryPositionDocument>,
    private audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateChainDto, companyId?: string) {
    const stores = await this.storeModel.find({ _id: { $in: dto.storeIds } });
    const companyIds = [...new Set(stores.map((s) => s.companyId.toString()))];
    const chain = await this.chainModel.create({
      name: dto.name,
      ownerUserId: new Types.ObjectId(userId),
      memberStoreIds: dto.storeIds.map((id) => new Types.ObjectId(id)),
      memberCompanyIds: companyIds.map((id) => new Types.ObjectId(id)),
    });

    const auditCompanyId = companyId ?? companyIds[0];
    if (auditCompanyId) {
      void this.audit.log({
        companyId: auditCompanyId,
        userId,
        action: 'chain.create',
        entityType: 'chain',
        entityId: chain._id.toString(),
        metadata: { name: dto.name, storeCount: dto.storeIds.length },
      });
    }

    return chain;
  }

  async listForUser(userId: string): Promise<ChainListItem[]> {
    const chains = await this.chainModel
      .find({ ownerUserId: new Types.ObjectId(userId) })
      .lean();
    const storeIds = chains.flatMap((c) => c.memberStoreIds.map((id) => id.toString()));
    const stores = await this.storeModel
      .find({ _id: { $in: storeIds } })
      .populate('companyId', 'name')
      .lean();
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));

    return chains.map((c) => ({
      _id: c._id,
      name: c.name,
      memberStoreIds: c.memberStoreIds,
      memberCompanyIds: c.memberCompanyIds,
      members: c.memberStoreIds.map((sid) => {
        const s = storeMap.get(sid.toString());
        const co = s?.companyId as unknown as { name?: string } | undefined;
        return {
          storeId: sid,
          storeName: s?.name ?? sid.toString(),
          companyName: co?.name ?? '—',
        };
      }),
    }));
  }

  /** All stores across companies the user belongs to (for chain member picker). */
  async listMemberStores(userId: string) {
    const companies = await this.companyService.listForUser(userId);
    const companyIds = companies.map((c) => c._id);
    const stores = await this.storeModel
      .find({ companyId: { $in: companyIds } })
      .lean();
    const companyMap = new Map(companies.map((c) => [c._id.toString(), c.name]));

    return stores.map((s) => ({
      _id: s._id,
      name: s.name,
      companyId: s.companyId,
      companyName: companyMap.get(s.companyId.toString()) ?? '—',
      warehouseEnabled: s.warehouseEnabled,
    }));
  }

  async getChain(userId: string, chainId: string): Promise<Record<string, unknown>> {
    const chain = await this.chainModel
      .findOne({ _id: chainId, ownerUserId: new Types.ObjectId(userId) })
      .lean();
    if (!chain) throw new NotFoundException('Chain not found');
    const rules = await this.ruleModel.find({ chainId: chain._id }).lean();
    const storeIds = [
      ...chain.memberStoreIds.map((id) => id.toString()),
      ...rules.map((r) => r.sourceStoreId.toString()),
    ];
    const stores = await this.storeModel
      .find({ _id: { $in: storeIds } })
      .populate('companyId', 'name')
      .lean();
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));
    return {
      _id: chain._id.toString(),
      name: chain.name,
      members: chain.memberStoreIds.map((sid) => {
        const s = storeMap.get(sid.toString());
        const co = s?.companyId as unknown as { name?: string } | undefined;
        return {
          storeId: sid.toString(),
          storeName: s?.name,
          companyName: co?.name,
        };
      }),
      shareRules: rules.map((r) => ({
        _id: r._id.toString(),
        sourceStoreId: r.sourceStoreId.toString(),
        sourceStoreName: storeMap.get(r.sourceStoreId.toString())?.name,
        mode: r.mode,
        value: r.value,
      })),
    };
  }

  async updateChain(
    userId: string,
    chainId: string,
    dto: UpdateChainDto,
    companyId?: string,
  ) {
    const chain = await this.chainModel.findOne({
      _id: chainId,
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!chain) throw new NotFoundException('Chain not found');
    const prevName = chain.name;
    if (dto.name !== undefined) chain.name = dto.name.trim();
    await chain.save();

    const auditCompanyId =
      companyId ?? chain.memberCompanyIds[0]?.toString();
    if (auditCompanyId && dto.name !== undefined) {
      void this.audit.log({
        companyId: auditCompanyId,
        userId,
        action: 'chain.rename',
        entityType: 'chain',
        entityId: chain._id.toString(),
        metadata: { from: prevName, to: chain.name },
      });
    }

    return this.getChain(userId, chainId);
  }

  async updateMembers(
    userId: string,
    chainId: string,
    dto: UpdateChainMembersDto,
    companyId?: string,
  ) {
    if (dto.storeIds.length < 2) {
      throw new BadRequestException('Chain requires at least 2 member stores');
    }
    const chain = await this.chainModel.findOne({
      _id: chainId,
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!chain) throw new NotFoundException('Chain not found');

    const stores = await this.storeModel.find({ _id: { $in: dto.storeIds } });
    if (stores.length !== dto.storeIds.length) {
      throw new BadRequestException('One or more stores not found');
    }
    const companyIds = [...new Set(stores.map((s) => s.companyId.toString()))];
    chain.memberStoreIds = dto.storeIds.map((id) => new Types.ObjectId(id));
    chain.memberCompanyIds = companyIds.map((id) => new Types.ObjectId(id));
    await chain.save();

    const auditCompanyId =
      companyId ?? chain.memberCompanyIds[0]?.toString();
    if (auditCompanyId) {
      void this.audit.log({
        companyId: auditCompanyId,
        userId,
        action: 'chain.members',
        entityType: 'chain',
        entityId: chain._id.toString(),
        metadata: { storeCount: dto.storeIds.length },
      });
    }

    return this.getChain(userId, chainId);
  }

  async addShareRule(userId: string, chainId: string, dto: CreateShareRuleDto) {
    const chain = await this.chainModel.findOne({
      _id: chainId,
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!chain) throw new NotFoundException('Chain not found');
    return this.ruleModel.create({
      chainId: chain._id,
      sourceStoreId: new Types.ObjectId(dto.sourceStoreId),
      mode: dto.mode,
      value: dto.value,
    });
  }

  async sharedStock(chainId: string, viewerStoreId: string) {
    const chain = await this.chainModel.findById(chainId);
    if (!chain) throw new NotFoundException('Chain not found');

    const viewerStore = await this.storeModel.findById(viewerStoreId);
    if (!viewerStore) throw new NotFoundException('Store not found');

    const rules = await this.ruleModel.find({ chainId: chain._id }).lean();
    const results = [];

    for (const rule of rules) {
      if (rule.sourceStoreId.toString() === viewerStoreId) continue;

      const sourceStore = await this.storeModel.findById(rule.sourceStoreId);
      if (!sourceStore) continue;

      const sameCompany = sourceStore.companyId.equals(viewerStore.companyId);
      const positions = await this.positionModel
        .find({
          storeId: rule.sourceStoreId,
          quantity: { $gt: 0 },
        })
        .populate('productId', 'name skuCode wholesalePrice costPrice')
        .lean();

      for (const pos of positions) {
        const prod = pos.productId as unknown as {
          _id: Types.ObjectId;
          name: string;
          skuCode?: string;
          wholesalePrice?: number;
          costPrice: number;
        };
        let sharedQty = pos.quantity;
        if (rule.mode === 'percent') {
          sharedQty = Math.floor((pos.quantity * rule.value) / 100);
        } else {
          sharedQty = Math.min(rule.value, pos.quantity);
        }
        if (sharedQty <= 0) continue;

        results.push({
          sourceStoreId: rule.sourceStoreId,
          productId: prod._id,
          name: prod.name,
          skuCode: prod.skuCode,
          sharedQuantity: sharedQty,
          pricePreTax: sameCompany
            ? prod.costPrice
            : (prod.wholesalePrice ?? prod.costPrice),
          priceLabel: sameCompany ? 'cost' : 'wholesale',
        });
      }
    }

    return results;
  }
}
