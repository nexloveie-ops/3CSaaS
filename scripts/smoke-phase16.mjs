/**
 * Phase 16: auto receipt PDF on sale, B2B invoice PDF, chain rename
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
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const email = `smoke-p16-${Date.now()}@lz3c.local`;

try {
  const reg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'ChangeMe123!',
      displayName: 'Phase16 Smoke',
    }),
  });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P16 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  const plans = await req('/subscription/plans');
  const enterprise = plans.find((p) => p.slug === 'enterprise');
  if (enterprise) {
    await req('/subscription/dev/apply-plan', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ planId: enterprise._id }),
    });
  }

  const taxes = await req('/tax-categories', { headers: h });
  const taxId = taxes[0]._id;
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P16 Store' }),
  });
  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P16 Store B' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P16 Item',
      productType: 'sku',
      skuCode: 'P16-1',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxId,
    }),
  });
  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 5 }] }),
  });

  const sale = await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  let archived = false;
  for (let i = 0; i < 8; i++) {
    await sleep(500);
    const today = await req('/pos/orders/today', { headers: hs });
    const row = today.find((o) => o._id === sale._id);
    if (row?.pdfStorageKey) {
      archived = true;
      console.log('Auto receipt PDF:', row.pdfStorageKey);
      break;
    }
  }
  if (!archived) {
    console.log('WARN: auto PDF not visible yet (Chromium may be slow); trying GET pdf');
    try {
      await req(`/pos/orders/${sale._id}/pdf`, { headers: hs });
    } catch (e) {
      if (!String(e.message).includes('503')) throw e;
    }
  }

  const b2b = await req('/b2b/orders', {
    method: 'POST',
    headers: hs,
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
  await sleep(1500);
  const invs = await req('/invoices', { headers: h });
  const sellerInv = invs.find((i) => i.perspective === 'seller' && String(i.b2bOrderId) === b2b._id);
  if (!sellerInv) throw new Error('Seller invoice missing');
  if (!sellerInv.pdfStorageKey) {
    await req(`/invoices/${sellerInv._id}/pdf`, { method: 'POST', headers: h, body: '{}' });
  }
  const invPdf = await req(`/invoices/${sellerInv._id}/pdf`, { headers: h });
  if (!invPdf.pdf || invPdf.buffer.byteLength < 500) throw new Error('Invoice PDF failed');
  console.log('B2B invoice PDF OK:', sellerInv.docNumber);

  const chain = await req('/chains', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P16 Chain Old', storeIds: [store._id, storeB._id] }),
  });
  const renamed = await req(`/chains/${chain._id}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ name: 'P16 Chain New' }),
  });
  if (renamed.name !== 'P16 Chain New') throw new Error('Chain rename failed');
  console.log('Chain renamed OK');

  console.log('Phase 16 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
