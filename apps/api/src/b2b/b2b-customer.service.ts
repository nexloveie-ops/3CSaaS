import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  B2bCustomer,
  B2bCustomerDocument,
  Order,
  OrderDocument,
} from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreateB2bCustomerDto } from './dto/create-b2b-customer.dto';
import { UpdateB2bCustomerDto } from './dto/update-b2b-customer.dto';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePaymentStatus(status?: string): 'unpaid' | 'partial' | 'paid' {
  if (status === 'paid' || status === 'partial') return status;
  return 'unpaid';
}

@Injectable()
export class B2bCustomerService {
  constructor(
    @InjectModel(B2bCustomer.name)
    private b2bCustomerModel: Model<B2bCustomerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private companyService: CompanyService,
  ) {}

  async list(userId: string, companyId: string, q?: string) {
    await this.companyService.assertMember(userId, companyId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
      isActive: true,
    };
    const term = q?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      filter.$or = [
        { name: rx },
        { registrationNumber: rx },
        { email: rx },
        { phone: rx },
      ];
    }
    return this.b2bCustomerModel
      .find(filter)
      .sort({ name: 1 })
      .limit(100)
      .lean();
  }

  async getOne(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const doc = await this.b2bCustomerModel
      .findOne({
        _id: id,
        companyId: new Types.ObjectId(companyId),
        isActive: true,
      })
      .lean();
    if (!doc) throw new NotFoundException('B2B customer not found');
    return doc;
  }

  async listOrders(userId: string, companyId: string, customerId: string) {
    await this.companyService.assertMember(userId, companyId);
    const customer = await this.b2bCustomerModel
      .findOne({
        _id: customerId,
        companyId: new Types.ObjectId(companyId),
        isActive: true,
      })
      .lean();
    if (!customer) throw new NotFoundException('B2B customer not found');

    const orders = await this.orderModel
      .find({
        companyId: new Types.ObjectId(companyId),
        b2bCustomerId: new Types.ObjectId(customerId),
        docType: 'invoice_b2b',
        status: 'completed',
      })
      .select({
        docNumber: 1,
        businessDate: 1,
        totalIncVat: 1,
        paymentStatus: 1,
        paymentMethod: 1,
        paidAmount: 1,
        paidAt: 1,
        createdAt: 1,
      })
      .lean();

    const ranked = orders.map((o) => {
      const paymentStatus = normalizePaymentStatus(o.paymentStatus);
      const unpaidRank = paymentStatus === 'paid' ? 1 : 0;
      return {
        _id: o._id,
        docNumber: o.docNumber,
        businessDate: o.businessDate,
        totalIncVat: o.totalIncVat,
        paymentStatus,
        paymentMethod: o.paymentMethod,
        paidAmount: o.paidAmount ?? 0,
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        unpaidRank,
      };
    });

    ranked.sort((a, b) => {
      if (a.unpaidRank !== b.unpaidRank) return a.unpaidRank - b.unpaidRank;
      const at = a.businessDate
        ? new Date(a.businessDate).getTime()
        : a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;
      const bt = b.businessDate
        ? new Date(b.businessDate).getTime()
        : b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;
      if (at !== bt) return at - bt;
      const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ac - bc;
    });

    return ranked.map(({ unpaidRank: _r, ...rest }) => rest);
  }

  async create(userId: string, companyId: string, dto: CreateB2bCustomerDto) {
    await this.companyService.assertMember(userId, companyId);
    return this.b2bCustomerModel.create({
      companyId: new Types.ObjectId(companyId),
      name: dto.name.trim(),
      registrationNumber: dto.registrationNumber.trim(),
      address: dto.address.trim(),
      email: dto.email.trim(),
      phone: dto.phone.trim(),
      vatNumber: dto.vatNumber?.trim() || undefined,
      isActive: true,
    });
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateB2bCustomerDto,
  ) {
    await this.companyService.assertMember(userId, companyId);
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.registrationNumber !== undefined) {
      patch.registrationNumber = dto.registrationNumber.trim();
    }
    if (dto.address !== undefined) patch.address = dto.address.trim();
    if (dto.email !== undefined) patch.email = dto.email.trim();
    if (dto.phone !== undefined) patch.phone = dto.phone.trim();
    if (dto.vatNumber !== undefined) {
      const v = dto.vatNumber.trim();
      if (v) patch.vatNumber = v;
    }

    const updateOps: Record<string, unknown> = { $set: patch };
    if (dto.vatNumber !== undefined && !dto.vatNumber.trim()) {
      updateOps.$unset = { vatNumber: 1 };
    }

    const doc = await this.b2bCustomerModel
      .findOneAndUpdate(
        {
          _id: id,
          companyId: new Types.ObjectId(companyId),
          isActive: true,
        },
        updateOps,
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('B2B customer not found');
    return doc;
  }

  async remove(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const doc = await this.b2bCustomerModel
      .findOneAndUpdate(
        {
          _id: id,
          companyId: new Types.ObjectId(companyId),
          isActive: true,
        },
        { $set: { isActive: false } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('B2B customer not found');
    return { ok: true };
  }
}
