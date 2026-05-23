import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyService } from '../../company/company.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Cashier store-ops API (regex on path after global prefix). */
const CASHIER_ALLOWED_RULES: { method: string; pattern: RegExp }[] = [
  { method: 'ANY', pattern: /^\/auth\// },
  { method: 'GET', pattern: /^\/health/ },
  { method: 'GET', pattern: /^\/subscription\/plans/ },
  { method: 'GET', pattern: /^\/companies\/?$/ },
  { method: 'GET', pattern: /^\/companies\/[a-f0-9]{24}\/?$/ },
  { method: 'ANY', pattern: /^\/stores(\/|$)/ },
  { method: 'ANY', pattern: /^\/products(\/|$)/ },
  { method: 'ANY', pattern: /^\/catalog-categories(\/|$)/ },
  { method: 'ANY', pattern: /^\/serials(\/|$)/ },
  { method: 'ANY', pattern: /^\/tax-categories(\/|$)/ },
  { method: 'ANY', pattern: /^\/pos(\/|$)/ },
  { method: 'ANY', pattern: /^\/inventory(\/|$)/ },
  { method: 'ANY', pattern: /^\/transfers(\/|$)/ },
  { method: 'ANY', pattern: /^\/work-orders(\/|$)/ },
  { method: 'ANY', pattern: /^\/price-list(\/|$)/ },
  { method: 'ANY', pattern: /^\/preorders(\/|$)/ },
  { method: 'ANY', pattern: /^\/credit-notes(\/|$)/ },
  { method: 'ANY', pattern: /^\/customers(\/|$)/ },
  { method: 'ANY', pattern: /^\/reports(\/|$)/ },
  { method: 'ANY', pattern: /^\/warehouse(\/|$)/ },
];

const CASHIER_DENIED_RULES: { method: string; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^\/companies\/?$/ },
  { method: 'POST', pattern: /^\/stores\/?$/ },
  {
    method: 'ANY',
    pattern:
      /^\/companies\/[^/]+\/(members|invites|settings|audit|webhook|maintenance|locale|profile)(\/|$)/,
  },
  { method: 'ANY', pattern: /^\/admin\// },
  { method: 'ANY', pattern: /^\/b2b\// },
  { method: 'ANY', pattern: /^\/chain\// },
  { method: 'ANY', pattern: /^\/audit\// },
  { method: 'ANY', pattern: /^\/invoices\// },
  {
    method: 'ANY',
    pattern: /^\/subscription\/(?!plans(?:\/|$)).*$/,
  },
];

const PUBLIC_PATH_RULES: { method: string; pattern: RegExp }[] = [
  { method: 'GET', pattern: /^\/invites\// },
  { method: 'POST', pattern: /^\/auth\/accept-invite$/ },
];

const WAREHOUSE_PATH_RULES: { method: string; pattern: RegExp }[] = [
  { method: 'GET', pattern: /^\/warehouse\// },
  { method: 'PUT', pattern: /^\/warehouse\// },
  { method: 'GET', pattern: /^\/inventory\// },
  { method: 'POST', pattern: /^\/inventory\/inbound/ },
  { method: 'GET', pattern: /^\/auth\// },
  { method: 'GET', pattern: /^\/companies\/?/ },
  { method: 'GET', pattern: /^\/stores\/?/ },
];

function pathRuleMatches(
  rules: { method: string; pattern: RegExp }[],
  method: string,
  path: string,
): boolean {
  return rules.some(
    (r) =>
      (r.method === method || r.method === 'ANY') && r.pattern.test(path),
  );
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private companyService: CompanyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException();

    const path =
      (req.path as string).replace(/^\/api/, '') ||
      req.url?.split('?')[0]?.replace(/^\/api/, '') ||
      '';
    const method = req.method as string;

    if (PUBLIC_PATH_RULES.some((r) => r.method === method && r.pattern.test(path))) {
      return true;
    }

    const companyId = req.headers['x-company-id'] as string | undefined;
    if (!companyId) {
      if (!required?.length) return true;
      throw new ForbiddenException('Company context required');
    }

    const storeId = req.headers['x-store-id'] as string | undefined;
    const boundStore = await this.companyService.resolveBoundStoreId(userId, companyId);
    if (boundStore && storeId && storeId !== boundStore) {
      throw new ForbiddenException('Access limited to your assigned store');
    }
    const role = await this.companyService.resolveRole(userId, companyId, storeId);

    if (role === 'admin' || role === 'manager') return true;

    if (role === 'cashier') {
      if (pathRuleMatches(CASHIER_DENIED_RULES, method, path)) {
        throw new ForbiddenException('Cashier role: access denied');
      }
      const allowed = pathRuleMatches(CASHIER_ALLOWED_RULES, method, path);
      if (!allowed) {
        throw new ForbiddenException('Cashier role: access denied');
      }
      if (required?.length && !required.includes('cashier')) {
        throw new ForbiddenException('Insufficient role');
      }
      return true;
    }

    if (role === 'warehouse_staff') {
      const allowed = WAREHOUSE_PATH_RULES.some(
        (r) => r.method === method && r.pattern.test(path),
      );
      if (!allowed) throw new ForbiddenException('Warehouse staff: warehouse routes only');
      return true;
    }

    if (required?.length && !required.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
