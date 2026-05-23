/** Phase 27: credit notes list + print */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) {
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return { html: true, text: await res.text() };
  }
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
try {
  const reg = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email: `p27-${Date.now()}@lz3c.local`, password: 'ChangeMe123!', displayName: 'P27' }) });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };
  const co = await req('/companies', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'P27' }) });
  const h = { ...auth, 'X-Company-Id': co._id };
  const taxes = await req('/tax-categories', { headers: h });
  const st = await req('/stores', { method: 'POST', headers: h, body: JSON.stringify({ name: 'S' }) });
  const hs = { ...h, 'X-Store-Id': st._id };
  const prod = await req('/products', { method: 'POST', headers: hs, body: JSON.stringify({ name: 'P', productType: 'sku', skuCode: 'P27', costPrice: 10, wholesalePrice: 15, retailPrice: 20, taxCategoryId: taxes[0]._id }) });
  const pre = await req('/preorders', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      lines: [{ productId: prod._id, quantity: 1, unitPriceIncVat: 100 }],
      depositAmount: 25,
    }),
  });
  await req(`/preorders/${pre._id}/deposit`, { method: 'POST', headers: hs, body: JSON.stringify({ amount: 25 }) });
  await req(`/preorders/${pre._id}/cancel`, { method: 'POST', headers: hs, body: '{}' });
  const list = await req('/credit-notes', { headers: hs });
  if (!list.length) throw new Error('No credit notes');
  const html = await req(`/credit-notes/${list[0]._id}/print`, { headers: hs });
  if (!html.text.includes('CREDIT NOTE')) throw new Error('Print HTML invalid');
  console.log('Phase 27 smoke OK');
} catch (e) { console.error('FAIL:', e.message); process.exit(1); }
