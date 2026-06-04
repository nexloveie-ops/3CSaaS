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

const nameQuery = process.argv[2] ?? 'Pre-owned iPhone 12 mini 128GB';
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

const products = await db
  .collection('products')
  .find({ name: new RegExp(nameQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
  .toArray();

if (!products.length) {
  console.log('Product not found:', nameQuery);
  await client.close();
  process.exit(0);
}

async function storeName(id) {
  if (!id) return null;
  const s = await db.collection('stores').findOne({ _id: id });
  return s?.name ?? id.toString();
}

const out = [];
for (const p of products) {
  const [company, tax, cat, parent] = await Promise.all([
    db.collection('companies').findOne({ _id: p.companyId }),
    p.taxCategoryId ? db.collection('tax_categories').findOne({ _id: p.taxCategoryId }) : null,
    p.catalogCategoryId ? db.collection('catalog_categories').findOne({ _id: p.catalogCategoryId }) : null,
    p.parentProductId ? db.collection('products').findOne({ _id: p.parentProductId }) : null,
  ]);

  const positions = await db.collection('inventory_positions').find({ productId: p._id }).toArray();
  const serials = await db.collection('serial_units').find({ productId: p._id }).toArray();
  const settings = await db.collection('store_product_settings').find({ productId: p._id }).toArray();

  out.push({
    product: {
      _id: p._id.toString(),
      name: p.name,
      productType: p.productType,
      skuCode: p.skuCode ?? null,
      company: company?.name,
      catalogCategory: cat?.name ?? null,
      parentProduct: parent?.name ?? null,
      variantValues: p.variantValues ?? null,
      variantDimensions: p.variantDimensions ?? null,
      costPrice: p.costPrice,
      wholesalePrice: p.wholesalePrice ?? null,
      retailPrice: p.retailPrice ?? null,
      isActive: p.isActive !== false,
      taxCategory: tax ? { name: tax.name, scheme: tax.scheme } : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    },
    inventoryByStore: await Promise.all(
      positions.map(async (pos) => ({
        store: await storeName(pos.storeId),
        quantity: pos.quantity,
      })),
    ),
    serialUnits: await Promise.all(
      serials.map(async (s) => ({
        _id: s._id.toString(),
        sn: s.sn,
        status: s.status,
        store: await storeName(s.currentStoreId),
        purchaseCost: s.purchaseCost,
      })),
    ),
    storeSettings: await Promise.all(
      settings.map(async (s) => ({
        store: await storeName(s.storeId),
        posSalable: s.posSalable !== false,
        chainShareEnabled: !!s.chainShareEnabled,
      })),
    ),
  });
}

console.log(JSON.stringify(out, null, 2));
await client.close();
