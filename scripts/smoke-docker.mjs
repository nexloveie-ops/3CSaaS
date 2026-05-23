/**
 * Smoke test against Docker Compose API (default http://localhost:3000)
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

try {
  const health = await req('/health');
  if (health.status !== 'ok') throw new Error(`Health not ok: ${health.status}`);
  console.log('Docker API health OK:', health.mongo?.db);
  console.log('Docker smoke OK');
} catch (e) {
  console.error('FAIL:', e.message);
  console.error('Start stack: npm run docker:up');
  process.exit(1);
}
