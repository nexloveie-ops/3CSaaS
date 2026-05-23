/** Phase 29: audit purge HTML notify metadata */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
try {
  const reg = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email: `p29-${Date.now()}@lz3c.local`, password: 'ChangeMe123!', displayName: 'P29' }) });
  const auth = { Authorization: `Bearer ${reg.accessToken}` };
  const co = await req('/companies', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'P29' }) });
  const h = { ...auth, 'X-Company-Id': co._id };
  const purge = await req(`/companies/${co._id}/audit/purge`, { method: 'POST', headers: h, body: '{}' });
  if (!purge.notify || purge.notify.enabled !== false) throw new Error('notify shape wrong');
  console.log('Phase 29 smoke OK (notify disabled without AUDIT_PURGE_NOTIFY=1)');
} catch (e) { console.error('FAIL:', e.message); process.exit(1); }
