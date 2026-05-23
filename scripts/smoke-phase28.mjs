/** Phase 28: preorder converted_to_sale + webhook events */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
try {
  const reg = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email: `p28-${Date.now()}@lz3c.local`, password: 'ChangeMe123!', displayName: 'P28' }) });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };
  const co = await req('/companies', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'P28' }) });
  const h = { ...auth, 'X-Company-Id': co._id };
  await req(`/companies/${co._id}/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ webhookUrl: 'https://httpbin.org/post' }) });
  const taxes = await req('/tax-categories', { headers: h });
  const st = await req('/stores', { method: 'POST', headers: h, body: JSON.stringify({ name: 'S' }) });
  const hs = { ...h, 'X-Store-Id': st._id };
  const prod = await req('/products', { method: 'POST', headers: hs, body: JSON.stringify({ name: 'P', productType: 'sku', skuCode: 'P28', costPrice: 10, wholesalePrice: 15, retailPrice: 20, taxCategoryId: taxes[0]._id }) });
  await req('/inventory/inbound', { method: 'POST', headers: hs, body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 5 }] }) });
  const pre = await req('/preorders', { method: 'POST', headers: hs, body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 1, unitPriceIncVat: 100 }], depositAmount: 20 }) });
  await req(`/preorders/${pre._id}/deposit`, { method: 'POST', headers: hs, body: JSON.stringify({ amount: 20 }) });
  await req(`/preorders/${pre._id}/ready`, { method: 'POST', headers: hs, body: '{}' });
  const converted = await req(`/preorders/${pre._id}/convert`, { method: 'POST', headers: hs, body: JSON.stringify({ paymentMethod: 'cash' }) });
  if (converted.status !== 'converted_to_sale') throw new Error(`Expected converted_to_sale got ${converted.status}`);
  await new Promise((r) => setTimeout(r, 3500));
  const deliveries = await req(`/companies/${co._id}/webhook/deliveries?event=preorder.convert`, { headers: h });
  if (!deliveries.some((d) => d.event === 'preorder.convert')) throw new Error('preorder.convert webhook missing');
  console.log('Phase 28 smoke OK');
} catch (e) { console.error('FAIL:', e.message); process.exit(1); }
