// Kasaba: 9 hub kapısı doğru interact'la var, spawn'dan BFS ile erişilebilir,
// mevcut kritik interact'lar (shop/npc/inn/elder/exit) korunmuş, hub binaları eski
// yapılara/yollara/plaza'ya aşılanmamış, ve duvar halkaları dekor delikleri bırakmıyor.
import { buildTownTiles } from '../lib/game/maps/townTiles';
import { HUB_GAMES, buildingRect } from '../lib/game/hub/hubGames';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? `  ✓ ${m}` : `  ✗ ${m}`); if (!c) fails++; };

const tiles = buildTownTiles();
const ROWS = tiles.length, COLS = tiles[0].length;

// ---------------------------------------------------------------------------
// Legacy footprint constants — townTiles.ts kaynağından elle çıkarıldı
// (yapılar açık koordinat döngüleriyle inşa ediliyor; her dikdörtgen
// duvar+iç mekan sınırını kapsar).
// ---------------------------------------------------------------------------
type Rect = { r0: number; r1: number; c0: number; c1: number };
const LEGACY_STRUCTURES: Record<string, Rect> = {
  eldersTower:   { r0: 3,  r1: 8,  c0: 3,  c1: 8 },   // "4. ELDER'S TOWER"
  merchantShop:  { r0: 3,  r1: 8,  c0: 23, c1: 28 },  // "5. MERCHANT'S SHOP"
  inn:           { r0: 17, r1: 21, c0: 3,  c1: 7 },   // "6. INN"
  trainingHall:  { r0: 17, r1: 21, c0: 24, c1: 28 },  // "7. TRAINING HALL"
  houseA:        { r0: 4,  r1: 6,  c0: 11, c1: 13 },  // "8. SMALL HOUSES" — House A
  houseB:        { r0: 19, r1: 21, c0: 20, c1: 22 },  // "8. SMALL HOUSES" — House B
  plaza:         { r0: 9,  r1: 15, c0: 10, c1: 21 },  // "3. CENTRAL PLAZA" (fountain/pillars/benches dahil)
};
// House B kapısı (kaynakta interact yok ama konumu sabit — silinmemeli/ezilmemeli)
const HOUSE_B_DOOR = { tx: 21, ty: 21 };

// Yol eksenleri — "2. ROAD NETWORK" bölümünden
const ROAD_NS: Rect = { r0: 5,  r1: 23, c0: 14, c1: 17 }; // ana kuzey-güney cobble yol
const ROAD_E:  Rect = { r0: 12, r1: 14, c0: 20, c1: 31 }; // doğu yolu (plaza → orman çıkışı)

function overlaps(a: Rect, b: Rect): boolean {
  return a.c1 >= b.c0 && b.c1 >= a.c0 && a.r1 >= b.r0 && b.r1 >= a.r0;
}

console.log('--- Hub binaları eski yapılara/yollara aşılanmıyor ---');
for (const g of HUB_GAMES) {
  const rect = buildingRect(g);
  for (const [name, legacyRect] of Object.entries(LEGACY_STRUCTURES)) {
    ok(!overlaps(rect, legacyRect), `${g.id} rect (${rect.c0}-${rect.c1},${rect.r0}-${rect.r1}) '${name}' ile çakışmıyor`);
  }
  ok(!overlaps(rect, ROAD_NS), `${g.id} kuzey-güney ana yolu kapatmıyor`);
  ok(!overlaps(rect, ROAD_E), `${g.id} doğu yolunu kapatmıyor`);
}

console.log('\n--- Hub binaları birbiriyle çakışmıyor ---');
for (let i = 0; i < HUB_GAMES.length; i++) {
  for (let j = i + 1; j < HUB_GAMES.length; j++) {
    const a = buildingRect(HUB_GAMES[i]), b = buildingRect(HUB_GAMES[j]);
    ok(!overlaps(a, b), `${HUB_GAMES[i].id} vs ${HUB_GAMES[j].id} çakışmıyor`);
  }
}

console.log('\n--- Duvar halkası bütünlüğü (kapı hariç tüm duvar tile\'ları solid) ---');
for (const g of HUB_GAMES) {
  const { r0, r1, c0, c1 } = buildingRect(g);
  const gaps: string[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const isWall = r === r0 || r === r1 || c === c0 || c === c1;
      if (!isWall) continue;
      if (r === r1 && c === g.door.tx) continue; // kapı tile'ının kendisi hariç
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) { gaps.push(`(${c},${r}) OOB`); continue; }
      if (!tiles[r][c].collision) gaps.push(`(${c},${r}) biome=${tiles[r][c].biome}`);
    }
  }
  ok(gaps.length === 0, `${g.id} duvar halkasında delik yok${gaps.length ? ' — ' + gaps.join('; ') : ''}`);
}

console.log('\n--- Spawn BFS erişilebilirlik ---');
const seen = new Set<string>(['16,22']);
const q: [number, number][] = [[16, 22]];
while (q.length) {
  const [tx, ty] = q.shift()!;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
    const k = `${nx},${ny}`;
    if (seen.has(k) || tiles[ny][nx].collision) continue;
    seen.add(k); q.push([nx, ny]);
  }
}

for (const g of HUB_GAMES) {
  const t = tiles[g.door.ty][g.door.tx];
  ok(t.interact === `hub_${g.id}`, `${g.id} kapısı (${g.door.tx},${g.door.ty}) interact=${t.interact}`);
  const reachable = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) =>
    seen.has(`${g.door.tx + dx},${g.door.ty + dy}`));
  ok(reachable, `${g.id} kapısına spawn'dan ulaşılabiliyor`);
}

console.log('\n--- Mevcut kritik interact/koruma kontrolleri ---');
const allInteracts = tiles.flat().map(t => t.interact).filter(Boolean);
for (const must of ['shop', 'inn', 'elder_house']) {
  ok(allInteracts.includes(must), `mevcut '${must}' interact'i duruyor`);
}
ok(allInteracts.filter(i => i === 'npc').length >= 2, 'en az 2 NPC duruyor');
ok(allInteracts.some(i => i!.startsWith('exit_')), 'zone çıkışı duruyor');

// House B kapısı hub inşası tarafından silinmemiş/ezilmemiş olmalı: hâlâ yürünebilir
// (collision=false) ve interact taşımıyor (kaynakta hiç taşımamıştı — sadece 'wood' tile).
const houseBDoorTile = tiles[HOUSE_B_DOOR.ty][HOUSE_B_DOOR.tx];
ok(houseBDoorTile.biome === 'wood' && !houseBDoorTile.collision,
  `House B kapısı (${HOUSE_B_DOOR.tx},${HOUSE_B_DOOR.ty}) hâlâ yürünebilir wood tile (biome=${houseBDoorTile.biome} collision=${houseBDoorTile.collision})`);

console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
