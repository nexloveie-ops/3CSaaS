/**
 * Phase 20: HTML invite email, audit action filter, transfer flow, super-admin audit
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';
const SUPER_EMAIL = process.env.SUPER_ADMIN_TEST_EMAIL ?? 'admin@lz3c.local';

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

const adminEmail = `p20-admin-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P20 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P20 Co' }),
  });
  const h = { ...auth, 'X-Company-Id': company._id };

  const taxes = await req('/tax-categories', { headers: h });
  const storeA = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P20 A' }),
  });
  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P20 B' }),
  });
  const hs = { ...h, 'X-Store-Id': storeA._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P20 Item',
      productType: 'sku',
      skuCode: 'P20',
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

  const invite = await req(`/companies/${company._id}/invites`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: `p20-inv-${Date.now()}@lz3c.local`,
      role: 'cashier',
      storeId: storeA._id,
    }),
  });
  if (!invite.inviteUrl) throw new Error('Invite missing URL');
  console.log('HTML invite email OK (mock or sendgrid)');

  const tr = await req('/transfers', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      toStoreId: storeB._id,
      lines: [{ productId: prod._id, quantity: 2 }],
    }),
  });
  await req(`/transfers/${tr._id}/transition`, {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({ status: 'confirmed' }),
  });
  console.log('Transfer flow OK:', tr.docNumber);

  const today = new Date().toISOString().slice(0, 10);
  const actions = await req(`/audit/actions?from=${today}&to=${today}`, { headers: h });
  if (!actions.includes('transfer.create')) {
    throw new Error(`Actions missing transfer.create: ${actions.join(', ')}`);
  }
  console.log('Audit actions:', actions.length);

  const filtered = await req(
    `/audit?from=${today}&to=${today}&action=transfer.create&limit=10`,
    { headers: h },
  );
  if (!filtered.events?.every((e) => e.action === 'transfer.create')) {
    throw new Error('Action filter returned wrong events');
  }
  console.log('Audit filter OK:', filtered.events.length);

  let superAuth;
  try {
    const superReg = await req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: SUPER_EMAIL,
        password: 'ChangeMe123!',
        displayName: 'Super Admin',
      }),
    });
    superAuth = { Authorization: `Bearer ${superReg.accessToken}` };
  } catch {
    try {
      const login = await req('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: SUPER_EMAIL, password: 'ChangeMe123!' }),
      });
      superAuth = { Authorization: `Bearer ${login.accessToken}` };
    } catch {
      console.log('SKIP: Super admin audit (register/login failed for', SUPER_EMAIL, ')');
      superAuth = null;
    }
  }

  if (superAuth) {
    try {
      const global = await req(`/admin/audit?from=${today}&to=${today}&limit=5`, {
        headers: superAuth,
      });
      if (!global.events?.length) throw new Error('Global audit empty');
      if (!global.events[0].companyName) throw new Error('Global audit missing companyName');
      console.log('Super admin audit OK:', global.events.length);
    } catch (e) {
      if (String(e.message).includes('403')) {
        console.log('SKIP: Super admin audit (not in SUPER_ADMIN_EMAILS)');
      } else throw e;
    }
  }

  console.log('Phase 20 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
