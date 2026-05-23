/**
 * Phase 22: pick list, invite preview, audit purge, webhook settings
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) {
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return { html: true, text: await res.text() };
  }
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

const adminEmail = `p22-admin-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P22 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P22 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  await req(`/companies/${company._id}/settings`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({
      webhookUrl: 'https://httpbin.org/post',
      auditRetentionDays: 30,
    }),
  });
  console.log('Webhook settings OK');

  const preview = await req(`/companies/${company._id}/invites/preview`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: 'inv@lz3c.local', role: 'manager' }),
  });
  if (!preview.html?.includes('LZ3C')) throw new Error('Invite preview missing HTML');
  console.log('Invite preview OK, locale:', preview.locale);

  const taxes = await req('/tax-categories', { headers: h });
  const storeA = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P22 A' }),
  });
  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P22 B' }),
  });
  const hs = { ...h, 'X-Store-Id': storeA._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P22',
      productType: 'sku',
      skuCode: 'P22',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxes[0]._id,
    }),
  });
  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 3 }] }),
  });

  const tr = await req('/transfers', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      toStoreId: storeB._id,
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  const pick = await req(`/transfers/${tr._id}/pick-list`, { headers: hs });
  if (!pick.html || !pick.text.includes('pick list')) {
    throw new Error('Pick list HTML invalid');
  }
  console.log('Pick list OK');

  await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  const purge = await req(`/companies/${company._id}/audit/purge`, {
    method: 'POST',
    headers: h,
    body: '{}',
  });
  console.log('Audit purge OK, deleted:', purge.deleted);

  console.log('Phase 22 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
