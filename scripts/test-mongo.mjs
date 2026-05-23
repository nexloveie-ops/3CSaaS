import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

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
    const key = t.slice(0, i);
    const val = t.slice(i + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });

try {
  await client.connect();
  const ping = await client.db('admin').command({ ping: 1 });
  const dbName = process.env.MONGODB_DB_NAME ?? 'lz3c';
  const { databases } = await client.db().admin().listDatabases();
  console.log('MongoDB connection: OK');
  console.log('Ping:', JSON.stringify(ping));
  console.log('Target DB:', dbName);
  console.log(
    'Databases:',
    databases.map((d) => d.name).join(', '),
  );
} catch (err) {
  console.error('MongoDB connection: FAILED');
  console.error(err.message);
  process.exit(1);
} finally {
  await client.close();
}
