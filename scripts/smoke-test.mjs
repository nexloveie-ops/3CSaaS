/**
 * Smoke test: register/login → company → store → product → inbound → sale
 * Run with API at http://localhost:3000
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const email = `smoke-${Date.now()}@lz3c.local`;

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

try {
  const reg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'ChangeMe123!',
      displayName: 'Smoke Test',
    }),
  });
  const token = reg.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'Smoke Co' }),
  });
  const companyId = company._id;
  const h = { ...auth, 'X-Company-Id': companyId };

  const taxes = await req('/tax-categories', { headers: h });
  const taxId = taxes.find((t) => t.scheme === 'standard_23')?._id ?? taxes[0]._id;

  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'Main Store' }),
  });
  const storeId = store._id;
  const hs = { ...h, 'X-Store-Id': storeId };

  const product = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'USB Cable',
      productType: 'sku',
      skuCode: 'USB-01',
      costPrice: 5,
      retailPrice: 12.99,
      taxCategoryId: taxId,
    }),
  });

  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      lines: [{ productId: product._id, quantity: 10 }],
    }),
  });

  const positions = await req('/inventory/positions', { headers: hs });
  console.log('Stock:', positions[0]?.quantity);

  const order = await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'card',
      lines: [{ productId: product._id, quantity: 1 }],
    }),
  });

  console.log('Smoke test OK');
  console.log('Receipt:', order.docNumber, 'total', order.totalIncVat);
} catch (e) {
  console.error('Smoke test FAILED:', e.message);
  process.exit(1);
}
