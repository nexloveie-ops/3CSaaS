/**
 * Regression: GET /auth/me must return memberships when user has them.
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const login = await req('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 't1@test.com', password: '12345678' }),
});

const me = await req('/auth/me', {
  headers: { Authorization: `Bearer ${login.accessToken}` },
});

if (!me.memberships?.length) {
  throw new Error('/auth/me returned empty memberships — cashier routing will break');
}
if (me.memberships[0].role !== 'cashier') {
  throw new Error(`expected cashier role, got ${me.memberships[0].role}`);
}
console.log('OK smoke-auth-me for t1@test.com');
