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

const NAME_EN_BY_ZH = {
  '4人卡座': '4-person booth seating',
  '2人卡座': '2-person booth seating',
  纸巾: 'Tissue',
  包装袋大号: 'Large packaging bag',
  包装袋小号: 'Small packaging bag',
  H154内托: 'H154 inner tray',
  'H154餐盒/盖子': 'H154 meal box / lid',
  'SZ601碗750ml': 'SZ601 bowl 750ml',
  SZ602盖子: 'SZ602 lid',
  'SZ701碗360ml': 'SZ701 bowl 360ml',
  SZ702盖子: 'SZ702 lid',
  '无纺布 中号500个': 'Non-woven fabric medium (500 pcs)',
  甘草粉: 'Licorice powder',
  陈皮粉: 'Dried tangerine peel powder',
  八角粉: 'Star anise powder',
  盐焗粉: 'Salt-baked seasoning powder',
  肉宝王: 'Meat seasoning (Rou Bao Wang)',
  '2人桌': '2-person table',
  '4人桌': '4-person table',
  椅子: 'Chair',
  'H116 汤杯': 'H116 soup cup',
  外卖3件套: 'Takeaway 3-piece set',
};

const CJK = /[\u3400-\u9FFF]/;

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('lz3c');

const products = await db
  .collection('products')
  .find({})
  .project({ name: 1, nameEn: 1, skuCode: 1 })
  .toArray();

let updated = 0;
for (const p of products) {
  const mapped = NAME_EN_BY_ZH[p.name];
  let nameEn = p.nameEn?.trim() || mapped || null;

  // If still Chinese-only / mixed Chinese without mapping, build a safe English label
  if ((!nameEn || CJK.test(nameEn)) && CJK.test(p.name)) {
    if (mapped) nameEn = mapped;
    else if (p.skuCode?.trim()) nameEn = `Item ${p.skuCode.trim()}`;
    else {
      // keep Latin/digit tokens from the name when possible
      const latin = p.name
        .replace(CJK, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      nameEn = latin || `Product ${String(p._id).slice(-6)}`;
    }
  }

  if (!nameEn || nameEn === p.nameEn) {
    if (mapped && p.nameEn !== mapped) {
      await db.collection('products').updateOne({ _id: p._id }, { $set: { nameEn: mapped } });
      updated++;
      console.log(`${p.name} -> ${mapped}`);
    }
    continue;
  }

  await db.collection('products').updateOne({ _id: p._id }, { $set: { nameEn } });
  updated++;
  console.log(`${p.name} -> ${nameEn}`);
}

console.log(`Updated nameEn on ${updated} products`);
await client.close();
