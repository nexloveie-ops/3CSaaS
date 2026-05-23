/**
 * Phase 21: audit CSV, transfer cancel + multi-line, invite locale, admin company filter
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

const adminEmail = `p21-admin-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P21 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P21 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  await req(`/companies/${company._id}/locale`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ defaultLocale: 'zh' }),
  });

  const taxes = await req('/tax-categories', { headers: h });
  const storeA = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P21 A' }),
  });
  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P21 B' }),
  });
  const hs = { ...h, 'X-Store-Id': storeA._id };

  const prod1 = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P21 A',
      productType: 'sku',
      skuCode: 'P21A',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxes[0]._id,
    }),
  });
  const prod2 = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P21 B',
      productType: 'sku',
      skuCode: 'P21B',
      costPrice: 8,
      wholesalePrice: 12,
      retailPrice: 18,
      taxCategoryId: taxes[0]._id,
    }),
  });
  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      lines: [
        { productId: prod1._id, quantity: 5 },
        { productId: prod2._id, quantity: 5 },
      ],
    }),
  });

  const tr = await req('/transfers', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      toStoreId: storeB._id,
      lines: [
        { productId: prod1._id, quantity: 1 },
        { productId: prod2._id, quantity: 2 },
      ],
    }),
  });
  if (tr.lines?.length !== 2) throw new Error('Multi-line transfer expected 2 lines');
  console.log('Multi-line transfer OK:', tr.docNumber);

  await req(`/transfers/${tr._id}/transition`, {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ status: 'cancelled' }),
  });
  console.log('Transfer cancel OK');

  const invite = await req(`/companies/${company._id}/invites`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: `p21-inv-${Date.now()}@lz3c.local`,
      role: 'manager',
    }),
  });
  if (!invite.inviteUrl) throw new Error('Invite failed');
  console.log('ZH locale invite OK');

  const today = new Date().toISOString().slice(0, 10);
  const csv = await req(`/audit/export.csv?from=${today}&to=${today}`, { headers: h });
  if (!csv.csv || !csv.text.includes('action')) throw new Error('Audit CSV invalid');
  console.log('Audit CSV OK, rows:', csv.text.split('\n').length);

  console.log('Phase 21 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
