# FrostbiteAdventures — Security Audit

**Scope:** `src/FrostbiteAdventures.sol`, `src/interfaces/IFrostbiteHeroes.sol`
**Reviewed at:** 2026-07-07 (post zone-budget hardening + audit-fix commit)
**Design spec:** `docs/superpowers/specs/2026-07-05-frostbite-adventures-design.md` §5, `docs/EXPEDITIONS_PHASE1.md`, `docs/superpowers/plans/2026-07-07-adventures-p1.md`
**Status:** internal multi-layer audit complete — 0 critical / 0 high / 0 medium; 2 low + 1 info found and FIXED.

## Methodology

- **Foundry test battery, 134 tests all green:** 96 unit (incl. exact curve values, every revert path, pause semantics), 6 fuzz (512-1024 runs: curve monotonicity/linearity, settle-bound exactness, accounting identity under random sequences), 7 handler-based invariants (256 runs × depth 64: solvency `balanceOf == poolBalance+totalPending`, custody `heroes.balanceOf == active positions`, cap `settledSinceLevel <= emissionCap`, ghost-tracked `emittedTotal`/`burnedTotal == dEaD balance`), 21 adversarial (leaked-resolver drain quantification, restake accounting, owner-rug attempts, reentrancy surface, pause griefing, seed uniqueness), 4 mainnet-fork (live FrostbiteHeroes struct-decode cross-check via raw staticcall, full lifecycle against real FSB/Heroes with impersonated whale).
- **Multi-agent adversarial audit:** 7 independent lenses (access control, accounting/solvency, reentrancy/CEI, player game-theory, live-contract integration fidelity, DoS/liveness, governance/rug) → every raw finding adversarially verified by an independent agent instructed to refute against the actual code. 5 raw → 3 confirmed, 2 refuted.
- **Slither** (`--filter-paths lib/`): 11 results, all informational (timestamp-comparisons and `elapsed==0` equality are the settlement design; `costly-loop` in settleBatch accounting accepted; OZ lib unindexed events).

## Structural defenses (verified by tests)

Every `settle` is bounded four ways: (1) per-position `zoneRate × elapsed`; (2) **zone all-time budget** — a zone's cumulative emission can never exceed its rate integrated over wall-clock (`zoneEmitted ≤ zoneBudgetAccrued + rate×(now−zoneRateSince)`, folded on rate changes); (3) per-token emission cap `settledSinceLevel ≤ 3×costToNextLevel(advLevel)`, reset ONLY by a levelUp FSB burn; (4) pre-funded `poolBalance` — **the contract has no mint path**. Payout credit is hard-wired to `position.player` (no recipient parameter). `unstake()` and `withdrawPayout()` are never pausable and never resolver-dependent. Owner sweeps cannot touch `totalPending` owed to players.

## Findings & status

| ID | Severity | Finding | Status |
|---|---|---|---|
| A1 | low | Single-step `Ownable` + live `renounceOwnership()` on the only key that actuates defenses (resolver revocation, pause, zone rates, pool sweep) | **FIXED** — `Ownable2Step`; `renounceOwnership()` reverts `RenounceDisabled` (tests: `test_transferOwnership_isTwoStep`, `test_renounceOwnership_disabled`) |
| A2 | low | Heroes sent directly via `transferFrom` (bypassing `stake()`) and foreign ERC20s were permanently locked — `sweepExcess` rescued FSB only | **FIXED** — `rescueHero(tokenId,to)` (structurally cannot touch staked heroes: requires `activePositionOf==0`) + `rescueToken(token,to)` (rejects FSB) with tests |
| A3 | info | Comments claimed live `FrostbiteHeroes.addXp` enforces `MAX_XP_PER_CALL=1000`; verified via eth_call that the **deployed** contract predates that check | **FIXED** — comments corrected; defensive ≤1000 bound kept for future Heroes redeployments |
| — | (pre-audit) | Per-position rate bound let a leaked resolver key extract N×rate×T across N positions | **FIXED earlier** — zone all-time budget (see above), pinned by `test_leakedResolver_multiPosition_aggregateCappedByZoneBudget` |

### Refuted (adversarially verified as non-issues)
- *advLevel init from live hero level = cap head-start*: init is `max(1, hero.level)` by design (P0 parity); cap scales with level exactly as the economy intends.
- *burn counters not enforced / 3× cap net-inflationary*: counters are telemetry by design; net-deflation is a Phase-2 economy-calibration concern, quantified in `docs/superpowers/specs/2026-07-07-adventures-economy-model.md` (b/e ≈ 0.72–0.86; net extraction bounded by the pre-funded pool).

## Accepted trust model / residual risks (documented, tested)

1. **Resolver is trusted for liveness + fair split** (not solvency): a dead resolver costs at most unsettled accrual (`SETTLE_GRACE = 7d` on closed positions); a leaked key extracts at most `min(zone budgets, per-token caps, poolBalance)` and only **to the position owners**.
2. `SETTLE_GRACE` is wall-clock, not pause-aware — a >7d pause forfeits unsettled accrual on closed positions (hero principal + credited payouts unaffected).
3. `setCostUnit` rescales caps retroactively (season-boundary tool; owner = Gnosis Safe 2/3).
4. Zone budget rolls over idle time (monotone, simple); combined with per-token caps this is accepted.
5. Position `seed` is resolver-only randomness; predictable pre-tx, must never be repurposed for on-chain/player-adversarial RNG.
6. Deps unpinned (forge-std 1.16.2, OZ 5.6.1 at review time) — pin before any external audit.

## Recommendation

Contract is fit for **Fuji deployment and rehearsal** now. Before MAINNET: run the Phase-2 gate — economy calibration applied on-chain (`setCostUnit(1e15)`, 150k FSB season pool per the economy model), resolver on PM2 with monitoring, `Heroes.setAuthorized` wiring decision, and (recommended, given real funds) an external audit pass over this internal one.
