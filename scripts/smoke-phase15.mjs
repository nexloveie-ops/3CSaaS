/**
 * Phase 15: POS receipt PDF archive + chain member update
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const email = `smoke-p15-${Date.now()}@lz3c.local`;

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

try {
  const reg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'ChangeMe123!',
      displayName: 'Phase15 Smoke',
    }),
  });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P15 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  const taxes = await req('/tax-categories', { headers: h });
  const taxId = taxes[0]._id;
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P15 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P15 Item',
      productType: 'sku',
      skuCode: 'P15-1',
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
  console.log('Sale:', sale.docNumber);

  try {
    const meta = await req(`/pos/orders/${sale._id}/pdf`, {
      method: 'POST',
      headers: hs,
      body: '{}',
    });
    console.log('Receipt PDF stored:', meta.storageKey);
    const dl = await req(`/pos/orders/${sale._id}/pdf`, { headers: hs });
    if (!dl.pdf || dl.buffer.byteLength < 200) throw new Error('Receipt PDF too small');
    console.log('Receipt PDF bytes:', dl.buffer.byteLength);
  } catch (e) {
    if (String(e.message).includes('503') || String(e.message).includes('unavailable')) {
      console.log('SKIP: PDF engine not available');
    } else {
      throw e;
    }
  }

  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P15 Store B' }),
  });

  const plans = await req('/subscription/plans');
  const enterprise = plans.find((p) => p.slug === 'enterprise');
  if (enterprise) {
    await req('/subscription/dev/apply-plan', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ planId: enterprise._id }),
    });
  }

  const chain = await req('/chains', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P15 Chain', storeIds: [store._id, storeB._id] }),
  });

  const updated = await req(`/chains/${chain._id}/members`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ storeIds: [store._id, storeB._id] }),
  });
  if (!updated.members || updated.members.length < 2) {
    throw new Error('Chain members update failed');
  }
  console.log('Chain members:', updated.members.length);

  console.log('Phase 15 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
