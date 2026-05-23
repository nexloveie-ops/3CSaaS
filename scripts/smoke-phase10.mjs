/**
 * Phase 10: i18n — user locale, company locale settings, overrides
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

const email = `p10-${Date.now()}@lz3c.local`;
const reg = await req('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password: 'ChangeMe123!',
    displayName: 'P10',
    locale: 'zh',
  }),
});
const auth = { Authorization: `Bearer ${reg.accessToken}` };

let me = await req('/auth/me', { headers: auth });
if (me.user.locale !== 'zh') throw new Error('Register locale not zh');

await req('/auth/locale', {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ locale: 'en' }),
});
me = await req('/auth/me', { headers: auth });
if (me.user.locale !== 'en') throw new Error('PATCH user locale failed');

const co = await req('/companies', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Locale Co' }),
});
const h = { ...auth, 'X-Company-Id': co._id };

const updated = await req(`/companies/${co._id}/locale`, {
  method: 'PATCH',
  headers: h,
  body: JSON.stringify({
    defaultLocale: 'zh',
    localeOverrides: { zh: { nav: { products: '货品' } } },
  }),
});

if (updated.defaultLocale !== 'zh') throw new Error('Company defaultLocale not zh');
if (updated.localeOverrides?.zh?.nav?.products !== '货品') {
  throw new Error('Company localeOverrides not saved');
}

console.log('User locale:', me.user.locale);
console.log('Company defaultLocale:', updated.defaultLocale);
console.log('Override nav.products:', updated.localeOverrides.zh.nav.products);
console.log('Phase 10 smoke OK');
