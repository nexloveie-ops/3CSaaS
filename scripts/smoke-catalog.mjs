/**
 * Catalog categories + cashier product create
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
    throw new Error(`${path} ${res.status}: ${msg}`);
  }
  return body;
}

const tag = Date.now();
const adminEmail = `catalog-admin-${tag}@lz3c.local`;
const cashierEmail = `catalog-cashier-${tag}@lz3c.local`;
const password = 'ChangeMe123!';

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password, displayName: 'Admin' }),
  });
  const ah = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: ah,
    body: JSON.stringify({ name: `Catalog Co ${tag}` }),
  });
  const h = { ...ah, 'X-Company-Id': company._id };

  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'Shop' }),
  });

  await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: cashierEmail, password, displayName: 'Cashier' }),
  });
  await req(`/companies/${company._id}/members`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: cashierEmail, role: 'cashier', storeId: store._id }),
  });

  const cashierReg = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: cashierEmail, password }),
  });
  const ch = {
    Authorization: `Bearer ${cashierReg.accessToken}`,
    'X-Company-Id': company._id,
    'X-Store-Id': store._id,
  };

  const used = await req('/catalog-categories', {
    method: 'POST',
    headers: ch,
    body: JSON.stringify({ name: 'Used devices' }),
  });
  const cases = await req('/catalog-categories', {
    method: 'POST',
    headers: ch,
    body: JSON.stringify({ name: 'Phone cases' }),
  });

  const list = await req('/catalog-categories', { headers: ch });
  if (list.length !== 2) throw new Error(`Expected 2 categories, got ${list.length}`);

  const tax = await req('/tax-categories', { headers: h });
  const product = await req('/products', {
    method: 'POST',
    headers: ch,
    body: JSON.stringify({
      name: 'iPhone 12 used',
      productType: 'simple',
      catalogCategoryId: used._id,
      costPrice: 200,
      retailPrice: 299,
      taxCategoryId: tax[0]._id,
    }),
  });
  if (!product._id) throw new Error('Product create failed');

  const filtered = await req(`/products?catalogCategoryId=${used._id}`, { headers: ch });
  if (filtered.length !== 1 || filtered[0].name !== 'iPhone 12 used') {
    throw new Error('Category filter failed');
  }

  await req(`/catalog-categories/${cases._id}`, { method: 'DELETE', headers: ch });
  console.log('OK smoke-catalog');
} catch (e) {
  console.error(e);
  process.exit(1);
}
