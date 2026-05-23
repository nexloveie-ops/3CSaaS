/**
 * Optional: seed first super-admin user after API is running.
 * Usage: node scripts/seed-admin.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    if (!process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

loadEnvLocal();

const base = process.env.API_URL ?? 'http://localhost:3000/api';
const email = process.env.SEED_EMAIL ?? 'admin@lz3c.local';
const password = process.env.SEED_PASSWORD ?? 'ChangeMe123!';
const displayName = process.env.SEED_NAME ?? 'Platform Admin';

const res = await fetch(`${base}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, displayName }),
});

const body = await res.json();
if (!res.ok) {
  console.log('Seed note:', body.message ?? body);
  process.exit(res.status === 409 ? 0 : 1);
}

console.log('Seeded user:', email);
console.log('Login at /login with the password from SEED_PASSWORD');
