/**
 * Phase 13: POS 80mm receipt HTML + chain available-stores
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) {
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return { html: text };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const email = `p13-${Date.now()}@lz3c.local`;
const reg = await req('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'ChangeMe123!', displayName: 'P13' }),
});
const auth = { Authorization: `Bearer ${reg.accessToken}` };

const co = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Receipt Co' }),
});
const h = { ...auth, 'X-Company-Id': co._id };
const taxes = await req('/tax-categories', { headers: h });
const taxId = taxes.find((t) => t.scheme === 'standard_23')?._id ?? taxes[0]._id;

const store = await req('/stores', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Front Desk' }),
});
const hs = { ...h, 'X-Store-Id': store._id };

const prod = await req('/products', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    name: 'USB-C Cable',
    productType: 'sku',
    skuCode: 'USB-P13',
    costPrice: 5,
    retailPrice: 14.99,
    taxCategoryId: taxId,
  }),
});
await req('/inventory/inbound', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 5 }] }),
});

const order = await req('/pos/sales', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    paymentMethod: 'card',
    lines: [{ productId: prod._id, quantity: 1, unitPriceIncVat: 14.99 }],
  }),
});

const receipt = await req(`/pos/orders/${order._id}/receipt`, { headers: hs });
if (!receipt.html?.includes(order.docNumber)) {
  throw new Error('Receipt HTML missing doc number');
}
if (!receipt.html?.includes('80mm') && !receipt.html?.includes('@page')) {
  throw new Error('Receipt missing 80mm styles');
}
console.log('Receipt HTML OK:', order.docNumber);

const available = await req('/chains/picker/stores', { headers: auth });
if (!available.length) throw new Error('No member stores');

const co2 = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Partner Co' }),
});
const h2 = { ...auth, 'X-Company-Id': co2._id };
const store2 = await req('/stores', {
  method: 'POST',
  headers: h2,
  body: JSON.stringify({ name: 'Partner Shop' }),
});

const chain = await req('/chains', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    name: 'Cross Chain',
    storeIds: [store._id, store2._id],
  }),
});
const listed = await req('/chains', { headers: auth });
if (!listed[0]?.members?.length) throw new Error('Chain list missing member names');
console.log('Chain members:', listed[0].members.map((m) => m.storeName).join(', '));

console.log('Phase 13 smoke OK');
