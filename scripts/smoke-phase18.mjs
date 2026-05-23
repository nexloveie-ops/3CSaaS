/**
 * Phase 18: invite flow, range CSV, audit log
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

const adminEmail = `p18-admin-${Date.now()}@lz3c.local`;
const inviteEmail = `p18-invite-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P18 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P18 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  const plans = await req('/subscription/plans');
  const ent = plans.find((p) => p.slug === 'enterprise');
  if (ent) {
    await req('/subscription/dev/apply-plan', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ planId: ent._id }),
    });
  }

  const taxes = await req('/tax-categories', { headers: h });
  const store = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P18 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P18',
      productType: 'sku',
      skuCode: 'P18',
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

  const today = new Date().toISOString().slice(0, 10);
  await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  const rangeCsv = await req(`/reports/range/export.csv?from=${today}&to=${today}`, {
    headers: hs,
  });
  if (!rangeCsv.csv || !rangeCsv.text.includes('docNumber')) {
    throw new Error('Range CSV failed');
  }
  console.log('Range CSV OK');

  const invite = await req(`/companies/${company._id}/invites`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: inviteEmail,
      role: 'cashier',
      storeId: store._id,
    }),
  });
  console.log('Invite URL:', invite.inviteUrl?.slice(0, 60), '...');

  const preview = await req(`/invites/${invite.token}`);
  if (!preview.valid) throw new Error('Invite preview invalid');
  console.log('Invite preview OK:', preview.companyName);

  const inviteReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: inviteEmail,
      password: 'ChangeMe123!',
      displayName: 'P18 Cashier',
    }),
  });
  const accepted = await req('/auth/accept-invite', {
    method: 'POST',
    headers: { Authorization: `Bearer ${inviteReg.accessToken}` },
    body: JSON.stringify({ token: invite.token }),
  });
  if (!accepted.companyId) throw new Error('Accept failed');
  console.log('Invite accepted OK');

  const b2b = await req('/b2b/orders', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      buyerStoreId: store._id,
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });
  await req(`/b2b/orders/${b2b._id}/transition`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ status: 'confirmed' }),
  });

  const auditRes = await req(`/audit?from=${today}&to=${today}`, { headers: h });
  const audit = auditRes.events ?? auditRes;
  const hasB2b = audit.some((e) => e.action === 'b2b.transition');
  const hasInbound = audit.some((e) => e.action === 'inventory.inbound');
  const hasPos = audit.some((e) => e.action === 'pos.sale');
  if (!hasB2b || !hasInbound || !hasPos) {
    throw new Error(`Audit missing events: b2b=${hasB2b} inbound=${hasInbound} pos=${hasPos}`);
  }
  console.log('Audit events:', audit.length);

  console.log('Phase 18 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
