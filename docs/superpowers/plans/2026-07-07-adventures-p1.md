# Adventures P1 — FrostbiteAdventures.sol + resolver settlement (plan)

> 2026-07-07. Kararlar (kullanıcı onaylı): **emisyon = sabit treasury-fonlu havuz, asla mint yok** · **Fuji önce, mainnet ayrı adım**.
> Girdi: `docs/superpowers/specs/2026-07-05-frostbite-adventures-design.md` §5-6, `docs/EXPEDITIONS_PHASE1.md`, 6-ajanlı keşif (2026-07-07).

## Mimari kararlar (keşif bulgularıyla gerekçeli)

| Karar | Seçim | Neden |
|---|---|---|
| Emisyon | `fundPool()` ile önceden fonlanan FSB havuzu; `settle` havuzdan öder, **mint yolu yok** | Kullanıcı kararı + FSB `mintReward` zaten 2 sabit slota kilitli (gameEngine/tournament) |
| Yakma | `transferFrom(user, 0x…dEaD, cost)` | FSB'de burn/burnFrom YOK (bytecode doğrulandı); OZ ERC20 `address(0)`'a transferi reddeder |
| Staking | **Custodial** (`transferFrom` ile NFT içeri; `safeTransferFrom` değil → unstake'te callback/reentrancy yok) | Stake'liyken satış/transfer imkânsız; stale-staker sınıfı komple kapanır |
| Seviye | **Adventure-level kontrat-lokal** (`advLevel[tokenId]`, ilk stake'te `max(1, hero.level)`) | Heroes.levelUp escrow'da erişilemez (ownerOf-gated); P0 zaten ayrı ilerleme tutuyor (add-only merge) |
| XP köprüsü | Opsiyonel: `xpPerLevelUp` (varsayılan 0=kapalı, ≤1000) level-up'ta `heroes.addXp` try/catch | Spec'in `authorized` seam'i; Heroes owner'ı (deployer EOA) `setAuthorized(adventures, true)` çağırınca aktifleşir |
| Accrual | **Resolver-settled** (blueprint modeli): off-chain hesap, on-chain 3 sınır — (1) `amount ≤ zoneRate×elapsed` (2) `settledSinceLevel+amount ≤ emissionCap(advLevel)` (3) `amount ≤ poolBalance` | Pro-rata/boosting/affinity matematiği on-chain pahalı; sınırlar sızan resolver anahtarının zararını yapısal olarak kısıtlar |
| Ödeme | `pendingPayouts` + `withdrawPayout()` (SafeERC20) | Repo konvansiyonu (BattleRoyale/BattleEngine) |
| Kaçış kapıları | `unstake` ve `withdrawPayout` ASLA pausable değil; unstake resolver'a bağımlı değil (Closed pozisyon `SETTLE_GRACE=7g` içinde settle edilebilir) | Ölü resolver kullanıcı varlığını kilitleyemez |
| Eğriler | `cost=(25+5L²)×costUnit`, `cap=3×cost`, zone rate'leri FSB-wei/sn — hepsi owner-settable | P0 birebir; P2 ekonomi kalibrasyonu setter'larla |
| Finds | P1'de ZİNCİRE TAŞINMIYOR (cap'i bypass eden ayrı emisyon kaynağı; JS float RNG Solidity'de üretilemez) | Tokenomics riski; demo süsü olarak off-chain kalır |
| Zaman | Kontrat/resolver 1× gerçek zaman; DEMO_SPEED=3 sadece P0 demo | Aksi halde önizleme/settlement 3× sapar |

## Zone tablosu (P0 zones.ts birebir; favoredElement = kontrat uint8 endeksi)
frostpond(fire=0)/glacier-stream(wind=2)/frozen-marsh(earth=4) tier1 L1 · rime-river(ice=3) L10 atk5+wis5 · whitewood(shadow=6) L15 spd5+def5+wis5 · frostlake(thunder=5) L20 hepsi5. Rate placeholder: 60/60/60/150/300/600 shard/dk → wei/sn (1 shard=1e18), mainnet öncesi P2'de kalibre edilir. Wisdom = advLevel×(rarity+1).

## Adımlar
1. ✅ Keşif (6 paralel ajan)
2. `adventures/` Foundry projesi (launchpad şablonu: foundry.toml/remappings/.gitignore/README) + `src/FrostbiteAdventures.sol` + `src/interfaces/IFrostbiteHeroes.sol` + `test/mocks/` (Heroes+FSB sadık kopyaları)
3. Test bataryası (paralel ajanlar): unit + fuzz + handler-invariant + reentrancy/adversarial + mainnet-fork (gerçek Heroes okuma) — launchpad kalıpları
4. Çok-ajanlı adversarial audit → `adventures/AUDIT.md`
5. Fuji deploy (`script/Deploy.s.sol` chain-aware; Fuji'de mock Heroes+FSB de deploy edilir) + `frontend/scripts/adventures-rehearsal-fuji.ts` E2E prova (stake→accrue→settle→withdraw→levelUp burn→cap reset→unstake, sıfır-tolerans assert)
6. Resolver iskeleti `server/adventures-resolver.mjs` (event-tarama + P0-engine-eşdeğer 1× accrual + settleBatch) — PM2'ye bağlama mainnet'le (P2)
7. Ekonomi simülasyonu (emisyon vs sink; P2 mainnet kararının girdisi)

## Mainnet öncesi (P2 kapısı — bu planda YOK)
Ekonomi kalibrasyonu, havuz fonlaması (Safe multisig FSB transferi), Heroes.setAuthorized, resolver PM2 + izleme, UI zincir bağlama, harici duyuru.
