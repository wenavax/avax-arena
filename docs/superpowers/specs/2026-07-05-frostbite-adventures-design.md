# Frostbite Idle Staking Game — Hoppers-Style Feasibility & Design Report

> Generated 2026-07-05 via multi-agent research workflow (Hoppers Game mechanics + tokenomics web research + avax-arena codebase mapping → synthesis). Grounded in actual repo files.

## 1. Verdict

**Yes — and you are unusually well-positioned to build it, because the hard, un-fun infrastructure already exists.** A Hoppers loop is: *stake an NFT → it accrues a yield token weighted by its stats/level → claim → burn the token to level up → the level raises both yield-share and the emission cap that forces re-investment.* In avax-arena, the NFT with on-chain stats/level/XP (`contracts/FrostbiteHeroes.sol`), the burn-to-upgrade item sink (`contracts/FrostbiteItems.sol`), the yield token (`contracts/ArenaToken.sol`, FSB), the hardened dual-NFT marketplace (`contracts/WorldMarketplace.sol`), the pull-payment + authorized-resolver settlement pattern (`contracts/BattleRoyale.sol`), a deterministic pluggable idle engine (`frontend/lib/game/expeditions/`), a bonding-curve launchpad (`launchpad/`), and the full Privy/wagmi + SQLite indexer stack are all present and mostly production-grade. **The single genuinely missing contract is the staking/adventure accrual contract itself** — and even that has a proven template to fork (`BattleRoyale.sol`) and a written settlement blueprint (`docs/EXPEDITIONS_PHASE1.md`).

**Estimate: ~75–80% of a Hoppers-style game already exists in reusable form.** The remaining ~20–25% is one new staking contract, the economy wiring (emission source decision), a frozen-biome content/UI layer on `/world`, and — the real work — a *tokenomic redesign* so it does not repeat Hoppers' 99.99% death spiral. The engineering is easy; **the economy is the entire risk**, and Section 4 is where you should spend your judgment.

---

## 2. Reuse Map

| Hoppers piece | Existing avax-arena asset | Rating | Note |
|---|---|---|---|
| NFT with 5 stats + level (yield inputs) | `contracts/FrostbiteHeroes.sol` — `element`, `rarity`, `level`, `xp`, `atk/def/spd` + immutable bases; on-chain base64 metadata | **DIRECT/ADAPT** | Stats/rarity/level map 1:1 to yield tiers. Only gap: `MAX_LEVEL=69` (Hoppers is 100) — a parameter change. |
| Leveling by burning token | `FrostbiteHeroes.levelUp()` + `addXp()` gated by `authorized[]` mapping | **ADAPT** | Today leveling spends *XP*, not FSB. Rewire so the staking contract burns FSB to grant XP/levels — the `authorized` hook is the exact seam. |
| Emission cap / overflow burn (core sink) | — | **NEW** | Hoppers' "earn ≤ 3× next-level cost then lock" logic lives in the staking contract. Must be built. |
| Yield token ($FLY → $FSB) | `contracts/ArenaToken.sol` (FSB, 100M cap, `mintReward` minter-gated) | **ADAPT** | Reuse as yield token. Its **hard cap is an advantage** vs. Hoppers' uncapped FLY. Decide: mint emissions vs. fund a fixed pool (recommend pool). |
| Staking / adventure accrual engine | *Does not exist.* Fork `contracts/BattleRoyale.sol` (Ownable+Pausable+ReentrancyGuard + `authorized[]` + `pendingPayouts` + `withdrawPayout`) | **NEW (from proven pattern)** | The one real contract to write. Settlement blueprint in `docs/EXPEDITIONS_PHASE1.md`. |
| Idle accrual logic / verifiable yield | `frontend/lib/game/expeditions/` — `economy.ts` (`EconomyProvider` seam), `rng.ts` (seeded PRNG), `run.ts` (accrue→bank state machine), `combat.ts` | **ADAPT (high value)** | Add a `StakingYieldEconomy` behind the existing `EconomyProvider` interface; the core never touches FSB directly. Reshape floor-cadence into time-based accrual. |
| Breeding / new NFT supply | `FrostbiteItems.upgrade()` (burn 2 → mint 1 next tier) + Heroes fusion pattern | **ADAPT** | Reuse burn-to-upgrade as the *fusion* sink; breeding-as-new-Hero is optional (see §3, and cap it hard — Hoppers' uncapped breeding collapsed the floor). |
| Native NFT marketplace + fee | `contracts/WorldMarketplace.sol` (867 lines, dual ERC-721/1155, pull-payment, front-run guard, 2.5% fee) | **DIRECT/ADAPT** | Production-grade. Lower fee than Hoppers' 7%; route a slice to buyback-and-burn (Hoppers did *not*). |
| veFLY-style escrow/ballot | — | **NEW (optional)** | Recommend **against** for v1 (§4). ve(3,3) did not save Hoppers. |
| Wallet / frontend | `frontend/lib/wagmi.ts` (Privy-bridged wagmi, Avalanche 43114), `frontend/app/world/*` routes (`mint`, `marketplace`, `battle-royale`) | **DIRECT** | Add `/world/adventures`. Login gate and providers already wired. |
| Backend / indexer / accrual ledger | `frontend/lib/db.ts` (better-sqlite3, WAL, ~25 tables incl. `marketplace_*`, `wallet_points`, `activities`) | **DIRECT** | Track stake positions, accrued yield, claim history off-chain; settle on-chain via resolver. |
| Automated emission/treasury funding | `server/auto-withdraw.mjs` (hourly PM2 cron), auto-withdraw pattern | **DIRECT** | Reuse cron to fund the reward pool / run buybacks. |
| Liquidity bootstrap | `launchpad/` (audited bonding curve → Trader Joe with burned LP) + `FrostbiteSwapRouter.sol` | **DIRECT/ADAPT** | Optional path to launch a *new* game token with credible, non-ruggable liquidity. |
| Token-bound accounts (NFT holds gear/yield) | `FrostbiteAccountV3.sol` (ERC-6551) | **REFERENCE** | Advanced; nice-to-have for "Hero holds its own accrued yield," not needed for MVP. |

---

## 3. Frostbite Game Design (the concrete reskin)

**Creature concept.** Frogs → **Frostlings** (or reuse the existing **Frostbite Heroes** directly — recommended, since they already carry element/rarity/level/stats on-chain and a live mint at `/world/mint`). Each Hero is an elemental creature (`element` 0–7: Fire/Water/Wind/Ice/Earth/Thunder/Shadow/Light) sent to hibernate/forage across a frozen world to earn **Frost Shards** off-chain or **$FSB** on-chain. No new NFT contract required — this is the biggest shortcut vs. Hoppers, which needed a fresh 10k mint.

**Stat system — map to what exists.** Hoppers has 5 attributes (STR/AGI/VIT/INT/FERT). `FrostbiteHeroes.sol` already exposes `atk`, `def`, `spd`, plus `element` and `rarity`. Map the zone-relevant "challenge" onto the existing triad rather than inventing new storage:

| Hoppers attr | Frostbite equivalent (existing field) |
|---|---|
| Strength | `atk` |
| Agility | `spd` |
| Vitality | `def` |
| Intelligence | `level` × `rarity` (composite "wisdom" — no new field) |
| Fertility (breeding) | `rarity` (drives fusion success — no new field) |

This means **zero storage migration** — yield is a pure function of already-on-chain values.

**Adventure zones (frozen biomes).** Six earning zones across four tiers, entry-gated by level + stat minimums, reusing the tier structure Hoppers proved works:

| Tier | Frozen biome | Min level | Stat gate | Primary (yield weight) |
|---|---|---|---|---|
| 1 | **Frostpond** | none | none | `atk` |
| 1 | **Glacier Stream** | none | none | `spd` |
| 1 | **Frozen Marsh** | none | none | `def` |
| 2 | **Rime River** | 10 | atk≥5 & wisdom≥5 | atk + wisdom |
| 3 | **Whitewood Forest** | 15 | spd,def,wisdom ≥5 | spd+def+wisdom |
| 4 | **The Great Frostlake** | 20 | all ≥5 | all four |

**Concrete yield formula.** Hoppers never published a closed form; you should publish one for auditability (it plugs straight into the deterministic `rng.ts`/settlement path). Per zone `z` with a fixed daily pool `P_z`:

```
weight_i   = level_i × primaryStat_i(z) × rarityMult(rarity_i)
yield_i/day = P_z × weight_i / Σ_j weight_j     // pro-rata over everyone staked in z
```
with `rarityMult = {Common:1, Rare:1.15, Exceptional:1.35, Epic:1.6, Legendary:2.0}`.

**The emission cap (the load-bearing sink — copy Hoppers here, it was the one good part).** Each Hero can accrue at most:
```
cap_i = 3 × costToNextLevel(level_i)
```
Once `accrued_i ≥ cap_i`, the Hero's emissions **lock** until the owner burns FSB to level it up, which resets `accrued_i = 0` and raises `cap_i`. Reuse the leveling cost curve verbatim (levels 2–20: `x/2`; 21+: `x^1.43522/7.5`). **Boosting:** with 2+ Heroes in one zone, an overflow-capped Hero's would-be yield redistributes to your uncapped Heroes there (Hoppers' anti-waste mechanic — keeps whales staking more, not fewer).

**The idle loop.** Stake Hero into biome → accrues FSB/Frost Shards continuously (off-chain ledger, on-chain settlement) → hits cap → claim (pull-payment `withdrawPayout`) → burn FSB via `levelUp()` to reset cap + raise yield-share → unlock higher-tier biome at L10/15/20. Auto-save and off-chain accrual already have a home in `frontend/lib/db.ts`.

**Breeding / fusion.** Do **not** copy Hoppers' uncapped Tadpole breeding — it flooded supply and zeroed the floor. Instead reuse the existing **`FrostbiteItems.upgrade()` burn-2-mint-1** pattern as *Fusion*: burn two Heroes (or gear) + FSB to produce one higher-rarity Hero, **consuming the parents** (net supply-neutral or deflationary). If you want new NFT supply, gate it: hard per-Hero breed cap, and price the FSB burn *above* the lifetime yield the offspring can produce (the §5 lesson).

**Plug into `/world`.** New route `/world/adventures` sits beside the existing `world/mint`, `world/marketplace`, `world/battle-royale`, `world/page` (all present in `frontend/app/world/`). Reuse `WorldLoginGate`, `PrivyWorldProvider`, and the isometric map you already have — biomes become clickable zones on the existing 96×96 world map. Marketplace tab = `WorldMarketplace.sol` unchanged.

---

## 4. Tokenomics (Anti-Death-Spiral) — the critical section

**Hoppers died a textbook economic death, not a hack:** ~135k FLY/day minted into an *uncapped* token, yield priced in the token itself, 0-day LP lock, no exogenous revenue, no buyback. Price ↓ → USD yield ↓ → farmers exit → sinks ↓ → inflation worsens → ↓. It fell 99% in four months. **Every design decision below is chosen to break that reflexive loop.**

### Recommendation (opinionated)

**1. Reuse FSB as the reward token — do NOT launch a new inflationary token.** FSB (`ArenaToken.sol`) has a **hard 100M cap**. Hoppers' fatal flaw was "no cap." A capped token cannot run the infinite-inflation curve that killed FLY. Skip the launchpad-for-a-new-token path for the game economy (keep `launchpad/` as a separate product); a second token just fragments liquidity and re-introduces the farm-and-dump structure.

**2. Fund rewards from a FIXED, treasury-backed pool — do NOT mint emissions.** This is the single most important call. Rather than `mintReward()` printing new FSB per block (the FLY model), pre-fund a **seasonal reward pool** and top it up from **real exogenous revenue**: mint AVAX (`FrostbiteHeroes` mint is 1 AVAX), the 2.5% marketplace fee (`WorldMarketplace.sol`), fusion/level FSB burns recycled via buyback, and battle/PvP entry fees. Route a fixed % of AVAX revenue through `FrostbiteSwapRouter.sol` to **buyback-and-burn FSB** on a schedule (reuse the `server/auto-withdraw.mjs` cron). Yield now has a source *other than the next buyer* — the definition of not-a-Ponzi. The team's own expeditions design already argued for "no-mint, buyback-funded"; apply it here.

**3. Net-deflationary target, with mandatory sinks.** Sinks that fire on *engagement*, not choice: leveling burn (frequent, forced by the emission cap), fusion burn (priced above offspring yield), PvP entry burns (a % of every `battle-royale` / arena match burned — reuse the pull-payment engines), rename/cosmetic burns. Target: **burns ≥ pool payout each season.** Because the pool is fixed (not minted), you *cannot* over-emit by construction.

**4. Seasons with resets.** Time-box adventures into ~8–12 week seasons. Each season has a **capped pool**; progression/leaderboard resets prevent unbounded compounding of farmed supply and re-engage churned users. Unclaimed pool rolls forward or burns. This is the structural fix for "single infinite inflation curve" — Hoppers had exactly one, forever.

**5. Skip veFLY for v1.** ve(3,3) *redirects* emissions; it does not *reduce* them or create real demand — it did nothing to save Hoppers and adds a bribe-market attack surface. If you later want emission-direction governance, gate a zone's *bonus* pool by FSB **staking-locked-in-that-zone** (simple, no separate veToken). Ship the core loop first.

**6. Real utility beyond farming.** FSB must be wanted even in a bear market: PvP entry, fusion, gear upgrades, marketplace currency option, cosmetic/season-pass purchases. A token whose only use is "stake to print more of itself" has no floor — that was Hoppers.

**7. Keep the yield an AVAX-anchored expectation, not a token promise.** Because the pool is AVAX-revenue-backed and FSB-buyback-fed, communicate yield as *"a share of real protocol revenue,"* not *"X% APR in a token we print."* This is the honest framing that survives a downturn.

**One-line policy:** *Capped token + fixed AVAX-revenue-backed seasonal pool + mandatory engagement burns + buyback — never mint yield.*

---

## 5. Architecture (on-chain vs off-chain split)

**On-chain (source of truth for value):**
- **`FrostbiteHeroes.sol`** — stats, level, XP (existing). Leveling burns FSB via a rewired `levelUp`/`addXp` path gated by the new staking contract's `authorized[]` entry.
- **`ArenaToken.sol` (FSB)** — reward token; treasury holds the seasonal pool.
- **NEW: `FrostbiteAdventures.sol`** — the one contract to write. Fork `BattleRoyale.sol`'s skeleton: `Ownable + Pausable + ReentrancyGuard + authorized[] + pendingPayouts + withdrawPayout`. Stores stake positions (owner, tokenId, zone, stakedAt, accrued, cap), enforces entry gates, implements emission-cap lock/reset on `levelUp`, and settles claims via **pull-payment** (`withdrawPayout`). An authorized server resolver (per `docs/EXPEDITIONS_PHASE1.md`) computes accrual off-chain from a blockhash seed + position log and calls `settleClaim` — the same "compute off-chain, verify, settle on-chain" blueprint already specced.
- **`WorldMarketplace.sol`** — trading (existing, unchanged).

**Off-chain (the accrual/indexer backbone, `frontend/lib/db.ts`):**
- New tables analogous to the specced `expedition_runs` / `frostbite_locks`: `adventure_stakes`, `accrual_ledger`, `claim_history`, `season_pool`. Continuous per-second accrual is computed off-chain (cheap), settled on-chain only on claim (gas-efficient — you don't SSTORE every second). `rng.ts`'s seeded deterministic PRNG makes accrued amounts reproducible/auditable so the resolver's `settleClaim` is verifiable and anti-cheat.
- The `StakingYieldEconomy` slots behind the existing `EconomyProvider` interface in `frontend/lib/game/expeditions/economy.ts` — the game core stays chain-agnostic.

**Liquidity bootstrap.** Two options: (a) if FSB liquidity is thin, seed a Trader Joe LB pool via the existing `FrostbiteSwapRouter.sol` and fund buybacks through it; (b) keep `launchpad/` reserved for *other* community token launches (it's a standalone product, not the game economy). Do **not** launch a second game token through it (§4).

**Data flow:** `stake (on-chain event)` → indexer records position → off-chain per-second accrual → `claim` → resolver verifies + `settleClaim` → `withdrawPayout` (pull) → owner burns FSB in `levelUp` → cap resets on-chain. Emission funding: hourly `auto-withdraw`-style cron sweeps AVAX revenue → buyback-burns FSB / tops season pool.

---

## 6. Phased Build Plan

| Phase | Scope | Reuse | Build (NEW) | Effort |
|---|---|---|---|---|
| **P0 — Off-chain demo** | Playable "Frost Shards" idle loop: stake Heroes into 3 Tier-1 biomes, accrue, claim, level (off-chain currency). No token risk. | `expeditions/` engine + `EconomyProvider` (`FreeEconomy`), `db.ts`, `/world` UI, `FrostbiteHeroes` read | `StakingYieldEconomy` (off-chain), `/world/adventures` UI, biome content/lore | **S** |
| **P1 — Core contract + testnet** | `FrostbiteAdventures.sol`: stake/claim, entry gates, emission cap lock/reset, pull-payment. Wire FSB leveling burn. Resolver settlement. | `BattleRoyale.sol` skeleton, `EXPEDITIONS_PHASE1.md` blueprint, `ArenaToken`, `authorized` hook | Staking contract + tests (fork BattleRoyale's reentrancy tests), resolver server-wallet, indexer tables | **L** |
| **P2 — Economy + sinks live** | Fixed seasonal pool funded by AVAX revenue; buyback-burn cron; fusion sink (`Items.upgrade` reuse); PvP entry burn. All 6 tiers + gates. | `WorldMarketplace`, `FrostbiteItems.upgrade`, `auto-withdraw` cron, `FrostbiteSwapRouter` | Season logic, pool-funding cron, buyback wiring, tier 2–4 unlocks | **M** |
| **P3 — Full loop + polish** | Boosting/overflow redistribution, capped fusion-breeding, leaderboard, seasons reset, marketplace tab, mobile. Optional: zone bonus-pool via FSB lock (light governance). | `wallet_points`/leaderboard tables, Capacitor mobile shell, marketplace UI | Boosting math, season rollover, optional bonus-vote | **M** |

**Critical path is P1** (the one new contract). P0 can ship in days off the existing engine and de-risks the design with real players before any token is at stake. **Do not skip P0** — validate the loop is fun with zero-value currency first (the "fun-first, own-not-earn" lesson).

---

## 7. Top Risks & Open Decisions

- **[BIGGEST — economic] Emission source is a launch-blocking decision.** Mint (Hoppers' path, capped by FSB's 100M ceiling) vs. fixed AVAX-revenue-backed pool (recommended). Get this wrong and no amount of good engineering prevents the spiral. **Decide before P2.** My recommendation: fixed pool, buyback-fed, never mint yield.
- **[economic] Steady-state must be modeled before launch.** Simulate emissions vs. sinks vs. plausible player growth. If the economy only balances with ever-growing new users, it's a Ponzi by construction and will spiral the moment growth stalls — exactly Hoppers, in 4 months. Build the spreadsheet in P1.
- **[regulatory] Yield-bearing NFT staking may read as an unregistered security / P2E "earn."** "Stake NFT to earn token with real-money value" is precisely the model under regulatory scrutiny in multiple jurisdictions. **Decision: frame as "own-not-earn" (rewards = in-game utility, cosmetics, progression), geofence if needed, and get counsel before any real-money yield goes live.** The off-chain Frost-Shards P0 sidesteps this entirely for validation.
- **[supply] Breeding/fusion supply must be capped and net-deflationary.** Hoppers' uncapped Tadpoles zeroed the floor. Decision: fusion consumes parents (supply-neutral) vs. capped breeding priced above offspring lifetime yield. Recommend consume-parents fusion for v1.
- **[technical] The resolver is trusted off-chain infrastructure.** Accrual computed off-chain and settled via an `authorized` server wallet is a centralization + key-security risk (if the resolver key leaks, payouts can be forged). Mitigate with deterministic, on-chain-verifiable seeds (`rng.ts` + blockhash) and bounded per-claim caps, as the `EXPEDITIONS_PHASE1.md` spec already contemplates.
- **[technical] FSB deployment/ownership is unresolved in-repo.** `ArenaToken` address is a zero-address env placeholder; memory says ownership moved to a Gnosis Safe. **Decide the live FSB address, minter config, and treasury-Safe signing flow before wiring the pool.**
- **[product] MAX_LEVEL and cap parameters need setting.** Heroes cap at level 69 vs. Hoppers' 100. Decide the level ceiling, the cap multiplier (Hoppers' 3×), and the rarity yield multipliers — these are the economy's tuning knobs and should be `Ownable`-settable, not hardcoded.
- **[design] veFLY-style governance: in or out?** Recommend out for v1 (added attack surface, didn't save Hoppers). Open decision: whether a light "FSB-locked-in-zone directs bonus pool" mechanic is worth it in P3.

**Bottom line:** the build is de-risked and mostly done; the *economy* is the whole game. Ship the off-chain loop first (P0), prove it's fun, then attach a capped, revenue-backed, net-deflationary token — and you avoid the one mistake that killed Hoppers and its entire 2022 cohort.
