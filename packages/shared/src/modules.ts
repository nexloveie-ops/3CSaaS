import type { ModuleId } from './constants';

/** API route module requirements (for documentation / tooling). */
export const CONTROLLER_MODULES = {
  pos: 'pos',
  inventory: 'inventory',
  serial: 'serialized',
  product: 'core',
  tax: 'core',
  workOrder: 'service',
  priceList: 'service',
  preorder: 'preorder',
  b2b: 'b2b',
  warehouse: 'warehouse',
  chain: 'chain',
  transfer: 'inventory',
  report: 'report',
  customer: 'crm',
  invoice: 'b2b',
} as const satisfies Record<string, ModuleId>;

/** Web dashboard paths → required module */
export const NAV_MODULE_REQUIREMENTS: Record<string, ModuleId> = {
  '/dashboard/products': 'core',
  '/dashboard/inventory': 'inventory',
  '/dashboard/pos': 'pos',
  '/dashboard/repairs': 'service',
  '/dashboard/price-list': 'service',
  '/dashboard/preorders': 'preorder',
  '/dashboard/credit-notes': 'preorder',
  '/dashboard/b2b': 'b2b',
  '/dashboard/warehouse': 'warehouse',
  '/dashboard/chain': 'chain',
  '/dashboard/transfers': 'inventory',
  '/dashboard/reports': 'report',
  '/dashboard/customers': 'crm',
};
