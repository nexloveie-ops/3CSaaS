/**
 * Cashier strict single-store: one store in list; POS blocked on other store.
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body?.message
        ? Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message
        : JSON.stringify(body);
    const err = new Error(`${path} ${res.status}: ${msg}`);
    throw err;
  }
  return body;
}

const tag = Date.now();
const adminEmail = `cashier-store-admin-${tag}@lz3c.local`;
const cashierEmail = `cashier-store-cashier-${tag}@lz3c.local`;
const password = 'ChangeMe123!';

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password, displayName: 'Admin' }),
  });
  const adminAuth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({ name: `Co ${tag}` }),
  });
  const ah = { ...adminAuth, 'X-Company-Id': company._id };

  const storeA = await req('/stores', {
    method: 'POST',
    headers: ah,
    body: JSON.stringify({ name: 'Store A' }),
  });
  const storeB = await req('/stores', {
    method: 'POST',
    headers: ah,
    body: JSON.stringify({ name: 'Store B' }),
  });

  await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: cashierEmail, password, displayName: 'Cashier' }),
  });
  await req(`/companies/${company._id}/members`, {
    method: 'POST',
    headers: ah,
    body: JSON.stringify({ email: cashierEmail, role: 'cashier', storeId: storeA._id }),
  });

  const cashierReg = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: cashierEmail, password }),
  });
  const ch = { Authorization: `Bearer ${cashierReg.accessToken}`, 'X-Company-Id': company._id };

  const stores = await req('/stores', { headers: ch });
  if (stores.length !== 1 || stores[0]._id !== storeA._id) {
    throw new Error(`Expected only store A, got ${JSON.stringify(stores)}`);
  }

  const tax = await req('/tax-categories', { headers: ah });
  const product = await req('/products', {
    method: 'POST',
    headers: { ...ah, 'X-Store-Id': storeA._id },
    body: JSON.stringify({
      name: 'Item',
      productType: 'simple',
      costPrice: 10,
      retailPrice: 12,
      taxCategoryId: tax[0]._id,
    }),
  });

  await req('/inventory/inbound', {
    method: 'POST',
    headers: { ...ah, 'X-Store-Id': storeA._id },
    body: JSON.stringify({ lines: [{ productId: product._id, quantity: 5 }] }),
  });

  const saleOk = await req('/pos/sales', {
    method: 'POST',
    headers: { ...ch, 'X-Store-Id': storeA._id },
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: product._id, quantity: 1 }],
    }),
  });
  if (!saleOk.docNumber) throw new Error('Expected sale at store A');

  let blocked = false;
  try {
    await req('/pos/sales', {
      method: 'POST',
      headers: { ...ch, 'X-Store-Id': storeB._id },
      body: JSON.stringify({
        paymentMethod: 'cash',
        lines: [{ productId: product._id, quantity: 1 }],
      }),
    });
  } catch (e) {
    blocked = /assigned store|Store context/i.test(String(e.message));
  }
  if (!blocked) throw new Error('Expected POS at store B to be forbidden');

  await req('/inventory/positions', { headers: { ...ch, 'X-Store-Id': storeA._id } });
  await req('/reports/daily', { headers: { ...ch, 'X-Store-Id': storeA._id } });
  await req('/price-list', { headers: ch });

  let invOtherStore = false;
  try {
    await req('/inventory/positions', { headers: { ...ch, 'X-Store-Id': storeB._id } });
  } catch (e) {
    invOtherStore = /assigned store|Store context/i.test(String(e.message));
  }
  if (!invOtherStore) throw new Error('Expected inventory at store B to be forbidden');

  console.log('OK smoke-cashier-store');
} catch (e) {
  console.error(e);
  process.exit(1);
}
