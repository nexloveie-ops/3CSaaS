import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument } from '@lz3c/db';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!WRITE_METHODS.has(req.method)) return true;

    const companyId = req.headers['x-company-id'];
    if (!companyId) return true;

    const company = await this.companyModel.findById(companyId).lean();
    if (company?.subscriptionStatus === 'read_only') {
      throw new ForbiddenException(
        'Subscription expired — read only. Renew to continue.',
      );
    }
    return true;
  }
}
