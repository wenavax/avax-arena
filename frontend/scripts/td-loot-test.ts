// frontend/scripts/td-loot-test.ts
// Faz 9A.0 — loot tablosu kapsama çapası.
//
// rollLoot tabloda anahtar bulamazsa SESSİZCE boş dizi döner: yeni bir canavar
// eklenip loot'u yazılmazsa oyun hiç şikâyet etmez, sadece o canavar hiçbir şey
// düşürmez. Bu dosya o sessizliği gürültüye çevirir — Faz 8'in derleme-zamanı
// DECO_SPEC çaparının runtime karşılığı.

import { LOOT_TABLES, rollLoot, hasLootTable, RARITY_COLORS, SELL_PRICES, type Rarity } from '../lib/game/lootTables';
import { REGION_MONSTERS, DUNGEON_ROSTERS } from '../lib/game/td/monsterData';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RANK: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };

// ─────────────────────────────────────────────────────────────────────────────
// (a) 🔒 %100 KAPSAMA — monsterData'daki HER tip bir tabloya isabet etmeli
// ─────────────────────────────────────────────────────────────────────────────
const allTypes = new Set<string>();
for (const list of Object.values(REGION_MONSTERS)) for (const m of list) allTypes.add(m.type);
for (const r of Object.values(DUNGEON_ROSTERS)) {
  for (const m of r.pool) allTypes.add(m.type);
  allTypes.add(r.boss.type);
}
const types = [...allTypes].sort();
console.log('monsterData tip sayısı:', types.length, '· LOOT_TABLES anahtar:', Object.keys(LOOT_TABLES).length);

const uncovered = types.filter(t => !hasLootTable(t));
if (uncovered.length) console.error('KAPSANMAYAN TİPLER:', uncovered.join(', '));
ok('coverage-100pct', uncovered.length === 0);
// hasLootTable ile rollLoot aynı anahtarı görmeli (lookup ayrışmasın)
ok('has-matches-roll', types.every(t => hasLootTable(t) === (LOOT_TABLES[t.replace(/^elite_/, '')] !== undefined || LOOT_TABLES[t] !== undefined)));
// bilinmeyen tip hâlâ boş dönmeli (sözleşme korunuyor, patlamıyor)
ok('unknown-type-empty', rollLoot('definitely_not_a_monster_xyz').length === 0);
ok('unknown-type-not-covered', !hasLootTable('definitely_not_a_monster_xyz'));

// ─────────────────────────────────────────────────────────────────────────────
// (b) Tablo bütünlüğü — chance aralığı, item.id, geçerli rarity
// ─────────────────────────────────────────────────────────────────────────────
let entryCount = 0;
for (const [key, table] of Object.entries(LOOT_TABLES)) {
  ok(`table-${key}-nonempty`, Array.isArray(table) && table.length > 0);
  for (const e of table) {
    entryCount++;
    ok(`table-${key}-chance-range`, typeof e.chance === 'number' && e.chance > 0 && e.chance <= 1);
    ok(`table-${key}-item-id`, typeof e.item?.id === 'string' && e.item.id.length > 0);
    ok(`table-${key}-item-name`, typeof e.item?.name === 'string' && e.item.name.length > 0);
    ok(`table-${key}-rarity-valid`, RARITIES.includes(e.rarity));
    ok(`table-${key}-count-1`, e.item.count === 1);
  }
}
console.log('toplam loot girdisi:', entryCount);
// RARITY_COLORS her rarity için tanımlı (yerdeki eşya ışıması 9A.1'de buna bakacak)
ok('rarity-colors-complete', RARITIES.every(r => typeof RARITY_COLORS[r] === 'number'));
// aynı tablo içinde aynı item iki kez listelenmesin (çift düşürme riski)
ok('no-dup-item-in-table', Object.entries(LOOT_TABLES).every(([, t]) => new Set(t.map(e => e.item.id)).size === t.length));
// SELL_PRICES'taki fiyatlar pozitif (ekonomi çapası; materyaller bilinçli olarak dışarıda)
ok('sell-prices-positive', Object.values(SELL_PRICES).every(v => typeof v === 'number' && v > 0));

// ─────────────────────────────────────────────────────────────────────────────
// (c) Kalibrasyon — geç oyun tipleri erken oyundan daha iyi loot vermeli
// ─────────────────────────────────────────────────────────────────────────────
const bestRank = (k: string) => Math.max(...LOOT_TABLES[k].map(e => RANK[e.rarity]));
// Geç oyun bölgelerinin hiçbir tipi 'common/uncommon' tavanına hapsolmamalı.
// (Taban: mevcut hell_hound/lesser_demon tabloları 'rare' tavanlı — 9A.0'da
//  dokunulmadı, bu yüzden bölge çapası 'rare+'; 9A.0'ın YAZDIĞI geç oyun
//  girdileri için ayrıca 'epic+' isteniyor, aşağıdaki çapa.)
const endgameTypes = [...new Set([
  ...REGION_MONSTERS.voidrealm.map(m => m.type),
  ...REGION_MONSTERS.eternal.map(m => m.type),
  ...REGION_MONSTERS.forge.map(m => m.type),
  ...REGION_MONSTERS.demongate.map(m => m.type),
])];
ok('endgame-loot-is-rare-plus', endgameTypes.every(t => bestRank(t) >= RANK.rare));
// 🔒 9A.0'ın eklediği geç oyun tipleri epic+ vermeli — "endgame'de loot duruyor"
// hissinin asıl panzehiri buydu.
const phase9EndgameTypes = ['hammer_sentinel', 'magma_smith', 'titan_guard', 'succubus', 'blood_knight',
  'infernal_mage', 'chaos_sprite', 'dark_seraphim', 'entropy_demon', 'primordial_beast', 'eternal_flame'];
ok('phase9-endgame-loot-is-epic-plus', phase9EndgameTypes.every(t => hasLootTable(t) && bestRank(t) >= RANK.epic));
// erken bölge trash'i legendary vermemeli (ekonomi bozulmasın)
const earlyTypes = [...new Set([...REGION_MONSTERS.forest, ...REGION_MONSTERS.grassE, ...REGION_MONSTERS.grassS].map(m => m.type))];
ok('early-loot-not-legendary', earlyTypes.every(t => bestRank(t) < RANK.legendary));
// zindan boss'ları trash'ten belirgin cömert olmalı (en yüksek chance ≥ 0.5)
const bossTypes = Object.values(DUNGEON_ROSTERS).map(r => r.boss.type);
ok('boss-tables-generous', bossTypes.every(t => Math.max(...LOOT_TABLES[t].map(e => e.chance)) >= 0.5));

// ─────────────────────────────────────────────────────────────────────────────
// (d) elite_ öneki soyuluyor + elit istatistiksel olarak daha iyi
// ─────────────────────────────────────────────────────────────────────────────
// rollLoot rastgele → tek çağrı boş dönebilir. wolf'un en yüksek chance'ı 0.15,
// 400 denemede en az bir düşüş olmama olasılığı ~0.85^400 ≈ 1e-28 (pratikte sıfır).
const rolled = (t: string, elite: boolean, n: number) => {
  let drops = 0, rankSum = 0;
  for (let i = 0; i < n; i++) for (const d of rollLoot(t, elite)) { drops++; rankSum += RANK[d.rarity]; }
  return { drops, rankSum };
};
ok('elite-prefix-stripped', rolled('elite_wolf', true, 400).drops > 0);
ok('elite-prefix-same-table-as-base', hasLootTable('elite_titan_guard') && hasLootTable('elite_ancient_dragon_king'));

const N = 4000;
for (const t of ['wolf', 'entropy_demon', 'titan_guard']) {
  const base = rolled(t, false, N), elite = rolled(t, true, N);
  console.log(`${t}: normal ${base.drops} düşüş / elit ${elite.drops} düşüş`);
  // chance ×2 → elit belirgin daha çok düşürmeli (%20 marj, rastgelelik payı)
  ok(`elite-drops-more-${t}`, elite.drops > base.drops * 1.2);
  // rarity +1 tier → ortalama kalite de yükselmeli
  ok(`elite-better-rarity-${t}`, elite.rankSum / elite.drops > base.rankSum / base.drops);
}

// ─────────────────────────────────────────────────────────────────────────────
// (e) rollLoot çıktısı çağıran tarafın beklediği şekli tutuyor (TdBattleScene sözleşmesi)
// ─────────────────────────────────────────────────────────────────────────────
const sample = rolled('abyssal_overlord', false, 1) && rollLoot('abyssal_overlord', false);
ok('overlord-always-drops', sample.length > 0);  // en yüksek chance 0.90 · 7 girdi
ok('result-shape', sample.every(d => !!d.item && !!d.item.id && RARITIES.includes(d.rarity)));
// dönen item kopyası olmalı — tabloyu mutasyona uğratmasın
sample[0].item.count = 99;
ok('result-is-copy', LOOT_TABLES.abyssal_overlord.every(e => e.item.count === 1));

console.log(`td-loot: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
