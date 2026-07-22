# TD World Faz 4 — Cozy Katman + Save v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toplama (ağaç/kaya/çalı/balık) + enerji + tarla + marketplace satışı — kalıcı TD durumu (`frostbite_td_save`, önizleme-izole) + test edilmiş v1→v2 göç fonksiyonu (Faz 5 geçişinde canlıya uygulanır).

**Architecture:** Saf çekirdek `td/cozy/` (enerji maliyet/regen, node kuralları, tarla durum makinesi — Node-testli) ↔ `td/tdState.ts` (kendi localStorage anahtarı; PlayerState'e DOKUNMAZ; `migrateV1()` saf fonksiyon fixture'larla testli) ↔ sahne entegrasyonu (SPACE toplama, enerji HUD, tarla parselleri, marketplace satış).

**Güvenlik ilkesi (Faz 3 dersi):** Önizleme HİÇBİR koşulda `frostbite_save`/`frostbite_achievements`'a yazmaz. TD durumu ayrı anahtar. `migrateV1` yalnız fonksiyon+test olarak gelir; çağrısı Faz 5'te.

**Kurallar:** izo/sceneLoader/hubGames/PlayerState.ts'e dokunma. Harita imzası 3830429448 korunur. Salt sözlüğü: **9=tarla yerleşimi** kaydı. Enerji değerleri spec §6.1: kesme 15, kazma 21, balık 25, ek/hasat 5; max 1000; pasif regen 6/sn, kamp ateşi ≤48px ×4.

---

### Task 1: cozy çekirdeği + tdState (saf, Node-testli)

**Files:**
- Create: `frontend/lib/game/td/cozy/rules.ts` (enerji maliyetleri, regen, node respawn süreleri, satış fiyatları, tarla aşama süreleri — TEK sabit kaynağı)
- Create: `frontend/lib/game/td/tdState.ts`
- Modify: `frontend/lib/game/td/tdCore.ts` (JSDoc salt satırına `, 9=tarla yerleşimi`)
- Test: `frontend/scripts/td-cozy-test.ts`

- [ ] **Step 1: Failing test** — kapsam: (a) COSTS/REGEN/PRICES sabitleri spec değerleriyle birebir; (b) `TdState.gather('wood')` enerji düşer + kaynak artar, enerji yetersizse false döner ve hiçbir şey değişmez; (c) `tick(dt, nearFire)` regen 6/sn ve ×4; cap 1000; (d) `sellAll()` fiyat tablosuyla gold'a çevirir, kaynaklar sıfırlanır; (e) farm: `plant(i)` → `tick` ile 2 aşama büyür (aşama süresi rules'tan) → `harvest(i)` +frostberry, boş parsele harvest false; (f) `save()/load()` roundtrip AYRI anahtar `frostbite_td_save` (Node'da localStorage yok → storage inject edilebilir olmalı: constructor `storage?: {getItem,setItem}` — testte in-memory stub); (g) `migrateV1(v1Json)`: gerçekçi v1 fixture (level/xp/gold/inventory/equipped/quests/zone:'Forest') → v2 objesi: TÜM v1 alanları korunur + `schemaVersion:2`, `worldPos` (zone→bölge spawn tablosundan: Forest→(150·16,150·16) gibi REGIONS merkezleri; bilinmeyen zone→TOWN_SPAWN), `energy:1000`, `resources:{}` boş, `farm:[]`; v1'de OLMAYAN hiçbir alan silinmez (spread-koruma testi: fixture'a sahte alan ekle, çıktı içermeli).
- [ ] **Step 2:** FAIL → implement. tdState iskeleti:

```ts
export interface TdResources { wood: number; stone: number; ore: number; fish: number; frostberry: number }
export interface FarmPlot { stage: 0 | 1 | 2 | 3; t: number } // 0 boş, 1-2 büyüme, 3 olgun
export class TdState {
  energy = 1000; gold = 0;
  resources: TdResources = { wood: 0, stone: 0, ore: 0, fish: 0, frostberry: 0 };
  farm: FarmPlot[] = Array.from({ length: 12 }, () => ({ stage: 0 as const, t: 0 }));
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem'>) {}
  // gather/tick/plant/harvest/sellAll/save/load — rules.ts sabitleriyle
}
export function migrateV1(v1: Record<string, unknown>): Record<string, unknown> { /* saf */ }
```
- [ ] **Step 3:** PASS + typecheck + imza guard'ı. Commit: `feat(td): cozy çekirdeği + tdState (frostbite_td_save, izole) + migrateV1`.

---

### Task 2: Sahne toplama entegrasyonu — SPACE ile kes/kaz/topla + enerji HUD

**Files:** Modify `frontend/lib/game/td/TdWorldScene.ts`, `frontend/app/worldtestnet/page.tsx` (kontrol satırına SPACE ekle)

- [x] TdState instance sahnede (lazy `new TdState()` + `load()` create'te; her mutasyondan sonra `save()` — kendi anahtarına, güvenli).
- [x] SPACE (keydown-SPACE): en yakın toplanabilir ≤22px: tree→`gather('wood')` 3 vuruş sonra kütük (img texture swap `td-stump` — sprites/props.ts'e mkStump ekle) + 25sn respawn; rock→'stone' (%25 hash şansıyla 'ore' — salt 4) 3 vuruş → despawn + 30sn; bush(berry varyantı)→'frostberry' tek vuruş → boş varyant + 20sn. Vuruş başına enerji maliyeti rules'tan (kesme 5/vuruş = toplam 15 vb. — rules'ta perHit alanları). Yetersiz enerji → hint kırmızı 'Not enough energy'. Floating +1 metni (mini Text, 60 frame yukarı süzülür — juice).
  - **API notu**: `tdState.gather(kind)` TOPLAM aksiyon maliyetini (COSTS.chop=15 vb.) tek seferde düşürüyor — vuruş-başına harcama modeline uymuyor. Çok-vuruşlu kesme/kazma için enerji PER_HIT'ten manuel düşüldü (yetersizse hiçbir şey değişmez kuralı korunarak) ve yalnız SON vuruşta kaynak +1 edildi (toplam harcama COSTS ile birebir). Tek-vuruşluk bush/fish için `gather()` doğrudan kullanıldı (API tam uyumlu).
- [x] Node durumu chunk-yerel RAM'de (respawn timer'lı Map; evict'te temizlenir — determinism bozulmaz çünkü kalıcı değil, bilinçli: node'lar chunk yeniden yüklenince tazelenir).
- [x] Enerji HUD: sol-üst 60×6 bar (scrollFactor 0, depth 1e9) + ⚡sayı; kamp ateşi ≤48px iken bar yanında 🔥×4 göstergesi; update'te `tdState.tick(dt, nearFire)`.
- [x] Balık: kahraman kıyıda (4 komşu tile'dan biri water) + SPACE + yakında başka toplanabilir yokken → 2.5sn sayaç (hint 'fishing…'), hareket iptal eder, bitince `gather('fish')`.
- [x] Doğrulama: typecheck, build, smoke'a ekle: SPACE ile ağaç kesimi → `s.tdState.resources.wood > 0` && energy < 1000 (hero'yu ağaca ışınlayarak — dev'de `__tdGame`). Commit.

---

### Task 3: Tarla + marketplace satışı

**Files:** Modify `worldProps.ts` (kind `'farm_plot'` — kasaba güneybatısında 4×3 parsel grid'i, salt 9; reserved() tarla alanını da korur), `sprites/props.ts` (mkFarmPlot(stage) 4 aşama görseli), `TdWorldScene.ts`, test `td-props-test.ts` (+2: farm_plot sayısı 12, hepsi kasaba chunk'ında)

- [ ] Parsel etkileşimi: E parselde → stage 0: `plant()` (enerji 5, hint 'planted 🌱'); stage 3: `harvest()` (+frostberry); 1-2: hint 'growing…'. Parsel sprite'ı tdState.farm[i].stage'e göre update'te senkron (12 sabit img, texture swap).
- [ ] Marketplace satışı: kind 'building' && data.id==='marketplace' && E → `sellAll()` → toast `Sold for {gold}g 💰` (td-hub-open yerine yeni CustomEvent 'td-sell' — page.tsx toast'u iki event'i de dinler); diğer binalar eski toast. HUD'a 💰gold sayacı (enerji barının altı).
- [ ] Test + typecheck + build + commit.

---

### Task 4: Kapanış — batarya + smoke + deploy

- [ ] Tüm td testleri (8 script) + hub-registry + izo+PlayerState dokunulmazlık (`git diff ... -- lib/game/PlayerState.ts` de BOŞ) + build.
- [ ] Smoke genişletmesi çalışıyor (gather assertion). **DEPLOY KURALI: smoke sonrası `npm run build` → rsync → pm2** (Faz 3'teki 502 tuzağı). Canlı doğrulama: enerji barı + ağaç kesme + tarla + satış screenshot turu. Push + memory.

---

## Self-Review Notları
- localStorage anahtarı `frostbite_td_save` — canlı `frostbite_save` ile ÇAKIŞMAZ; migrateV1 çağrılMAZ (Faz 5).
- Node-respawn RAM'de: determinizm imzası etkilenmez (worldMap/props üretimi değişmiyor; yalnız runtime durumu).
- Balık/tarla/enerji değerleri tek kaynak rules.ts — spec §6.1 ile birebir olduğu testle kilitli.
- TdBattleScene'e dokunulmuyor (gold/XP savaş ödülleri hâlâ sandbox'lı PlayerState'te — Faz 5'te tdState'e bağlanacak; bilinçli ayrık).
