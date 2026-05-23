/**
 * Phase 25: webhook filter/detail, invite note zh, purge notify metadata
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
    throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

const noteEn = 'Welcome EN note';
const noteZh = '欢迎加入中文说明';

try {
  const reg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `p25-${Date.now()}@lz3c.local`,
      password: 'ChangeMe123!',
      displayName: 'P25',
    }),
  });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P25 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  await req(`/companies/${company._id}/locale`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ defaultLocale: 'zh' }),
  });
  await req(`/companies/${company._id}/settings`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ inviteEmailNote: noteEn, inviteEmailNoteZh: noteZh }),
  });

  const preview = await req(`/companies/${company._id}/invites/preview`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: 'x@lz3c.local', role: 'manager' }),
  });
  if (!preview.html.includes(noteZh)) throw new Error('ZH invite note missing in preview');
  console.log('Invite note zh OK');

  const taxes = await req('/tax-categories', { headers: h });
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P25 S' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };
  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P25',
      productType: 'sku',
      skuCode: 'P25',
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

  await req(`/companies/${company._id}/settings`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ webhookUrl: 'https://httpbin.org/post' }),
  });
  await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });
  await new Promise((r) => setTimeout(r, 3500));

  const all = await req(`/companies/${company._id}/webhook/deliveries`, { headers: h });
  const filtered = await req(
    `/companies/${company._id}/webhook/deliveries?event=pos.sale&status=success`,
    { headers: h },
  );
  if (!filtered.length || filtered.some((d) => d.event !== 'pos.sale' || d.status !== 'success')) {
    throw new Error('Webhook filter failed');
  }
  console.log('Webhook filter OK, total:', all.length, 'filtered:', filtered.length);

  const detail = await req(
    `/companies/${company._id}/webhook/deliveries/${filtered[0]._id}`,
    { headers: h },
  );
  if (!detail.url?.includes('httpbin')) throw new Error('Webhook detail missing url');
  console.log('Webhook detail OK');

  const purge = await req(`/companies/${company._id}/audit/purge`, {
    method: 'POST',
    headers: h,
    body: '{}',
  });
  if (purge.notify === undefined) throw new Error('Purge missing notify field');
  console.log('Purge notify metadata OK, enabled:', purge.notify.enabled);

  console.log('Phase 25 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
