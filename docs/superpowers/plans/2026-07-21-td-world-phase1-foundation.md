# TD World Faz 1 — Temel (Motor + Harita + Kahraman) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lib/game/td/` altında top-down motor çekirdeği: 384×384 deterministik dünya, chunk-stream render, chibi kahramanla yürünebilir dev-only rota — canlı izo World'e sıfır dokunuş.

**Architecture:** Saf-veri katman (tdCore, worldMap) Node'da test edilir; DOM katman (chibi fabrikası, chunk renderer, Phaser sahnesi) dev rotasında görsel+perf doğrulanır. Spec: `docs/superpowers/specs/2026-07-21-world-cozy-topdown-design.md`.

**Tech Stack:** TypeScript, Phaser 3 (mevcut), Canvas 2D prosedürel sprite, Next.js app router (dev rota), `npx tsx` test scriptleri (repo kalıbı: `scripts/cardgame-engine-test.ts`).

**Faz yol haritası (her faz kendi planını alır):**
1. **BU PLAN** — çekirdek + harita + kahraman + dev rota
2. Dünya içeriği — bölge atmosferleri, prop'lar, kasaba+hub binaları, zindan kapıları, minimap
3. Savaş — canavar chibi şablonları (kullanıcı onay kapısı), encounter, BattleScene reskin, TdDungeonScene
4. Cozy — enerji/toplama/tarla, Shop entegrasyonu, save v2 göçü
5. Entegrasyon & geçiş — multiplayer, mobil, test uyarlamaları, atomik sceneLoader geçişi

**Kurallar (her görevde):** İzo dosyalarına (`lib/game/iso/`, `lib/game/scenes/Iso*`) DOKUNMA. `sceneLoader.ts`'e DOKUNMA (geçiş Faz 5). Her görev commit'le biter.

---

### Task 1: tdCore — grid matematiği (saf, Node-testli)

**Files:**
- Create: `frontend/lib/game/td/tdCore.ts`
- Test: `frontend/scripts/td-core-test.ts`

- [ ] **Step 1: Failing test yaz**

```ts
// frontend/scripts/td-core-test.ts
import { TILE, CHUNK, VIEW_W, VIEW_H, toScreen, toTile, depth, chunkOf, chunksInView, hash2d } from '../lib/game/td/tdCore';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

eq('TILE', TILE, 16); eq('CHUNK', CHUNK, 48); eq('VIEW', [VIEW_W, VIEW_H], [384, 256]);
eq('toScreen', toScreen(3, 5), { x: 48, y: 80 });
eq('toTile', toTile(48, 80), { tx: 3, ty: 5 });
eq('toTile-neg-floor', toTile(-1, -1), { tx: -1, ty: -1 });
eq('depth-y-sort', depth(10, 200) > depth(10, 100), true);
eq('chunkOf', chunkOf(49, 95), { cx: 1, cy: 1 });
eq('chunksInView-center', chunksInView(3072, 3072).length, 9); // harita ortası (tile 192 → chunk 4) → 3×3 halka
eq('chunksInView-corner', chunksInView(100, 100).length, 4);   // köşe chunk (0,0) → 2×2 kırpılır
// determinizm: aynı girdi aynı hash, farklı girdi (neredeyse kesin) farklı
eq('hash2d-det', hash2d(12, 34) === hash2d(12, 34), true);
eq('hash2d-diff', hash2d(12, 34) !== hash2d(34, 12), true);

console.log(`td-core: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `cd frontend && npx tsx scripts/td-core-test.ts`
Expected: `Cannot find module '../lib/game/td/tdCore'`

- [ ] **Step 3: Implement**

```ts
// frontend/lib/game/td/tdCore.ts
// ─── TD çekirdeği: grid matematiği + determinizm ───
// İzo core'un aksine projeksiyon birebir: ekran = tile × TILE.

export const TILE = 16;          // px / tile
export const CHUNK = 48;         // tile / chunk kenarı (48×48 tile = 768×768 px canvas)
export const VIEW_W = 384;       // iç çözünürlük (24 tile) — Larvy zoom ölçümü (spec §3)
export const VIEW_H = 256;       // 16 tile
export const MAP_W = 384;        // dünya: 384×384 tile (spec §2)
export const MAP_H = 384;

export function toScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE, y: ty * TILE };
}
export function toTile(sx: number, sy: number): { tx: number; ty: number } {
  return { tx: Math.floor(sx / TILE), ty: Math.floor(sy / TILE) };
}
/** y-sort: alt kenarı (feet) büyük olan üste çizilir. x kırıcı olarak eklenir. */
export function depth(x: number, footY: number): number {
  return footY * 10 + (x % 10) / 10;
}
export function chunkOf(tx: number, ty: number): { cx: number; cy: number } {
  return { cx: Math.floor(tx / CHUNK), cy: Math.floor(ty / CHUNK) };
}
/** Kamera merkezine göre görünür + 1 halka chunk listesi (LRU stream için). */
export function chunksInView(camCenterX: number, camCenterY: number): { cx: number; cy: number }[] {
  const { cx, cy } = chunkOf(Math.floor(camCenterX / TILE), Math.floor(camCenterY / TILE));
  const out: { cx: number; cy: number }[] = [];
  const maxC = Math.ceil(MAP_W / CHUNK) - 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx > maxC || ny > maxC) continue;
    out.push({ cx: nx, cy: ny });
  }
  return out;
}
/** Deterministik 2B hash — harita/deko üretiminin tek rastgelelik kaynağı. */
export function hash2d(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}
```

- [ ] **Step 4: Test PASS**

Run: `cd frontend && npx tsx scripts/td-core-test.ts`
Expected: `td-core: 12 pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/game/td/tdCore.ts frontend/scripts/td-core-test.ts
git commit -m "feat(td): tdCore — grid matematiği + deterministik hash (Faz 1)"
```

---

### Task 2: worldMap — 384×384 deterministik dünya (saf, Node-testli)

**Files:**
- Create: `frontend/lib/game/td/worldMap.ts`
- Test: `frontend/scripts/td-map-test.ts`

Bölge tablosu spec §2.1 coğrafyasını kodlar: merkez kasaba, halkalar, uç biyomlar. Faz 1'de tile çıktısı = `{biome, collision}`; prop/deko Faz 2.

- [ ] **Step 1: Failing test yaz**

```ts
// frontend/scripts/td-map-test.ts
import { MAP_W, MAP_H } from '../lib/game/td/tdCore';
import { getTile, REGIONS, regionAt, TOWN_SPAWN } from '../lib/game/td/worldMap';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

// 1) determinizm: 10k örnek tile'ın imzası sabit kalmalı (snapshot)
let sig = 0;
for (let i = 0; i < 10000; i++) {
  const x = (i * 7919) % MAP_W, y = (i * 104729) % MAP_H;
  const t = getTile(x, y);
  sig = (sig * 31 + t.biome.charCodeAt(0) + (t.collision ? 7 : 0)) >>> 0;
}
console.log('map signature:', sig);
ok('deterministic-rerun', (() => {
  let s2 = 0;
  for (let i = 0; i < 10000; i++) {
    const x = (i * 7919) % MAP_W, y = (i * 104729) % MAP_H;
    const t = getTile(x, y);
    s2 = (s2 * 31 + t.biome.charCodeAt(0) + (t.collision ? 7 : 0)) >>> 0;
  }
  return s2 === sig;
})());
// 2) coğrafya: spawn kasabada, kasaba yürünebilir
ok('spawn-in-town', regionAt(TOWN_SPAWN.tx, TOWN_SPAWN.ty).key === 'town');
ok('spawn-walkable', !getTile(TOWN_SPAWN.tx, TOWN_SPAWN.ty).collision);
// 3) 18 bölge var, hepsi harita içinde
ok('regions-18', REGIONS.length === 18);
ok('regions-in-bounds', REGIONS.every(r => r.cx >= 0 && r.cx < MAP_W && r.cy >= 0 && r.cy < MAP_H));
// 4) uç biyom yerleşimi (spec §2.1): FrostWastes kuzeyde, Volcano güneydoğuda
const fw = REGIONS.find(r => r.key === 'frostwastes')!, vo = REGIONS.find(r => r.key === 'volcano')!;
ok('frostwastes-north', fw.cy < MAP_H * 0.3);
ok('volcano-southeast', vo.cy > MAP_H * 0.6 && vo.cx > MAP_W * 0.6);
// 5) göl collision'lı, kıyısı değil
const lakeT = getTile(150, 150); // forest gölü merkezi (region tablosunda tanımlı)
ok('lake-water-collides', lakeT.biome === 'water' ? lakeT.collision : true);
// 6) sınır: harita kenarı her yönde collision (dünya çitleri)
ok('border-collides', getTile(0, 100).collision && getTile(MAP_W - 1, 100).collision);

console.log(`td-map: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
```

- [ ] **Step 2: FAIL gör**

Run: `cd frontend && npx tsx scripts/td-map-test.ts`
Expected: `Cannot find module '../lib/game/td/worldMap'`

- [ ] **Step 3: Implement**

```ts
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

// Göller: (bölge hissi için) elips tanımları — su collision'lıdır
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
  if (secondScore - bestScore < 0.15 && (hash2d(tx, ty) % 100) < 40) return second;
  return best;
}

export function getTile(tx: number, ty: number): TdTile {
  // dünya kenarı: 2-tile collision bandı
  if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) return { biome: 'forest', collision: true };
  // göller
  for (const L of LAKES) {
    if (((tx - L.cx) / L.rx) ** 2 + ((ty - L.cy) / L.ry) ** 2 <= 1) return { biome: 'water', collision: true };
  }
  const rg = regionAt(tx, ty);
  return { biome: rg.biome, collision: false };
}
```

- [ ] **Step 4: Test PASS + imzayı plana işle**

Run: `cd frontend && npx tsx scripts/td-map-test.ts`
Expected: `td-map: 9 pass, 0 fail` + `map signature: <SAYI>` — bu sayıyı commit mesajına yaz (gelecek regresyonlar için referans).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/game/td/worldMap.ts frontend/scripts/td-map-test.ts
git commit -m "feat(td): worldMap — 18 bölgeli 384×384 deterministik dünya (imza: <SAYI>)"
```

---

### Task 3: chibi sprite fabrikası (DOM; dev rotada görsel doğrulama Task 6'da)

**Files:**
- Create: `frontend/lib/game/td/sprites/chibi.ts`

Demo reçetesinin production portu. Saf fonksiyonlar; Phaser'a bağımlı DEĞİL (canvas üretir, sahne `textures.addCanvas` ile alır).

- [ ] **Step 1: Implement**

```ts
// frontend/lib/game/td/sprites/chibi.ts
// ─── Prosedürel chibi sprite fabrikası ───
// Reçete (spec §4): 1px koyu kontur, px-rect çizim, palet parametreli.

export type Px = (x: number, y: number, w: number, h: number, color: string) => void;

/** w×h canvas üret, fn'e 1px-rect çizici ver. */
export function spr(w: number, h: number, fn: (px: Px, g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  fn((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, g);
  return c;
}

/** 1px koyu silüet konturu — "bitmiş pixel-art" hissinin ana kuralı. Çıktı (w+2)×(h+2). */
export function outline(c: HTMLCanvasElement, col = '#243141'): HTMLCanvasElement {
  const o = document.createElement('canvas'); o.width = c.width + 2; o.height = c.height + 2;
  const g = o.getContext('2d')!;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]] as const) g.drawImage(c, dx, dy);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, o.width, o.height);
  g.globalCompositeOperation = 'source-over'; g.drawImage(c, 1, 1);
  return o;
}

export interface ChibiPalette {
  skin: string; hair: string; top: string; topShade: string;
  accent: string;      // Frostbite kimliği: atkı vb. (#e84142 default)
  leg: string; boot: string;
}
export const DEFAULT_PALETTE: ChibiPalette = {
  skin: '#f2c99a', hair: '#5b3a24', top: '#4e6e8e', topShade: '#3d5872',
  accent: '#e84142', leg: '#2c3540', boot: '#1d242c',
};
const EYE = '#20242c', BLUSH = '#f0a8a0';

/**
 * Chibi insansı 12×18 (kontur sonrası 14×20) — kafa ≈ %55 (Larvy oranı).
 * dir: 0 aşağı, 1 yukarı, 2 yan(sol; sağ = flip). phase: 0 durma, 1 sol adım, 2 sağ adım.
 * Yürüyüş döngüsü sahnede [0,1,0,2] olarak kullanılır.
 */
export function chibiHumanoid(dir: 0 | 1 | 2, phase: 0 | 1 | 2, P: ChibiPalette = DEFAULT_PALETTE): HTMLCanvasElement {
  return outline(spr(12, 18, (px) => {
    const legs = () => {
      if (phase === 0) { px(4, 14, 2, 2, P.leg); px(6, 14, 2, 2, P.leg); px(4, 16, 2, 2, P.boot); px(6, 16, 2, 2, P.boot); }
      else if (phase === 1) { px(4, 14, 2, 3, P.leg); px(6, 14, 2, 1, P.leg); px(4, 17, 2, 1, P.boot); px(6, 15, 2, 2, P.boot); }
      else { px(4, 14, 2, 1, P.leg); px(6, 14, 2, 3, P.leg); px(4, 15, 2, 2, P.boot); px(6, 17, 2, 1, P.boot); }
    };
    if (dir === 0) {
      px(3, 0, 6, 1, P.hair); px(2, 1, 8, 2, P.hair); px(1, 2, 10, 2, P.hair);
      px(2, 4, 8, 5, P.skin); px(1, 4, 1, 3, P.hair); px(10, 4, 1, 3, P.hair); px(2, 4, 8, 1, P.hair);
      px(3, 5, 2, 2, EYE); px(7, 5, 2, 2, EYE);
      px(2, 7, 1, 1, BLUSH); px(9, 7, 1, 1, BLUSH);
      px(3, 9, 6, 1, P.accent); px(8, 10, 2, 1, P.accent);
      px(3, 10, 6, 4, P.top); px(2, 10, 1, 3, P.topShade); px(9, 10, 1, 3, P.topShade);
      legs();
    } else if (dir === 1) {
      px(3, 0, 6, 1, P.hair); px(2, 1, 8, 3, P.hair); px(1, 2, 10, 5, P.hair); px(2, 7, 8, 2, P.hair);
      px(3, 9, 6, 1, P.accent);
      px(3, 10, 6, 4, P.top); px(2, 10, 1, 3, P.topShade); px(9, 10, 1, 3, P.topShade);
      legs();
    } else {
      px(3, 0, 6, 1, P.hair); px(2, 1, 8, 2, P.hair); px(2, 2, 9, 2, P.hair);
      px(2, 4, 7, 5, P.skin); px(8, 4, 3, 5, P.hair); px(2, 4, 7, 1, P.hair);
      px(3, 5, 2, 2, EYE); px(2, 7, 1, 1, BLUSH);
      px(3, 9, 6, 1, P.accent); px(8, 9, 2, 1, P.accent); px(9, 10, 1, 2, P.accent);
      px(3, 10, 6, 4, P.top); px(3, 11, 1, 2, P.topShade);
      legs();
    }
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "td/" ; echo "exit:$?"`
Expected: td/ altında hata yok (grep boş, exit:1 grep-bulunamadı demektir → OK).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/game/td/sprites/chibi.ts
git commit -m "feat(td): chibi sprite fabrikası — kontur + palet parametreli insansı"
```

---

### Task 4: tiles — biome chunk renderer (DOM)

**Files:**
- Create: `frontend/lib/game/td/tiles.ts`

- [ ] **Step 1: Implement**

```ts
// frontend/lib/game/td/tiles.ts
// ─── Chunk pre-render: 48×48 tile'lık canvas'lar ───
// Reçete (spec §4): dama + benek yamalar, su 3-kare parıltı + kıyı yumuşatma.
import { TILE, CHUNK, hash2d } from './tdCore';
import { getTile, type Biome } from './worldMap';

// Faz 1 palet seti — her biome: [açık dama, koyu dama, benek]. Faz 2 atmosferle zenginleşir.
const BIOME_PAL: Record<Biome, [string, string, string]> = {
  town:        ['#e3ebee', '#dce5e9', '#d5e0e5'],
  grass:       ['#cfe3cd', '#c5dbc3', '#bcd3ba'],
  forest:      ['#c2dcc4', '#b8d3ba', '#aecab0'],
  water:       ['#479fc4', '#3f93b8', '#66bad6'],
  swamp:       ['#b9c7a8', '#aebe9d', '#a3b492'],
  mines:       ['#cfcbc4', '#c5c1ba', '#bab6af'],
  ruins:       ['#d6d2c6', '#ccc8bc', '#c2beb2'],
  frostwastes: ['#e8eff3', '#e1e9ee', '#d8e2e8'],
  volcano:     ['#d8b8a8', '#cdad9d', '#c2a292'],
  necropolis:  ['#c8c4ce', '#bebac4', '#b4b0ba'],
  citadel:     ['#d8d4c8', '#cecabe', '#c4c0b4'],
  demongate:   ['#c8aeb2', '#bea4a8', '#b49a9e'],
  voidrealm:   ['#b4b0c8', '#aaa6be', '#a09cb4'],
  sanctum:     ['#dce8dc', '#d2ded2', '#c8d4c8'],
  crypt:       ['#c4c8c4', '#babeba', '#b0b4b0'],
  abyss:       ['#aab4be', '#a0aab4', '#96a0aa'],
  forge:       ['#d4c4b4', '#cabaa0', '#c0b0a0'],
  eternal:     ['#e4e0ee', '#dad6e4', '#d0ccda'],
  path:        ['#bc9a6d', '#b2905f', '#9a7c52'],
};

const FLOE = '#e8f3f6', GLINT = '#8ed2e8', SHALLOW = '#66bad6';

/** Bir chunk'ı canvas'a çiz. frame: 0..2 (su parıltı animasyonu). */
export function renderChunk(cx: number, cy: number, frame: 0 | 1 | 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CHUNK * TILE; c.height = CHUNK * TILE;
  const g = c.getContext('2d')!;
  const baseX = cx * CHUNK, baseY = cy * CHUNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const tx = baseX + x, ty = baseY + y;
    const t = getTile(tx, ty), h = hash2d(tx, ty);
    const pal = BIOME_PAL[t.biome];
    const px = x * TILE, py = y * TILE;
    g.fillStyle = ((tx + ty) & 1) ? pal[0] : pal[1];
    g.fillRect(px, py, TILE, TILE);
    if (t.biome === 'water') {
      const land = (dx: number, dy: number) => getTile(tx + dx, ty + dy).biome !== 'water';
      g.fillStyle = SHALLOW;
      if (land(0, -1)) g.fillRect(px, py, TILE, 4);
      if (land(0, 1)) g.fillRect(px, py + TILE - 4, TILE, 4);
      if (land(-1, 0)) g.fillRect(px, py, 4, TILE);
      if (land(1, 0)) g.fillRect(px + TILE - 4, py, 4, TILE);
      if ((h + frame * 7) % 9 === 0) { g.fillStyle = GLINT; g.fillRect(px + ((h >> 3) % 10) + 2, py + ((h >> 6) % 10) + 3, 5, 1); }
      g.fillStyle = FLOE;
      if (land(0, -1)) g.fillRect(px, py, TILE, 2);
      if (land(0, 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (land(-1, 0)) g.fillRect(px, py, 2, TILE);
      if (land(1, 0)) g.fillRect(px + TILE - 2, py, 2, TILE);
      // köşe yumuşatma (merdiven kırıcı) — kıyı tarafının kara tonuyla kapat
      g.fillStyle = '#dce5e9';
      if (land(0, -1) && land(-1, 0)) { g.fillRect(px, py, 6, 3); g.fillRect(px, py, 3, 6); }
      if (land(0, -1) && land(1, 0)) { g.fillRect(px + TILE - 6, py, 6, 3); g.fillRect(px + TILE - 3, py, 3, 6); }
      if (land(0, 1) && land(-1, 0)) { g.fillRect(px, py + TILE - 3, 6, 3); g.fillRect(px, py + TILE - 6, 3, 6); }
      if (land(0, 1) && land(1, 0)) { g.fillRect(px + TILE - 6, py + TILE - 3, 6, 3); g.fillRect(px + TILE - 3, py + TILE - 6, 3, 6); }
    } else {
      // benekli yama — dama sertliğini kırar
      if (h % 7 < 2) { g.fillStyle = pal[2]; g.fillRect(px + (h % 7) + 1, py + ((h >> 4) % 7) + 2, 8, 5); }
      if (h % 23 === 0) { g.fillStyle = '#ffffff30'; g.fillRect(px + (h % 12) + 2, py + ((h >> 4) % 12) + 2, 2, 2); }
    }
  }
  return c;
}
```

- [ ] **Step 2: Typecheck** (Task 3 Step 2 komutu). Expected: td/ hatasız.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/game/td/tiles.ts
git commit -m "feat(td): biome chunk renderer — 19 palet, su kıyı yumuşatma, 3-kare parıltı"
```

---

### Task 5: TdWorldScene — chunk stream + kahraman hareketi

**Files:**
- Create: `frontend/lib/game/td/TdWorldScene.ts`

- [ ] **Step 1: Implement**

```ts
// frontend/lib/game/td/TdWorldScene.ts
// ─── Açık dünya sahnesi: chunk streaming + chibi kahraman ───
import * as Phaser from 'phaser';
import { TILE, CHUNK, MAP_W, MAP_H, chunksInView } from './tdCore';
import { getTile, TOWN_SPAWN } from './worldMap';
import { renderChunk } from './tiles';
import { chibiHumanoid } from './sprites/chibi';

const WALK_FRAMES = [0, 1, 0, 2] as const; // faz dizisi (spec §4)

export class TdWorldScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Image;
  private heroPos = { x: TOWN_SPAWN.tx * TILE + 8, y: TOWN_SPAWN.ty * TILE + 8 };
  private heroDir: 0 | 1 | 2 = 0; private heroFlip = false;
  private walkIdx = 0; private walkT = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private chunks = new Map<string, Phaser.GameObjects.Image>(); // "cx,cy" → image
  private waterFrame: 0 | 1 | 2 = 0; private waterT = 0;
  private perf = { chunkMs: 0, visible: 0 }; private perfText?: Phaser.GameObjects.Text;

  constructor() { super({ key: 'TdWorld' }); }

  create(): void {
    // kahraman kareleri: 3 yön × 3 faz → texture'lar
    for (let d = 0; d < 3; d++) for (let p = 0; p < 3; p++) {
      const key = `td-hero-${d}-${p}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, chibiHumanoid(d as 0 | 1 | 2, p as 0 | 1 | 2));
    }
    this.hero = this.add.image(this.heroPos.x, this.heroPos.y, 'td-hero-0-0').setOrigin(0.5, 0.9);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.startFollow(this.hero, true, 1, 1);
    this.cameras.main.setRoundPixels(true);
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    this.cursors = kb.createCursorKeys();
    // F3: perf overlay (Faz 1 doğrulama aracı)
    kb.on('keydown-F3', () => {
      if (this.perfText) { this.perfText.destroy(); this.perfText = undefined; }
      else this.perfText = this.add.text(4, 4, '', { fontSize: '10px', color: '#9fe8ff', backgroundColor: '#0009' })
        .setScrollFactor(0).setDepth(1e9);
    });
    this.streamChunks(); // ilk yükleme
  }

  private canMove(nx: number, ny: number): boolean {
    for (const [ox, oy] of [[-4, 0], [4, 0], [-4, 3], [4, 3], [0, 3]] as const) {
      const t = getTile(Math.floor((nx + ox) / TILE), Math.floor((ny + oy) / TILE));
      if (t.collision) return false;
    }
    return true;
  }

  private streamChunks(): void {
    const t0 = performance.now();
    const want = chunksInView(this.heroPos.x, this.heroPos.y);
    const wantKeys = new Set(want.map(c => `${c.cx},${c.cy}`));
    for (const [key, img] of this.chunks) {
      if (!wantKeys.has(key)) { img.destroy(); this.chunks.delete(key); this.textures.remove(`td-chunk-${key}-${this.waterFrame}`); }
    }
    for (const c of want) {
      const key = `${c.cx},${c.cy}`;
      if (this.chunks.has(key)) continue;
      const texKey = `td-chunk-${key}-${this.waterFrame}`;
      if (!this.textures.exists(texKey)) this.textures.addCanvas(texKey, renderChunk(c.cx, c.cy, this.waterFrame));
      const img = this.add.image(c.cx * CHUNK * TILE, c.cy * CHUNK * TILE, texKey).setOrigin(0, 0).setDepth(-1000);
      this.chunks.set(key, img);
    }
    this.perf.chunkMs = performance.now() - t0;
    this.perf.visible = this.chunks.size;
  }

  update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown || this.cursors.up.isDown) dy -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) dy += 1;
    if (this.keys.A.isDown || this.cursors.left.isDown) dx -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) dx += 1;
    const moving = !!(dx || dy);
    if (moving) {
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const sp = 88 * dt;
      const nx = this.heroPos.x + dx * sp, ny = this.heroPos.y + dy * sp;
      if (this.canMove(nx, this.heroPos.y)) this.heroPos.x = nx;
      if (this.canMove(this.heroPos.x, ny)) this.heroPos.y = ny;
      if (Math.abs(dx) > Math.abs(dy)) { this.heroDir = 2; this.heroFlip = dx > 0; }
      else this.heroDir = dy < 0 ? 1 : 0;
      this.walkT += dt;
      if (this.walkT > 0.13) { this.walkT = 0; this.walkIdx = (this.walkIdx + 1) % 4; }
    } else this.walkIdx = 0;
    const phase = moving ? WALK_FRAMES[this.walkIdx] : 0;
    const bob = moving ? (this.walkIdx % 2) : (Math.floor(_t / 520) % 2); // adım dalması / idle nefes
    this.hero.setTexture(`td-hero-${this.heroDir}-${phase}`);
    this.hero.setFlipX(this.heroFlip);
    this.hero.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y) + bob);
    this.hero.setDepth(this.heroPos.y);
    // su animasyonu: 400ms'de bir chunk texture seti tazelenir
    this.waterT += dt;
    if (this.waterT > 0.4) {
      this.waterT = 0; this.waterFrame = ((this.waterFrame + 1) % 3) as 0 | 1 | 2;
      for (const [key, img] of this.chunks) { img.destroy(); this.chunks.delete(key); }
      this.streamChunks();
    } else {
      // chunk sınırı geçildiyse stream
      this.streamChunks();
    }
    if (this.perfText) this.perfText.setText(
      `chunks:${this.perf.visible} stream:${this.perf.chunkMs.toFixed(1)}ms fps:${this.game.loop.actualFps | 0}`);
  }
}
```

**Not (executor'a):** (1) Su animasyonunda her 400ms tüm chunk'ları yıkıp yeniden çizmek Faz 1 basitliğidir; perf overlay 60fps altını gösterirse su-frame'i 2'ye düşür veya sadece su içeren chunk'ları tazele (chunk'ın su içerip içermediğini renderChunk dönüşünde işaretle) — hangisini yaptığını commit mesajına yaz. (2) Chunk tahliyesinde üç su-frame'in texture'ını da sil (`td-chunk-${key}-0/1/2`) — yalnız aktif frame silinirse uzun yürüyüşte texture birikir.

- [ ] **Step 2: Typecheck.** Expected: td/ hatasız.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/game/td/TdWorldScene.ts
git commit -m "feat(td): TdWorldScene — chunk stream + chibi kahraman + F3 perf overlay"
```

---

### Task 6: Dev rota (`/world/td-dev`) — gizli, noindex

**Files:**
- Create: `frontend/app/world/td-dev/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// frontend/app/world/td-dev/page.tsx
'use client';
/**
 * TD World geliştirme rotası — Faz 1-4 boyunca içeriden doğrulama alanı.
 * Nav'da YOK, noindex; canlı izo World'e dokunmaz. Faz 5 geçişinde silinir.
 */
import { useEffect, useRef } from 'react';

export default function TdDevPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: import('phaser').Game | null = null;
    let cancelled = false;
    (async () => {
      const Phaser = await import('phaser');
      const { TdWorldScene } = await import('@/lib/game/td/TdWorldScene');
      const { VIEW_W, VIEW_H } = await import('@/lib/game/td/tdCore');
      if (cancelled || !ref.current) return;
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: ref.current,
        width: VIEW_W, height: VIEW_H,
        pixelArt: true, roundPixels: true,
        backgroundColor: '#0d1319',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [TdWorldScene],
      });
    })();
    return () => { cancelled = true; game?.destroy(true); };
  }, []);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-5xl">
        <p className="mb-2 text-center font-mono text-xs text-white/40">
          TD-DEV — internal preview · WASD move · F3 perf
        </p>
        <div ref={ref} className="aspect-[3/2] w-full [image-rendering:pixelated]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: noindex metadata** — `frontend/app/world/td-dev/layout.tsx` oluştur:

```tsx
// frontend/app/world/td-dev/layout.tsx
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function TdDevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 3: Dev server'da doğrula**

Run: `cd frontend && rm -rf .next && npm run dev` (⚠️ hafıza notu: eski .next dev tuzağı — temiz başlat), sonra `http://localhost:3000/avalanche/world/td-dev` aç.
Doğrula (screenshot al): (a) kasaba dama zemininde chibi kahraman, (b) WASD ile yürüyüş + 4-kare animasyon + adım dalması, (c) kuzeye uzun yürüyüşte biome geçişi (town→forest→frostwastes tonları), (d) göl kıyısı yumuşatılmış + collision, (e) F3 → chunks:≤9, fps ≥ 55.

- [ ] **Step 4: Build sağlığı**

Run: `cd frontend && npm run build 2>&1 | tail -3`
Expected: `✓ Compiled successfully` + route listesinde `/world/td-dev`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/world/td-dev/
git commit -m "feat(td): /world/td-dev gizli önizleme rotası (noindex, navsız)"
```

---

### Task 7: Faz 1 kapanış doğrulaması

**Files:** (yalnız çalıştırma; kod yok)

- [ ] **Step 1: Tüm td testleri**

Run: `cd frontend && npx tsx scripts/td-core-test.ts && npx tsx scripts/td-map-test.ts`
Expected: her ikisi `0 fail`; map signature Task 2'dekiyle AYNI.

- [ ] **Step 2: İzo dokunulmazlık kontrolü**

Run: `git diff --stat origin/frozenfriends-mvp...HEAD -- frontend/lib/game/iso frontend/lib/game/scenes frontend/lib/game/sceneLoader.ts | cat`
Expected: BOŞ çıktı (izo dosyalarına sıfır dokunuş).

- [ ] **Step 3: Prod build + mevcut smoke'lar hâlâ yeşil**

Run: `cd frontend && npm run build 2>&1 | tail -3 && npx tsx scripts/hub-registry-test.ts 2>&1 | tail -2`
Expected: build ✓; hub testi geçer (dokunmadık, regresyon sigortası).

- [ ] **Step 4: Faz 1 özet commit'i (plan işaretleri)**

```bash
git add docs/superpowers/plans/2026-07-21-td-world-phase1-foundation.md
git commit -m "docs(td): Faz 1 tamam — çekirdek+harita+kahraman dev rotada doğrulandı"
```

---

## Self-Review Notları
- **Spec kapsaması:** Faz 1 spec'in §1.1 (tdCore/chibi/tiles/worldMap/TdWorldScene), §2 (384×384 + chunk + determinizm), §3 (görünüm 384×256), §4 (kontur/dalma/nefes/su reçetesi) maddelerini uygular. §5 savaş, §6 cozy/save, §7 geçiş sonraki fazların planlarında (yol haritası başta).
- **Tip tutarlılığı:** `chibiHumanoid(dir, phase)` ↔ sahnedeki `td-hero-${d}-${p}` anahtarları; `renderChunk(cx,cy,frame)` ↔ `td-chunk-${key}-${frame}`; `getTile` her iki katmanda aynı imza.
- **Bilinen basitleştirmeler (Faz 2+ borcu):** patika ağı yok (Faz 2 kasaba işi), zone atmosfer/partikül yok (Faz 2), su animasyon stratejisi Task 5 notundaki optimizasyona açık.
