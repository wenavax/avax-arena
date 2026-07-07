// snapshot (Salvor 3431 + Joepegs verified flag) → kompakt tier'lı verified map.
// Joepegs verified = trust gate; Salvor d7 volume + saleCount = liquidity tier.
// Anti-abuse: sales_d7>=3 for any liquidity tier; wash-spike floor frozen.
// Output: lib/data/verifiedCollections.json  { "0xaddr": { name, tier, floorAvax } }
import fs from 'fs';
import path from 'path';

const SNAP = 'scripts/data-salvor-verified-20260707.json';
const OUT = 'lib/data/verifiedCollections.json';

const rows = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const num = (v) => (v === undefined || v === null ? 0 : parseFloat(v) || 0);
const floorAll = (r) => num((r.floor || {}).all);
const floorD7 = (r) => num((r.floor || {}).d7);
const volD7 = (r) => num((r.volume || {}).d7);
const salesD7 = (r) => parseInt(r.saleCount_d7 || 0, 10);

const RANK = ['C', 'B', 'A', 'S'];
function bumpUp(t) {
  const i = RANK.indexOf(t);
  return i >= 0 && i < RANK.length - 1 ? RANK[i + 1] : t;
}

const out = {};
let counts = { S: 0, A: 0, B: 0, C: 0 };
for (const r of rows) {
  const v = r.joepegs_verified;
  if (v !== 'verified' && v !== 'verified_trusted') continue; // trust gate
  const vol = volD7(r);
  const sales = salesD7(r);
  const fAll = floorAll(r);
  const fD7 = floorD7(r);

  let tier;
  if (v === 'verified_trusted' || (vol >= 50 && sales >= 10)) tier = 'S';
  else if (vol >= 15 && sales >= 5) tier = 'A';
  else if (vol >= 2 && sales >= 3) tier = 'B';
  else tier = 'C'; // verified ama az/sıfır hacim (floor-only)

  // floor secondary bump — yalnız gerçek likidite varsa ve wash-spike değilse
  const washSpike = fD7 > 0 && fAll / fD7 > 2;
  if (fAll >= 5 && sales >= 3 && !washSpike) tier = bumpUp(tier);

  const addr = String(r.address).toLowerCase();
  out[addr] = { name: r.name || 'Unknown', tier, floorAvax: fAll || undefined };
  counts[tier]++;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(`${Object.keys(out).length} verified koleksiyon tier'landı → ${OUT}`);
console.log('dağılım:', JSON.stringify(counts));
