# Frostbite Expeditions — Faz 1 Detaylı Mühendislik Planı

> Tarih: 2026-07-03 · Önkoşul: Faz 0 tamam (`lib/game/expeditions/*` deterministik engine + `/expeditions` prototip)
> Kapsam: **on-chain FSB escrow + resolver backend + AVAX→FSB buyback**, **testnet-first**. Süre: 3-5 gün.
> Referans: `docs/EXPEDITIONS_SPEC.md` (§5-6) · Gerçek kontratlar: `contracts/{BattleRoyale,ArenaToken,FrostbiteSwapRouter}.sol`

---

## 0. Faz 1 Neyi Teslim Eder

Faz 0 tamamen off-chain simülasyondu. Faz 1 gerçek ekonomiyi bağlar:
1. **`ExpeditionEscrow.sol`** — FSB entry alır, relic/thaw ile FSB **yakar** (sink), extract'ta FSB **ödül** öder (pull-payment). Testnet'e deploy.
2. **Resolver backend** — deterministik engine'i sunucuda yeniden çalıştırıp depth'i **doğrular** (anti-cheat), authorized cüzdanla `settleRun` çağırır. + DB tabloları + ai-enemy batch/cache orchestrator.
3. **AVAX→FSB buyback** — ödül havuzunu mint'le değil, swap router üzerinden gerçek talep ile fonlar (deflasyonist).

**Faz 1 kasıtlı ERTELER (Faz 3):** on-chain combat replay/verify, spectator pari-mutuel bahis, guild/co-op, mobil.

---

## 1. Kritik Tasarım Kararı: Determinizm = Anti-Cheat

Faz 0 engine'i **seed + seçim-dizisinden** tamamen deterministik. Bu, güven modelinin temeli:

```
Client'ın SUNUCUYA gönderdiği tek şey: seed (zaten on-chain) + choice log
  choice log = [ {floor: 1, action: 'draft', relicId: 'bloodpact'}, {floor: 2, action: 'heal'}, ... {floor: 9, action: 'extract'} ]
Sunucu bunu deterministik engine'e verir → depth'i, ödülü YENİDEN türetir.
Client HP/damage/sonuç UYDURAMAZ — sunucu seed'den birebir hesaplıyor.
Tek doğrulanan girdi: seçimler (draft edilen relic offeredRelics'te mi — o da seed'den deterministik).
```

Sonuç: **client sadece UI**; sunucu otoritedir; on-chain seed audit trail bırakır. Faz 3'te bu hesap zincire taşınıp tam trustless olur. Faz 1 için "authorized resolver + doğrulanabilir seed" yeterli (BattleRoyale/BattleEngine ile aynı güven seviyesi).

---

## 2. On-Chain: `ExpeditionEscrow.sol` (BattleRoyale fork, FSB)

`contracts/BattleRoyale.sol` deseni (Ownable + Pausable + ReentrancyGuard + `authorized` + `pendingPayouts` pull-payment) birebir korunur; AVAX yerine **FSB (ERC20)**, `SafeERC20` ile.

### 2.1 State & sabitler
```solidity
IERC20 public immutable FSB;                 // FrostbiteToken (ArenaToken.sol)
address public constant BURN = 0x000000000000000000000000000000000000dEaD; // FSB burnable değil → dead transfer
address public treasury;
address public swapRouter;                   // FrostbiteSwapRouter (AVAX→FSB buyback)

uint256 public nextRunId = 1;
uint256 public prizePool;                    // escrow'un ödül için ayırdığı FSB
uint256 public burnedTotal;                  // guardrail muhasebesi (relic+thaw+reroll)
uint256 public emittedTotal;                 // guardrail muhasebesi (ödüller)

// Ödül eğrisi (owner ayarlar, Faz-2 bot-sim'de kalibre)
uint256 public rewardBase = 8 ether;         // FSB / floor
uint256 public eliteBonusBps = 6000;         // elite floor +%60

enum RunStatus { None, Active, Settled, Abandoned }
struct Run {
    address player;
    bytes32 seed;          // keccak(blockhash, runId, player) — verifiable
    uint64  startedAt;
    RunStatus status;
    uint32  depth;         // settle'da yazılır
    uint256 entryPaid;
}
mapping(uint256 => Run) public runs;
mapping(address => bool) public authorized;        // resolver server cüzdanları
mapping(address => uint256) public pendingPayouts; // pull-payment (BattleRoyale'den)
```

### 2.2 Fonksiyonlar (imza + davranış)

```solidity
// ── Player ──
function startRun(uint256[] calldata warriorIds, uint256 entryFsb)
    external whenNotPaused nonReentrant returns (uint256 runId);
//   FSB.safeTransferFrom(player, this, entryFsb); prizePool += entryFsb (kısmi) / burn (kısmi);
//   runId = nextRunId++; seed = keccak256(abi.encodePacked(blockhash(block.number-1), runId, msg.sender));
//   runs[runId] = Run(player, seed, ..., Active, 0, entryFsb); emit RunStarted(runId, player, seed, warriorIds);

function buyProvision(uint256 runId, uint8 kind, uint256 fsbAmount)
    external whenNotPaused nonReentrant;
//   sadece run.player, status Active; FSB.safeTransferFrom(player, BURN, fsbAmount);  // GERÇEK YAKMA
//   burnedTotal += fsbAmount; emit ProvisionBought(runId, kind, fsbAmount);
//   kind: 0=relic draft, 1=reroll, 2=boss reroll  (thaw ayrı fonksiyon)

function thaw(uint256 tokenId, uint256 fsbAmount) external whenNotPaused nonReentrant;
//   FSB.safeTransferFrom(msg.sender, BURN, fsbAmount); burnedTotal += fsbAmount; emit WarriorThawed(tokenId, msg.sender);

function withdrawPayout() external nonReentrant;  // BattleRoyale'den aynen — pendingPayouts çek

// ── Resolver (authorized) ──
function settleRun(uint256 runId, uint32 depth, bytes32 resultHash)
    external onlyAuthorized nonReentrant;
//   status Active olmalı; reward = _reward(depth); require(reward <= prizePool);
//   prizePool -= reward; pendingPayouts[run.player] += reward; emittedTotal += reward;
//   run.depth = depth; run.status = Settled; emit RunSettled(runId, depth, reward, resultHash);

function abandonRun(uint256 runId) external;
//   run.player VEYA timeout (startedAt + 24h) sonrası herkes; status Active → Abandoned;
//   entry'nin havuza gitmeyen kısmını pendingPayouts[player] += refund; emit RunAbandoned(runId);

// ── Admin (owner) ──
function fundPrizePool(uint256 fsbAmount) external;                 // FSB yatır → prizePool
function buybackToPool(uint256 amountOutMin, bytes calldata path, uint256 deadline)
    external payable onlyOwner;                                     // AVAX→FSB (swapRouter) → prizePool
function setAuthorized(address a, bool ok) external onlyOwner;
function setTreasury(address t) external onlyOwner;
function setRewardCurve(uint256 base, uint256 eliteBps) external onlyOwner;
function pause() / unpause() external onlyOwner;
function _reward(uint32 depth) internal view returns (uint256);    // Σ rewardBase*floor*(elite?eliteBonus:1)
```

### 2.3 Güvenlik kontrol listesi
- **SafeERC20** tüm FSB transferlerinde (FrostbiteToken standart ERC20).
- **Pull-payment** (`pendingPayouts` + `withdrawPayout`) — reentrancy-safe, BattleRoyale'de kanıtlı.
- **Checks-Effects-Interactions** + `nonReentrant` her external state-değiştiren fonksiyonda.
- **`onlyAuthorized`** sadece `settleRun` (resolver); ödül `prizePool`'la sınırlı → resolver keyfi para basamaz.
- **Seed doğrulanabilir:** `keccak(blockhash, runId, player)` — sonuç seed'den yeniden türetilebilir; resolver'ın `depth`'i seed'den deterministik, denetlenebilir.
- **Reward cap:** `reward <= prizePool` → havuz kurursa ödeme durur (mint YOK → enflasyon YOK).
- **Burn gerçek:** FSB `0x…dEaD`'e gider (token burnable olmadığından); `burnedTotal` on-chain şeffaf.
- **Reentrancy/DoS:** warrior lock DB'de (on-chain değil) → gas/DoS yüzeyi minimal.
- **Audit:** deploy öncesi `solidity-security` skill + mevcut Foundry test deseni (BattleRoyale.t.sol gibi).

---

## 3. Off-Chain: Resolver + Orchestrator

### 3.1 Bileşenler
- **Resolver server-wallet** (authorized) — mevcut auto-withdraw/authorized deseni yeniden kullanılır (PM2, server key `.env`).
- **Orchestrator** (Next API route `app/api/v1/expeditions/*` veya `frostbite-mp` server):
  - `RunStarted` event dinle → `seed` oku → `ai-enemy` ile N boss batch'i **pre-generate + cache** (seed'e bağlı) → client'a besle.
  - Client oynar (client-side deterministik sim; boss'lar cache'den).
  - Client extract/death → `POST /api/v1/expeditions/settle { runId, choiceLog }`.
  - Sunucu deterministik engine'i **seed + choiceLog** ile yeniden çalıştırır → `depth` + `resultHash` türetir → `choiceLog`'u doğrular (draft edilen relic gerçekten `offeredRelics`'te miydi — seed'den deterministik) → authorized cüzdanla `settleRun(runId, depth, resultHash)` gönderir.
  - Death → DB'ye `frostbite_locks` yazar.

### 3.2 DB şeması (`frontend/lib/db.ts`, SQLite/better-sqlite3)
```sql
expedition_runs   (run_id PK, player, seed, warrior_ids, entry_fsb, status, depth, reward, started_at, settled_at)
run_choices       (run_id, floor, action, relic_id, ts)          -- choiceLog, doğrulama için
frostbite_locks   (token_id PK, run_id, frostbitten_until)        -- ölümde warrior kilidi
expedition_ladder (week_key, player, best_depth, updated_at)      -- Deepest Descent (Leaderboard sezon backbone)
relic_burns       (run_id, relic_id, rarity, fsb_burned, ts)      -- guardrail muhasebe (burned vs emitted)
```

### 3.3 ai-enemy batch/cache (Faz 0 spec'inden taşınır)
- `app/api/v1/ai-enemy` refactor: `?batch=N&seed=...` → N boss şablonu tek çağrıda üret, `seed`'e göre cache (DB/Redis).
- Latency + Claude maliyeti kapanır; boss'lar seed'den deterministik → sunucu doğrulaması bozulmaz.
- Faz 0 prosedürel boss'ları fallback kalır (AI down ise).

---

## 4. AVAX → FSB Buyback

Ödüller **mint'ten değil** gerçek talepten gelir (deflasyonist):
```
AVAX rake (diğer modlardan / dedike treasury fonu)
  → owner: buybackToPool{value: avax}(amountOutMin, path, deadline)
    → FrostbiteSwapRouter.swapExactNATIVEForTokens(amountOutMin, path, address(this), deadline)
      → FSB escrow'a girer → prizePool += FSB
```
`path` = LB Router V2.1 Path struct (WAVAX→FSB pair). Böylece FSB'nin **hem sink'i (relic burn) hem demand'i (buyback)** olur.

---

## 5. Ekonomi Invariantı (guardrail)
- On-chain: `burnedTotal` (provisions+thaw) vs `emittedTotal` (rewards) — şeffaf sayaçlar.
- **Hedef: burnedTotal > emittedTotal** (net-deflasyonist). Ödül `prizePool`'la kapalı (mint yok) → yapısal güvence.
- Haftalık off-chain rapor: aktif kullanıcı başına net FSB akışı negatif mi? Pozitife dönerse `setRewardCurve` ile ödül ↓ / relic burn ↑.
- **Kalibrasyon Faz 2:** 70 bot ile simülasyon → `rewardBase`, entry, relic cost dengelenir → sonra mainnet + gerçek stake.

---

## 6. Deploy (testnet-first)
1. **Fuji testnet**'e test FSB (veya mevcut FSB testnet kopyası) + `ExpeditionEscrow` deploy (`script/DeployExpeditions.s.sol`, BattleRoyale deploy deseni).
2. `setAuthorized(resolverWallet, true)`, `fundPrizePool(testFSB)`, `swapRouter` set.
3. Resolver PM2 process ayağa kaldır, orchestrator + DB tabloları.
4. `/expeditions` sayfasını gerçek warrior okuma + startRun/buyProvision/settleRun tx'lerine bağla (Faz 0 UI'ı üstüne, `switchChainAsync` guard).
5. **Smoke test:** cüzdan bağla → startRun → relic burn → floors → extract → withdrawPayout. Seed doğrulaması + guardrail sayaçları kontrol.
6. Bot-sim (Faz 2) → kalibrasyon → mainnet.

---

## 7. Görev Kırılımı (spec Faz 1 = task 4-6)

| # | Görev | Çıktı | Efor |
|---|---|---|---|
| 1 | `ExpeditionEscrow.sol` yaz (BattleRoyale fork, FSB, SafeERC20) | kontrat | 0.5-1 gün |
| 2 | Foundry testleri (start/buy/settle/thaw/abandon, reward cap, burn, auth, reentrancy) | `.t.sol` | 0.5 gün |
| 3 | `solidity-security` audit + fix | temiz kontrat | 0.5 gün |
| 4 | Fuji deploy script + deploy + config (authorized, fund, router) | testnet adresi | 0.5 gün |
| 5 | Resolver server-wallet + orchestrator + `POST /settle` (seed re-derive + validate) | backend | 1 gün |
| 6 | DB tabloları (`db.ts`) + `frostbite_locks` + ladder (Leaderboard backbone) | şema | 0.5 gün |
| 7 | `ai-enemy` batch/cache refactor | endpoint | 0.5 gün |
| 8 | `/expeditions` sayfasını on-chain'e bağla (warrior oku, tx'ler, switchChainAsync) | wired UI | 0.5-1 gün |
| 9 | AVAX→FSB `buybackToPool` + prize pool fonlama | ekonomi kancası | 0.5 gün |
| 10 | Testnet smoke test (uçtan uca + seed/guardrail doğrulama) | yeşil demo | 0.5 gün |

---

## 8. Açık Kararlar (Faz-1'e özel, senin girdin)

1. **Ödül kaynağı:** SADECE buyback+entry havuzu (önerilen, deflasyonist) mı, yoksa `mintReward` ile kısmi mint mi? → Öneri: mint YOK.
2. **Entry split:** entry FSB'nin ne kadarı prizePool'a, ne kadarı burn'e? (örn. %50/%50)
3. **AVAX rake kaynağı:** dedike treasury fonu mu, yoksa diğer modların rake'inden otomatik mi besленecek?
4. **Warrior lock:** Faz 1'de DB-only (önerilen, basit) mi, yoksa on-chain kilit mi? → Öneri: DB.
5. **Settle güven modeli:** Faz 1 server-authoritative (seed audit) mi, yoksa baştan on-chain verify mi? → Öneri: server-authoritative, Faz 3'te on-chain.
6. **Testnet FSB:** mevcut mainnet FSB'nin testnet kopyası mı, yeni test token mı?
7. **Ödül eğrisi başlangıç değerleri:** `rewardBase`, `eliteBonusBps`, entry — Faz 2 kalibrasyonuna kadar placeholder.

---

*Faz 1 bitince: on-chain FSB döngüsü canlı (testnet), sink+demand çalışıyor, guardrail sayaçları izlenebilir. Faz 2 = bot-sim kalibrasyon + mainnet. Faz 3 = spectator pari-mutuel bahis ligi (kalabalığın favorisi) + on-chain verify.*
