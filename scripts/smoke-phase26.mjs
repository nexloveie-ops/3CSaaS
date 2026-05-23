/** Phase 26: webhook CSV, retry-all, invite preview locale */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/csv')) return { csv: true, text: await res.text() };
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
try {
  const reg = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email: `p26-${Date.now()}@lz3c.local`, password: 'ChangeMe123!', displayName: 'P26' }) });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };
  const co = await req('/companies', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'P26' }) });
  const h = { ...auth, 'X-Company-Id': co._id };
  await req(`/companies/${co._id}/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ inviteEmailNoteZh: 'ZHONLY' }) });
  const prev = await req(`/companies/${co._id}/invites/preview`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'a@b.com', role: 'manager', locale: 'zh' }) });
  if (!prev.html.includes('ZHONLY')) throw new Error('locale preview failed');
  await req(`/companies/${co._id}/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ webhookUrl: 'https://httpbin.org/status/500' }) });
  const taxes = await req('/tax-categories', { headers: h });
  const st = await req('/stores', { method: 'POST', headers: h, body: JSON.stringify({ name: 'S' }) });
  const hs = { ...h, 'X-Store-Id': st._id };
  const p = await req('/products', { method: 'POST', headers: hs, body: JSON.stringify({ name: 'P', productType: 'sku', skuCode: 'P26', costPrice: 10, wholesalePrice: 15, retailPrice: 20, taxCategoryId: taxes[0]._id }) });
  await req('/inventory/inbound', { method: 'POST', headers: hs, body: JSON.stringify({ lines: [{ productId: p._id, quantity: 2 }] }) });
  await req('/pos/sales', { method: 'POST', headers: hs, body: JSON.stringify({ paymentMethod: 'cash', lines: [{ productId: p._id, quantity: 1 }] }) });
  await new Promise((r) => setTimeout(r, 3500));
  await req(`/companies/${co._id}/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ webhookUrl: 'https://httpbin.org/post' }) });
  const retryAll = await req(`/companies/${co._id}/webhook/deliveries/retry-failed`, { method: 'POST', headers: h, body: '{}' });
  if (!retryAll.attempted && retryAll.attempted !== 0) throw new Error('retry-all bad response');
  const csv = await req(`/companies/${co._id}/webhook/deliveries/export.csv`, { headers: h });
  if (!csv.text?.includes('event')) throw new Error('CSV export invalid');
  console.log('Phase 26 smoke OK');
} catch (e) { console.error('FAIL:', e.message); process.exit(1); }
