import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument } from '@lz3c/db';
import { REQUIRED_MODULE_KEY } from '../decorators/require-module.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleId = this.reflector.getAllAndOverride<string>(REQUIRED_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleId) return true;

    const req = context.switchToHttp().getRequest();
    const companyId = req.headers['x-company-id'] ?? req.user?.companyId;
    if (!companyId) {
      throw new ForbiddenException('Company context required');
    }

    const company = await this.companyModel.findById(companyId).lean();
    if (!company) throw new ForbiddenException('Company not found');

    const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    if (company.subscriptionStatus === 'read_only' && writeMethods.has(req.method)) {
      throw new ForbiddenException('Subscription expired — read only');
    }

    if (!company.enabledModules?.includes(moduleId)) {
      throw new ForbiddenException(`Module not enabled: ${moduleId}`);
    }

    return true;
  }
}
