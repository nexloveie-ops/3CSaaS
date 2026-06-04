import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';

const envPath = resolve('.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    if (!process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

const email = process.argv[2] ?? 'toys123ie@gmail.com';
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('No MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const user = await db.collection('users').findOne({ email: email.toLowerCase() });
if (!user) {
  console.log('User not found');
  await client.close();
  process.exit(0);
}

const memberships = await db.collection('memberships').find({ userId: user._id }).toArray();
const companyIds = memberships.map((m) => m.companyId);
const storeIds = memberships.filter((m) => m.storeId).map((m) => m.storeId);
const companies = companyIds.length
  ? await db.collection('companies').find({ _id: { $in: companyIds } }).toArray()
  : [];
const stores = storeIds.length
  ? await db.collection('stores').find({ _id: { $in: storeIds } }).toArray()
  : [];
const companyById = Object.fromEntries(companies.map((x) => [x._id.toString(), x.name]));
const storeById = Object.fromEntries(stores.map((x) => [x._id.toString(), x.name]));

console.log(
  JSON.stringify(
    {
      user: {
        email: user.email,
        displayName: user.displayName,
        isSuperAdmin: !!user.isSuperAdmin,
        isActive: user.isActive !== false,
      },
      memberships: memberships.map((m) => ({
        role: m.role,
        company: companyById[m.companyId.toString()] ?? m.companyId.toString(),
        store: m.storeId ? (storeById[m.storeId.toString()] ?? m.storeId.toString()) : null,
      })),
    },
    null,
    2,
  ),
);

await client.close();
