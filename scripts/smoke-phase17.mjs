/**
 * Phase 17: CSV export, cashier role guard, email mock, add member
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/csv')) {
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return { csv: true, text: await res.text() };
  }
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function reqStatus(path, code, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  const body = text.startsWith('{') ? JSON.parse(text) : text;
  if (res.status !== code) {
    throw new Error(`Expected ${code} for ${path}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const adminEmail = `p17-admin-${Date.now()}@lz3c.local`;
const cashierEmail = `p17-cashier-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P17 Admin',
    }),
  });
  const adminAuth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({ name: 'P17 Co' }),
  });
  const h = { ...adminAuth, 'X-Company-Id': company._id };

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
    body: JSON.stringify({ name: 'P17 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P17 Item',
      productType: 'sku',
      skuCode: 'P17-1',
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

  await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  const csv = await req('/reports/daily/export.csv', { headers: hs });
  if (!csv.csv || !csv.text.includes('docNumber')) {
    throw new Error('Daily CSV missing order lines');
  }
  console.log('Daily CSV OK, lines:', csv.text.split('\n').length);

  const companyCsv = await req('/reports/company/export.csv', { headers: h });
  if (!companyCsv.csv || !companyCsv.text.includes('salesTotal')) {
    throw new Error('Company CSV invalid');
  }
  console.log('Company CSV OK');

  const cashierReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: cashierEmail,
      password: 'ChangeMe123!',
      displayName: 'P17 Cashier',
    }),
  });

  await req(`/companies/${company._id}/members`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: cashierEmail,
      role: 'cashier',
      storeId: store._id,
    }),
  });

  const cashierAuth = { Authorization: `Bearer ${cashierReg.accessToken}` };
  const ch = { ...cashierAuth, 'X-Company-Id': company._id, 'X-Store-Id': store._id };

  await req('/pos/sales', {
    method: 'POST',
    headers: ch,
    body: JSON.stringify({
      paymentMethod: 'card',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });
  console.log('Cashier POS OK');

  await req('/reports/daily', { headers: ch });
  console.log('Cashier reports OK');

  const sale = await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  const emailRes = await req(`/pos/orders/${sale._id}/email`, {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ to: 'customer@example.com' }),
  });
  if (emailRes.mode !== 'mock' && !emailRes.sent) {
    throw new Error('Unexpected email result');
  }
  console.log('Receipt email:', emailRes.mode);

  console.log('Phase 17 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
