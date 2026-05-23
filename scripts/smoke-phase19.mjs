/**
 * Phase 19: invite list/revoke, audit enrichment & pagination, extended audit actions
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

const adminEmail = `p19-admin-${Date.now()}@lz3c.local`;
const inviteEmail = `p19-invite-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P19 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P19 Co' }),
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
    body: JSON.stringify({ name: 'P19 Store' }),
  });
  const hs = { ...h, 'X-Store-Id': store._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P19',
      productType: 'sku',
      skuCode: 'P19',
      costPrice: 10,
      wholesalePrice: 15,
      retailPrice: 20,
      taxCategoryId: taxes[0]._id,
    }),
  });

  const invite = await req(`/companies/${company._id}/invites`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: inviteEmail,
      role: 'cashier',
      storeId: store._id,
    }),
  });

  const pending = await req(`/companies/${company._id}/invites`, { headers: h });
  if (!pending.some((i) => i.email === inviteEmail)) {
    throw new Error('Pending invite list missing new invite');
  }
  console.log('Pending invites:', pending.length);

  await req(`/companies/${company._id}/invites/${invite._id}`, {
    method: 'DELETE',
    headers: h,
  });
  const afterRevoke = await req(`/companies/${company._id}/invites`, { headers: h });
  if (afterRevoke.some((i) => i.email === inviteEmail)) {
    throw new Error('Revoked invite still listed');
  }
  console.log('Revoke invite OK');

  const invite2 = await req(`/companies/${company._id}/invites`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: inviteEmail,
      role: 'cashier',
      storeId: store._id,
    }),
  });

  const inviteReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: inviteEmail,
      password: 'ChangeMe123!',
      displayName: 'P19 Cashier',
    }),
  });
  await req('/auth/accept-invite', {
    method: 'POST',
    headers: { Authorization: `Bearer ${inviteReg.accessToken}` },
    body: JSON.stringify({ token: invite2.token }),
  });
  console.log('Invite accept OK');

  await req('/inventory/inbound', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ lines: [{ productId: prod._id, quantity: 2 }] }),
  });

  const store2 = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P19 Store B' }),
  });

  const tr = await req('/transfers', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      toStoreId: store2._id,
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });
  await req(`/transfers/${tr._id}/transition`, {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ status: 'confirmed' }),
  });

  const b2b = await req('/b2b/orders', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      buyerStoreId: store._id,
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const allEvents = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ from: today, to: today, limit: '20' });
    if (cursor) qs.set('before', cursor);
    const page = await req(`/audit?${qs}`, { headers: h });
    allEvents.push(...(page.events ?? []));
    cursor = page.nextCursor;
  } while (cursor);

  if (!allEvents.length) throw new Error('Audit events empty');
  if (!allEvents[0].userEmail) throw new Error('Audit missing userEmail');
  console.log('Audit enriched:', allEvents.length, 'user:', allEvents[0].userEmail);

  const actions = new Set(allEvents.map((e) => e.action));
  const required = ['company.invite', 'company.invite_accept', 'inventory.inbound', 'transfer.create', 'b2b.create'];
  for (const a of required) {
    if (!actions.has(a)) {
      throw new Error(`Missing audit action: ${a} (have: ${[...actions].join(', ')})`);
    }
  }
  console.log('Audit actions OK:', [...actions].join(', '));

  if (allEvents.length > 20) {
    console.log('Audit pagination OK (multi-page fetch)');
  }

  console.log('Phase 19 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
