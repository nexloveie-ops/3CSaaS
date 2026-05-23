/**
 * Phase 12: invoice PDF generate + download (requires Chromium/puppeteer)
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/pdf')) {
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return { pdf: true, buffer: await res.arrayBuffer() };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const email = `p12-${Date.now()}@lz3c.local`;
const reg = await req('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'ChangeMe123!', displayName: 'P12' }),
});
const auth = { Authorization: `Bearer ${reg.accessToken}` };

const co = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'PDF Co' }),
});
const h = { ...auth, 'X-Company-Id': co._id };
const taxes = await req('/tax-categories', { headers: h });
const taxId = taxes[0]._id;

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
    name: 'PDF Item',
    productType: 'sku',
    skuCode: 'PDF-1',
    costPrice: 10,
    wholesalePrice: 15,
    retailPrice: 20,
    taxCategoryId: taxId,
  }),
});
await req('/inventory/inbound', {
  method: 'POST',
  headers: hsA,
  body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 5 }] }),
});

const b2b = await req('/b2b/orders', {
  method: 'POST',
  headers: hsA,
  body: JSON.stringify({
    buyerStoreId: storeB._id,
    lines: [{ productId: prod._id, quantity: 1 }],
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
const inv = invs.find((i) => i.perspective === 'seller');
if (!inv) throw new Error('No seller invoice');

try {
  const meta = await req(`/invoices/${inv._id}/pdf`, {
    method: 'POST',
    headers: h,
    body: '{}',
  });
  console.log('PDF stored:', meta.storageKey, meta.cached ? '(cached)' : '(new)');

  const dl = await req(`/invoices/${inv._id}/pdf`, { headers: h });
  if (!dl.pdf || dl.buffer.byteLength < 500) throw new Error('PDF too small');
  console.log('PDF bytes:', dl.buffer.byteLength);
  console.log('Phase 12 smoke OK');
} catch (e) {
  if (String(e.message).includes('503') || String(e.message).includes('unavailable')) {
    console.log('SKIP: PDF engine not available in this environment');
    console.log('Phase 12 smoke SKIPPED (install puppeteer / chromium)');
    process.exit(0);
  }
  throw e;
}
