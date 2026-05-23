/**
 * Phase 8: subscription plans, free activate, billing, invoice print HTML
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const email = `smoke-p8-${Date.now()}@lz3c.local`;

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

try {
  const reg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'ChangeMe123!',
      displayName: 'Phase8 Smoke',
    }),
  });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P8 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  const plans = await req('/subscription/plans');
  const free = plans.find((p) => p.isFree);
  if (!free) throw new Error('No free plan');

  await req('/subscription/activate-free', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ planId: free._id }),
  });

  const billing = await req('/subscription/billing', { headers: h });
  if (billing.subscriptionStatus !== 'active') {
    throw new Error(`Expected active, got ${billing.subscriptionStatus}`);
  }
  console.log('Billing:', billing.subscriptionStatus, billing.enabledModules?.length, 'modules');

  const taxes = await req('/tax-categories', { headers: h });
  const taxId = taxes[0]._id;
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P8 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P8 Store B' }),
  });

  const sellerProd = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P8 Widget',
      productType: 'sku',
      skuCode: 'P8-01',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxId,
    }),
  });
  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ lines: [{ productId: sellerProd._id, quantity: 5 }] }),
  });

  const enterprise = plans.find((p) => p.slug === 'enterprise');
  if (!enterprise) throw new Error('No enterprise plan');
  await req('/subscription/dev/apply-plan', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ planId: enterprise._id }),
  });

  const b2b = await req('/b2b/orders', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      buyerStoreId: storeB._id,
      lines: [{ productId: sellerProd._id, quantity: 1 }],
    }),
  });
  for (const st of ['confirmed', 'shipped', 'received', 'invoiced']) {
    await req(`/b2b/orders/${b2b._id}/transition`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ status: st }),
    });
  }

  const invoices = await req('/invoices', { headers: h });
  const inv = invoices.find((i) => i.perspective === 'seller' && i.b2bOrderId === b2b._id);
  if (!inv) throw new Error('Invoice not found');

  const printRes = await fetch(`${BASE}/invoices/${inv._id}/print`, {
    headers: { Authorization: auth.Authorization, 'X-Company-Id': company._id },
  });
  const html = await printRes.text();
  if (!printRes.ok || !html.includes(inv.docNumber)) {
    throw new Error('Invoice print failed');
  }
  console.log('Invoice print OK:', inv.docNumber);

  const report = await req('/reports/company', { headers: h });
  console.log('Company report stores:', report.storeCount);

  console.log('Phase 8 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
