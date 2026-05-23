/**
 * Phase 14: subscription module guard + read-only writes
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const email = `smoke-p14-${Date.now()}@lz3c.local`;

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function reqStatus(path, expectedStatus, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (res.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} for ${path}, got ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

try {
  const reg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'ChangeMe123!',
      displayName: 'Phase14 Smoke',
    }),
  });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P14 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  const plans = await req('/subscription/plans');
  const free = plans.find((p) => p.isFree);
  const enterprise = plans.find((p) => p.slug === 'enterprise');
  if (!free || !enterprise) throw new Error('Plans missing');

  await req('/subscription/activate-free', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ planId: free._id }),
  });

  const billingFree = await req('/subscription/billing', { headers: h });
  if (billingFree.enabledModules?.includes('b2b')) {
    throw new Error('Free plan should not include b2b');
  }

  const taxes = await req('/tax-categories', { headers: h });
  const taxId = taxes[0]._id;
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P14 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P14 Widget',
      productType: 'sku',
      skuCode: 'P14-01',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxId,
    }),
  });
  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 3 }] }),
  });

  await reqStatus(
    '/b2b/orders',
    403,
    {
      method: 'POST',
      headers: hs,
      body: JSON.stringify({
        buyerStoreId: store._id,
        lines: [{ productId: prod._id, quantity: 1 }],
      }),
    },
  );
  console.log('B2B blocked on free plan OK');

  await req('/subscription/dev/apply-plan', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ planId: enterprise._id }),
  });

  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P14 Store B' }),
  });

  const b2b = await req('/b2b/orders', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      buyerStoreId: storeB._id,
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });
  console.log('B2B allowed on enterprise OK:', b2b._id);

  await req('/subscription/dev/apply-plan', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ planId: enterprise._id, subscriptionStatus: 'read_only' }),
  });

  await reqStatus(
    '/inventory/inbound',
    403,
    {
      method: 'POST',
      headers: hs,
      body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 1 }] }),
    },
  );
  const orders = await req('/b2b/orders', { headers: h });
  if (!Array.isArray(orders) || !orders.find((o) => o._id === b2b._id)) {
    throw new Error('B2B GET should work in read_only');
  }
  console.log('Read-only: GET OK, POST blocked OK');

  console.log('Phase 14 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
