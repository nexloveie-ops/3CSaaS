export const MODULE_IDS = [
  'core',
  'pos',
  'inventory',
  'serialized',
  'service',
  'preorder',
  'report',
  'b2b',
  'warehouse',
  'chain',
  'crm',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const STORE_ROLES = ['admin', 'manager', 'cashier'] as const;
export const WAREHOUSE_ROLES = ['admin', 'warehouse_staff'] as const;

export const PRODUCT_TYPES = ['serialized', 'sku', 'simple', 'service'] as const;

export const DOC_TYPES = [
  'receipt',
  'invoice_b2b',
  'transfer',
  'credit_note',
] as const;
