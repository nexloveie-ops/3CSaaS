/**
 * Phase 4/5 smoke: serial repair + preorder
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

const email = `phase4-${Date.now()}@lz3c.local`;
const reg = await req('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'ChangeMe123!', displayName: 'Phase4' }),
});
const auth = { Authorization: `Bearer ${reg.accessToken}` };

const company = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Repair Co' }),
});
const h = { ...auth, 'X-Company-Id': company._id };
const taxes = await req('/tax-categories', { headers: h });
const tax13 = taxes.find((t) => t.scheme === 'standard_13_5')?._id ?? taxes[0]._id;

const store = await req('/stores', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Shop' }),
});
const hs = { ...h, 'X-Store-Id': store._id };

const phone = await req('/products', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    name: 'iPhone 15',
    productType: 'serialized',
    costPrice: 400,
    retailPrice: 899,
    taxCategoryId: taxes.find((t) => t.scheme === 'margin_23')?._id ?? taxes[0]._id,
  }),
});

await req('/inventory/inbound', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    lines: [{ productId: phone._id, quantity: 1, serialNumbers: ['SN-PHASE4-001'] }],
  }),
});

const serials = await req('/serials', { headers: hs });
const serial = serials[0];

const plBrand = await req('/price-list/brands', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'Apple' }),
});
const plModel = await req(`/price-list/brands/${plBrand._id}/models`, {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ name: 'iPhone 14' }),
});
await req('/price-list/issue-templates', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ label: 'Screen', kind: 'template' }),
});
await req('/price-list/matrix/bulk', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({
    brandId: plBrand._id,
    entries: [{ modelId: plModel._id, issue: 'Screen', priceIncVat: 89 }],
  }),
});

const wo = await req('/work-orders', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    flowType: 'in_store',
    serialUnitId: serial._id,
    customerPhone: '+353871234567',
    issueDescription: 'Cracked screen',
    lines: [{ description: 'Screen repair', priceIncVat: 89 }],
  }),
});

await req(`/work-orders/${wo._id}/transition`, {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({ status: 'in_progress' }),
});
await req(`/work-orders/${wo._id}/transition`, {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({ status: 'awaiting_payment' }),
});

const sku = await req('/products', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    name: 'Case',
    productType: 'sku',
    skuCode: 'CASE-1',
    costPrice: 5,
    retailPrice: 19.99,
    taxCategoryId: taxes.find((t) => t.scheme === 'standard_23')?._id,
  }),
});

await req('/inventory/inbound', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({ lines: [{ productId: sku._id, quantity: 5 }] }),
});

const pre = await req('/preorders', {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({
    lines: [{ productId: sku._id, quantity: 1 }],
    depositAmount: 10,
  }),
});

await req(`/preorders/${pre._id}/deposit`, {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({ amount: 10, paymentMethod: 'cash' }),
});
await req(`/preorders/${pre._id}/ready`, { method: 'POST', headers: hs, body: '{}' });
await req(`/preorders/${pre._id}/convert`, {
  method: 'POST',
  headers: hs,
  body: JSON.stringify({ paymentMethod: 'card' }),
});

console.log('Phase 4/5 smoke OK');
console.log('Work order:', wo.docNumber);
console.log('Preorder:', pre.docNumber);
