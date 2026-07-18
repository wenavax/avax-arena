# World Görsel Yükseltme Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** İzometrik World'ün görsellerini hibrit yönde ciddi yükseltmek: sprite monster/NPC'ler + prosedürel zemin 2.0 (ışık/atmosfer) + zone kimlik dekorları + savaş/HUD cilası.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-18-world-visual-upgrade-design.md`. Tek doğruluk kaynakları: `monsterSprites.ts` (tip→arketip→frame), `zoneAtmosphere.ts` (zone→renk banyosu), `zoneProps.ts` (zone→prop seti). Ortak render yolu `IsoBaseScene.createMonsterVisual()` — eşlemesiz tip prosedürel fallback'e düşer. Terrain, chunk'lanmış Graphics + viewport culling ile hızlanır (spec'teki RenderTexture fikri bellek maliyeti yüzünden chunk+cull ile değiştirildi — 96×96 harita tek RT'de ~80MB olurdu).

**Tech Stack:** Phaser 3 (Graphics + spritesheet), Next.js, Playwright (npx cache'ten, `hub-embed-smoke.mjs` kalıbı), tsx test scriptleri.

**Kritik bağlam (uygulayıcı için):**
- `frontend/lib/game/iso/IsoBaseScene.ts` (3182 satır) — create: 143. satır civarı; `renderTerrain()` :309; `drawDecoration()` :335; `createPlayer()` :668; `redrawPlayerBody()` :871; `addMonsterAt()` :2089 (SADECE genel yardımcı; sahnelerin çoğu KENDİ `spawnMonsterAt`'ını kullanır, örn. `IsoForestScene.ts:727`).
- `frontend/lib/game/iso/core.ts` — `drawColumn/drawTopFace/drawLeftWall/drawRightWall`, `ZONE_BIOME_COLORS`, `toScreen`, `isoDepth`. `ISO_TILE_W=64, ISO_TILE_H=32, ISO_BLOCK_H=12`.
- Spritesheet'ler: `kenney-1bit.png` BootScene'de `'tiles'` anahtarıyla YÜKLÜ (16px, spacing 1 → 49 sütun × 22 satır, frame index = satır*49+sütun). `tiny-dungeon.png` (12×11 grid) ve `tiny-battle.png` (18×11 grid) public'te var ama yüklü değil.
- 18 zone scene key'i: Town, Forest, Dungeon, IceCave, Volcano, Crypt, Abyss, Sanctum, Swamp, Mines, Citadel, Necropolis, FrostWastes, DemonGate, Ruins, VoidRealm, Forge, Eternal.
- Monster tipleri: sahnelerde `type: 'xxx'` deseniyle ~125 benzersiz tip (potion/xp/quest pickup'ları hariç). Boss tipleri prosedürel KALIR.
- Depth düzeni: terrain 0 · dekor `isoDepth+2` · monster `isoDepth+3..5` · oyuncu `isoDepth+5` · gate label 49-52 · diyalog 2000 · minimap 4500 bandı. Yeni atmosfer overlay'leri 1500-1501 (diyaloğun ALTINDA), ışık havuzları 1400.
- Doğrulama komutları her görevde aynı blok: bkz. "Ortak doğrulama" (aşağıda).
- ⚠️ Kasaba hub binaları: dekor değişiklikleri `hub-town-check.ts` 150/150'yi bozmamalı (duvar/interact ezme tuzağı bilinen).
- ⚠️ Tüm UI metinleri İngilizce.

**Ortak doğrulama bloğu** (her görevin son adımlarında "DOĞRULAMA" diye geçer):
```bash
cd /Users/hts_bot/avax-arena/frontend
npx tsc --noEmit                     # 0 yeni hata (baseline: track3d @types/three)
npx tsx scripts/hub-registry-test.ts # 9/9
npx tsx scripts/hub-town-check.ts    # 150/150
npm run dev &                        # zaten çalışmıyorsa
node scripts/world-visual-smoke.mjs  # Task 1'de yaratılır: 4 sayfa 0 hata + screenshot
```

---

### Task 1: Araçlar — kontakt sheet + kalıcı world smoke/screenshot scripti

**Files:**
- Create: `frontend/scripts/sprite-contact-sheet.mjs`
- Create: `frontend/scripts/world-visual-smoke.mjs`

- [ ] **Step 1: Kontakt sheet scriptini yaz** — spritesheet'i 4× nearest büyütüp 5 hücrede bir cetvel çizgisi basar; çıktıya bakan kişi frame index'i `satır*sütunSayısı+sütun` ile okur. Playwright'ın chromium'unu kullanır (yeni bağımlılık YOK — canvas'ı headless sayfada çizdirip screenshot alır).

```js
// frontend/scripts/sprite-contact-sheet.mjs
// Kullanım: node scripts/sprite-contact-sheet.mjs public/sprites/kenney-1bit.png 16 1 out.png
// (dosya, tileSize, spacing, çıktı). Çıktı: 4x nearest büyütme + 5'te bir kırmızı cetvel + kenarda indeksler.
import { chromium } from 'file:///Users/hts_bot/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [src, tileArg, gapArg, out] = process.argv.slice(2);
const TILE = Number(tileArg || 16), GAP = Number(gapArg || 0), SCALE = 4;
const b64 = readFileSync(resolve(src)).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas><script>
  const img = new Image();
  img.onload = () => {
    const step = ${TILE} + ${GAP};
    const cols = Math.floor((img.width + ${GAP}) / step);
    const rows = Math.floor((img.height + ${GAP}) / step);
    const c = document.getElementById('c');
    c.width = img.width * ${SCALE} + 60; c.height = img.height * ${SCALE} + 60;
    const x = c.getContext('2d');
    x.fillStyle = '#223'; x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 60, 60, img.width * ${SCALE}, img.height * ${SCALE});
    x.strokeStyle = 'rgba(255,60,60,0.8)'; x.fillStyle = '#ffdd44'; x.font = '14px monospace';
    for (let cc = 0; cc <= cols; cc += 5) {
      const px = 60 + cc * step * ${SCALE};
      x.beginPath(); x.moveTo(px, 40); x.lineTo(px, c.height); x.stroke();
      x.fillText(String(cc), px + 2, 34);
    }
    for (let rr = 0; rr <= rows; rr += 5) {
      const py = 60 + rr * step * ${SCALE};
      x.beginPath(); x.moveTo(40, py); x.lineTo(c.width, py); x.stroke();
      x.fillText(String(rr), 2, py + 14);
    }
    x.fillText('index = row*' + cols + '+col', 60, 16);
    window.__done = true;
  };
  img.src = 'data:image/png;base64,${b64}';
</script>`);
await page.waitForFunction('window.__done === true');
const el = await page.$('#c');
await el.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
```

- [ ] **Step 2: Çalıştır ve 3 kontakt sheet üret**

```bash
cd /Users/hts_bot/avax-arena/frontend
node scripts/sprite-contact-sheet.mjs public/sprites/kenney-1bit.png 16 1 /tmp/cs-kenney.png
node scripts/sprite-contact-sheet.mjs public/sprites/tiny-dungeon.png 16 0 /tmp/cs-tinydungeon.png
node scripts/sprite-contact-sheet.mjs public/sprites/tiny-battle.png 16 0 /tmp/cs-tinybattle.png
```
Expected: 3 PNG yazılır. Read tool ile görüntüle — kenney'de yaratık bloğu (yaklaşık sütun 24-34 / satır 6-11 bölgesi) net okunmalı.

- [ ] **Step 3: world-visual-smoke.mjs yaz** — `hub-embed-smoke.mjs` kalıbı (aynı playwright import yolu): `/avalanche/world`, `/avalanche/world/mint`, `/avalanche/world/battle-royale`, `/avalanche/world/adventures` sayfalarını açar, konsol hatası sayar (aynı filtre regex'i), ilk sayfada 8 sn bekleyip `--shots <dir>` verilirse canvas screenshot'ı alır. Çıkış kodu: hata varsa 1.

```js
// frontend/scripts/world-visual-smoke.mjs
// Kullanım: node scripts/world-visual-smoke.mjs [baseUrl] [--shots dir]
import { chromium } from 'file:///Users/hts_bot/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shotsDir = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
const BASE = (shotsIdx === 0 ? null : args[0]) || 'http://localhost:3000';
const URLS = ['/world', '/world/mint', '/world/battle-royale', '/world/adventures'];
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let fails = 0;
for (const u of URLS) {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${BASE}/avalanche${u}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(u === '/world' ? 8000 : 4000);
  const real = errs.filter(e => !/net::ERR|Failed to fetch|walletconnect|favicon|status of 40/i.test(e));
  const pass = real.length === 0;
  if (!pass) fails++;
  console.log(`${pass ? '✓' : '✗'} ${u} err:${real.length}`);
  real.slice(0, 3).forEach(e => console.log('   ', e.slice(0, 160)));
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${u.replace(/\//g, '_')}.png` });
}
await browser.close();
process.exit(fails ? 1 : 0);
```

- [ ] **Step 4: Çalıştır (dev server ayakta olmalı)**

Run: `node scripts/world-visual-smoke.mjs http://localhost:3000 --shots /tmp/ws-baseline`
Expected: `✓ /world err:0` ×4, baseline screenshot'lar `/tmp/ws-baseline/`de (sonraki görevlerde karşılaştırma referansı).

- [ ] **Step 5: Commit**

```bash
git add scripts/sprite-contact-sheet.mjs scripts/world-visual-smoke.mjs
git commit -m "chore(world): görsel yükseltme araçları — sprite kontakt sheet + kalıcı world smoke/screenshot"
```

---

### Task 2: monsterSprites.ts — arketip kayıt defteri + bütünlük testi (TDD)

**Files:**
- Create: `frontend/lib/game/iso/monsterSprites.ts`
- Create: `frontend/scripts/monster-sprite-test.ts`

- [ ] **Step 1: Önce testi yaz** — sahneleri tarayıp TÜM monster tiplerini çıkarır; her tipin `MONSTER_VISUALS`ta kaydı olduğunu, her arketipin frame'lerinin sheet sınırında olduğunu ve doldurulmamış (-1) frame kalmadığını doğrular.

```ts
// frontend/scripts/monster-sprite-test.ts
// Çalıştır: npx tsx scripts/monster-sprite-test.ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ARCHETYPES, MONSTER_VISUALS, SHEET_SPECS } from '../lib/game/iso/monsterSprites';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { cond ? pass++ : (fail++, console.log('✗', msg)); };

// 1) Sahnelerden tip envanteri
const dir = join(__dirname, '../lib/game/scenes');
const types = new Set<string>();
for (const f of readdirSync(dir).filter(f => f.startsWith('Iso') && f.endsWith('.ts'))) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const m of src.matchAll(/type: '([a-z_]+)'/g)) types.add(m[1]);
}
['potion', 'xp', 'quest'].forEach(t => types.delete(t)); // pickup'lar monster değil
ok(types.size >= 100, `en az 100 tip bulunmalı (bulunan: ${types.size})`);

// 2) Her tipin kaydı var (null = bilinçli prosedürel, örn. boss)
for (const t of types) {
  ok(t in MONSTER_VISUALS, `eşleme eksik: '${t}' — MONSTER_VISUALS'a ekle (arketip+tint ya da null)`);
}

// 3) Arketip frame'leri sheet sınırında ve doldurulmuş
for (const [name, a] of Object.entries(ARCHETYPES)) {
  const spec = SHEET_SPECS[a.sheet];
  ok(!!spec, `arketip '${name}': bilinmeyen sheet '${a.sheet}'`);
  if (!spec) continue;
  const max = spec.cols * spec.rows;
  ok(a.frame >= 0, `arketip '${name}': frame doldurulmamış (-1) — kontakt sheet'ten seç`);
  ok(a.frame < max, `arketip '${name}': frame ${a.frame} sınır dışı (max ${max})`);
  if (a.frame2 !== undefined) ok(a.frame2 >= 0 && a.frame2 < max, `arketip '${name}': frame2 sınır dışı`);
}

// 4) Her non-null eşlemenin arketipi tanımlı
for (const [t, v] of Object.entries(MONSTER_VISUALS)) {
  if (v) ok(v.arch in ARCHETYPES, `'${t}' bilinmeyen arketip '${v.arch}'`);
}

console.log(`monster-sprite-test: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Testi çalıştır, başarısızlığı gör**

Run: `npx tsx scripts/monster-sprite-test.ts`
Expected: FAIL — modül yok (`Cannot find module '../lib/game/iso/monsterSprites'`).

- [ ] **Step 3: monsterSprites.ts'i yaz.** Frame index'leri Task 1'in kontakt sheet'lerinden SEÇİLEREK doldurulur (Read tool ile `/tmp/cs-*.png` görüntüle; kenney'de yaratık bloğu ~sütun 24-34/satır 6-11). Aşağıdaki iskelet frame'leri `-1` ile başlar; **bu görev bitmeden hepsi gerçek index olacak** (test bunu zorlar). Eşleme tablosu aşağıda bilinen ~85 tiple verildi; testin listelediği eksik tipleri aynı kalıpla ekle (zone temasına uygun arketip + tint). Boss tipleri `null` (prosedürel kalır) — boss listesi için her sahnede `isBoss`/`boss` alanını grep'le doğrula.

```ts
// frontend/lib/game/iso/monsterSprites.ts
// Tek doğruluk kaynağı: monster tipi → sprite arketipi → sheet frame'i.
// Eşlemesi null olan tip (boss'lar) prosedürel çizimde kalır.

export interface SheetSpec { cols: number; rows: number }
export const SHEET_SPECS: Record<string, SheetSpec> = {
  'tiles':        { cols: 49, rows: 22 },  // kenney-1bit, BootScene'de yüklü
  'tiny-dungeon': { cols: 12, rows: 11 },  // Task 3'te yüklenir
  'tiny-battle':  { cols: 18, rows: 11 },
};

export interface ArchetypeDef {
  sheet: keyof typeof SHEET_SPECS & string;
  frame: number;      // idle frame — kontakt sheet'ten
  frame2?: number;    // varsa 2-frame anim; yoksa bob tween
  scale?: number;     // varsayılan 3
}

// Frame'ler kontakt sheet'ten doldurulur (bkz. Task 1). -1 bırakmak test hatası.
export const ARCHETYPES: Record<string, ArchetypeDef> = {
  skeleton:  { sheet: 'tiles', frame: -1 },
  zombie:    { sheet: 'tiles', frame: -1 },
  ghost:     { sheet: 'tiles', frame: -1 },
  wraith:    { sheet: 'tiles', frame: -1 },   // ghost'tan farklı silüet bulunamazsa ghost frame'i + koyu tint kullan
  demon:     { sheet: 'tiles', frame: -1 },
  imp:       { sheet: 'tiles', frame: -1 },
  beast:     { sheet: 'tiles', frame: -1 },   // kurt/köpek silüeti
  rat:       { sheet: 'tiles', frame: -1 },
  spider:    { sheet: 'tiles', frame: -1 },
  snake:     { sheet: 'tiles', frame: -1 },   // wyrm/serpent için
  dragon:    { sheet: 'tiles', frame: -1 },
  golem:     { sheet: 'tiles', frame: -1 },   // iri gövdeli construct
  elemental: { sheet: 'tiles', frame: -1 },   // alev/küre silüeti
  knight:    { sheet: 'tiles', frame: -1 },   // zırhlı insansı
  mage:      { sheet: 'tiles', frame: -1 },   // cüppeli insansı
  bird:      { sheet: 'tiles', frame: -1 },
  plant:     { sheet: 'tiles', frame: -1 },   // treant/vine
  blob:      { sheet: 'tiles', frame: -1 },   // slime/amorf
  insect:    { sheet: 'tiles', frame: -1 },
};

export interface MonsterVisual { arch: keyof typeof ARCHETYPES & string; tint?: number }

// null = bilinçli prosedürel (boss / imza görsel)
export const MONSTER_VISUALS: Record<string, MonsterVisual | null> = {
  // — Temel/orman/kasaba —
  skeleton: { arch: 'skeleton' },
  skeleton_warrior: { arch: 'skeleton', tint: 0xccddff },
  skeleton_lord: { arch: 'skeleton', tint: 0xffcc66 },
  wolf: { arch: 'beast', tint: 0x8888aa },
  spider: { arch: 'spider' },
  treant: { arch: 'plant', tint: 0x66aa44 },
  vine_crawler: { arch: 'plant', tint: 0x44cc66 },
  ghost: { arch: 'ghost', tint: 0xaaddff },
  wraith: { arch: 'wraith', tint: 0x9988cc },
  // — Crypt/Necropolis (undead) —
  plague_zombie: { arch: 'zombie', tint: 0x88aa55 },
  lich_acolyte: { arch: 'mage', tint: 0x66ffcc },
  soul_reaper: { arch: 'wraith', tint: 0x555577 },
  death_knight: { arch: 'knight', tint: 0x554466 },
  blood_knight: { arch: 'knight', tint: 0xcc3344 },
  undead_dragon: null, // boss adayı — sahnede isBoss ise null kalsın, değilse { arch: 'dragon', tint: 0x88aa88 }
  // — Swamp —
  poison_toad: { arch: 'blob', tint: 0x66bb33 },
  swamp_hag: { arch: 'mage', tint: 0x557744 },
  swamp_wraith: { arch: 'wraith', tint: 0x448855 },
  witch_apprentice: { arch: 'mage', tint: 0xaa66cc },
  venomous_hydra: { arch: 'snake', tint: 0x44dd44 },
  // — Mines —
  mine_rat: { arch: 'rat', tint: 0x997755 },
  gem_beetle: { arch: 'insect', tint: 0x44ccdd },
  rock_golem: { arch: 'golem', tint: 0x998877 },
  stone_sentinel: { arch: 'golem', tint: 0xaaaabb },
  // — Citadel/Sky —
  cloud_wisp: { arch: 'elemental', tint: 0xcceeff },
  wind_spirit: { arch: 'elemental', tint: 0xaaffee },
  storm_hawk: { arch: 'bird', tint: 0x88aaff },
  lightning_elemental: { arch: 'elemental', tint: 0xffee44 },
  sky_sentinel: { arch: 'knight', tint: 0xbbccff },
  storm_titan: null, // boss
  // — FrostWastes/IceCave —
  blizzard_wolf: { arch: 'beast', tint: 0xbbddff },
  frost_sprite: { arch: 'elemental', tint: 0x99ddff },
  permafrost_wyrm: { arch: 'snake', tint: 0x77ccee },
  yeti: { arch: 'golem', tint: 0xeeffff },
  // — Volcano/DemonGate/Forge —
  hell_hound: { arch: 'beast', tint: 0xdd4422 },
  lesser_demon: { arch: 'imp', tint: 0xcc4433 },
  pit_fiend: { arch: 'demon', tint: 0xaa2211 },
  infernal_mage: { arch: 'mage', tint: 0xff6633 },
  succubus: { arch: 'demon', tint: 0xdd44aa },
  molten_giant: { arch: 'golem', tint: 0xff7733 },
  magma_smith: { arch: 'knight', tint: 0xcc6622 },
  forge_automaton: { arch: 'golem', tint: 0xffaa44 },
  hammer_sentinel: { arch: 'knight', tint: 0xbb8855 },
  steel_golem: { arch: 'golem', tint: 0xccccdd },
  eternal_flame: { arch: 'elemental', tint: 0xff9922 },
  titan_guard: { arch: 'knight', tint: 0xddaa66 },
  titan_forgemaster: null, // boss
  // — Ruins —
  ruin_ghost: { arch: 'ghost', tint: 0xccbb99 },
  enchanted_armor: { arch: 'knight', tint: 0x99bbdd },
  wyrm_guardian: { arch: 'snake', tint: 0xbbaa77 },
  // — Abyss/su —
  sea_serpent: { arch: 'snake', tint: 0x3388cc },
  tidal_guardian: { arch: 'golem', tint: 0x44aacc },
  water_elemental: { arch: 'elemental', tint: 0x55aaff },
  // — VoidRealm/Eternal —
  void_stalker: { arch: 'beast', tint: 0x6644aa },
  time_wraith: { arch: 'wraith', tint: 0x8866ff },
  chaos_sprite: { arch: 'elemental', tint: 0xcc66ff },
  shadow_fiend: { arch: 'demon', tint: 0x443366 },
  shadow_assassin: { arch: 'knight', tint: 0x554477 },
  shadow_lord: null, // boss
  entropy_demon: { arch: 'demon', tint: 0x7755cc },
  nightmare_beast: { arch: 'beast', tint: 0x662288 },
  abyssal_terror: { arch: 'demon', tint: 0x224488 },
  primordial_beast: { arch: 'beast', tint: 0x886644 },
  world_eater: null,     // boss
  void_sovereign: null,  // boss
  dread_lord: null,      // boss
  doom_knight: null,     // boss adayı — sahnede doğrula
  dark_seraphim: null,   // boss adayı — sahnede doğrula
  // — Diğer —
  hedgehog: { arch: 'rat', tint: 0xaa8855 },
  young_dragon: { arch: 'dragon', tint: 0x66cc55 },
  // ... test eksik tipleri listeler; aynı kalıpla (zone temasına uygun arketip+tint) buraya ekle
};

const DEFAULT_SCALE = 3;

export function getMonsterVisual(type: string): (ArchetypeDef & { tint?: number; scale: number }) | null {
  const v = MONSTER_VISUALS[type];
  if (!v) return null;
  const a = ARCHETYPES[v.arch];
  if (!a) return null;
  return { ...a, tint: v.tint, scale: a.scale ?? DEFAULT_SCALE };
}
```

- [ ] **Step 4: Kontakt sheet'lere bak, TÜM `-1` frame'leri gerçek index'lerle doldur; testi eksik tip kalmayana kadar döngüde çalıştır**

Run: `npx tsx scripts/monster-sprite-test.ts`
Expected: `N pass, 0 fail` (N ≥ 250). `boss adayı` yorumlu tipler için ilgili sahnede boss olup olmadığını grep'le doğrula, değilse arketipe çevir.

- [ ] **Step 5: DOĞRULAMA bloğunu çalıştır, Commit**

```bash
git add lib/game/iso/monsterSprites.ts scripts/monster-sprite-test.ts
git commit -m "feat(world): monster sprite kayıt defteri — arketip+tint eşlemesi, bütünlük testli"
```

---

### Task 3: createMonsterVisual + BootScene yüklemeleri + Town vitrini (P1 çekirdek)

**Files:**
- Modify: `frontend/lib/game/scenes/BootScene.ts:40-57` (yeni sheet'ler + NEAREST)
- Modify: `frontend/lib/game/iso/IsoBaseScene.ts:2089-2165` (`addMonsterAt` sprite yolu) + yeni `createMonsterVisual` metodu
- Modify: `frontend/lib/game/scenes/IsoTownScene.ts` (kasaba NPC/monster'ları helper'a)

- [ ] **Step 1: BootScene'e sheet yüklemeleri + NEAREST filtreleri ekle.** `preload()` içine (ninja yüklemelerinin altına):

```ts
// Monster/prop sprite sheets (visual upgrade). Non-critical: eşlemesiz
// tipler prosedürel fallback'e düşer, dünya sprite'sız da render olur.
this.load.spritesheet('tiny-dungeon', '/avalanche/sprites/tiny-dungeon.png', {
  frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
});
this.load.spritesheet('tiny-battle', '/avalanche/sprites/tiny-battle.png', {
  frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
});
```

`create()` başına (failedCritical kontrolünden SONRA):

```ts
// Pixel keskinliği: global antialias açık ama sprite'lar büyütülünce
// bulanıklaşmasın — texture bazında nearest.
for (const key of ['tiles', 'tiny-dungeon', 'tiny-battle']) {
  if (this.textures.exists(key)) {
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
```

- [ ] **Step 2: IsoBaseScene'e `createMonsterVisual` ekle** (`addMonsterAt`'ın hemen üstüne). Sözleşme: gölge+gövde görselini verilen container'a ekler, container'ı DEĞİL eklediği gövde objesini döndürür (flip için); çağıran taraf label/depth/tween'lerine dokunmaz.

```ts
import { getMonsterVisual } from './monsterSprites'; // dosya başındaki import bloğuna

/**
 * Monster gövde görseli: eşleme varsa sprite (NEAREST, ölçekli, gölgeli),
 * yoksa null döner — çağıran mevcut prosedürel çizimini kullanır.
 * Dönen sprite'ta yön için setFlipX kullanılabilir.
 */
protected createMonsterVisual(
  container: Phaser.GameObjects.Container,
  type: string,
): Phaser.GameObjects.Sprite | null {
  const v = getMonsterVisual(type);
  if (!v || !this.textures.exists(v.sheet)) return null;

  // Gölge (sprite'ın altına)
  const shadow = this.add.graphics();
  shadow.fillStyle(0x000000, 0.28);
  shadow.fillEllipse(0, 2, 26, 9);
  container.add(shadow);

  const spr = this.add.sprite(0, -10, v.sheet, v.frame);
  spr.setScale(v.scale);
  if (v.tint !== undefined) spr.setTint(v.tint);
  container.add(spr);

  if (v.frame2 !== undefined) {
    // 2-frame idle — anim tanımını tekilleştir
    const animKey = `mon_${v.sheet}_${v.frame}`;
    if (!this.anims.exists(animKey)) {
      this.anims.create({
        key: animKey,
        frames: [
          { key: v.sheet, frame: v.frame },
          { key: v.sheet, frame: v.frame2 },
        ],
        frameRate: 3,
        repeat: -1,
      });
    }
    spr.play(animKey);
  } else {
    // Frame yoksa yumuşak bob (container'ı değil sprite'ı oynat —
    // container tween'leri (gezinme) ile çakışmasın)
    this.tweens.add({
      targets: spr,
      y: -13,
      duration: 900 + Math.random() * 300,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }
  return spr;
}
```

- [ ] **Step 3: `addMonsterAt`'ı sprite yoluna geçir** — :2094-2107 arası kırmızı oval bloğu şununla değiştir (label/AI/depth aynı kalır):

```ts
// Monster body: sprite eşlemesi varsa sprite, yoksa eski prosedürel oval
const spr = this.createMonsterVisual(container, type);
if (!spr) {
  const monGfx = this.add.graphics();
  monGfx.fillStyle(0x000000, 0.2);
  monGfx.fillEllipse(0, 4, 24, 10);
  monGfx.fillStyle(0xcc3333, 1);
  monGfx.fillEllipse(0, -8, 20, 16);
  monGfx.fillStyle(0xffff00, 1);
  monGfx.fillCircle(-4, -10, 2.5);
  monGfx.fillCircle(4, -10, 2.5);
  monGfx.fillStyle(0x000000, 1);
  monGfx.fillCircle(-4, -10, 1);
  monGfx.fillCircle(4, -10, 1);
  container.add(monGfx);
}
```

Gezinme AI callback'inde (tween onComplete yakınına, tween başlamadan önce) yön flip'i ekle:

```ts
if (spr) spr.setFlipX(d.dx < 0);
```

- [ ] **Step 4: IsoTownScene'deki monster/NPC spawn'larını incele** — Town kendi spawn metodunu kullanıyorsa (grep `spawnMonster\|add.circle` IsoTownScene.ts) gövde-çizim kısmını `const spr = this.createMonsterVisual(container, m.type)` + fallback kalıbına geçir (Task 6'daki Forest örneğiyle birebir aynı kalıp). Town'da monster yoksa sadece NPC'lere bak; NPC'ler için `tiny-dungeon` insan frame'leri kullanılabilir (kontakt sheet'ten villager frame'i seç, `ARCHETYPES.villager` olarak ekle ve test'i güncelle).

- [ ] **Step 5: DOĞRULAMA + görsel kontrol**

Run: `node scripts/world-visual-smoke.mjs http://localhost:3000 --shots /tmp/ws-p1-town`
Expected: 4×✓; `/tmp/ws-p1-town/_world.png`'de Town'da sprite karakterler görünür (Read ile bak — login gate açıksa canvas'a girilemez; o durumda Town görüntüsü için Task 5'teki harness adımını kullan).

- [ ] **Step 6: Commit**

```bash
git add lib/game/scenes/BootScene.ts lib/game/iso/IsoBaseScene.ts lib/game/scenes/IsoTownScene.ts
git commit -m "feat(world): monster/NPC sprite render yolu — createMonsterVisual + NEAREST + Town vitrini"
```

---

### Task 4: Terrain chunk+cull, cast shadow, zone atmosferi, ışık havuzları (P2 çekirdek — Town vitrini)

**Files:**
- Create: `frontend/lib/game/iso/zoneAtmosphere.ts`
- Create: `frontend/lib/game/iso/lightPool.ts`
- Modify: `frontend/lib/game/iso/IsoBaseScene.ts` (`renderTerrain` :309, `create` :185 civarı, `update`)

- [ ] **Step 1: lightPool.ts yaz**

```ts
// frontend/lib/game/iso/lightPool.ts
// Titreyen ışık havuzları — tek radial-gradient texture, ADD blend, alpha tween.
// Bütçe: masaüstü 6, mobil 3 (sahne başına). Depth 1400 (atmosfer 1500'ün altı).
import * as Phaser from 'phaser';

const TEX_KEY = 'light-radial';

function ensureLightTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_KEY)) return;
  const size = 128;
  const canvas = scene.textures.createCanvas(TEX_KEY, size, size);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}

export class LightPool {
  private count = 0;
  constructor(private scene: Phaser.Scene, private max: number) {
    ensureLightTexture(scene);
  }

  /** Işık ekle; bütçe dolduysa sessizce yok sayar. */
  add(x: number, y: number, color: number, radius: number, flicker = true): void {
    if (this.count >= this.max || !this.scene.textures.exists(TEX_KEY)) return;
    this.count++;
    const img = this.scene.add.image(x, y, TEX_KEY)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.45)
      .setDisplaySize(radius * 2, radius * 2)
      .setDepth(1400);
    if (flicker) {
      this.scene.tweens.add({
        targets: img,
        alpha: { from: 0.34, to: 0.55 },
        duration: 260 + Math.random() * 240,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }
}
```

- [ ] **Step 2: zoneAtmosphere.ts yaz** — 18 zone'un tam tablosu (Task 7'de değerler ince ayarlanır; burada ilk paletler):

```ts
// frontend/lib/game/iso/zoneAtmosphere.ts
// Zone → ekran renk banyosu + alt sis bandı. scrollFactor 0, depth 1500-1501
// (dünyanın üstü ~900, diyalog 2000'in ALTI — diyaloglar boyanmaz).
export interface ZoneAtmo {
  tint: number;      // üst renk banyosu
  tintAlpha: number; // 0.04-0.12 arası tut — oynanışı karartma
  fogColor: number;  // alt sis rengi
  fogAlpha: number;  // 0.10-0.25
}

export const ZONE_ATMOSPHERE: Record<string, ZoneAtmo> = {
  Town:        { tint: 0x88bbff, tintAlpha: 0.04, fogColor: 0xbbddff, fogAlpha: 0.10 },
  Forest:      { tint: 0x66cc88, tintAlpha: 0.05, fogColor: 0x88ccaa, fogAlpha: 0.12 },
  Dungeon:     { tint: 0x334466, tintAlpha: 0.10, fogColor: 0x222244, fogAlpha: 0.20 },
  IceCave:     { tint: 0x66bbee, tintAlpha: 0.08, fogColor: 0xaaddff, fogAlpha: 0.16 },
  Volcano:     { tint: 0xff6633, tintAlpha: 0.07, fogColor: 0x662211, fogAlpha: 0.18 },
  Crypt:       { tint: 0x554477, tintAlpha: 0.10, fogColor: 0x332244, fogAlpha: 0.20 },
  Abyss:       { tint: 0x2266aa, tintAlpha: 0.10, fogColor: 0x113355, fogAlpha: 0.22 },
  Sanctum:     { tint: 0xff8844, tintAlpha: 0.08, fogColor: 0x883322, fogAlpha: 0.16 },
  Swamp:       { tint: 0x557744, tintAlpha: 0.09, fogColor: 0x445533, fogAlpha: 0.20 },
  Mines:       { tint: 0x8899bb, tintAlpha: 0.07, fogColor: 0x445566, fogAlpha: 0.16 },
  Citadel:     { tint: 0xaaccff, tintAlpha: 0.06, fogColor: 0xcce0ff, fogAlpha: 0.14 },
  Necropolis:  { tint: 0x443355, tintAlpha: 0.11, fogColor: 0x221133, fogAlpha: 0.22 },
  FrostWastes: { tint: 0x99ccee, tintAlpha: 0.08, fogColor: 0xddeeff, fogAlpha: 0.18 },
  DemonGate:   { tint: 0xcc2200, tintAlpha: 0.08, fogColor: 0x551100, fogAlpha: 0.18 },
  Ruins:       { tint: 0xbbaa77, tintAlpha: 0.06, fogColor: 0x887755, fogAlpha: 0.14 },
  VoidRealm:   { tint: 0x442266, tintAlpha: 0.12, fogColor: 0x220044, fogAlpha: 0.24 },
  Forge:       { tint: 0xdd6600, tintAlpha: 0.07, fogColor: 0x663300, fogAlpha: 0.16 },
  Eternal:     { tint: 0x330055, tintAlpha: 0.12, fogColor: 0x110022, fogAlpha: 0.24 },
};
```

- [ ] **Step 3: renderTerrain'i chunk'la + cast shadow ekle.** :309-332'yi şununla değiştir (drawDecoration çağrısı aynı yerde kalır):

```ts
private terrainChunks: { gfx: Phaser.GameObjects.Graphics; bounds: Phaser.Geom.Rectangle }[] = [];
private static readonly TERRAIN_CHUNK = 16;

private renderTerrain(): void {
  this.terrainChunks = [];
  const C = IsoBaseScene.TERRAIN_CHUNK;
  for (let cy = 0; cy < this.mapH; cy += C) {
    for (let cx = 0; cx < this.mapW; cx += C) {
      const gfx = this.add.graphics();
      gfx.setDepth(0);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (let ty = cy; ty < Math.min(cy + C, this.mapH); ty++) {
        for (let tx = cx; tx < Math.min(cx + C, this.mapW); tx++) {
          const tile = this.tiles[ty][tx];
          const colors = ZONE_BIOME_COLORS[tile.biome] || ZONE_BIOME_COLORS['grass'];
          const screen = toScreen(tx, ty);
          const neighborLeft = ty + 1 < this.mapH ? this.tiles[ty + 1][tx].height : 0;
          const neighborRight = tx + 1 < this.mapW ? this.tiles[ty][tx + 1].height : 0;

          drawColumn(gfx, screen.x, screen.y, colors, tile.height, neighborLeft, neighborRight, tx, ty);

          // Güneş KB'den: batıdaki (tx-1) komşu daha yüksekse üst yüzün
          // batı kenarına gölge kaması düşür
          const hW = tx > 0 ? this.tiles[ty][tx - 1].height : tile.height;
          if (hW > tile.height) {
            const sy = screen.y - tile.height * ISO_BLOCK_H;
            const hw = ISO_TILE_W / 2, hh = ISO_TILE_H / 2;
            gfx.fillStyle(0x000015, Math.min(0.22, 0.11 * (hW - tile.height)));
            gfx.beginPath();
            gfx.moveTo(screen.x - hw, sy);
            gfx.lineTo(screen.x, sy - hh);
            gfx.lineTo(screen.x, sy - hh + 7);
            gfx.lineTo(screen.x - hw + 11, sy + 5);
            gfx.closePath();
            gfx.fillPath();
          }

          if (tile.data?.deco) {
            this.drawDecoration(tx, ty, tile.data.deco, tile.height);
          }

          // Chunk sınır kutusu (culling için) — duvar + yükseklik payı
          minX = Math.min(minX, screen.x - ISO_TILE_W / 2);
          maxX = Math.max(maxX, screen.x + ISO_TILE_W / 2);
          minY = Math.min(minY, screen.y - tile.height * ISO_BLOCK_H - ISO_TILE_H);
          maxY = Math.max(maxY, screen.y + ISO_TILE_H + tile.height * ISO_BLOCK_H);
        }
      }
      if (minX !== Infinity) {
        this.terrainChunks.push({
          gfx,
          bounds: new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY),
        });
      }
    }
  }
}

private cullTerrain(): void {
  const view = this.cameras.main.worldView;
  for (const ch of this.terrainChunks) {
    ch.gfx.setVisible(Phaser.Geom.Intersects.RectangleToRectangle(ch.bounds, view));
  }
}
```

`update()`nin başına (super.update çağıran alt sınıflar etkilenmez, IsoBaseScene.update içine): `this.cullTerrain();`
`ISO_BLOCK_H`, `ISO_TILE_W`, `ISO_TILE_H` import listesinde yoksa `./core` import'una ekle.

- [ ] **Step 4: Atmosfer + ışık havuzunu create'e bağla.** IsoBaseScene'e alan + metod:

```ts
protected lightPool!: LightPool;

private applyZoneAtmosphere(): void {
  const atmo = ZONE_ATMOSPHERE[this.scene.key];
  if (!atmo) return;
  const w = this.scale.width, h = this.scale.height;
  const wash = this.add.graphics().setScrollFactor(0).setDepth(1500);
  wash.fillGradientStyle(atmo.tint, atmo.tint, atmo.fogColor, atmo.fogColor,
    atmo.tintAlpha, atmo.tintAlpha, 0, 0);
  wash.fillRect(0, 0, w, h);
  const fog = this.add.graphics().setScrollFactor(0).setDepth(1501);
  fog.fillGradientStyle(atmo.fogColor, atmo.fogColor, atmo.fogColor, atmo.fogColor,
    0, 0, atmo.fogAlpha, atmo.fogAlpha);
  fog.fillRect(0, h * 0.62, w, h * 0.38);
}
```

create()'te `this.renderTerrain();` satırından önce `this.lightPool = new LightPool(this, this.detectMobile() ? 3 : 6);`, `this.addAmbientParticles();` satırından sonra `this.applyZoneAtmosphere();`. Import'lar: `ZONE_ATMOSPHERE`, `LightPool`.

- [ ] **Step 5: drawDecoration 'torch' case'ine ışık havuzu ekle** — mevcut torch çizimin sonuna:

```ts
this.lightPool.add(screen.x, screen.y - 18, 0xffaa44, 70);
```

Lav için renderTerrain chunk döngüsünde (drawColumn'dan sonra):

```ts
if (tile.biome === 'lava' && ((tx * 7 + ty * 13) % 41) === 0) {
  this.lightPool.add(screen.x, screen.y - tile.height * ISO_BLOCK_H, 0xff5522, 90);
}
```

- [ ] **Step 6: DOĞRULAMA + performans kontrolü**

Run: `node scripts/world-visual-smoke.mjs http://localhost:3000 --shots /tmp/ws-p2-town`
Expected: 4×✓. Ek: dev console'da bir zone'a girip `game.loop.actualFps` 55+ (chunk culling regresyonu yok).

- [ ] **Step 7: Commit**

```bash
git add lib/game/iso/lightPool.ts lib/game/iso/zoneAtmosphere.ts lib/game/iso/IsoBaseScene.ts
git commit -m "feat(world): zemin 2.0 çekirdek — chunk culling, cast shadow, zone atmosferi, ışık havuzları"
```

---

### Task 5: 🚦 VİTRİN KAPISI — Town screenshot + kullanıcı onayı (DUR NOKTASI)

**Files:** yok (geçici harness `app/world/visual-test/page.tsx` — commit ÖNCESİ silinir)

- [ ] **Step 1: Geçici harness rotası kur** — login gate'i atlayıp doğrudan Town'u başlatan sayfa (14 Tem `/world-boot-test` + 17 Tem `/world/battle-test` kalıbı; şablon `scripts/hub-e2e.mjs` baş yorumunda). Sayfa PhaserGame'i `startScene: 'Town'` ile mount eder.
- [ ] **Step 2: Headless screenshot al** — `world-visual-smoke.mjs`'i harness URL'iyle çalıştır, Town'da 10 sn bekleyen screenshot; ayrıca zoom'lu ikinci kare için `page.mouse.wheel` gerekmiyor — tek genel kare yeter.
- [ ] **Step 3: Screenshot'ları kullanıcıya gönder (SendUserFile), ONAY BEKLE.** Onay gelmeden Task 6+'ya GEÇME. Kullanıcı isterse canlı bakar (dev URL). Red/revizyon gelirse Task 2-4 içinde ayar yap (tint, atmosfer alpha, ölçek), yeniden screenshot.
- [ ] **Step 4: Onay sonrası harness'ı sil**, `git status` temiz olduğunu doğrula (harness commit'lenmez).

---

### Task 6: P1 yayılım — 17 sahnenin spawnMonsterAt'ları ortak yola

**Files:**
- Modify: `frontend/lib/game/scenes/IsoForestScene.ts:727-759` + aynı kalıpla: IsoDungeonScene, IsoIceCaveScene, IsoVolcanoScene, IsoCryptScene, IsoAbyssScene, IsoSanctumScene, IsoSwampScene, IsoMinesScene, IsoCitadelScene, IsoNecropolisScene, IsoFrostWastesScene, IsoDemonGateScene, IsoRuinsScene, IsoVoidRealmScene, IsoForgeScene, IsoEternalScene (dosya adlarını `ls lib/game/scenes/` ile doğrula)

- [ ] **Step 1: Forest'ta işlenmiş örnek** — `spawnMonsterAt` içindeki gövde bloğu (`const body = this.add.circle(...)` satırı) şöyle değişir:

```ts
// Gövde: sprite eşlemesi varsa sprite, yoksa eski renkli daire
const spr = this.createMonsterVisual(container, m.type);
if (!spr) {
  const body = this.add.circle(0, -8, 6, m.color, 1);
  container.add(body);
}
```

Level/isim label'ları, depth, idle bob tween, `monsterSprites.push` AYNEN kalır. ⚠️ Sprite'lı durumda container bob tween'i (y −3) sprite'ın kendi bob'uyla üst üste binmesin: `createMonsterVisual` sprite döndürdüyse sahnenin kendi idle-bob tween'ini EKLEME (`if (!spr) this.tweens.add({...})` şeklinde sar). Boss tipleri otomatik prosedürelde kalır (eşleme null).

- [ ] **Step 2: Testi çalıştır** — `npx tsx scripts/monster-sprite-test.ts` hâlâ 0 fail (yeni tip eklenmediyse değişmez).
- [ ] **Step 3: Kalan 16 sahneyi aynı kalıpla geçir.** Her sahnenin spawn metodu küçük farklarla aynı; kalıp: gövde çizim satır(lar)ını `createMonsterVisual` + fallback'e sar, çift-bob'u önle. Sahne başına diff ~10 satır.
- [ ] **Step 4: DOĞRULAMA** (tam blok) + spot kontrol: harness kalıbıyla 3 zone'a gir (Forest, Crypt, Volcano) screenshot; sprite'lar tint'li ve zemine oturmuş görünmeli.
- [ ] **Step 5: Commit**

```bash
git add lib/game/scenes/Iso*.ts
git commit -m "feat(world): monster sprite'ları 17 sahneye yayıldı — ortak createMonsterVisual yolu"
```

---

### Task 7: P2 yayılım — 18 zone atmosfer ince ayarı + ışık kaynakları

**Files:**
- Modify: `frontend/lib/game/iso/zoneAtmosphere.ts` (değer ayarı)
- Modify: ilgili sahnelerin dekor/tile üretimleri (ışık noktaları: torch dekoru olan sahneler otomatik alır; kristal/portal noktaları sahne bazlı)

- [ ] **Step 1: 18 zone'u harness ile screenshot'la** (Task 5 kalıbı, `?zone=<key>` parametreli harness — startScene'i query'den al).
- [ ] **Step 2: Ekran görüntülerine bakarak zoneAtmosphere değerlerini ayarla** — kriterler: oyuncu/monster okunaklı kalmalı (alpha üst sınırları koru), her zone'un ayırt edici tonu hissedilmeli, ardışık zone'lar (Forest→Swamp) yeterince farklı olmalı.
- [ ] **Step 3: Işık kaynakları:** IceCave/Citadel/FrostWastes'ta `ice_crystal` biome tile'larına mavi ışık (lav kalıbının aynısı, renk 0x66ccff, radius 60); Crypt/Necropolis'te torch dekorları zaten otomatik. DemonGate/Sanctum'da portal/gate label noktalarına kırmızı-turuncu ışık.
- [ ] **Step 4: DOĞRULAMA + Commit**

```bash
git add lib/game/iso/zoneAtmosphere.ts lib/game/scenes/Iso*.ts
git commit -m "feat(world): 18 zone atmosfer paleti ince ayarı + zone ışık kaynakları"
```

---

### Task 8: Hero prosedürel yükseltmesi

**Files:**
- Modify: `frontend/lib/game/iso/IsoBaseScene.ts` (`redrawPlayerBody` :871, `createPlayer` :668, yürüme kodu :1564 civarı)

- [ ] **Step 1: Yürüme döngüsünü 4→6 frame'e çıkar.** :891'deki diziler:

```ts
const f = this.walkFrame % 6;
const legL = [0, -3, -5, 0, 3, 5][f];
const legR = [0, 3, 5, 0, -3, -5][f];
const armF = [0, -2, -4, 0, 2, 4][f];
const armB = [0, 2, 4, 0, -2, -4][f];
const bodyBob = [0, -1, -1.5, 0, -1, -1.5][f];
```

:1564'teki `% 4`ü `% 6` yap (`this.walkFrame = (this.walkFrame + 1) % 6;`).

- [ ] **Step 2: Nefes alma idle'ı ekle.** createPlayer sonunda (non-NFT dalında da çalışan) timer:

```ts
// Idle breathing — dururken 700ms'de bir hafif gövde salınımı
this.time.addEvent({
  delay: 700, loop: true,
  callback: () => {
    if (this.playerMoving || this.frozen) return;
    this.breathPhase = !this.breathPhase;
    if (!this.nftSpriteImage) this.redrawPlayerBody();
    else this.nftSpriteImage.setDisplaySize(56, this.breathPhase ? 55 : 56);
  },
});
```

`private breathPhase = false;` alanı ekle; `redrawPlayerBody` içinde `bodyBob` hesabına `+ (this.breathPhase && this.walkFrame === 0 ? -0.6 : 0)` kat.

- [ ] **Step 3: Silah/aksesuar detayı** — redrawPlayerBody'deki silah çizim bölümünü bul (grep `weapon` :871-1100 aralığı); mevcut çizime: kabza bandı (2px koyu şerit), magic silahlarda uç parıltısı (2px beyaz nokta, walkFrame'e göre alpha 0.4-0.8). Kod mevcut silah bloğunun stiliyle yazılır — blok bulunup okunmadan yazılmaz.
- [ ] **Step 4: DOĞRULAMA + görsel spot (harness Town, hareket halinde 2 kare) + Commit**

```bash
git add lib/game/iso/IsoBaseScene.ts
git commit -m "feat(world): hero prosedürel yükseltme — 6-frame yürüme, nefes idle'ı, silah detayı"
```

---

### Task 9: P3 — zone kimlik prop'ları + ambient partikül özelleştirme

**Files:**
- Create: `frontend/lib/game/maps/zoneProps.ts`
- Modify: `frontend/lib/game/iso/IsoBaseScene.ts` (`renderTerrain` prop yerleşimi, `drawDecoration` yeni case'ler, `addAmbientParticles`)

- [ ] **Step 1: zoneProps.ts yaz**

```ts
// frontend/lib/game/maps/zoneProps.ts
// Zone → görsel prop yerleşimi. SADECE görsel: collision/interact'e dokunmaz.
// allowWalkable=true olan prop'lar küçük zemin detayıdır (üstünden yürünebilir
// görünmesi doğal); büyük prop'lar yalnız collision tile'larına yerleşir.
export interface ZonePropDef {
  deco: string;          // drawDecoration case anahtarı
  density: number;       // 0-1, tile başına olasılık (seeded)
  biomes: string[];      // yalnız bu biome'lara yerleşir
  allowWalkable: boolean;
}

export const ZONE_PROPS: Record<string, ZonePropDef[]> = {
  Forest:      [{ deco: 'mushroom_cluster', density: 0.020, biomes: ['grass', 'dark_grass'], allowWalkable: true },
                { deco: 'fallen_log',       density: 0.012, biomes: ['dark_grass'],          allowWalkable: false }],
  Crypt:       [{ deco: 'gravestone', density: 0.030, biomes: ['stone_dark', 'dirt'], allowWalkable: false },
                { deco: 'bones',      density: 0.020, biomes: ['stone_dark', 'dirt'], allowWalkable: true }],
  Necropolis:  [{ deco: 'gravestone', density: 0.040, biomes: ['stone_dark', 'obsidian'], allowWalkable: false },
                { deco: 'bones',      density: 0.030, biomes: ['stone_dark'],             allowWalkable: true }],
  Volcano:     [{ deco: 'lava_rock',  density: 0.030, biomes: ['volcanic', 'volcanic_rock'], allowWalkable: false },
                { deco: 'ember_vent', density: 0.015, biomes: ['magma', 'volcanic'],         allowWalkable: true }],
  Sanctum:     [{ deco: 'lava_rock',  density: 0.020, biomes: ['volcanic_rock', 'obsidian'], allowWalkable: false }],
  DemonGate:   [{ deco: 'lava_rock',  density: 0.025, biomes: ['volcanic_rock', 'obsidian'], allowWalkable: false },
                { deco: 'bones',      density: 0.020, biomes: ['volcanic'],                  allowWalkable: true }],
  IceCave:     [{ deco: 'ice_shard',  density: 0.030, biomes: ['ice', 'ice_dark'], allowWalkable: false }],
  Citadel:     [{ deco: 'ice_shard',  density: 0.020, biomes: ['snow', 'ice'],     allowWalkable: false }],
  FrostWastes: [{ deco: 'ice_shard',  density: 0.025, biomes: ['snow', 'ice'],     allowWalkable: false },
                { deco: 'bones',      density: 0.012, biomes: ['snow'],            allowWalkable: true }],
  Swamp:       [{ deco: 'mushroom_cluster', density: 0.035, biomes: ['dark_grass', 'dirt'], allowWalkable: true },
                { deco: 'swamp_reed',       density: 0.025, biomes: ['water', 'dark_grass'], allowWalkable: false }],
  Mines:       [{ deco: 'crystal_small', density: 0.025, biomes: ['stone', 'stone_dark'], allowWalkable: false },
                { deco: 'pebbles',       density: 0.020, biomes: ['dirt', 'stone'],       allowWalkable: true }],
  Ruins:       [{ deco: 'ruin_pillar', density: 0.015, biomes: ['stone', 'sand'], allowWalkable: false },
                { deco: 'pebbles',     density: 0.025, biomes: ['stone', 'sand'], allowWalkable: true }],
  VoidRealm:   [{ deco: 'void_wisp', density: 0.020, biomes: ['obsidian', 'stone_dark'], allowWalkable: true }],
  Eternal:     [{ deco: 'void_wisp', density: 0.025, biomes: ['obsidian'], allowWalkable: true },
                { deco: 'bones',     density: 0.015, biomes: ['obsidian', 'stone_dark'], allowWalkable: true }],
  Forge:       [{ deco: 'anvil_scrap', density: 0.018, biomes: ['stone_dark', 'volcanic_rock'], allowWalkable: true }],
  Abyss:       [{ deco: 'coral',  density: 0.020, biomes: ['water', 'stone_dark'], allowWalkable: false }],
  Dungeon:     [{ deco: 'bones',   density: 0.018, biomes: ['stone_dark', 'cobble'], allowWalkable: true },
                { deco: 'pebbles', density: 0.020, biomes: ['stone_dark'],           allowWalkable: true }],
  // Town bilinçli boş: hub binaları + mevcut tema dekorları yeterli, çakışma riski alma
};
```

- [ ] **Step 2: renderTerrain'e prop yerleşimi ekle** (chunk döngüsünde, drawDecoration çağrısından sonra):

```ts
// Zone kimlik prop'ları — görsel katman, collision'a dokunmaz
const props = ZONE_PROPS[this.scene.key];
if (props && !tile.data?.deco && !tile.interact) {
  const h = (tx * 374761393 + ty * 668265263) >>> 0;
  for (const p of props) {
    if (!p.biomes.includes(tile.biome)) continue;
    // Yürünebilir (küçük zemin) prop yalnız açık tile'a; büyük prop yalnız collision tile'a
    if (p.allowWalkable ? tile.collision : !tile.collision) continue;
    if ((h % 1000) < p.density * 1000) {
      this.drawDecoration(tx, ty, p.deco, tile.height);
      break; // tile başına en fazla 1 prop
    }
  }
}
```

- [ ] **Step 3: drawDecoration'a yeni case'ler.** 3 tam örnek (kalanlar aynı kalıp — tek Graphics, isoDepth+2, mevcut 'rock' case stilinde):

```ts
case 'gravestone': {
  const g = this.add.graphics().setDepth(depth);
  g.fillStyle(0x777788, 1);
  g.fillRoundedRect(screen.x - 5, screen.y - 16, 10, 14, { tl: 5, tr: 5, bl: 0, br: 0 });
  g.fillStyle(0x555566, 1);
  g.fillRect(screen.x - 7, screen.y - 3, 14, 3);
  g.lineStyle(1, 0x444455, 0.8);
  g.beginPath(); g.moveTo(screen.x - 2, screen.y - 11); g.lineTo(screen.x + 2, screen.y - 11);
  g.moveTo(screen.x, screen.y - 13); g.lineTo(screen.x, screen.y - 8); g.strokePath();
  this.objectGfxList.push(g);
  break;
}
case 'ice_shard': {
  const g = this.add.graphics().setDepth(depth);
  g.fillStyle(0xaaddff, 0.9);
  g.beginPath();
  g.moveTo(screen.x - 6, screen.y); g.lineTo(screen.x - 2, screen.y - 18);
  g.lineTo(screen.x + 1, screen.y); g.closePath(); g.fillPath();
  g.fillStyle(0xcceeff, 0.8);
  g.beginPath();
  g.moveTo(screen.x + 1, screen.y); g.lineTo(screen.x + 5, screen.y - 11);
  g.lineTo(screen.x + 8, screen.y); g.closePath(); g.fillPath();
  this.objectGfxList.push(g);
  break;
}
case 'lava_rock': {
  const g = this.add.graphics().setDepth(depth);
  g.fillStyle(0x3a2418, 1);
  g.fillEllipse(screen.x, screen.y - 5, 16, 10);
  g.fillStyle(0xff5522, 0.9); // köz çatlakları
  g.fillRect(screen.x - 4, screen.y - 7, 5, 1.5);
  g.fillRect(screen.x + 1, screen.y - 4, 4, 1.5);
  this.objectGfxList.push(g);
  break;
}
// Aynı kalıpla: bones (2-3 açık gri çubuk+kafatası dairesi), mushroom_cluster
// (2-3 şapkalı mantar, kırmızı/kahve), fallen_log (yatay kütük), swamp_reed
// (3-4 ince dik çizgi), crystal_small (mor mini ice_shard), pebbles (3 koyu
// nokta), ruin_pillar (kırık sütun: gövde+devrik başlık), void_wisp (mor
// yarı saydam daire + alpha tween), anvil_scrap (koyu örs silüeti+kıvılcım
// noktası), coral (turuncu/pembe dallı çalı).
```

- [ ] **Step 4: addAmbientParticles'a zone özelleştirmesi** — mevcut fonksiyondaki zone→partikül ayrımını genişlet: Volcano/DemonGate/Sanctum/Forge = yukarı süzülen turuncu köz (0xff7733); Swamp = yavaş yeşil spor (0x88cc66); Crypt/Necropolis/Dungeon = gri toz; VoidRealm/Eternal = mor kıvılcım (0xaa66ff); IceCave/Citadel/FrostWastes = mevcut kar. Partikül sayısı üst sınırı (25) ve mobil davranışı DEĞİŞMEZ.
- [ ] **Step 5: DOĞRULAMA** — özellikle `hub-town-check.ts` 150/150 (Town'a prop eklenmediğini de doğrular) + 4 zone screenshot spot (Crypt, Volcano, Swamp, Mines).
- [ ] **Step 6: Commit**

```bash
git add lib/game/maps/zoneProps.ts lib/game/iso/IsoBaseScene.ts
git commit -m "feat(world): zone kimlik prop'ları + zone'a özel ambient partiküller"
```

---

### Task 10: P4 — savaş sahnesi zone arka planı + savaş sprite'ları + boss imzaları + HUD dokunuşu

**Files:**
- Create: `frontend/lib/game/battleBackdrop.ts`
- Modify: `frontend/lib/game/scenes/BattleScene.ts` (2670 satır — önce oku: init data'sı, monster çizimi, layout)
- Modify: `frontend/lib/game/scenes/HUDScene.ts` (minimap çerçevesi)

- [ ] **Step 1: BattleScene'i keşfet** — `grep -n "init(\|drawMonster\|returnScene\|monsterType" lib/game/scenes/BattleScene.ts` ile: (a) hangi data ile başlatılıyor (dönüş zone'u geliyor mu — gelmiyorsa `PlayerState.get().lastZone` kullan), (b) monster görseli nerede çiziliyor, (c) arka plan şu an ne.
- [ ] **Step 2: battleBackdrop.ts yaz** — zone paletiyle katmanlı arka plan:

```ts
// frontend/lib/game/battleBackdrop.ts
// Savaş sahnesi zone-temalı arka planı: gradient gökyüzü + 2 kat silüet.
import * as Phaser from 'phaser';
import { ZONE_ATMOSPHERE } from './iso/zoneAtmosphere';

export function drawBattleBackdrop(scene: Phaser.Scene, zoneKey: string, w: number, h: number): void {
  const atmo = ZONE_ATMOSPHERE[zoneKey] ?? ZONE_ATMOSPHERE.Forest;
  const g = scene.add.graphics().setDepth(-10);

  // Gökyüzü gradyanı
  g.fillGradientStyle(atmo.tint, atmo.tint, atmo.fogColor, atmo.fogColor, 0.5, 0.5, 0.9, 0.9);
  g.fillRect(0, 0, w, h * 0.62);

  // Uzak silüet (tepeler/sütunlar) — seeded üçgen sırası
  g.fillStyle(atmo.fogColor, 0.55);
  for (let i = 0; i < 7; i++) {
    const bx = (i / 7) * w + ((i * 97) % 40) - 20;
    const bw = w / 6 + ((i * 53) % 50);
    const bh = h * 0.14 + ((i * 31) % 45);
    g.fillTriangle(bx, h * 0.62, bx + bw / 2, h * 0.62 - bh, bx + bw, h * 0.62);
  }
  // Yakın silüet (daha koyu)
  g.fillStyle(atmo.fogColor, 0.85);
  for (let i = 0; i < 5; i++) {
    const bx = (i / 5) * w + ((i * 61) % 60) - 30;
    const bw = w / 4 + ((i * 41) % 60);
    const bh = h * 0.08 + ((i * 23) % 30);
    g.fillTriangle(bx, h * 0.62, bx + bw / 2, h * 0.62 - bh, bx + bw, h * 0.62);
  }
  // Zemin
  g.fillGradientStyle(atmo.fogColor, atmo.fogColor, 0x0a0e1a, 0x0a0e1a, 0.7, 0.7, 0.95, 0.95);
  g.fillRect(0, h * 0.62, w, h * 0.38);
}
```

Zone karakteri: Volcano/DemonGate'te üçgenler sivri (bh × 1.5), IceCave/Citadel'de üçgen yerine `fillRoundedRect` buz kütleleri, Abyss'te üst şerit dalga elipsleri — `zoneKey`e göre 3 varyant switch'i ekle (aynı fonksiyon içinde).

- [ ] **Step 3: BattleScene'e bağla** — create'in başında (mevcut düz arka planın yerine) `drawBattleBackdrop(this, zoneKey, w, h)`. Monster görseli: `getMonsterVisual(type)` eşlemesi varsa monster çizim noktasında `add.sprite(x, y, v.sheet, v.frame).setScale(v.scale * 2)` (savaşta ~6×) + tint + mevcut flash/knockback tween'leri sprite'a uygulanır; eşleme yoksa (boss'lar dahil) mevcut prosedürel çizim AYNEN kalır.
- [ ] **Step 4: Boss imza görselleri** — 13 boss'un savaş çizimine tip-bazlı aksan katmanı: mevcut prosedürel boss çizim fonksiyonunu bul, her boss tipine 2-3 vurgu ekle (dread_lord: omuz sivrileri + göz parıltısı; titan_forgemaster: örs-çekiç silüeti + turuncu damar çizgileri; void_sovereign: etrafında dönen 3 mor parça — redrawNftAura'daki orbit kalıbı). Kod mevcut boss çizim stiliyle yazılır; her boss ~8-15 satır.
- [ ] **Step 5: HUD minimap çerçevesi** — HUDScene minimap bloğuna (:35-145 stats panel stiliyle uyumlu): 1.5px cyan-alpha çerçeve + köşe aksan tikleri:

```ts
const frame = this.add.graphics().setScrollFactor(0).setDepth(4502);
frame.lineStyle(1.5, 0x00e5ff, 0.35);
frame.strokeRoundedRect(mapX - 3, mapY - 3, mapSize + 6, mapSize + 6, 6);
frame.lineStyle(2, 0x00e5ff, 0.7);
// köşe tikleri (sol-üst örneği; 4 köşe için tekrarla)
frame.beginPath(); frame.moveTo(mapX - 3, mapY + 7); frame.lineTo(mapX - 3, mapY - 3); frame.lineTo(mapX + 7, mapY - 3); frame.strokePath();
```

(`mapX/mapY/mapSize` değişken adlarını HUDScene'deki gerçek adlarla eşle — createMinimap IsoBaseScene :3111 civarında; çerçeve oraya da eklenebilir, hangisi minimap'i çiziyorsa oraya.)

- [ ] **Step 6: Battle-test harness ile doğrula** — 17 Tem kalıbı: geçici `/world/battle-test` rotası (`?boss=<type>` destekli), 3 normal monster + 3 boss savaşı screenshot; harness commit ÖNCESİ silinir.
- [ ] **Step 7: DOĞRULAMA + Commit**

```bash
git add lib/game/battleBackdrop.ts lib/game/scenes/BattleScene.ts lib/game/scenes/HUDScene.ts lib/game/iso/IsoBaseScene.ts
git commit -m "feat(world): savaş sahnesi zone arka planları + savaş sprite'ları + boss imza görselleri + minimap çerçevesi"
```

---

### Task 11: Bütünlük turu — 18 zone matrisi + düzeltmeler + rollout

**Files:** düzeltme çıkan dosyalar (değer ayarları)

- [ ] **Step 1: 18 zone'u harness ile screenshot'la** (Task 7 kalıbı), tek dizinde topla.
- [ ] **Step 2: Yan yana incele** (Read ile) — kontrol listesi: (a) her zone ayırt edilebilir mi, (b) monster sprite'ları zemin üstünde okunaklı mı, (c) atmosfer alpha'sı oynanışı karartmıyor mu, (d) prop yoğunluğu ne boş ne kalabalık, (e) ışık havuzları taşmıyor mu. Sorunları değer ayarlarıyla (tint/alpha/density) tek commit'te düzelt.
- [ ] **Step 3: Tam test süiti**: DOĞRULAMA bloğu + `node scripts/hub-embed-smoke.mjs` (18/18) + `npx tsx scripts/monster-sprite-test.ts` + mobil viewport smoke (`world-visual-smoke.mjs`'e 390×844 viewport parametresi ekle ya da elle).
- [ ] **Step 4: Commit + push + prod deploy** (memory'deki rsync akışı: lokal build → rsync → pm2 restart; SQLite+uploads exclude'ları ZORUNLU) + prod smoke (`node scripts/world-visual-smoke.mjs https://frostbite.pro`).
- [ ] **Step 5: Memory güncelle** — world-hub / bugfix memory dosyalarına görsel yükseltme durumu işlenir.

```bash
git add -A && git commit -m "polish(world): bütünlük turu — 18 zone palet/yoğunluk düzeltmeleri"
git push origin frozenfriends-mvp
```

---

## Self-review notları (yazım sonrası kontrol edildi)

- **Spec kapsaması:** vitrin kapısı=Task 5 · P1=Task 2,3,6 · P2=Task 4,7 · P3=Task 9 · P4=Task 10 · hero=Task 8 · bütünlük=Task 11 · araçlar=Task 1. Spec'teki RenderTexture → chunk+cull değişikliği plan başında gerekçeli.
- **Tip tutarlılığı:** `createMonsterVisual(container, type)` imzası Task 3'te tanımlı, Task 6/10 aynı imzayı kullanır. `ZONE_ATMOSPHERE` Task 4'te tanımlı, Task 7/10 tüketir. `getMonsterVisual` Task 2'de tanımlı.
- **Bilinçli esneklikler (placeholder DEĞİL, keşif adımı):** kenney frame index'leri kontakt sheet'ten seçilir (test -1'i reddeder); BattleScene/silah bloğu entegrasyonları "önce oku, mevcut stile uy" talimatlı — 2670 satırlık dosyada satır tahmin etmek yanlış plan üretirdi.
- **Riskler plan içinde:** çift-bob tween çakışması (Task 6), hub-town-check koruması (Task 9), diyalog-üstü overlay depth'i (Task 4), Town'a prop eklememe kararı (Task 9).
