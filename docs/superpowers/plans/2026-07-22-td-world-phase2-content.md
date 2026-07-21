# TD World Faz 2 — Dünya İçeriği Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 384×384 dünyaya içerik: bölge atmosferleri, deterministik prop yerleşimi (ağaç/kaya/çalı), kasaba + 9 hub binası (HUB_GAMES tek kaynak), zindan kapıları, minimap, etkileşim ipuçları — hepsi `/worldtestnet` canlı önizlemesinde.

**Architecture:** Saf yerleşim katmanı (`worldProps.ts`, Node-testli) ↔ DOM sprite fabrikaları (`sprites/props.ts`) ↔ sahne entegrasyonu (chunk-başına prop grubu, `tdCore.depth()` ile birleşik y-sort). Spec §2/§4; Faz 1 final review devir listesi görevlere katlandı.

**Tech Stack:** Faz 1 modülleri + `lib/game/hub/hubGames.ts` (DOKUNMA — sadece import) + `lib/game/iso/zoneAtmosphere.ts` verisi (kopyalanır, iso dosyası DOKUNULMAZ).

**Kurallar:** izo dosyalarına ve `sceneLoader.ts`'e dokunma. `hubGames.ts`'e dokunma (yalnız import). Her görev commit'le biter. Harita imzası `3830429448` DEĞİŞMEMELİ (worldMap'e dokunan görev yok).

---

### Task 1: Devir hijyeni — salt sözlüğü + depth birleşiği + walkT reset

**Files:**
- Modify: `frontend/lib/game/td/tdCore.ts` (hash2d JSDoc + depth kullanımı notu)
- Modify: `frontend/lib/game/td/TdWorldScene.ts` (hero depth → tdCore.depth; walkT reset)
- Test: `frontend/scripts/td-core-test.ts` (depth monotonluk testi güçlendir)

- [ ] **Step 1:** `tdCore.ts`'te hash2d JSDoc'unu şununla değiştir:

```ts
/**
 * Deterministik 2B hash — harita/deko üretiminin tek rastgelelik kaynağı.
 * SALT SÖZLÜĞÜ (çakışma yasak): 0=serbest, 1=bölge blend (worldMap),
 * 2=tile deko (tiles), 3=prop yerleşim, 4=prop varyant, 5=kaya, 6=çalı.
 * Yeni tüketici buraya kayıt düşmeden salt alamaz.
 */
```

- [ ] **Step 2:** `TdWorldScene.ts`: import'a `depth` ekle (`from './tdCore'`); `this.hero.setDepth(this.heroPos.y)` satırını `this.hero.setDepth(depth(this.heroPos.x, this.heroPos.y))` yap; `} else this.walkIdx = 0;` satırını `} else { this.walkIdx = 0; this.walkT = 0; }` yap.

- [ ] **Step 3:** `td-core-test.ts`'e final console.log'dan önce ekle:

```ts
eq('depth-x-tiebreak', depth(3, 100) !== depth(7, 100), true);
eq('depth-y-dominates', depth(9, 101) > depth(0, 100), true);
```
Beklenen satırı `td-core: 16 pass, 0 fail` yap.

- [ ] **Step 4:** Çalıştır: `cd frontend && npx tsx scripts/td-core-test.ts` → `16 pass`. Typecheck: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "game/td" ; true` → boş.

- [ ] **Step 5:** Commit: `git add frontend/lib/game/td/tdCore.ts frontend/lib/game/td/TdWorldScene.ts frontend/scripts/td-core-test.ts && git commit -m "chore(td): salt sözlüğü + depth birleşiği + walkT reset (Faz1 devir 1-2-4)"` (+ standart trailer'lar).

---

### Task 2: worldProps — deterministik prop yerleşimi (saf, Node-testli)

**Files:**
- Create: `frontend/lib/game/td/worldProps.ts`
- Test: `frontend/scripts/td-props-test.ts`

- [ ] **Step 1: Failing test:**

```ts
// frontend/scripts/td-props-test.ts
import { propsForChunk, allTownProps, dungeonDoors, TOWN_ORIGIN } from '../lib/game/td/worldProps';
import { getTile } from '../lib/game/td/worldMap';
import { HUB_GAMES } from '../lib/game/hub/hubGames';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };

// determinizm: forest merkez chunk'ı (150/48≈3) iki üretimde birebir
const a = propsForChunk(3, 3), b = propsForChunk(3, 3);
ok('deterministic', JSON.stringify(a) === JSON.stringify(b));
// yoğunluk: forest chunk'ında makul ağaç sayısı
const trees = a.filter(p => p.kind === 'tree').length;
console.log('forest chunk trees:', trees);
ok('forest-density', trees > 80 && trees < 400);
// hiçbir otomatik prop collision tile üstünde değil
ok('no-props-on-collision', a.every(p => !getTile(Math.floor(p.x / 16), Math.floor(p.y / 16)).collision));
// kasaba: bina sayısı = HUB_GAMES, hepsi kasaba chunk'ında (192/48=4)
const town = allTownProps();
ok('buildings-count', town.filter(p => p.kind === 'building').length === HUB_GAMES.length);
const c44 = propsForChunk(4, 4);
ok('town-buildings-in-chunk', c44.filter(p => p.kind === 'building').length === HUB_GAMES.length);
// bina rect'leri içinde otomatik ağaç yok
const solids = town.filter(p => p.solid).map(p => p.solid!);
const inSolid = (x: number, y: number) => solids.some(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
ok('no-tree-in-buildings', c44.filter(p => p.kind === 'tree').every(p => !inSolid(p.x, p.y)));
// zindan kapıları: 14 adet (town/forest/grassE/grassS hariç), koordinatlar bölge merkezinde
const doors = dungeonDoors();
ok('doors-14', doors.length === 14);
ok('doors-have-data', doors.every(d => !!d.data?.id && !!d.solid));
console.log('TOWN_ORIGIN', TOWN_ORIGIN);
console.log(`td-props: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
```

- [ ] **Step 2:** FAIL gör (module not found).

- [ ] **Step 3: Implement:**

```ts
// frontend/lib/game/td/worldProps.ts
// ─── Deterministik prop yerleşimi (saf; DOM yok) ───
// Kasaba binaları HUB_GAMES'ten türetilir (tek doğruluk kaynağı korunur).
// salt sözlüğü: 3=yerleşim(ağaç), 4=varyant, 5=kaya, 6=çalı (bkz tdCore.hash2d).
import { CHUNK, hash2d } from './tdCore';
import { getTile, regionAt, REGIONS, TOWN_SPAWN } from './worldMap';
import { HUB_GAMES, buildingRect } from '../hub/hubGames';

export type PropKind = 'tree' | 'rock' | 'bush' | 'campfire' | 'building' | 'door_dungeon';
export interface TdProp {
  kind: PropKind;
  x: number; y: number;                    // dünya px (taban/ayak noktası)
  v?: number;                              // sprite varyantı
  solid?: { x: number; y: number; w: number; h: number };
  data?: { id?: string; name?: string; icon?: string; url?: string; accent?: string; wTiles?: number; hTiles?: number; region?: string };
}

/** hubGames yerel tile koordinatlarının dünya ofseti — kasaba kuzeybatısı. */
export const TOWN_ORIGIN = { tx: 174, ty: 168 };

// biome → ağaç yoğunluğu (‰, tile başına)
const TREE_DENS: Record<string, number> = {
  forest: 90, grass: 25, town: 6, swamp: 45, frostwastes: 30, sanctum: 35,
  necropolis: 18, ruins: 14, mines: 10, citadel: 12, volcano: 6, crypt: 12,
  abyss: 8, forge: 6, demongate: 6, voidrealm: 5, eternal: 8, water: 0, path: 0,
};
const ROCK_DENS: Record<string, number> = {
  mines: 30, volcano: 26, forge: 20, ruins: 18, frostwastes: 14, abyss: 14,
  town: 2, water: 0, path: 0,
};
const BUSH_DENS: Record<string, number> = { forest: 14, grass: 12, town: 6, swamp: 10, water: 0, path: 0 };

function townProps(): TdProp[] {
  const out: TdProp[] = [];
  for (const g of HUB_GAMES) {
    const r = buildingRect(g);
    const doorTx = TOWN_ORIGIN.tx + g.door.tx, doorTy = TOWN_ORIGIN.ty + g.door.ty;
    out.push({
      kind: 'building', x: doorTx * 16 + 8, y: doorTy * 16 + 15,
      solid: { x: (TOWN_ORIGIN.tx + r.c0) * 16, y: (TOWN_ORIGIN.ty + r.r0) * 16, w: g.size.w * 16, h: g.size.h * 16 - 6 },
      data: { id: g.id, name: g.name, icon: g.icon, url: g.url, accent: g.accent, wTiles: g.size.w, hTiles: g.size.h },
    });
  }
  // meydan kamp ateşi (spawn'ın 3 tile kuzeyi)
  out.push({
    kind: 'campfire', x: TOWN_SPAWN.tx * 16 + 8, y: (TOWN_SPAWN.ty - 3) * 16 + 10,
    solid: { x: TOWN_SPAWN.tx * 16 + 2, y: (TOWN_SPAWN.ty - 3) * 16 + 4, w: 12, h: 6 },
  });
  return out;
}
let TOWN_CACHE: TdProp[] | null = null;
export function allTownProps(): TdProp[] { return TOWN_CACHE ?? (TOWN_CACHE = townProps()); }

/** Kasaba/çayır/orman DIŞI 14 bölgenin merkezine zindan kapısı. */
export function dungeonDoors(): TdProp[] {
  return REGIONS.filter(r => !['town', 'forest', 'grassE', 'grassS'].includes(r.key)).map(r => ({
    kind: 'door_dungeon' as const, x: r.cx * 16 + 8, y: r.cy * 16 + 14,
    solid: { x: r.cx * 16 - 8, y: r.cy * 16 - 2, w: 32, h: 14 },
    data: { id: r.key, name: r.key.toUpperCase(), region: r.key },
  }));
}

// otomatik yerleşime kapalı alanlar: bina rect'leri (+1 tile pay), kapı önleri, spawn ±3, zindan kapısı ±2
function reserved(tx: number, ty: number): boolean {
  if (Math.abs(tx - TOWN_SPAWN.tx) <= 3 && Math.abs(ty - TOWN_SPAWN.ty) <= 3) return true;
  for (const p of allTownProps()) {
    if (!p.solid) continue;
    const s = p.solid;
    if (tx * 16 + 8 >= s.x - 16 && tx * 16 + 8 < s.x + s.w + 16 && ty * 16 + 8 >= s.y - 16 && ty * 16 + 8 < s.y + s.h + 32) return true;
  }
  for (const d of dungeonDoors()) {
    if (Math.abs(tx * 16 + 8 - d.x) <= 32 && Math.abs(ty * 16 + 8 - d.y) <= 32) return true;
  }
  return false;
}

/** Chunk'ın deterministik prop listesi (kasaba sabitleri + kapılar dahil, koordinata filtreli). */
export function propsForChunk(cx: number, cy: number): TdProp[] {
  const out: TdProp[] = [];
  const bx = cx * CHUNK, by = cy * CHUNK;
  const inChunk = (p: TdProp) => p.x >= bx * 16 && p.x < (bx + CHUNK) * 16 && p.y >= by * 16 && p.y < (by + CHUNK) * 16;
  for (const p of allTownProps()) if (inChunk(p)) out.push(p);
  for (const d of dungeonDoors()) if (inChunk(d)) out.push(d);
  for (let ty = by; ty < by + CHUNK; ty++) for (let tx = bx; tx < bx + CHUNK; tx++) {
    const t = getTile(tx, ty);
    if (t.collision || t.biome === 'water') continue;
    if (reserved(tx, ty)) continue;
    const rgKey = regionAt(tx, ty).key;
    const hT = hash2d(tx, ty, 3);
    if (hT % 1000 < (TREE_DENS[t.biome] ?? 12)) {
      out.push({ kind: 'tree', x: tx * 16 + 8, y: ty * 16 + 14, v: hash2d(tx, ty, 4) % 4,
        solid: { x: tx * 16 + 3, y: ty * 16 + 10, w: 10, h: 6 }, data: { region: rgKey } });
      continue;
    }
    if (hash2d(tx, ty, 5) % 1000 < (ROCK_DENS[t.biome] ?? 6)) {
      out.push({ kind: 'rock', x: tx * 16 + 8, y: ty * 16 + 12, v: hash2d(tx, ty, 4) % 2,
        solid: { x: tx * 16 + 2, y: ty * 16 + 8, w: 12, h: 6 }, data: { region: rgKey } });
      continue;
    }
    if (hash2d(tx, ty, 6) % 1000 < (BUSH_DENS[t.biome] ?? 4)) {
      out.push({ kind: 'bush', x: tx * 16 + 8, y: ty * 16 + 13, v: hash2d(tx, ty, 4) % 2, data: { region: rgKey } });
    }
  }
  return out;
}
```

- [ ] **Step 4:** Test PASS (`td-props: 8 pass, 0 fail`) + typecheck boş. Ağaç sayısını çıktıdan not et.

- [ ] **Step 5:** Commit: `feat(td): worldProps — deterministik yerleşim, HUB_GAMES kasabası, 14 zindan kapısı`.

---

### Task 3: sprites/props — prop sprite fabrikaları (DOM)

**Files:**
- Create: `frontend/lib/game/td/sprites/props.ts`

- [ ] **Step 1: Implement** (client-only; demo reçetesinin production portu):

```ts
// frontend/lib/game/td/sprites/props.ts
// ─── Prop sprite fabrikaları (client-only; SSR'da ÇAĞIRMA) ───
import { spr, outline } from './chibi';

const SNOW = '#eef6f8', TRUNK = '#5f4430';

/** Karlı çam — v: 0/1 küçük iki ton, 2/3 büyük iki ton. Çıktı meta: {img,ox,oy}. */
export function mkTree(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const big = v >= 2, tone = v % 2;
  const w = big ? 20 : 16, h = big ? 30 : 24, c0 = w >> 1;
  const G = tone ? ['#2b6e59', '#225746', '#3a8a70'] : ['#2f7a4c', '#265f3c', '#3f9660'];
  const layers: [number, number][] = big ? [[1, 6], [7, 8], [14, 10]] : [[1, 5], [6, 6], [11, 8]];
  const img = outline(spr(w, h, (px) => {
    px(c0 - 1, h - 6, 2, 6, TRUNK);
    for (const [cy, half] of layers) {
      for (let r = 0; r < half; r++) px(c0 - (r + 1), cy + r, (r + 1) * 2, 1, G[0]);
      px(c0 - half, cy + half - 1, half * 2, 1, G[1]);
      px(c0 - 2, cy + 2, 2, 1, G[2]);
      px(c0 - 1, cy, 2, 1, SNOW);
      px(c0 - half + 1, cy + half - 1, 3, 1, SNOW);
      px(c0 + half - 4, cy + half - 1, 3, 1, SNOW);
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

export function mkRock(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const ore = v === 1;
  const img = outline(spr(14, 11, (px) => {
    px(2, 4, 10, 6, '#8b95a0'); px(4, 2, 7, 3, '#8b95a0'); px(3, 3, 3, 2, '#a5aeb8');
    px(2, 8, 10, 2, '#6c7681'); px(10, 3, 2, 2, '#6c7681'); px(4, 1, 5, 1, SNOW);
    if (ore) { px(6, 5, 2, 1, '#e8b23f'); px(9, 7, 1, 1, '#e8b23f'); px(4, 7, 1, 1, '#e8b23f'); }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

export function mkBush(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const berry = v === 1;
  const img = outline(spr(26, 16, (px) => {
    px(6, 2, 14, 4, '#3f8a56'); px(4, 4, 18, 8, '#3f8a56'); px(2, 7, 22, 6, '#3f8a56');
    px(2, 11, 22, 3, '#2f6a44'); px(6, 3, 8, 2, '#5aa06a'); px(4, 6, 4, 2, '#5aa06a');
    px(8, 1, 6, 1, SNOW); px(16, 4, 4, 1, SNOW); px(3, 8, 3, 1, SNOW);
    if (berry) for (const [bx, by] of [[6, 6], [12, 8], [18, 5], [9, 11], [16, 10]] as const) {
      px(bx, by, 3, 3, '#e84142'); px(bx, by, 1, 1, '#ffd0c8');
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

/** 4-karelik kamp ateşi. */
export function mkFireFrames(): HTMLCanvasElement[] {
  return [0, 1, 2, 3].map(f => outline(spr(14, 12, (px) => {
    px(2, 9, 10, 2, '#5a4028'); px(3, 8, 3, 2, '#6b4c31'); px(8, 8, 3, 2, '#6b4c31');
    const F1 = '#ff9d3f', F2 = '#ffd23f';
    if (f === 0) { px(5, 3, 4, 6, F1); px(6, 1, 2, 4, F2); px(4, 6, 6, 3, F1); }
    else if (f === 1) { px(4, 4, 6, 5, F1); px(5, 2, 3, 4, F2); px(8, 3, 2, 3, F2); }
    else if (f === 2) { px(5, 2, 4, 7, F1); px(6, 0, 2, 4, F2); px(4, 5, 2, 4, F1); }
    else { px(4, 3, 6, 6, F1); px(6, 2, 2, 3, F2); px(9, 4, 1, 4, F1); px(3, 6, 2, 3, F1); }
  })));
}

/** Hub binası — wTiles×hTiles, accent çatı, emoji tabela. Taban = alt kenar. */
export function mkBuilding(wTiles: number, hTiles: number, accent: string, icon: string): { img: HTMLCanvasElement; ox: number; oy: number } {
  const W = wTiles * 16, H = hTiles * 16 + 14; // +14 çatı taşması
  const base = spr(W, H, (px, g) => {
    const wallH = hTiles * 16 - 8;
    px(2, H - wallH, W - 4, wallH, '#8a6845');                       // duvar
    px(2, H - wallH, W - 4, 3, '#75563a');
    for (let i = 1; i < hTiles; i++) px(2, H - wallH + i * 14, W - 4, 1, 'rgba(0,0,0,.14)');
    const roofH = 16;                                                 // accent çatı
    for (let r = 0; r < roofH; r++) {
      const inset = Math.max(0, Math.floor((roofH - r) * 0.45));
      px(inset, H - wallH - roofH + r, W - inset * 2, 1, r < 3 ? SNOW : accent);
    }
    px(0, H - wallH - 2, W, 3, '#3d3126');
    const dw = 10, dx0 = (W - dw) >> 1;                               // kapı
    px(dx0, H - 14, dw, 14, '#5a4028'); px(dx0 + 1, H - 13, dw - 2, 13, '#4a3420');
    px(dx0 + dw - 3, H - 8, 2, 2, '#e8b23f');
    px(4, H - wallH + 4, 8, 7, '#ffd98a'); px(W - 12, H - wallH + 4, 8, 7, '#ffd98a'); // pencereler
    // tabela: emoji
    g.font = '9px serif'; g.textAlign = 'center';
    g.fillStyle = '#caa06a'; g.fillRect((W >> 1) - 7, H - wallH - 12, 14, 11);
    g.fillText(icon, W >> 1, H - wallH - 3);
  });
  const img = outline(base);
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

/** Zindan kapısı — taş kemer + bölge-accent parıltı noktası. */
export function mkDungeonDoor(): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(28, 22, (px) => {
    px(2, 6, 24, 16, '#6c7681'); px(4, 2, 20, 6, '#6c7681'); px(6, 0, 16, 3, '#8b95a0');
    px(9, 8, 10, 14, '#1a2028'); px(10, 6, 8, 3, '#1a2028');
    px(4, 4, 4, 2, SNOW); px(20, 3, 4, 2, SNOW);
    px(13, 12, 2, 2, '#9fe8ff');
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}
```

- [ ] **Step 2:** Typecheck boş.
- [ ] **Step 3:** Commit: `feat(td): prop sprite fabrikaları — çam/kaya/çalı/ateş/bina/zindan kapısı`.

---

### Task 4: atmosphere — bölge renk banyosu verisi

**Files:**
- Create: `frontend/lib/game/td/atmosphere.ts`
- Test: `frontend/scripts/td-atmo-test.ts`

- [ ] **Step 1: Failing test:**

```ts
// frontend/scripts/td-atmo-test.ts
import { atmoForRegion } from '../lib/game/td/atmosphere';
import { REGIONS } from '../lib/game/td/worldMap';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };
ok('all-regions-mapped', REGIONS.every(r => !!atmoForRegion(r.key)));
const t = atmoForRegion('town');
ok('sane-alphas', t.tintAlpha > 0 && t.tintAlpha <= 0.15 && t.fogAlpha > 0 && t.fogAlpha <= 0.3);
ok('distinct-volcano-town', atmoForRegion('volcano').tint !== atmoForRegion('town').tint);
console.log(`td-atmo: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
```

- [ ] **Step 2:** FAIL gör. **Step 3: Implement** — `lib/game/iso/zoneAtmosphere.ts`'teki ZONE_ATMOSPHERE değerlerini KOPYALA (iso dosyasına dokunma; değer birebir, koment kısalt) ve bölge eşlemesi ekle:

```ts
// frontend/lib/game/td/atmosphere.ts
// ─── Bölge → renk banyosu (iso zoneAtmosphere değerlerinin TD portu) ───
export interface TdAtmo { tint: number; tintAlpha: number; fogColor: number; fogAlpha: number }

const ATMO: Record<string, TdAtmo> = {
  Town:        { tint: 0x88bbff, tintAlpha: 0.04, fogColor: 0xbbddff, fogAlpha: 0.10 },
  Forest:      { tint: 0x66cc88, tintAlpha: 0.05, fogColor: 0x88ccaa, fogAlpha: 0.12 },
  IceCave:     { tint: 0x66bbee, tintAlpha: 0.08, fogColor: 0xaaddff, fogAlpha: 0.16 },
  Volcano:     { tint: 0xff6633, tintAlpha: 0.07, fogColor: 0x662211, fogAlpha: 0.18 },
  Crypt:       { tint: 0x554477, tintAlpha: 0.10, fogColor: 0x332244, fogAlpha: 0.20 },
  Abyss:       { tint: 0x2266aa, tintAlpha: 0.10, fogColor: 0x113355, fogAlpha: 0.22 },
  Sanctum:     { tint: 0xffb84d, tintAlpha: 0.08, fogColor: 0x8a5a1e, fogAlpha: 0.15 },
  Swamp:       { tint: 0x6b7a2e, tintAlpha: 0.10, fogColor: 0x3d4a1f, fogAlpha: 0.21 },
  Mines:       { tint: 0x8899bb, tintAlpha: 0.07, fogColor: 0x445566, fogAlpha: 0.16 },
  Citadel:     { tint: 0xb0c4ff, tintAlpha: 0.06, fogColor: 0xd4defc, fogAlpha: 0.13 },
  Necropolis:  { tint: 0x443355, tintAlpha: 0.11, fogColor: 0x221133, fogAlpha: 0.22 },
  FrostWastes: { tint: 0xcfeaff, tintAlpha: 0.08, fogColor: 0xeef6ff, fogAlpha: 0.18 },
  DemonGate:   { tint: 0xcc2200, tintAlpha: 0.08, fogColor: 0x551100, fogAlpha: 0.18 },
  Ruins:       { tint: 0xbbaa77, tintAlpha: 0.06, fogColor: 0x887755, fogAlpha: 0.14 },
  VoidRealm:   { tint: 0x5a2e8f, tintAlpha: 0.12, fogColor: 0x1e0a3a, fogAlpha: 0.24 },
  Forge:       { tint: 0xdd6600, tintAlpha: 0.07, fogColor: 0x663300, fogAlpha: 0.16 },
  Eternal:     { tint: 0x330055, tintAlpha: 0.12, fogColor: 0x110022, fogAlpha: 0.24 },
};

const REGION_TO_ATMO: Record<string, string> = {
  town: 'Town', forest: 'Forest', grassE: 'Forest', grassS: 'Town',
  swamp: 'Swamp', mines: 'Mines', ruins: 'Ruins', citadel: 'Citadel',
  sanctum: 'Sanctum', crypt: 'Crypt', frostwastes: 'FrostWastes',
  necropolis: 'Necropolis', volcano: 'Volcano', abyss: 'Abyss',
  forge: 'Forge', demongate: 'DemonGate', voidrealm: 'VoidRealm', eternal: 'Eternal',
};

export function atmoForRegion(regionKey: string): TdAtmo {
  return ATMO[REGION_TO_ATMO[regionKey] ?? 'Town'] ?? ATMO.Town;
}
```

- [ ] **Step 4:** `td-atmo: 3 pass, 0 fail` + typecheck boş. **Step 5:** Commit: `feat(td): bölge atmosfer verisi (iso değerlerinin portu)`.

---

### Task 5: Sahne entegrasyonu — prop render + collision + etkileşim + atmosfer + minimap

**Files:**
- Modify: `frontend/lib/game/td/TdWorldScene.ts`
- Modify: `frontend/app/worldtestnet/page.tsx` (hub-open toast dinleyicisi)

Bu görev büyük; alt adımları sırayla, her biri sonrası typecheck.

- [ ] **Step 1: Prop texture kaydı + chunk prop grupları.** Scene'e ekle: import `{ propsForChunk, type TdProp } from './worldProps'`, `{ mkTree, mkRock, mkBush, mkFireFrames, mkBuilding, mkDungeonDoor } from './sprites/props'`, `{ depth } from './tdCore'` (Task 1'de geldi), `{ atmoForRegion } from './atmosphere'`, `{ regionAt } from './worldMap'`. `create()` başında texture kayıtları:

```ts
    // prop texture'ları (bir kez)
    const reg = (key: string, m: { img: HTMLCanvasElement }) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, m.img); };
    for (let v = 0; v < 4; v++) { const m = mkTree(v); reg(`td-tree-${v}`, m); this.propMeta.set(`tree-${v}`, { ox: m.ox, oy: m.oy }); }
    for (let v = 0; v < 2; v++) { const m = mkRock(v); reg(`td-rock-${v}`, m); this.propMeta.set(`rock-${v}`, { ox: m.ox, oy: m.oy }); }
    for (let v = 0; v < 2; v++) { const m = mkBush(v); reg(`td-bush-${v}`, m); this.propMeta.set(`bush-${v}`, { ox: m.ox, oy: m.oy }); }
    mkFireFrames().forEach((c, f) => { if (!this.textures.exists(`td-fire-${f}`)) this.textures.addCanvas(`td-fire-${f}`, c); });
    const dd = mkDungeonDoor(); reg('td-door-dungeon', dd); this.propMeta.set('door', { ox: dd.ox, oy: dd.oy });
```
Alan tanımları: `private propMeta = new Map<string, { ox: number; oy: number }>();`, `private chunkProps = new Map<string, { objs: Phaser.GameObjects.GameObject[]; solids: NonNullable<TdProp['solid']>[]; interactives: TdProp[] }>();`, `private fires: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];`.

Bina texture'ları per-id (boyut/accent farklı): chunk yüklerken `td-bld-${p.data.id}` yoksa `mkBuilding(p.data.wTiles!, p.data.hTiles!, p.data.accent!, p.data.icon!)` ile üret.

- [ ] **Step 2: streamChunks'a prop ekleme/tahliye.** Chunk eklenirken (`this.chunks.set(key, img)` sonrası):

```ts
      if (!this.chunkProps.has(key)) {
        const list = propsForChunk(c.cx, c.cy);
        const objs: Phaser.GameObjects.GameObject[] = [];
        const solids: NonNullable<TdProp['solid']>[] = [];
        const interactives: TdProp[] = [];
        for (const p of list) {
          if (p.solid) solids.push(p.solid);
          if (p.kind === 'building' || p.kind === 'door_dungeon') interactives.push(p);
          let texKey = '', meta = { ox: 8, oy: 14 };
          if (p.kind === 'tree') { texKey = `td-tree-${p.v ?? 0}`; meta = this.propMeta.get(`tree-${p.v ?? 0}`)!; }
          else if (p.kind === 'rock') { texKey = `td-rock-${p.v ?? 0}`; meta = this.propMeta.get(`rock-${p.v ?? 0}`)!; }
          else if (p.kind === 'bush') { texKey = `td-bush-${p.v ?? 0}`; meta = this.propMeta.get(`bush-${p.v ?? 0}`)!; }
          else if (p.kind === 'door_dungeon') { texKey = 'td-door-dungeon'; meta = this.propMeta.get('door')!; }
          else if (p.kind === 'campfire') {
            const img = this.add.image(p.x, p.y, 'td-fire-0').setOrigin(0.5, 0.9).setDepth(depth(p.x, p.y));
            this.fires.push({ img, x: p.x, y: p.y }); objs.push(img); continue;
          } else if (p.kind === 'building') {
            const bk = `td-bld-${p.data!.id}`;
            if (!this.textures.exists(bk)) {
              const bm = mkBuilding(p.data!.wTiles!, p.data!.hTiles!, p.data!.accent!, p.data!.icon!);
              this.textures.addCanvas(bk, bm.img);
            }
            const img = this.add.image(p.x, p.y, bk).setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
            const label = this.add.text(p.x, p.y - p.data!.hTiles! * 16 - 18, p.data!.name!, {
              fontSize: '8px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
            }).setOrigin(0.5, 1).setDepth(depth(p.x, p.y) + 1);
            objs.push(img, label); continue;
          }
          const img = this.add.image(p.x, p.y, texKey).setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
          objs.push(img);
        }
        this.chunkProps.set(key, { objs, solids, interactives });
      }
```
`evictChunk`'a: `const cp = this.chunkProps.get(key); if (cp) { cp.objs.forEach(o => o.destroy()); this.chunkProps.delete(key); this.fires = this.fires.filter(f => f.img.active); }`.
NOT: su-tazeleme yolunda (`refreshWater && ...`) chunk image'ı yeniden yaratılırken chunkProps'a DOKUNMA (zaten `this.chunkProps.has(key)` guard'ı var).

- [ ] **Step 3: Prop collision.** `canMove` içine tile kontrolünden sonra:

```ts
    for (const cp of this.chunkProps.values()) {
      for (const s of cp.solids) {
        if (nx + 4 > s.x && nx - 4 < s.x + s.w && ny + 3 > s.y && ny < s.y + s.h) return false;
      }
    }
```

- [ ] **Step 4: Ateş animasyonu + etkileşim + atmosfer + minimap.** update() sonuna:

```ts
    // kamp ateşi 4-kare (130ms)
    const ff = Math.floor(t / 130) % 4;
    for (const f of this.fires) f.img.setTexture(`td-fire-${ff}`);
    // etkileşim: en yakın interaktif ≤ 28px
    let near: TdProp | null = null; let nd = 28;
    for (const cp of this.chunkProps.values()) for (const p of cp.interactives) {
      const d = Math.hypot(this.heroPos.x - p.x, this.heroPos.y - p.y);
      if (d < nd) { nd = d; near = p; }
    }
    if (near !== this.nearProp) {
      this.nearProp = near;
      this.hintText.setText(near
        ? (near.kind === 'building' ? `E — ${near.data!.name}` : `⛓ ${near.data!.name} — sealed (Phase 3)`)
        : '').setVisible(!!near);
    }
    // atmosfer lerp
    const atmo = atmoForRegion(regionAt(Math.floor(this.heroPos.x / 16), Math.floor(this.heroPos.y / 16)).key);
    this.tintRect.fillColor = atmo.tint; this.tintRect.fillAlpha += (atmo.tintAlpha - this.tintRect.fillAlpha) * 0.05;
    this.fogRect.fillColor = atmo.fogColor; this.fogRect.fillAlpha += (atmo.fogAlpha - this.fogRect.fillAlpha) * 0.05;
    // minimap hero noktası
    if (this.minimapDot?.visible) this.minimapDot.setPosition(this.minimapX + this.heroPos.x / (MAP_W * TILE) * 96, this.minimapY + this.heroPos.y / (MAP_H * TILE) * 96);
```
create()'e alanlar + kurulum: `nearProp: TdProp | null = null`; hintText (bottom-center, scrollFactor 0, depth 1e9, boş başlar); tintRect/fogRect: `this.add.rectangle(VIEW_W/2, VIEW_H/2, VIEW_W, VIEW_H, 0x88bbff, 0.04).setScrollFactor(0).setDepth(1500)` + fog alt bant `(VIEW_W/2, VIEW_H-24, VIEW_W, 48, ...)` depth 1501 (VIEW_W/H importu tdCore'dan). E tuşu: `kb.on('keydown-E', () => { const p = this.nearProp; if (p?.kind === 'building') window.dispatchEvent(new CustomEvent('td-hub-open', { detail: { url: p.data!.url, name: p.data!.name, accent: p.data!.accent } })); });` M tuşu: minimap toggle — create'te bir kez üret:

```ts
    // minimap (96×96: 4 tile/px, bölge renkleri BIOME_PAL[0])
    kb.on('keydown-M', () => this.toggleMinimap());
```
toggleMinimap(): ilk çağrıda canvas üret (`document.createElement`, her 4. tile için `getTile` → tiles.ts'ten export edilecek `biomeTopColor(biome)` yardımıyla renk; tiles.ts'e ekle: `export function biomeTopColor(b: Biome): string { return BIOME_PAL[b][0]; }`), 'td-minimap' texture + sağ-üst image (scrollFactor 0, depth 1e9) + kırmızı 2×2 dot; sonraki çağrılar visible toggle. Alanlar: `minimapImg?`, `minimapDot?`, `minimapX = VIEW_W - 100`, `minimapY = 4`.

- [ ] **Step 5: worldtestnet sayfasına toast.** `page.tsx`'e `useEffect` ekle: `td-hub-open` dinle; köşede 2.5s'lik toast div göster: `«{name} — opens after the World switch (Phase 5)»` (state ile; stil: sabit sağ-alt, koyu chip, accent sol bordür).

- [ ] **Step 6:** Typecheck boş → `npm run build` ✓ → commit: `feat(td): sahne içeriği — prop render/collision, hub etkileşimi, atmosfer, minimap`.

---

### Task 6: Smoke scripti — headless doğrulama (repoya kalıcı)

**Files:**
- Create: `frontend/scripts/td-walk-smoke.py` (python playwright; repo'da python precedenti: build-verified-collections.py)

- [ ] **Step 1:** Scripti yaz — localhost:3000 varsayar (`TD_URL` env ile override):

```python
# frontend/scripts/td-walk-smoke.py — TD world headless smoke (dev server gerekli)
# Kullanım: python3 scripts/td-walk-smoke.py  (önce: npm run dev)
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/worldtestnet')
fails = []
def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1200, 'height': 800})
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)
    S = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"
    hero = lambda: pg.evaluate(S % "({...s.heroPos})")
    p0 = hero()
    f0 = pg.evaluate("() => window.__tdGame.loop.frame")
    time.sleep(1)
    check('raf-alive', pg.evaluate("() => window.__tdGame.loop.frame") > f0)
    # hareket
    pg.keyboard.down('d'); time.sleep(1.5); pg.keyboard.up('d')
    p1 = hero()
    check('moves-east', p1['x'] - p0['x'] > 100)
    # prop'lar yüklendi + collision solid listesi dolu
    stats = pg.evaluate(S % "({chunks: s.chunkProps.size, solids: [...s.chunkProps.values()].reduce((n,c)=>n+c.solids.length,0), inter: [...s.chunkProps.values()].reduce((n,c)=>n+c.interactives.length,0)})")
    print('stats', json.dumps(stats))
    check('props-loaded', stats['chunks'] >= 4 and stats['solids'] > 20)
    check('town-interactives', stats['inter'] >= 9)  # 9 hub binası (+ yakın kapılar)
    # fps
    time.sleep(1)
    fps = pg.evaluate("() => window.__tdGame.loop.actualFps")
    print('fps', round(fps))
    check('fps-ok', fps > 40)
    pg.screenshot(path='/tmp/td-smoke.png')
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2:** Dev server aç (`rm -rf .next && npm run dev &`), scripti koştur: `python3 scripts/td-walk-smoke.py` → `OK`. `/tmp/td-smoke.png`'yi kontrol için sakla. Dev server'ı kapat.
- [ ] **Step 3:** Commit: `test(td): headless walk-smoke scripti (hareket/prop/fps assertion'ları)`.

---

### Task 7: Faz 2 kapanışı — tüm testler + görsel tur + deploy

- [ ] **Step 1:** `npx tsx scripts/td-core-test.ts && npx tsx scripts/td-map-test.ts && npx tsx scripts/td-props-test.ts && npx tsx scripts/td-atmo-test.ts` → hepsi 0 fail; **harita imzası hâlâ 3830429448**.
- [ ] **Step 2:** İzo dokunulmazlık: `git diff --stat origin/frozenfriends-mvp...HEAD -- frontend/lib/game/iso frontend/lib/game/scenes frontend/lib/game/sceneLoader.ts frontend/lib/game/hub/hubGames.ts | cat` → BOŞ.
- [ ] **Step 3:** `npm run build` ✓ + `npx tsx scripts/hub-registry-test.ts` PASS.
- [ ] **Step 4 (controller yapar):** Görsel tur — kasaba (binalar+tabelalar+ateş), orman yoğunluğu, bir zindan kapısı, atmosfer geçişi, minimap (M), E-toast. Deploy: rsync + pm2 restart + canlı screenshot.
- [ ] **Step 5:** Plan checkbox'ları + commit + push.

---

## Self-Review Notları
- **Spec kapsaması:** §2.1 kasaba+hub binaları+zindan kapıları ✓, §4 atmosfer+prop'lar ✓, minimap ✓; Faz 1 devir #1 (salt legend) T1, #2 (depth) T1+T5, #4 (walkT) T1'de. #3 (su overlay) bilinçli ertelendi — bu fazda kıyı büyümüyor. #5-6 not olarak duruyor.
- **Tip tutarlılığı:** TdProp/propsForChunk imzaları T2↔T5; mkX dönüşleri `{img,ox,oy}` — T5'te `setOrigin(0.5,1)` kullanıldığı için ox/oy meta aslında yalnız tree/rock/bush'ta gölge-hizalama içindir; origin tabanlı çizim tutarlı.
- **Bilinen basitleştirme:** kasaba duvar/yol dokusu yok (Faz 2.5 cila adayı); building tabela emoji'si canvas fillText — pixel-perfect değil, kabul.
