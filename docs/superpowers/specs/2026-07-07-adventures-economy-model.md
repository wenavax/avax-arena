# Adventures P1 — Economy Model (emissions vs sinks vs growth)

> 2026-07-07. Produced by `adventures/economy-sim.mjs` (runnable, node-only; scenario names below are its output labels). Answers spec §7's launch-blocking question: *"If the economy only balances with ever-growing new users, it's a Ponzi by construction."*
> Model: 12-week season, players in 3 archetypes (grinder 35% eager-levels to L100 / farmer 45% lazy-levels to L40 / tourist 20% quits at L5), 3 heroes each, growth curves zero/-7%wk decline/+15%wk growth. On-chain semantics mirrored: pro-rata zone pools with boosting, cap = 3× next-level cost cumulative-until-levelUp, burns to dEaD (NOT recycled to pool), fixed pre-funded pool, no mint.

## Headline numbers

| Quantity | Value |
|---|---|
| Zone emission ceiling (all 6 zones saturated) | 1,230 shards/min = **1.77M shards/day** = 148.8M shards/12wk |
| L1→L100 levelUp ladder burn | 1.64M shards/hero (lazy-path lifetime extraction ≈ 3× = 4.93M) |
| Ceiling at current `costUnit=1e18` | **1.77M FSB/day = 17.7% of the 10M circulating FSB per day** |
| Ceiling at calibrated `costUnit=1e15` (÷1000) | 1.8k FSB/day, **148.8k FSB/season** |

## (c) Current placeholder rates are unusable on mainnet

Every `cur-*` scenario (costUnit=1e18) depletes any realistic pool in **days**: 100k FSB pool → dead day 1 (`cur-p100k-n50-zero`), 1M FSB pool (10% of circulating!) → dead day 3-4 (`cur-p1000k-n50-zero`: weekly table shows pool=0 in week 1). **Fix is one setter**: `setCostUnit(1e15)` scales FSB denomination ÷1000 while shard-space gameplay (P0 UI numbers, curves, caps) stays identical. Zone `ratePerSec` values stay as deployed.

## (a) Are burns ≥ payouts achievable at a steady population?

**Not with the level-up sink alone — structurally.** Burn/emission (b/e) across all 54 scenarios: 0.29–0.97, typical 0.72–0.86 (e.g. `cal-p500k-n50-zero` 0.81, `cal-p1000k-n5-zero` 0.97). Cause: the cap lets a lazy player extract up to 3× what they burn (cap = 3× cost), so pure-farmer b/e floors near 1/3; grinders pull it up but never past 1. Consequences:
- **Net extraction is bounded and small**: worst case ≈ 34k FSB/season at 500 players (`cal-p1000k-n500-zero` netExtr 33.2k). That is the real "cost of running the game" and must be covered by exogenous revenue (hero mint AVAX, 2.5% marketplace fee) — exactly the design report's §4 model.
- To push b/e → 1+, P2 has levers: lower cap multiplier (3× → 2×), recruit/fusion sinks (already in P0 engine, not yet on-chain), PvP entry burns. Do NOT rely on growth.

## (b) What survives a 12-week season with ZERO growth?

Calibrated rates + **150k FSB pool ≥ 148.8k season ceiling → depletion impossible by construction** (all 9 `REC-cal-p150k-*` scenarios finish with pool left, incl. 500-player zero-growth: 7.1k left, and decline: 57.8k left). At 100k pool, 500 zero-growth players deplete day 60 (`cal-p100k-n500-zero`) — near-miss; 5–50 players never deplete.

## (d) Recommended P2 launch parameters

| Knob | Value | Why |
|---|---|---|
| `costUnit` | **1e15** (0.001 FSB/shard) | ÷1000 scale; P0 shard UX unchanged; one Safe tx |
| Zone rates | unchanged (60/60/60/150/300/600 shards/min) | relative zone progression already tuned in P0 |
| Season pool | **150k FSB** (1.5% of circulating) | ≥ saturation ceiling → cannot deplete; worst-case net extraction ~34k FSB |
| Season length | 12 weeks | matches design report §4; unclaimed pool rolls/burns |
| Cap multiplier | keep 3× for season 1, revisit with real b/e telemetry | contract exposes counters (`emittedTotal`/`burnedTotal`) for the weekly report |

Funding source: Safe transfers FSB via `fundPool()`; top-ups from AVAX revenue per design report §4 (buyback leg stays inert until FSB LP exists — known user decision).

## (e) Honest Ponzi test

**Pass, by construction**: payouts come only from a pre-funded fixed pool (the contract has no mint path), so no player's yield ever depends on a later player's deposit — zero-growth and decline scenarios differ only in how much of the pool is consumed. The open question is not solvency but **sponsorship**: someone (treasury) must keep choosing to fund seasons from real revenue. With FSB having no market liquidity today, rewards are in-game utility ("own-not-earn" framing per design report §7) — which is also the regulatory-safe posture.

## Caveats
Archetype behavior is heuristic; boosting waterfill approximated at week granularity; off-chain "idle finds" excluded (P1 deliberately keeps them off-chain — they'd be an uncapped emission source). Re-run: `node adventures/economy-sim.mjs`.
