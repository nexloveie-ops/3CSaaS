import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MongoClient, ObjectId } from 'mongodb';
import dns from 'dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

function load(p) {
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    if (!process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

load(resolve('.env.local'));
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('lz3c');

const ids = [
  '6a457aadb59270e9e807021f', // L&Z Techserve LTD
  '6a0faedf40da76f823142e8e', // celestia
];

for (const id of ids) {
  const co = await db.collection('companies').findOne({ _id: new ObjectId(id) });
  if (!co) continue;
  const mods = new Set(co.enabledModules || []);
  mods.add('b2b');
  await db.collection('companies').updateOne(
    { _id: co._id },
    { $set: { enabledModules: [...mods] } },
  );
  const updated = await db
    .collection('companies')
    .findOne({ _id: co._id }, { projection: { name: 1, enabledModules: 1 } });
  console.log(updated.name, '=>', updated.enabledModules.join(', '));
}

await client.close();
