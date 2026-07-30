import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';
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

const APPLY = process.argv.includes('--apply');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('lz3c');

const companies = await db
  .collection('companies')
  .find({})
  .project({ name: 1 })
  .toArray();

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} (${companies.length} companies)\n`);

let totalMatched = 0;
let totalModified = 0;
let totalAlready = 0;
let companiesSkipped = 0;

for (const co of companies) {
  const taxes = await db
    .collection('tax_categories')
    .find({ companyId: co._id })
    .project({ name: 1, scheme: 1, isDefault: 1 })
    .toArray();

  const target =
    taxes.find((t) => /23%.*new goods/i.test(t.name)) ||
    taxes.find((t) => t.scheme === 'standard_23' && t.isDefault) ||
    taxes.find((t) => t.scheme === 'standard_23');

  if (!target) {
    console.log(`[skip] ${co.name} — no standard_23 / New goods tax category`);
    companiesSkipped++;
    continue;
  }

  const productCount = await db.collection('products').countDocuments({ companyId: co._id });
  const already = await db.collection('products').countDocuments({
    companyId: co._id,
    taxCategoryId: target._id,
  });
  const needUpdate = productCount - already;

  const byTax = await db
    .collection('products')
    .aggregate([
      { $match: { companyId: co._id } },
      { $group: { _id: '$taxCategoryId', count: { $sum: 1 } } },
    ])
    .toArray();

  const taxName = (id) => {
    const t = taxes.find((x) => String(x._id) === String(id));
    return t ? `${t.name} (${t.scheme})` : String(id);
  };

  console.log(`${co.name}`);
  console.log(`  target: ${target.name} [${target.scheme}] ${target._id}`);
  console.log(`  products: ${productCount} (already correct: ${already}, to update: ${needUpdate})`);
  for (const row of byTax) {
    console.log(`    - ${taxName(row._id)}: ${row.count}`);
  }

  if (APPLY && needUpdate > 0) {
    const res = await db.collection('products').updateMany(
      { companyId: co._id, taxCategoryId: { $ne: target._id } },
      { $set: { taxCategoryId: target._id } },
    );
    totalMatched += res.matchedCount;
    totalModified += res.modifiedCount;
    console.log(`  updated: matched=${res.matchedCount} modified=${res.modifiedCount}`);
  } else {
    totalMatched += needUpdate;
  }
  totalAlready += already;
  console.log('');
}

console.log('---');
console.log(`already correct: ${totalAlready}`);
console.log(`${APPLY ? 'modified' : 'would update'}: ${APPLY ? totalModified : totalMatched}`);
console.log(`companies without target tax: ${companiesSkipped}`);
if (!APPLY) console.log('\nRe-run with --apply to write changes.');

await client.close();
