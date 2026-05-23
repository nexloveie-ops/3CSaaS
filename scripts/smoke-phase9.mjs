/**
 * Phase 9: warehouse scope/catalog + chain shared stock
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const email = `p9-${Date.now()}@lz3c.local`;
const reg = await req('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'ChangeMe123!', displayName: 'P9' }),
});
const auth = { Authorization: `Bearer ${reg.accessToken}` };

const co = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Chain Co' }),
});
const h = { ...auth, 'X-Company-Id': co._id };
const taxes = await req('/tax-categories', { headers: h });
const taxId = taxes[0]._id;

const warehouse = await req('/stores', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Central WH', warehouseEnabled: true }),
});
const retail = await req('/stores', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Retail Branch' }),
});

const hWh = { ...h, 'X-Store-Id': warehouse._id };
const prod = await req('/products', {
  method: 'POST',
  headers: hWh,
  body: JSON.stringify({
    name: 'Bulk Cable',
    productType: 'sku',
    skuCode: 'CBL-9',
    costPrice: 8,
    wholesalePrice: 12,
    retailPrice: 18,
    taxCategoryId: taxId,
  }),
});
await req('/inventory/inbound', {
  method: 'POST',
  headers: hWh,
  body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 50 }] }),
});

await req('/warehouse/scope', {
  method: 'PUT',
  headers: hWh,
  body: JSON.stringify({ allowedStoreIds: [retail._id] }),
});

const hRetail = { ...h, 'X-Store-Id': retail._id };
const catalog = await req(`/warehouse/catalog/${warehouse._id}`, { headers: hRetail });
if (!catalog.length) throw new Error('Catalog empty');

const b2b = await req('/b2b/orders', {
  method: 'POST',
  headers: hWh,
  body: JSON.stringify({
    buyerStoreId: retail._id,
    lines: [{ productId: prod._id, quantity: 3 }],
  }),
});
console.log('Warehouse B2B:', b2b.docNumber);

const chain = await req('/chains', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    name: 'Test Chain',
    storeIds: [warehouse._id, retail._id],
  }),
});
await req(`/chains/${chain._id}/share-rules`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    sourceStoreId: warehouse._id,
    mode: 'percent',
    value: 40,
  }),
});

const stock = await req(
  `/chains/${chain._id}/shared-stock?viewerStoreId=${retail._id}`,
  { headers: auth },
);
if (!stock.length) throw new Error('No shared stock');
console.log('Chain shared SKU:', stock[0].name, 'qty', stock[0].sharedQuantity);

console.log('Phase 9 smoke OK');
