// frontend/lib/game/td/worldMap.ts
// ─── 384×384 kesintisiz dünya — deterministik, tembel (tile başına hesap) ───
// Coğrafya = level-gate (spec §2.1): merkez kasaba → halka1 → halka2 → uç biyomlar.
import { MAP_W, MAP_H, hash2d } from './tdCore';

export type Biome =
  | 'town' | 'grass' | 'forest' | 'water' | 'swamp' | 'mines' | 'ruins'
  | 'frostwastes' | 'volcano' | 'necropolis' | 'citadel' | 'demongate' | 'voidrealm'
  | 'sanctum' | 'crypt' | 'abyss' | 'forge' | 'eternal' | 'path';

export interface Region {
  key: string; biome: Biome;
  cx: number; cy: number; r: number;       // merkez + etki yarıçapı (tile)
  level: [number, number];                  // canavar seviye aralığı (Faz 3 kullanır)
}

// 18 bölge — eski zone'ların coğrafi yerleşimi (spec ASCII haritası)
export const REGIONS: Region[] = [
  { key: 'town',        biome: 'town',        cx: 192, cy: 192, r: 28, level: [0, 0] },
  { key: 'forest',      biome: 'forest',      cx: 150, cy: 150, r: 46, level: [1, 8] },
  { key: 'grassE',      biome: 'grass',       cx: 240, cy: 160, r: 40, level: [1, 10] },
  { key: 'grassS',      biome: 'grass',       cx: 200, cy: 250, r: 40, level: [3, 12] },
  { key: 'swamp',       biome: 'swamp',       cx: 110, cy: 240, r: 38, level: [12, 22] },
  { key: 'mines',       biome: 'mines',       cx: 280, cy: 230, r: 34, level: [15, 25] },
  { key: 'ruins',       biome: 'ruins',       cx: 300, cy: 140, r: 34, level: [18, 28] },
  { key: 'citadel',     biome: 'citadel',     cx: 330, cy: 190, r: 30, level: [25, 35] },
  { key: 'sanctum',     biome: 'sanctum',     cx: 90,  cy: 130, r: 30, level: [20, 30] },
  { key: 'crypt',       biome: 'crypt',       cx: 140, cy: 300, r: 30, level: [22, 32] },
  { key: 'frostwastes', biome: 'frostwastes', cx: 190, cy: 60,  r: 44, level: [40, 50] },
  { key: 'necropolis',  biome: 'necropolis',  cx: 60,  cy: 190, r: 36, level: [35, 45] },
  { key: 'volcano',     biome: 'volcano',     cx: 310, cy: 310, r: 40, level: [45, 55] },
  { key: 'abyss',       biome: 'abyss',       cx: 60,  cy: 310, r: 30, level: [40, 50] },
  { key: 'forge',       biome: 'forge',       cx: 320, cy: 60,  r: 28, level: [42, 52] },
  { key: 'demongate',   biome: 'demongate',   cx: 40,  cy: 40,  r: 26, level: [55, 65] },
  { key: 'voidrealm',   biome: 'voidrealm',   cx: 350, cy: 350, r: 24, level: [55, 69] },
  { key: 'eternal',     biome: 'eternal',     cx: 350, cy: 30,  r: 22, level: [60, 69] },
];

// Göller: elips tanımları — su collision'lıdır
const LAKES: { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 150, cy: 150, rx: 10, ry: 7 },   // forest gölü
  { cx: 235, cy: 205, rx: 8,  ry: 6 },   // kasaba doğusu
  { cx: 115, cy: 250, rx: 12, ry: 8 },   // bataklık gölü
];

export const TOWN_SPAWN = { tx: 192, ty: 198 }; // kasaba meydanının hemen altı

export interface TdTile { biome: Biome; collision: boolean }

/** En yakın bölge (mesafe/r oranıyla) — sınırlarda hash'li blend (4-8 tile yumuşaklık). */
export function regionAt(tx: number, ty: number): Region {
  let best = REGIONS[0], bestScore = Infinity, second = REGIONS[0], secondScore = Infinity;
  for (const rg of REGIONS) {
    const d = Math.hypot(tx - rg.cx, ty - rg.cy) / rg.r;
    if (d < bestScore) { second = best; secondScore = bestScore; best = rg; bestScore = d; }
    else if (d < secondScore) { second = rg; secondScore = d; }
  }
  // sınır bandında (skorlar yakınsa) hash ile karıştır → yumuşak geçiş
  if (secondScore - bestScore < 0.15 && (hash2d(tx, ty, 1) % 100) < 40) return second;
  return best;
}

// ── Faz 5.6: YOLLAR — kasabadan her bölge merkezine L-şekilli (önce yatay, sonra dikey)
// 2-tile genişlik. Tüm yatay bacaklar y=191-192 bandını paylaşır → tek ana cadde +
// bölge sapakları okunur bir ağ verir. Su üstünde yol = köprü (collision false).
// Kasaba çekirdeği (≤16 tile) yol almaz — meydan zemini bozulmasın.
const ROAD_Y = 192;
interface RoadSeg { x0: number; x1: number; y0: number; y1: number }
// Faz 5.8: yatay ana cadde ile dikey sapaklar AYRIŞTI — cadde köyün İÇİNDEN geçer
// (kuzey bina sırasının kapı önü), dikey sapaklar köy çekirdeğinde (≤16 tile) kesilir.
const ROADS_H: RoadSeg[] = (() => {
  const segs: RoadSeg[] = [];
  for (const rg of REGIONS) {
    if (rg.key === 'town') continue;
    const [hx0, hx1] = rg.cx < 192 ? [rg.cx, 192] : [192, rg.cx];
    segs.push({ x0: hx0, x1: hx1, y0: ROAD_Y - 1, y1: ROAD_Y });
  }
  return segs;
})();
const ROADS_V: RoadSeg[] = (() => {
  const segs: RoadSeg[] = [];
  for (const rg of REGIONS) {
    if (rg.key === 'town') continue;
    const [vy0, vy1] = rg.cy < ROAD_Y ? [rg.cy, ROAD_Y] : [ROAD_Y, rg.cy];
    segs.push({ x0: rg.cx - 1, x1: rg.cx, y0: vy0, y1: vy1 });
  }
  return segs;
})();
function inSegs(segs: RoadSeg[], tx: number, ty: number): boolean {
  for (const s of segs) if (tx >= s.x0 && tx <= s.x1 && ty >= s.y0 && ty <= s.y1) return true;
  return false;
}

export function getTile(tx: number, ty: number): TdTile {
  // dünya kenarı: 2-tile collision bandı
  if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) return { biome: 'forest', collision: true };
  // yol — göllerden ÖNCE (su üstünde köprü); ana cadde köy içinden, sapaklar çekirdek dışı
  if (inSegs(ROADS_H, tx, ty) || (inSegs(ROADS_V, tx, ty) && Math.hypot(tx - 192, ty - 192) > 16)) {
    return { biome: 'path', collision: false };
  }
  // göller
  for (const L of LAKES) {
    if (((tx - L.cx) / L.rx) ** 2 + ((ty - L.cy) / L.ry) ** 2 <= 1) return { biome: 'water', collision: true };
  }
  const rg = regionAt(tx, ty);
  return { biome: rg.biome, collision: false };
}
