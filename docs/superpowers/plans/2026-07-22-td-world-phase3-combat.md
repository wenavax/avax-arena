# TD World Faz 3 — Savaş Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dünyada gezinen chibi canavarlar + temas encounter'ı + TdBattleScene (BattleScene kopya-reskin, kontrat birebir) + parametrik TdDungeonScene (13 zindan: prosedürel layout, birebir roster/boss) — `/worldtestnet` canlısında uçtan uca savaş.

**Architecture:** `iso/monsterSprites.ts` VERİ olarak import edilir (dokunulmaz; MONSTER_VISUALS/ARCHETYPES tek kaynak). 20 arketip → 6 chibi gövde planı + tint. BattleScene → `td/TdBattleScene.ts` kopyası (canlı izo etkilenmez), sprite+backdrop yolu değişir. Zindanlar: seed'li prosedürel oda düzeni + bölge paleti + izo'dan damıtılmış canavar/boss rosterı.

**SPEC SAPMASI (bilinçli, onaya sunuldu):** spec §1.1 "13 zindanın layout'u veriye çıkarılır" demişti; el yapımı 13×~700 LOC layout çıkarımı yerine Faz 3'te **layout prosedürel (dungeonId-seed'li, deterministik)**, canavar/boss rosterları birebir izo'dan. El yapımı layout istenirse Faz 3.5 olarak ayrılır.

**ONAY KAPISI:** Task 1 sonunda canavar şablon örnekleri kullanıcıya screenshot'la sunulur; onay gelmeden Task 2+ BAŞLAMAZ.

**Kurallar:** izo dosyalarına/sceneLoader'a/hubGames'e dokunma (`iso/monsterSprites` yalnız import). Harita imzası 3830429448 korunur. Salt sözlüğüne yeni kayıt: **7=canavar yerleşim** (tdCore JSDoc'a eklenir). Her görev commit + çift review.

---

### Task 1: monsterChibi — 6 gövde planı + arketip eşleme + örnek sayfası 🔑ONAY KAPISI

**Files:**
- Modify: `frontend/lib/game/td/tdCore.ts` (salt 7 kaydı — JSDoc satırına `, 7=canavar yerleşim` ekle)
- Create: `frontend/lib/game/td/sprites/monsterChibi.ts`
- Modify: `frontend/app/worldtestnet/page.tsx` (`?monsters=1` query → örnek grid overlay)
- Test: `frontend/scripts/td-monster-test.ts` (Node: eşleme kapsaması)

- [ ] **Step 1: Failing test:**

```ts
// frontend/scripts/td-monster-test.ts
import { ARCH_TO_PLAN, PLANS, monsterPlanFor } from '../lib/game/td/sprites/monsterChibi';
import { ARCHETYPES, MONSTER_VISUALS } from '../lib/game/iso/monsterSprites';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };
ok('plans-6', Object.keys(PLANS).length === 6);
ok('all-20-archetypes-mapped', Object.keys(ARCHETYPES).every(a => !!ARCH_TO_PLAN[a]));
// her canavar tipi bir plana çözülür (null=boss → 'boss' planı)
ok('all-visuals-resolve', Object.keys(MONSTER_VISUALS).every(t => !!monsterPlanFor(t)));
ok('boss-resolves', monsterPlanFor('__unknown_boss__') === 'boss');
console.log('visual count:', Object.keys(MONSTER_VISUALS).length);
console.log(`td-monster: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
```

- [ ] **Step 2:** FAIL gör. **Step 3: Implement** `monsterChibi.ts`:

```ts
// frontend/lib/game/td/sprites/monsterChibi.ts
// ─── Canavar chibi fabrikası: 6 gövde planı × arketip eşleme × tint ───
// Veri kaynağı iso/monsterSprites (SADECE import — dokunulmaz).
// Client-only çizim; monsterPlanFor/ARCH_TO_PLAN saf (Node-testli).
import { spr, outline, type Px } from './chibi';
import { MONSTER_VISUALS } from '../../iso/monsterSprites';

export type PlanKey = 'biped' | 'beast' | 'blob' | 'flying' | 'serpent' | 'boss';
export const PLANS: Record<PlanKey, true> = { biped: true, beast: true, blob: true, flying: true, serpent: true, boss: true };

export const ARCH_TO_PLAN: Record<string, PlanKey> = {
  skeleton: 'biped', zombie: 'biped', wraith: 'biped', demon: 'biped', imp: 'biped',
  knight: 'biped', mage: 'biped', golem: 'biped',
  beast: 'beast', rat: 'beast', spider: 'beast', insect: 'beast',
  blob: 'blob', plant: 'blob', elemental: 'blob', octopus: 'blob',
  ghost: 'flying', bird: 'flying',
  snake: 'serpent', dragon: 'serpent',
};

/** Tip → plan (saf). Bilinmeyen/null (boss) → 'boss'. */
export function monsterPlanFor(type: string): PlanKey {
  const vis = MONSTER_VISUALS[type];
  if (!vis) return 'boss';
  return ARCH_TO_PLAN[vis.arch] ?? 'biped';
}

const EYE = '#20242c';
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function shade(c: string, f: number): string {
  const n = parseInt(c.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Her plan: 2 kare (idle/step) çizer. body = ana renk (tint'ten), boyut small/big.
function drawBiped(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.25);
  px(cx - 4, 0, 8, 2, C); px(cx - 5, 1, 10, 5, C);            // iri kafa
  px(cx - 3, 2, 2, 2, EYE); px(cx + 1, 2, 2, 2, EYE);
  px(cx - 5, 5, 10, 1, D);
  px(cx - 4, 6, 8, H - 12, C); px(cx - 4, 6, 1, H - 12, D); px(cx + 3, 6, 1, H - 12, D); // gövde
  px(cx - 5, 7, 1, 3, L); px(cx + 4, 7, 1, 3, L);              // omuz vurgusu
  if (f === 0) { px(cx - 3, H - 4, 2, 4, D); px(cx + 1, H - 4, 2, 4, D); }
  else { px(cx - 3, H - 4, 2, 3, D); px(cx + 1, H - 5, 2, 5, D); }
}
function drawBeast(px: Px, f: number, C: string, W: number, H: number): void {
  const D = shade(C, 0.72);
  px(2, H - 9, W - 6, 6, C); px(2, H - 4, W - 6, 1, D);        // yatay gövde
  px(W - 7, H - 12, 6, 6, C); px(W - 5, H - 11, 2, 2, EYE);    // baş sağda
  px(W - 8, H - 13, 2, 2, C); px(W - 3, H - 13, 2, 2, C);      // kulaklar
  px(0, H - 8, 3, 2, D);                                        // kuyruk
  if (f === 0) { px(4, H - 3, 2, 3, D); px(W - 8, H - 3, 2, 3, D); }
  else { px(6, H - 3, 2, 3, D); px(W - 10, H - 3, 2, 3, D); }
}
function drawBlob(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.3);
  const squish = f === 0 ? 0 : 1;
  px(cx - 6, 4 + squish, 12, H - 6 - squish, C);
  px(cx - 7, 7 + squish, 14, H - 9 - squish, C);
  px(cx - 5, 5 + squish, 3, 2, L);                              // parlama
  px(cx - 7, H - 4, 14, 2, D);
  px(cx - 3, 8 + squish, 2, 2, EYE); px(cx + 1, 8 + squish, 2, 2, EYE);
}
function drawFlying(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72);
  const wing = f === 0 ? 0 : -2;
  px(cx - 8, 6 + wing, 5, 3, D); px(cx + 3, 6 + wing, 5, 3, D); // kanatlar
  px(cx - 4, 3, 8, 8, C);                                       // gövde
  px(cx - 2, 5, 2, 2, EYE); px(cx + 1, 5, 2, 2, EYE);
  px(cx - 3, 11, 2, 3, C); px(cx + 1, 11, 2, 2, C);             // hayalet kuyruk saçağı
}
function drawSerpent(px: Px, f: number, C: string, W: number, H: number): void {
  const D = shade(C, 0.72), s = f === 0 ? 0 : 1;
  px(2, H - 5, W - 8, 3, C); px(4 + s, H - 8, W - 12, 3, C);    // kıvrım
  px(W - 8, H - 13, 6, 7, C);                                   // dik baş
  px(W - 6, H - 11, 2, 2, EYE);
  px(W - 9, H - 6, 2, 1, D); px(2, H - 3, W - 8, 1, D);
}
function drawBoss(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.7), L = shade(C, 1.3);
  px(cx - 7, 0, 14, 3, C); px(cx - 9, 2, 18, 8, C);             // dev kafa
  px(cx - 9, 0, 3, 4, L); px(cx + 6, 0, 3, 4, L);               // boynuz
  px(cx - 5, 4, 3, 3, EYE); px(cx + 2, 4, 3, 3, EYE);
  px(cx - 2, 8, 4, 1, '#ffffff');                               // diş
  px(cx - 8, 10, 16, H - 16, C); px(cx - 8, 10, 2, H - 16, D); px(cx + 6, 10, 2, H - 16, D);
  px(cx - 11, 11, 3, 5, C); px(cx + 8, 11, 3, 5, C);            // pençe kollar
  if (f === 0) { px(cx - 5, H - 6, 4, 6, D); px(cx + 1, H - 6, 4, 6, D); }
  else { px(cx - 5, H - 6, 4, 5, D); px(cx + 1, H - 7, 4, 7, D); }
}

const DRAW: Record<PlanKey, (px: Px, f: number, C: string, W: number, H: number) => void> = {
  biped: drawBiped, beast: drawBeast, blob: drawBlob, flying: drawFlying, serpent: drawSerpent, boss: drawBoss,
};
/** Plan → taban boyut (small overworld / big battle ×~2). */
const SIZE: Record<PlanKey, [number, number]> = {
  biped: [14, 18], beast: [18, 14], blob: [16, 15], flying: [18, 15], serpent: [18, 15], boss: [26, 26],
};

/** Canavar chibi 2-kare seti. big=savaş boyu (×2). Tint MONSTER_VISUALS'tan; boss default kızıl. */
export function mkMonsterChibi(type: string, big = false): { frames: HTMLCanvasElement[]; ox: number; oy: number } {
  const plan = monsterPlanFor(type);
  const vis = MONSTER_VISUALS[type];
  const base = vis?.tint !== undefined ? hex(vis.tint) : plan === 'boss' ? '#b03038' : '#9aa4b0';
  const [w, h] = SIZE[plan];
  const mult = big ? 2 : 1;
  const frames = [0, 1].map(f => {
    const raw = spr(w, h, (px) => DRAW[plan](px, f, base, w, h));
    const o = outline(raw);
    if (mult === 1) return o;
    const c = document.createElement('canvas');
    c.width = o.width * mult; c.height = o.height * mult;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(o, 0, 0, c.width, c.height);
    return c;
  });
  return { frames, ox: frames[0].width >> 1, oy: frames[0].height - 2 };
}
```

- [ ] **Step 4:** Test PASS (4 pass) + typecheck boş.

- [ ] **Step 5: Örnek grid overlay.** `page.tsx`: `useSearchParams` KULLANMA (Suspense gerektirir); `window.location.search` oku. `?monsters=1` iken oyun yerine örnek grid çiz: bir canvas'a 6 planın temsilcisi (skeleton, wolf, slime→blob tipi 'treant', ghost, snake, `__boss__`) küçük+büyük 2 kare yan yana, altlarına plan adı; ayrıca 12 rastgele gerçek tip (MONSTER_VISUALS'tan ilk 12) küçük boy. Grid canvas'ı `image-rendering:pixelated` ile 3× göster. (Bu overlay kalıcı — gelecek fazlarda görsel regresyon aracı.)

- [ ] **Step 6:** Build ✓, commit: `feat(td): monsterChibi — 6 gövde planı, 20 arketip eşleme, örnek grid (?monsters=1)`.

- [ ] **Step 7 (controller):** Dev server + `?monsters=1` screenshot → KULLANICI ONAYI. Onay gelmeden Task 2'ye geçilmez. Kullanıcı beğenmezse plan/palet düzeltmesi bu görevde iterate edilir.

---

### Task 2: monsterData — bölge havuzları + zindan rosterları (izo'dan damıtma, saf)

**Files:**
- Create: `frontend/lib/game/td/monsterData.ts`
- Test: `frontend/scripts/td-mondata-test.ts`

- [ ] **Step 1:** İzo sahnelerinden damıt (SADECE OKU): her `Iso*Scene.ts`'teki monster tablosundan (tx,ty at, kalanı al) bölge başına 4-6 temsilci `{type,name,level,hp,atk,def}` seç (düşük/orta/yüksek level yayılımı) + her sahnenin boss'unu `{type,name,level,hp,atk,def,isBoss:true}` olarak çıkar. Bölge eşlemesi: Forest→forest, Town yok, Dungeon→mines?, — DOĞRUSU: zone→region eşlemesi worldMap REGIONS key'leriyle: forest/grassE (Forest'tan), grassS (Forest düşük level), swamp/mines/ruins/citadel/sanctum/crypt/frostwastes/necropolis/volcano/abyss/forge/demongate/voidrealm/eternal kendi sahnelerinden; Dungeon+IceCave sahneleri zindan-rosterı olarak `DUNGEON_ROSTERS.mines`/`.frostwastes`'e ek. Yapı:

```ts
export interface MonsterEntry { type: string; name: string; level: number; hp: number; atk: number; def: number; isBoss?: boolean }
export const REGION_MONSTERS: Record<string, MonsterEntry[]> = { /* 16 bölge (town/grassS hariç değil — grassS düşük level forest alt kümesi) */ };
export const DUNGEON_ROSTERS: Record<string, { pool: MonsterEntry[]; boss: MonsterEntry }> = { /* 14 kapı bölge-key'i */ };
```

- [ ] **Step 2: Test** (`td-mondata-test.ts`): (a) REGION_MONSTERS her non-town bölge için ≥3 entry, (b) her entry.type `MONSTER_VISUALS`'ta VAR ya da roster boss'u (monsterPlanFor çözer — hata atmaz), (c) DUNGEON_ROSTERS 14 kapı key'inin hepsini kapsar + her birinde boss var, (d) level'lar bölgenin `REGIONS.level` aralığının ±5 içinde. Beklenen: tümü pass.

- [ ] **Step 3:** Commit: `feat(td): monsterData — izo tablolarından damıtılmış bölge havuzları + 14 zindan rosterı`.

---

### Task 3: Overworld canavarları — spawn + gezinme + temas

**Files:**
- Modify: `frontend/lib/game/td/TdWorldScene.ts`

- [ ] **Step 1:** Chunk yüklenirken bölge havuzundan canavar spawn: chunk başına `hash2d(cx,cy,7)%3 + 2` adet (town chunk'ı 0), pozisyon chunk içi hash'li boş tile; her canavar `{entry, x, y, tx0, ty0, img, hp}` — texture `td-mon-${type}` (mkMonsterChibi small, 2 kare 300ms flip). Gezinme: tilki AI'ının kopyası (spawn noktasının 40px yarıçapında hedefler, 18px/s). Depth: `depth(x,y)`.
- [ ] **Step 2:** Temas: kahraman-canavar mesafesi < 12px && battle aktif değil → `this.startBattle(entry, monsterRef)`. Task 4 gelene dek `startBattle` = hintText'e `⚔ {name} Lv{level}` yaz + canavarı 1.5s geri it (knockback). Elite: `hash2d(tx0,ty0,7)%10===0` → isElite (isim öneki + ×2 hp — iso formülüyle aynı: hp×2, atk×1.5, def×1.3).
- [ ] **Step 3:** Evict: canavar objeleri chunk tahliyesinde yok edilir (chunkProps.objs kalıbı — ayrı `chunkMonsters` Map). Typecheck + build + smoke (`td-walk-smoke.py`'a assertion ekle: `monsters>0` — scene'e `chunkMonsters` say). Commit: `feat(td): overworld canavarları — bölge havuzlu spawn, gezinme, temas`.

---

### Task 4: TdBattleScene — kopya-reskin (kontrat birebir)

**Files:**
- Create: `frontend/lib/game/td/TdBattleScene.ts` (BattleScene.ts kopyasından)
- Modify: `frontend/lib/game/td/TdWorldScene.ts` (startBattle gerçek launch)
- Modify: `frontend/app/worldtestnet/page.tsx` (scene listesine TdBattleScene)

- [ ] **Step 1:** `cp lib/game/scenes/BattleScene.ts lib/game/td/TdBattleScene.ts` sonra patch: (a) class/`super({key:'Battle'})` → `TdBattleScene`/`'TdBattle'`, (b) import yolları düzelt (`../` derinlikleri), (c) canavar sprite oluşturma noktasını bul (grep: MONSTER_VISUALS / ARCHETYPES / archetype frame kullanımı) → yerine `mkMonsterChibi(type, true)` 2-kare texture (`td-bmon-${type}`) + 600ms flip tween; scale/pozisyon mevcut sprite yerleşimini koru, (d) backdrop çizimini bul → bölge paletli prosedürel gradient + vinyet (data.region geçilir; `biomeTopColor` + atmo tint), (e) juice/tween/HP bar/konfeti DOKUNMA — aynen kalsın, (f) `returnScene` mantığı korunur (TdWorld 'battle-end' dinliyor).
- [ ] **Step 2:** TdWorldScene.startBattle: `this.scene.launch('TdBattle', { monster: {...entry stats, isElite}, region: rgKey, returnScene: 'TdWorld' }); this.scene.pause();` + `battle-end` once → resume + kazanıldıysa canavar objesini despawn (5dk respawn timer), kaybedildiyse spawn'a ışınla + tam can (iso davranışı ne ise onu kopyala — BattleScene'in kaybetme akışını oku ve aynısını uygula).
- [ ] **Step 3:** page.tsx `scene: [TdWorldScene, TdBattleScene]`. Typecheck+build. Headless doğrulama: smoke'a battle roundtrip ekle — `__tdGame` üzerinden en yakın canavarı kahramanın üstüne taşı → temas → `scene.isActive('TdBattle')` true → battle scene'de kaçma/win debug… en basit: `s.scene.get('TdBattle').events.emit('battle-end',{won:true})` ile kapat → TdWorld resumed. Commit: `feat(td): TdBattleScene kopya-reskin + dünya savaş akışı`.

---

### Task 5: TdDungeonScene — parametrik zindan (prosedürel layout + birebir roster)

**Files:**
- Create: `frontend/lib/game/td/TdDungeonScene.ts`
- Create: `frontend/lib/game/td/dungeonGen.ts` (saf; Node-testli)
- Test: `frontend/scripts/td-dungeon-test.ts`
- Modify: `frontend/lib/game/td/TdWorldScene.ts` (kapı E → zindana giriş)

- [ ] **Step 1 (saf üretici + test, TDD):** `dungeonGen.ts`: `genDungeon(id: string): { w: number; h: number; tiles: Uint8Array (0 duvar/1 zemin/2 çıkış/3 boss-noktası); spawns: {x,y,i}[] }` — seed=id hash; 5-8 oda + koridor (drunkard-walk veya BSP basit), giriş güneyde, boss odası en uzak oda. Test: determinizm, oda bağlantılılığı (BFS: tüm zemin tile'ları girişten erişilir), boss noktası var, 14 id'nin hepsi üretilir.
- [ ] **Step 2:** `TdDungeonScene` (key 'TdDungeon'): data `{dungeonId}` alır; tiles'ı bölge paletiyle çizer (tek pre-render canvas — chunk gerekmez, zindan ≤64×64), duvar collision, canavarlar `DUNGEON_ROSTERS[id].pool`'dan spawn noktalarına, boss `3` noktasına (big chibi, `td-bmon-` texture), temas → TdBattle (returnScene 'TdDungeon'), çıkış tile'ı → TdWorld'e dön (kapının önüne). Atmosfer: bölgenin atmo'su koyulaştırılmış (tintAlpha ×1.6).
- [ ] **Step 3:** TdWorldScene kapı etkileşimi: E → `scene.start('TdDungeon',{dungeonId})` yerine sahne geçişi launch/stop dengesi: `this.scene.pause(); this.scene.launch('TdDungeon', {dungeonId, exitPos:{x,y}});` zindandan dönüş `this.scene.stop(); resume TdWorld`. page.tsx scene listesine ekle. Hint metni `E — enter {NAME}` olur (sealed kalkar).
- [ ] **Step 4:** Testler + typecheck + build + commit: `feat(td): TdDungeonScene — seed'li prosedürel zindan, birebir roster, kapı akışı`.

---

### Task 6: Kapanış — smoke genişletme + tam batarya + deploy

- [ ] Smoke'a ekle: monsters>0, battle roundtrip, dungeon giriş-çıkış roundtrip (E simülasyonu `__tdGame` scene API'siyle). Tam batarya: 5 td test scripti + hub-registry + izo-dokunulmazlık (`iso/monsterSprites.ts` diff DAHİL boş) + build. Deploy (rsync+pm2) + canlı screenshot turu (orman canavarı, savaş ekranı, zindan içi, boss). Push. Memory güncelle.

---

## Self-Review Notları
- Kontrat: `launch('TdBattle', {monster:{type,name,level,hp,maxHp,atk,def,isElite}, returnScene})` + `battle-end {won}` — izo BattleScene launch payload'ıyla birebir (IsoNecropolis örneğinden doğrulandı). maxHp'yi startBattle'da `hp` ile eşle.
- monsterChibi Node testi yalnız SAF exports'u (ARCH_TO_PLAN/PLANS/monsterPlanFor) import eder — mkMonsterChibi DOM'lu ama import zinciri `./chibi` üzerinden DOM'a import-time dokunmaz (fonksiyon gövdesinde) → tsx'te güvenli.
- BattleScene kopyası geçici duplikasyon (Faz 5'te izo silinince tekilleşir) — bilinçli.
- Salt 7 kaydı Task 1'de; Task 3 spawn'ı 7'yi kullanır.
