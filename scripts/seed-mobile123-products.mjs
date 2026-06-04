/**
 * Seed demo products + Mobile123 store stock for testing store-catalog / POS.
 * Usage: node scripts/seed-mobile123-products.mjs
 * Idempotent: upserts by companyId + skuCode (DEMO-* prefix).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MongoClient, ObjectId } from 'mongodb';

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

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();

const store = await db.collection('stores').findOne({ name: 'Mobile123' });
if (!store) {
  console.error('Store Mobile123 not found');
  process.exit(1);
}

const companyId = store.companyId;
const storeId = store._id;

const taxes = await db.collection('tax_categories').find({ companyId }).toArray();
const tax23 = taxes.find((t) => t.scheme === 'standard_23');
const taxMargin = taxes.find((t) => t.scheme === 'margin_23');
if (!tax23 || !taxMargin) {
  console.error('Missing tax categories');
  process.exit(1);
}

const categories = await db.collection('catalog_categories').find({ companyId, isActive: true }).toArray();
const catByName = Object.fromEntries(categories.map((c) => [c.name, c._id]));
const pickCat = (...names) => {
  for (const n of names) {
    if (catByName[n]) return catByName[n];
  }
  return categories[0]?._id;
};

const now = new Date();

/** @type {Array<{ sku: string, doc: Record<string, unknown>, qty: number, chainShare?: boolean, posSalable?: boolean }>} */
const seeds = [
  {
    sku: 'DEMO-CABLE-USB-C',
    qty: 24,
    chainShare: true,
    doc: {
      productType: 'simple',
      name: 'Demo USB-C Cable 1m',
      catalogCategoryId: pickCat('Cable', 'Power Adaptor'),
      taxCategoryId: tax23._id,
      costPrice: 3.5,
      wholesalePrice: 5,
      retailPrice: 12.99,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-ADAPTOR-20W',
    qty: 15,
    chainShare: true,
    doc: {
      productType: 'simple',
      name: 'Demo 20W USB-C Power Adaptor',
      catalogCategoryId: pickCat('Power Adaptor', 'Power Supply'),
      taxCategoryId: tax23._id,
      costPrice: 8,
      wholesalePrice: 12,
      retailPrice: 24.99,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-CASE-IP15',
    qty: 30,
    chainShare: false,
    doc: {
      productType: 'sku',
      name: 'Demo Silicone Case iPhone 15',
      catalogCategoryId: pickCat('Phone Cases', '手机壳'),
      taxCategoryId: tax23._id,
      costPrice: 4,
      wholesalePrice: 7,
      retailPrice: 19.99,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-SCREEN-IP15',
    qty: 40,
    doc: {
      productType: 'simple',
      name: 'Demo Tempered Glass iPhone 15',
      catalogCategoryId: pickCat('Phone Screen Protector', '手机屏保'),
      taxCategoryId: tax23._id,
      costPrice: 2,
      wholesalePrice: 4,
      retailPrice: 14.99,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-PHONE-IP13-128',
    qty: 0,
    doc: {
      productType: 'serialized',
      name: 'Demo Pre-owned iPhone 13 128GB',
      catalogCategoryId: pickCat('Pre-owned Devices', 'Brand New Devices'),
      taxCategoryId: taxMargin._id,
      costPrice: 280,
      retailPrice: 399,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-EARBUDS',
    qty: 12,
    chainShare: true,
    posSalable: true,
    doc: {
      productType: 'simple',
      name: 'Demo Wireless Earbuds',
      catalogCategoryId: pickCat('Car Accessories', 'Laptop Accessories'),
      taxCategoryId: tax23._id,
      costPrice: 15,
      wholesalePrice: 22,
      retailPrice: 49.99,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-MOUNT-CAR',
    qty: 8,
    doc: {
      productType: 'simple',
      name: 'Demo Magnetic Car Phone Mount',
      catalogCategoryId: pickCat('Car Accessories'),
      taxCategoryId: tax23._id,
      costPrice: 6,
      retailPrice: 17.99,
      isActive: true,
    },
  },
  {
    sku: 'DEMO-TABLET-CASE',
    qty: 6,
    doc: {
      productType: 'simple',
      name: 'Demo Tablet Folio Case 10"',
      catalogCategoryId: pickCat('Tablet Cases', '平板保护壳'),
      taxCategoryId: tax23._id,
      costPrice: 10,
      retailPrice: 29.99,
      isActive: true,
    },
  },
];

let productsUpserted = 0;
let positionsUpserted = 0;
let settingsUpserted = 0;
const serialsCreated = [];

for (const seed of seeds) {
  const filter = { companyId, skuCode: seed.sku };
  const update = {
    $set: {
      ...seed.doc,
      companyId,
      skuCode: seed.sku,
      updatedAt: now,
    },
    $setOnInsert: { createdAt: now },
  };

  const result = await db.collection('products').findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: 'after',
  });
  const product = result;
  if (!product?._id) continue;
  productsUpserted += 1;

  if (seed.doc.productType !== 'serialized' && seed.doc.productType !== 'service') {
    await db.collection('inventory_positions').updateOne(
      { companyId, storeId, productId: product._id },
      {
        $set: { quantity: seed.qty, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    positionsUpserted += 1;
  }

  if (seed.doc.productType === 'serialized' && seed.qty === 0) {
    const existingSerials = await db.collection('serial_units').countDocuments({
      companyId,
      productId: product._id,
      currentStoreId: storeId,
      status: 'in_stock',
    });
    const toCreate = Math.max(0, 3 - existingSerials);
    for (let i = 0; i < toCreate; i++) {
      const sn = `${seed.sku}-${Date.now()}-${i}`;
      await db.collection('serial_units').insertOne({
        companyId,
        productId: product._id,
        sn,
        status: 'in_stock',
        purchaseCost: seed.doc.costPrice,
        currentStoreId: storeId,
        createdAt: now,
        updatedAt: now,
      });
      serialsCreated.push(sn);
    }
  }

  const settingSet = {};
  if (seed.chainShare !== undefined) settingSet.chainShareEnabled = seed.chainShare;
  if (seed.posSalable !== undefined) settingSet.posSalable = seed.posSalable;
  if (Object.keys(settingSet).length) {
    await db.collection('store_product_settings').updateOne(
      { storeId, productId: product._id },
      {
        $set: { ...settingSet, companyId, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    settingsUpserted += 1;
  }
}

console.log(
  JSON.stringify(
    {
      store: 'Mobile123',
      storeId: storeId.toString(),
      companyId: companyId.toString(),
      productsUpserted,
      positionsUpserted,
      settingsUpserted,
      serialsCreated,
      demoSkus: seeds.map((s) => s.sku),
    },
    null,
    2,
  ),
);

await client.close();
