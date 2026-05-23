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

const email = `p6-${Date.now()}@lz3c.local`;
const reg = await req('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'ChangeMe123!', displayName: 'P6' }),
});
const auth = { Authorization: `Bearer ${reg.accessToken}` };

const co = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'B2B Co' }),
});
const h = { ...auth, 'X-Company-Id': co._id };
const taxes = await req('/tax-categories', { headers: h });
const tax23 = taxes.find((t) => t.scheme === 'standard_23')?._id;

const storeA = await req('/stores', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Store A' }),
});
const storeB = await req('/stores', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Store B' }),
});

const hsA = { ...h, 'X-Store-Id': storeA._id };
const prod = await req('/products', {
  method: 'POST',
  headers: hsA,
  body: JSON.stringify({
    name: 'Widget',
    productType: 'sku',
    skuCode: 'WDG-1',
    costPrice: 10,
    wholesalePrice: 15,
    retailPrice: 25,
    taxCategoryId: tax23,
  }),
});

await req('/inventory/inbound', {
  method: 'POST',
  headers: hsA,
  body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 20 }] }),
});

const b2b = await req('/b2b/orders', {
  method: 'POST',
  headers: hsA,
  body: JSON.stringify({
    buyerStoreId: storeB._id,
    lines: [{ productId: prod._id, quantity: 2 }],
  }),
});

for (const st of ['confirmed', 'shipped', 'received', 'invoiced']) {
  await req(`/b2b/orders/${b2b._id}/transition`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ status: st }),
  });
}

const invs = await req('/invoices', { headers: h });
const sellerInv = invs.find((i) => i.perspective === 'seller');

const tr = await req('/transfers', {
  method: 'POST',
  headers: hsA,
  body: JSON.stringify({
    toStoreId: storeB._id,
    lines: [{ productId: prod._id, quantity: 1 }],
  }),
});

for (const st of ['confirmed', 'shipped', 'received']) {
  await req(`/transfers/${tr._id}/transition`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ status: st }),
  });
}

const report = await req('/reports/daily/regenerate', {
  method: 'POST',
  headers: { ...h, 'X-Store-Id': storeA._id },
  body: '{}',
});

console.log('Phase 6 smoke OK');
console.log('B2B:', b2b.docNumber, 'Seller invoice VAT:', sellerInv?.totalVat);
console.log('Transfer:', tr.docNumber);
console.log('Daily sales:', report.salesTotal);
