import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '@lz3c/db';
import { CompanyService } from '../company/company.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private companyService: CompanyService,
  ) {}

  async list(userId: string, companyId: string, q?: string) {
    await this.companyService.assertMember(userId, companyId);
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
    };
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ];
    }
    return this.customerModel.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  }

  async create(userId: string, companyId: string, dto: CreateCustomerDto) {
    await this.companyService.assertMember(userId, companyId);
    return this.customerModel.create({
      ...dto,
      companyId: new Types.ObjectId(companyId),
    });
  }

  async getOne(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const c = await this.customerModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }
}
