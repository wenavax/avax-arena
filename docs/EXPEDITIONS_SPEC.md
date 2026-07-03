# Frostbite Expeditions — Oyun Tasarımı & Teknik Spec

> Tarih: 2026-07-03 · Durum: Taslak (onay bekliyor) · Yazar: Claude + çok-ajanlı analiz workflow'u
> Tür: **İdle on-chain roguelike auto-battler** (Loot Survivor × Super Auto Pets)
> Karar gerekçesi: `docs/GAME_ANALYSIS_REPORT.md` (portföy teşhisi) + 11-ajanlı ideation/jüri (assetFit=9, feasibility=9, en düşük risk)

---

## 0. TEK CÜMLE

Sahip olduğun **warrior NFT'lerini**, AI-üretilen boss'lara karşı doğrulanabilir (blockhash-seed) bir **idle gauntlet**'a gönder; katlar arası **FSB ile yakılan relic** kartları çek, squad'ın "frostbitten" olmadan önce en derine in; ulaştığın derinlik haftalık **Deepest Descent** ladder'ına yazılır ve her run paylaşılabilir bir AI-özet kartıyla biter.

---

## 1. NEDEN BU OYUN — Teşhisi Nasıl Çözüyor

`GAME_ANALYSIS_REPORT.md` + ekonomi analizinin ortaya koyduğu 4 kök sorun ve Expeditions'ın çözümü:

| Teşhis (mevcut) | Expeditions çözümü |
|---|---|
| **Combat'ta oyuncu kararı yok** — battle/quest tek-atışlık stat/RNG karşılaştırması | Katlar arası gerçek **draft / heal / push / extract** kararları (Super Auto Pets gerilimi). Combat sim çoklu tur, HP katlar arası taşınıyor. |
| **FSB'nin oyun-içi sink'i yok** → sürekli satış baskısı | FSB, her run **tüketilen** relic/provision/thaw ile **yakılıyor** → oyunla ölçeklenen deflasyonist sink |
| **Modlar birbirini beslemiyor** (paralel puan muslukları) | Warrior stat + level + element mastery + fusion **run gücünü** doğrudan etkiliyor; combat ilk kez ladder'ı hak ediyor |
| **AI / bot / content dosyaları kullanılmıyor** | `ai-enemy` = sonsuz boss üreteci; `lootTables/lore/elements/skills` = relic+flavor; 70 bot = ladder'ı 1. gün canlı gösterir |

**Kritik strateji notu:** 6 konseptin 4'ü "spectator + FSB bahis ligi"ne yakınsadı ama jüri onu **1. günden likidite + eşzamanlı oyuncu** gerektirdiği için (ince FSB LP riski) ertelemeyi seçti. Expeditions **deflasyonist-by-construction** (büyük emisyon yok, sadece burn) → ince likiditede güvenli. Ve **köprü**: oyuncu tabanı + FSB likidite oluşunca, doğrulanabilir combat replay üstüne **spectator pari-mutuel bahis** faz-2 fast-follow olarak eklenir. Yani bahis-ligi tezi reddedilmiyor, kazanılıyor.

---

## 2. ÇEKİRDEK DÖNGÜ (Core Loop)

### Session akışı
```
1. PARTY SEÇ      → cüzdanındaki 1-3 ArenaWarrior (getWarriorsByOwner)
2. RELIC DRAFT    → FSB entry öde, 3 relic/tactic kartı çek (rastgele havuzdan, FSB ile re-roll)
3. DESCEND        → startRun() tx: blockhash + runId seed olarak snapshot'lanır
4. FLOOR LOOP (5-10+ kat):
     a. Kat boss'u = önceden cache'lenmiş ai-enemy şablonu (seed'e bağlı)
     b. Combat = mevcut client sim, deterministik (seed'li RNG), HP KATLAR ARASI TAŞINIR
     c. Kat temizlenince ÜÇ SEÇİM: [Relic al] / [İyileş] / [Bankala & Çık]
5. SON:
     - EXTRACT   → settleRun(runId, depth) → FSB ödül (pendingPayouts → withdrawPayout)
     - ÖLÜM      → squad "frostbitten" (DB lock), depth yine de ladder'a yazılır
6. LADDER + RECAP → Deepest Descent haftalık ladder + paylaşılabilir AI-özet kartı
```

### Neden "tension" var (roguelike özü)
- **HP taşınıyor** → her kat riski artar; "bir kat daha mı, yoksa şimdi mi bankalıyım?" ikilemi
- **Extract = FSB ödülü kesinleşir; ölürsen ödül yanar** (ama depth ladder'a yazılır)
- **Frostbite** = warrior gerçek zamanlı çözülür (örn. 8-24 saat) VEYA FSB yakarak anında thaw → come-back + sink

---

## 3. SİSTEMLER (Detay)

### 3.1 Birim: Warriors → Combat statları
On-chain kaynak (`FrostbiteWarrior.getWarrior`):
```
(uint8 attack, uint8 defense, uint8 speed, uint8 element,
 uint8 specialPower, uint16 level, uint256 experience,
 uint256 battleWins, uint256 battleLosses, uint256 powerScore)
```
Combat'a maplenmesi (öneri):
- `maxHP = 80 + level*10 + defense*4` (party toplamı = squad HP havuzu)
- `dmg = attack * skillMultiplier * elementMult - target.defense/2`, `±%15` seed-varyans
- `element` (0-7 → `elements.ts` 8 element) → `getElementMultiplier(atk, def)` = **1.5 / 0.67 / 1.0**
- `specialPower` → şu an atıl; burada **relic tetikleyicisi** olur (bkz 3.3): yüksek specialPower = relic proc şansı ↑
- `speed` → tur sırası + dodge şansı
- `level` + `elementMastery` (`getElementMastery`) → hafif ölçek bonusu (mevcut grind'e nihayet değer)

> Party 1-3 warrior: tek güçlü vs. üç element-çeşitliliği trade-off'u = ilk stratejik karar.

### 3.2 Combat çözümü (deterministik & doğrulanabilir)
- **Mevcut client turn-based sim** sertleştirilir: tüm RNG `seededRandom(runSeed, floor, tick)` ile (blockhash-seed). Aynı seed = aynı sonuç → **doğrulanabilir**, sunucu-güvensiz.
- `elements.ts::getElementMultiplier` aynen kullanılır.
- `skills.ts::Skill` şeması relic/tactic + boss skill'leri için taban (multiplier, hits, stunChance, selfBuff, dot).
- `Monster.ts::MonsterData` kat düşmanı şekli.
- **Faz-1'de off-chain** (server + client sim, seed on-chain). Faz-3'te opsiyonel on-chain replay/verify.

### 3.3 Relic / Tactic kartları (FSB sink'in kalbi)
- **Şema:** `skills.ts::Skill`'i genişlet — `RelicCard { id, name, rarity, element?, effect }`. Havuz kaynağı: `lootTables.ts` rarity sistemi (common→legendary, `RARITY_COLORS`).
- **FSB ile çekilir ve run sonunda YOK OLUR** (tüketilir) → recurring burn, engagement ile ölçeklenir.
- Rarity dağılımı (lootTables ile hizalı): common %55 / uncommon %28 / rare %12 / epic %4 / legendary %1.
- **Örnek relic'ler:**
  | Relic | Rarity | Etki |
  |---|---|---|
  | Ember Fervor | common | Element avantajında +%25 ATK |
  | Frost Ward | uncommon | Bir ölümcül vuruşta hayatta kal (1x) |
  | Bloodpact | rare | Her kill'de %10 HP çal |
  | Echo Strike | epic | Skill'ler %30 şansla 2x tetiklenir (specialPower ile scale) |
  | Avalanche Heart | legendary | Extract ödülü +%50, ama max HP -%20 |
- **Draft gerilimi:** 3 slot, katlar arası yeni relic teklifi (al = eskiyi değiştir/ekle). Build çeşitliliği = tekrar oynanabilirlik.

### 3.4 AI kat boss'ları (`/api/v1/ai-enemy`)
- Endpoint bugün `?level=&element=` ile `{ name, title, type, element, hp, attack, defense, speed, powerScore, skills[], lore, entranceDialogue, defeatDialogue }` üretiyor — **birebir uygun**.
- **Kritik değişiklik:** run başında (startRun) bir **batch** boss şablonu **pre-generate + cache** (seed'e bağlı). Böylece: (a) kat geçişi lag'sız, (b) Claude maliyeti öngörülebilir, (c) seed → deterministik boss.
- `lore.ts` (566 satır) kat/boss flavor'ı; `entranceDialogue/defeatDialogue` = drama.
- Boss zorluğu = `f(floor, party powerScore)`; her N katta bir "elite" (garantili relic drop).

### 3.5 Derinlik & scaling
- Floor difficulty üstel-hafif: `bossPower(floor) = base * (1.12^floor)`.
- HP taşındığı için doğal duvar oluşur; extract kararı = risk yönetimi.
- Ödül eğrisi: derinlik arttıkça FSB ödül + relic kalitesi artar (ama ölüm riski de).

### 3.6 Frostbite (ölüm) & Thaw
- Ölüm → o run'daki warrior'lar **DB'de `frostbitten_until` ile kilitlenir** (örn. 8-24s, derinlikle ölçekli).
- **Thaw:** `thaw(tokenId)` → FSB yakar, anında çözer (come-back sink).
- On-chain zorunlu değil (DB lock yeter); ama thaw FSB burn'ü on-chain (ekonomi şeffaflığı).

### 3.7 Deepest Descent ladder (mevcut altyapı)
- `Leaderboard.sol` + haftalık sezon backbone yeniden kullanılır (yeni "deepestDepth" metriği).
- **70 bot** ile 1. gün doldurulur → boş görünmez.
- Ödül: haftalık FSB pool (küçük, **prize < toplam burn** → net deflasyonist).
- `getReputation` / `elementMastery` → achievement & cosmetic unlock (kalıcı ilerleme).

### 3.8 Paylaşılabilir AI recap kartı (virality)
- Run sonu: `ai-enemy` tarzı bir çağrı bir **anlatı özeti** üretir ("Floor 7'de Frozen Warden'ı Bloodpact ile devirdin, ama Floor 9 Yeti seni dondurdu").
- OG-image / Farcaster frame olarak paylaşılabilir → düşük-maliyetli akquizisyon.

### 3.9 F2P günlük "shallow run" (on-ramp — Concept 3'ten graft)
- Cüzdan/NFT gerektirmeyen **ücretsiz günlük sığ run** (gold-energy, streak çarpanı).
- Amaç: sıfır-harcama funnel → oyuncu ısınır → FSB'li derin run'a geçer.

---

## 4. EKONOMİ & TOKENOMICS

### 4.1 FSB Sink'leri (hepsi BURN — bugün sıfır olan tarafı doldurur)
1. **Relic/tactic draft** — her run tüketilen kartlar (ana recurring sink, engagement ile ölçeklenir)
2. **Run entry provision** — kısmi burn, kısmi prize pool
3. **Instant thaw** — frostbitten warrior'ı anında çöz
4. **Boss/floor re-roll** — beğenmediğin kat/relic'i yeniden çek

### 4.2 FSB Talebi (demand)
- Mevcut **%2.5-5 AVAX rake** → otomatik **AVAX→FSB buyback** (`FrostbiteSwapRouter` / Trader Joe LB) → prize pool'u FSB ile fonla.
- Sonuç: FSB'nin ilk kez **hem sink hem demand**'i olur.

### 4.3 Net-deflasyonist tasarım (guardrail)
- Burn (relic+entry+thaw+reroll) **>** emisyon (prize pool, capped).
- **Zorunlu guardrail metriği:** aktif kullanıcı başına net FSB akışı **negatif** kalmalı. Haftalık on-chain burn vs payout muhasebesiyle doğrulanır; pozitife dönerse relic potency ↓ / burn ↑ → sonra stake artır.
- **Kalibrasyon:** gerçek stake açılmadan önce **70 botla simülasyon** — relic-burn-rate vs prize emission dengesi ayarlanır.

---

## 5. ON-CHAIN — `ExpeditionEscrow.sol` (BattleRoyale fork)

`contracts/BattleRoyale.sol` tabanı yeniden kullanılır (`authorized`/`onlyAuthorized`, `pendingPayouts`, `withdrawPayout`, `treasury`+fee, `nonReentrant`, `Pausable`, `Ownable`). AVAX yerine **FSB (ERC20)**.

```solidity
// Çekirdek fonksiyonlar (imzalar)
function startRun(uint256[] calldata warriorIds, uint256 entryFsb) external nonReentrant returns (uint256 runId);
//   → FSB entry transferFrom; blockhash(block.number-1) + runId => runSeed snapshot; RunStarted event
function buyProvision(uint256 runId, uint8 kind, uint256 fsbAmount) external nonReentrant;
//   → FSB BURN (relic draft / reroll / thaw); ProvisionBought event
function settleRun(uint256 runId, uint256 depth, bytes32 resultHash) external onlyAuthorized nonReentrant;
//   → sunucu resolver; pendingPayouts[player] += prize(depth); RunSettled event
function thaw(uint256 tokenId, uint256 fsbAmount) external nonReentrant;
//   → FSB BURN; WarriorThawed event
function withdrawPayout() external nonReentrant; // pull-payment (BattleRoyale'den aynen)

// Ekonomi kancaları
address swapRouter;   // AVAX->FSB buyback
uint256 burnedTotal;  // guardrail muhasebesi (on-chain şeffaf)
uint256 emittedTotal;
```

**Güvenlik / doğrulama:**
- Pull-payment (`pendingPayouts`) — reentrancy-safe, BattleRoyale'den kanıtlı desen.
- `runSeed = keccak256(blockhash, runId, player)` → sonuç doğrulanabilir; sunucu keyfi kazanan ilan edemez (depth, seed'den türeyen deterministik sim ile çapraz-kontrol edilebilir; faz-3 on-chain verify).
- `onlyAuthorized` resolver = mevcut server-wallet deseni (BattleRoyale/BattleEngine'deki gibi).
- FSB burn = `transfer(0xdead)` veya `ERC20Burnable.burn` (FSB kontratına göre).
- Reentrancy, pause, ownership → OpenZeppelin (mevcut import deseni).

---

## 6. BACKEND / OFF-CHAIN

- **Run orchestrator** (Next API veya frostbite-mp server): startRun eventini dinler → seed'le boss batch'i pre-generate (ai-enemy) → cache (DB/Redis) → client'a besler.
- **Resolver server-wallet** (authorized): run bitince `settleRun(runId, depth, resultHash)` çağırır. Mevcut auto-withdraw/authorized deseni yeniden kullanılır.
- **DB şeması (yeni tablolar, `frontend/lib/db.ts` SQLite):**
  - `expedition_runs(run_id, player, warrior_ids, seed, depth, status, entry_fsb, started_at, settled_at)`
  - `frostbite_locks(token_id, frostbitten_until)`
  - `expedition_ladder(week_key, player, best_depth, updated_at)`
  - `relic_draws(run_id, relic_id, rarity, fsb_burned)`  ← guardrail muhasebesi
- **Determinism testi:** aynı seed → aynı depth/sonuç (CI'da property test).

---

## 7. FRONTEND — `/avalanche/expeditions`

Tek sayfa, mevcut 4 varlığı bağlar (warrior read hooks + ai-enemy + combat sim + leaderboard):
```
[Party & Relic Draft]  → warriorlar (getWarriorsByOwner), FSB approve+entry (switchChainAsync guard), 3 relic çek
        ↓ Descend (startRun tx)
[Floor Runner]         → kat kat resolve, taşınan HP bar, boss taunt/lore, kat-arası 3 seçim
        ↓ death | extract
[Result]               → frostbite DB flag | settleRun → withdrawPayout; Deepest Descent ladder; AI recap kartı
[Daily Shallow Run]    → ücretsiz F2P streak (aynı sayfada, akquizisyon funnel)
```
- Tasarım dili: yeni STAMPED/Space Grotesk + Anton kimliği (bkz `project_frostbite_redesign`), crimson aksan.
- Mobil: faz-3 (touch), ama grid/responsive baştan.

---

## 8. YENİDEN KULLANIM HARİTASI (leverage)

| Mevcut varlık | Expeditions'ta rolü | Hazırlık |
|---|---|---|
| `FrostbiteWarrior` ERC-721 (`getWarrior`) | Run birimleri | Hazır |
| `elements.ts` (`getElementMultiplier`) | Element avantajı (run-boyu anlamlı) | Hazır |
| `skills.ts` (`Skill` şeması) | Relic/tactic + boss skill taban | Hazır |
| `Monster.ts` (`MonsterData`) | Kat düşmanı şekli | Hazır |
| `lootTables.ts` (rarity) | Relic havuzu + drop | Hazır |
| `lore.ts` (566 satır) | Kat/boss flavor | Hazır |
| `/api/v1/ai-enemy` | Sonsuz boss + taunt üreteci | Küçük refactor (batch+cache) |
| Client turn-based combat sim | Deterministik kat çözümü | **Sertleştir (seed)** |
| `BattleRoyale.sol` (pull-payment/authorized) | `ExpeditionEscrow` fork tabanı | Fork |
| `Leaderboard.sol` + sezon | Deepest Descent ladder | Yeni metrik |
| `FrostbiteSwapRouter` (Trader Joe LB) | AVAX→FSB buyback | Hazır |
| ~70 bot | Ladder'ı 1. gün doldur | Hazır |
| `achievements.ts` / `dailyQuests.ts` | Retention hook | Hazır |

---

## 9. FAZ PLANI (Roadmap)

### Faz 0 — Engine sertleştirme (2-3 gün) · *hiç kontrat yok*
1. Client combat sim'i **tam seed-deterministik** yap (blockhash-seed RNG).
2. `lootTables.ts` → relic/tactic havuzu; `lore.ts` → flavor; `elements.ts` entegre.
3. `ai-enemy` → **batch pre-generate + cache** (seed'le), latency+maliyet riskini kapat.
> Çıktı: off-chain oynanabilir single-player prototip.

### Faz 1 — Kontrat + backend (3-5 gün)
4. `ExpeditionEscrow.sol` yaz+test (BattleRoyale fork, FSB, startRun/buyProvision/settleRun/thaw) → **testnet** deploy.
5. Resolver server-wallet + DB tabloları + orchestrator.
6. AVAX→FSB buyback kancası (`FrostbiteSwapRouter`).

### Faz 2 — Frontend MVP + ladder + F2P (4-6 gün)
7. `/expeditions` sayfası (party+draft → floor runner → result).
8. Deepest Descent ladder (sezon backbone + 70 bot seed).
9. AI recap kartı + günlük ücretsiz shallow run streak.
10. **Bot simülasyonu ile ekonomi kalibrasyonu** → sonra mainnet + gerçek FSB stake.

### Faz 3 — Fast-follow (bahis-ligi köprüsü)
11. On-chain doğrulanabilir combat replay.
12. **Spectator pari-mutuel FSB bahsi** (kalabalığın favorisi — likidite+oyuncu gelince).
13. Guild/co-op expedition; mobil touch.

---

## 10. BAŞARI METRİKLERİ & GUARDRAIL

- **Birincil:** D1/D7 dönüş oranı + 48s içinde **2. run başlatma** oranı (idle/thaw come-back döngüsü çalışıyor mu).
- **İkincil:** ortalama run derinliği, relic draft/run, paylaşım→akquizisyon.
- **Zorunlu guardrail:** aktif kullanıcı başına **net FSB akışı negatif** (burn > emisyon), haftalık on-chain doğrulama. Pozitife dönerse → relic potency ↓ / burn ↑, ölçeklemeden önce.

---

## 11. RİSKLER & AZALTMA

| Risk | Azaltma |
|---|---|
| AI latency / maliyet | Run başında batch pre-generate + cache; seed'e bağlı deterministik |
| Combat determinizmi kırılırsa (client hile) | Seed on-chain; faz-3 on-chain verify; sunucu resolver çapraz-kontrol |
| Ekonomi enflasyona döner | Deflasyonist-by-construction + bot simülasyonu + haftalık guardrail muhasebe |
| Cold-start (boş görünme) | 70 bot ladder'ı doldurur; günlük F2P run trafiği |
| Warrior lock oyuncuyu kızdırır | Frostbite süresi makul + FSB thaw kaçış; depth ölse bile ladder'a yazılır |
| Scope kayması | Faz-0 tamamen off-chain, kontratsız doğrulanır; kontrat ancak loop eğlenceliyse |

---

## 12. AÇIK KARARLAR (senin girdin gerekli)

1. **Frostbite süresi** — sabit mi (örn. 12s) yoksa derinlikle ölçekli mi? Thaw FSB maliyeti?
2. **Party boyutu** — 1-3 mü, sabit 3 mü? (3 = daha çok NFT talebi ama daha yüksek giriş bariyeri)
3. **Prize pool kaynağı** — sadece entry provision + AVAX rake buyback mı, yoksa leaderboard havuzundan pay mı?
4. **F2P sınırı** — günde kaç ücretsiz shallow run? Streak ödülü FSB mi cosmetic mi?
5. **İlk deploy zinciri** — testnet'te mi kanıtlayalım (önerilen) yoksa doğrudan mainnet mi?
6. **`specialPower` rolü** — relic proc şansı mı, yoksa başka bir mekanik mi?

---

*Bu spec `docs/GAME_ANALYSIS_REPORT.md` teşhisine ve gerçek kod arayüzlerine (getWarrior, elements.ts, skills.ts, Monster.ts, lootTables.ts, ai-enemy route, BattleRoyale.sol) dayanır. Runner-up konsept: Frostbite Frontier (idle tycoon, 18-zone dünyayı kullanır). Bold alternatif: Frostbite Prophets (AI-agent bahis ligi).*
