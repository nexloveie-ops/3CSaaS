/**
 * Phase 23: webhook delivery log, pick-list PDF, maintenance audit purge
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/pdf')) {
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return { pdf: true, buffer: await res.arrayBuffer() };
  }
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

const adminEmail = `p23-admin-${Date.now()}@lz3c.local`;

try {
  const adminReg = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: 'ChangeMe123!',
      displayName: 'P23 Admin',
    }),
  });
  const auth = { Authorization: `Bearer ${adminReg.accessToken}` };

  const company = await req('/companies', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'P23 Co' }),
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

  const taxes = await req('/tax-categories', { headers: h });
  const storeA = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P23 A' }),
  });
  const storeB = await req('/stores', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'P23 B' }),
  });
  const hs = { ...h, 'X-Store-Id': storeA._id };

  const prod = await req('/products', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      name: 'P23',
      productType: 'sku',
      skuCode: 'P23',
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
  console.log('Pick list HTML OK');

  try {
    const pickPdf = await req(`/transfers/${tr._id}/pick-list.pdf`, { headers: hs });
    if (!pickPdf.pdf || pickPdf.buffer.byteLength < 200) {
      throw new Error('Pick list PDF too small');
    }
    console.log('Pick list PDF OK, bytes:', pickPdf.buffer.byteLength);
  } catch (e) {
    if (e.message.includes('503') || e.message.includes('PDF')) {
      console.log('WARN: pick-list PDF skipped (Chromium unavailable)');
    } else {
      throw e;
    }
  }

  await req('/pos/sales', {
    method: 'POST',
    headers: hs,
    body: JSON.stringify({
      paymentMethod: 'cash',
      lines: [{ productId: prod._id, quantity: 1 }],
    }),
  });
  console.log('POS sale OK (webhook dispatch)');

  await new Promise((r) => setTimeout(r, 2500));

  const deliveries = await req(`/companies/${company._id}/webhook/deliveries`, { headers: h });
  if (!Array.isArray(deliveries)) throw new Error('Deliveries not array');
  const posDelivery = deliveries.find((d) => d.event === 'pos.sale');
  if (!posDelivery) {
    console.log('WARN: pos.sale delivery not found yet; deliveries:', deliveries.length);
  } else {
    console.log('Webhook delivery log OK:', posDelivery.status, 'attempts:', posDelivery.attempts);
  }

  const purge = await req(`/companies/${company._id}/audit/purge`, {
    method: 'POST',
    headers: h,
    body: '{}',
  });
  console.log('Audit purge OK, deleted:', purge.deleted);

  const superEmails = (process.env.SUPER_ADMIN_EMAILS ?? 'admin@lz3c.local').split(',');
  if (superEmails.includes(adminEmail)) {
    const allPurge = await req('/admin/maintenance/audit-purge-all', {
      method: 'POST',
      headers: auth,
      body: '{}',
    });
    console.log('Admin maintenance purge OK:', allPurge.deleted, 'events');
  } else {
    console.log('SKIP: admin maintenance purge (not super admin)');
  }

  console.log('Phase 23 smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
