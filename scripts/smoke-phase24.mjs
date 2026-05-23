/**
 * Phase 24: webhook retry, admin deliveries, invite note, maintenance status
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const body = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

const note = 'Welcome to our Dublin store team!';
const adminEmail = `p24-admin-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P24 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P24 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  await req(`/companies/${company._id}/settings`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ inviteEmailNote: note }),
  });

  const preview = await req(`/companies/${company._id}/invites/preview`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: 'inv@lz3c.local', role: 'manager' }),
  });
  if (!preview.html?.includes(note)) throw new Error('Invite preview missing custom note');
  console.log('Invite note in preview OK');

  const taxes = await req('/tax-categories', { headers: h });
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P24 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P24',
      productType: 'sku',
      skuCode: 'P24',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxes[0]._id,
    }),
  });
  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 5 }] }),
  });

  await req(`/companies/${company._id}/settings`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ webhookUrl: 'https://httpbin.org/status/500' }),
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

  let deliveries = await req(`/companies/${company._id}/webhook/deliveries`, { headers: h });
  const failed = deliveries.find((d) => d.status === 'failed');
  if (!failed) throw new Error('Expected failed webhook delivery');
  console.log('Failed webhook delivery OK');

  await req(`/companies/${company._id}/settings`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ webhookUrl: 'https://httpbin.org/post' }),
  });
  const retry = await req(
    `/companies/${company._id}/webhook/deliveries/${failed._id}/retry`,
    { method: 'POST', headers: h, body: '{}' },
  );
  if (!retry.dispatched) throw new Error('Webhook retry did not dispatch');
  console.log('Webhook retry OK, attempts:', retry.attempts);

  await new Promise((r) => setTimeout(r, 1500));
  deliveries = await req(`/companies/${company._id}/webhook/deliveries`, { headers: h });
  if (!deliveries.some((d) => d.status === 'success' && d.event === 'pos.sale')) {
    throw new Error('No success delivery after retry');
  }

  const purge = await req(`/companies/${company._id}/audit/purge`, {
    method: 'POST',
    headers: h,
    body: '{}',
  });
  if (!purge.lastAuditPurgeAt) throw new Error('Missing lastAuditPurgeAt');
  console.log('Company purge + maintenance OK');

  const maint = await req(`/companies/${company._id}/maintenance/status`, { headers: h });
  if (maint.lastAuditPurgeAt !== purge.lastAuditPurgeAt) {
    throw new Error('Maintenance status mismatch');
  }
  console.log('Company maintenance status OK');

  const superEmails = (process.env.SUPER_ADMIN_EMAILS ?? 'admin@lz3c.local').split(',');
  if (superEmails.includes(adminEmail)) {
    const global = await req('/admin/webhook/deliveries', { headers: auth });
    if (!Array.isArray(global) || !global.length) throw new Error('Admin webhook list empty');
    const status = await req('/admin/maintenance/status', { headers: auth });
    console.log('Admin webhook list OK:', global.length, 'auto-purge:', status.auditAutoPurgeEnabled);
    const allPurge = await req('/admin/maintenance/audit-purge-all', {
      method: 'POST',
      headers: auth,
      body: '{}',
    });
    const status2 = await req('/admin/maintenance/status', { headers: auth });
    if (!status2.lastAuditPurgeAt) throw new Error('Global purge status not updated');
    console.log('Admin maintenance purge OK, deleted:', allPurge.deleted);
  } else {
    console.log('SKIP: admin endpoints (not super admin)');
  }

  console.log('Phase 24 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
