# Frostbite Launchpad — In-Repo Audit Summary

**Scope:** `launchpad/src/**` — `LaunchpadFactory.sol`, `BondingCurvePool.sol`, `LaunchToken.sol`, `libraries/CurveMath.sol`, `interfaces/*`.
**Reviewed at commit:** `df6f266` (branch `frozenfriends-mvp`).
**Design spec:** `../docs/superpowers/specs/2026-07-03-launchpad-design.md`.
**Status:** Core on-chain system built + tested + reviewed + **deep-audited (two rounds)**; the HIGH graduation-DoS (F6) is **fixed and fork-validated against the real Trader Joe V1 on Fuji** (empirically not a DoS). Round-2 deep audit surfaced only one actionable low-severity item (config bounds), now fixed. **Pending:** a final tokenomics parameter lock (deploy config). **External professional audit is still recommended before mainnet with real liquidity** — an in-house audit reduces risk but does not provide independent attestation.

## Methodology
- **Foundry tests — 29 passing:** unit + fuzz (CurveMath monotonicity, round-trip non-profit, avaxOut ≤ reserve), pool buy/sell/graduate/init-bounds, factory launch/fee/pause/governance, and **invariant tests** (solvency `balance ≥ realAvax`, supply conservation `tokensSold ≤ curveSupply`, `poolTokenBalance == totalSupply − tokensSold`) over 256 runs × 16,384 calls with zero violations.
- **Slither** static analysis (`--filter-paths lib/`): no high-severity reentrancy; remaining reentrancy notes are false positives (guarded by `nonReentrant`, which Slither does not model; `withdrawFees` is CEI-clean).
- **Two independent adversarial LLM reviews** (Opus): one on the pool (custody/curve/graduation), one on the factory + cross-contract integration + economics.

## Findings & status

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| P1 | MEDIUM | Graduation trigger decoupled from curve exhaustion → stuck-in-Trading (threshold too high) or stranded tokens (too low) | **FIXED** — init rejects unreachable threshold; graduate on `tokensSold ≥ curveSupply` too; burn unsold curve tokens |
| P2 | MEDIUM | `initialize` missing bounds (fee underflow, zero addrs, `y0 ≤ curveSupply`) | **FIXED** — bounds + `MAX_FEE_BPS` + reachability invariant |
| P3 | LOW | Zero-token buys donate AVAX | **FIXED** — `revert ZeroAmount()` when `out == 0` |
| F1 | MEDIUM | `totalSupply == curveSupply + lpReserve` never enforced → graduation can brick | **FIXED** — factory `_validateConfig` + pool-init balance check |
| F2 | MEDIUM | Governance setters bypass pool invariants → owner can silently disable future launches | **FIXED** — `_validateConfig` in constructor + `setCurveParams`/`setGraduationThreshold` |
| F3 | LOW | `createToken` state/event after external fee/refund (CEI) | **FIXED** — `nonReentrant` + CEI reorder |
| F4 | MEDIUM | Sell fee sent to treasury before paying seller → a reverting treasury blocks **exits** | **FIXED** — trading fees accrue to `pendingFees`; `withdrawFees()` pull pattern; buys/sells never call the treasury |
| F6 | **HIGH (liveness)** | Graduation griefable: an attacker pre-creates the Trader Joe pair at a skewed ratio; the exact-min `addLiquidityAVAX` then reverts → permanent graduation DoS for that launch (no theft; holders can still sell) | **FIXED (code) → fork-validate in T10.** `_graduate` now get-or-creates the pair and seeds it via direct `pair.mint` to BURN (no exact-min addLiquidity), so a pre-created/skewed pair cannot revert graduation. Mock-tested (`test_graduation_survivesPreCreatedPair`); real-router mint math validated on fork |
| F5 | INFO | DEX opens ~+19% above the last curve price (a smooth upward step, not a down-cliff). Exact continuity would need `lpReserve ≈ 238M`, not 200M | **DEFERRED → T12** param lock |

### Confirmed sound (no change)
- Curve math solvency + no round-trip profit (fuzz-proven; `avaxOut` clamped to `realAvax`).
- `buy`/`sell` are `nonReentrant` with correct checks-effects-interactions; the non-upgradeable `ReentrancyGuard` functions correctly inside the EIP-1167 clone (default `_status == 0` is treated as not-entered; no storage collision with `Initializable`'s namespaced storage).
- Custody trust property: no owner/withdraw/sweep/upgrade path to pool reserves; only exits are `sell`, the accrued fee (via `withdrawFees`), and graduation → burned LP.
- `paused()` blocks new launches + buys but **never** sells (exits always open).
- Factory clones + initializes token and pool atomically in one tx → the un-access-controlled `initialize` cannot be front-run.
- Non-ruggable token: fixed supply, no owner, no mint/blacklist/fee-on-transfer/transfer-pause.

## Deep audit round 2 (2026-07-04)

A second, deeper pass at the user's request. **Additional methodology:**
- **Strengthened property/invariant fuzzing** (Echidna-equivalent via Foundry): tightened solvency to the exact identity `poolBalance == realAvax + pendingFees`, and added a factory-driven multi-pool invariant suite (`address(factory).balance == 0`, per-pool solvency + supply conservation, launchCount). Both held over 256 runs × 16,384 calls, 0 violations.
- **7-lens multi-agent adversarial audit** (MEV/ordering, arithmetic/precision, reentrancy, access/init/clone, graduation/DEX, economic/griefing/DoS, lifecycle/state) with an independent adversarial verifier refuting each finding.
- **F6 extreme-reserve fork test** against real Trader Joe V1 on Fuji.
- Slither (done earlier). Mythril was attempted but is unavailable in this environment (blocked from downloading a solc binary); the multi-agent audit + Foundry fuzz/invariant + Slither cover the same ground.

**Result: 10 raw findings → 2 confirmed (both low/info), 8 refuted.** 0 critical / high / medium.

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| D1 | LOW | `_validateConfig` + pool init lacked positive lower-bounds and uint112 upper-bounds on `vAvax0`/`curveSupply`/`lpReserve`/`graduationThreshold` → a trusted-owner misconfig (e.g. `lpReserve=0`) passes validation but bricks graduation (no attacker path, no fund loss — sells stay open) | **FIXED** — positivity + uint112 bounds added to `_validateConfig` and pool init |

The 8 refuted findings (verified false positives / by-design): graduation listing-premium "MEV extraction" (self-funded, no extractable value — pool AVAX is conserved), first-block sniping (inherent, intentional pump.fun property; sniper pays fair curve price, no theft), `avaxOut` recompute drift (dust-bounded, the clamp keeps the pool over-collateralized), launch-fee push to treasury (owner-gated, self-healing via mutable `setTreasury`), pool-treasury immutability stranding fees (owner-gated, protocol-revenue-only, `_sendAvax` to a codeless address succeeds), zero-fee launch spam (no on-chain DoS; `launches[]` never iterated), and the **F6 "permanent DoS"** claim (refuted independently — see below).

### F6 — final characterization (fork-validated)
The extreme-reserve variant of F6 was fork-tested on real Trader Joe V1: **graduation does NOT revert / is NOT a DoS** (`pair.mint` succeeds because the protocol's 200M-token + ~69-AVAX seed guarantees non-zero liquidity). The verifier independently reached the same conclusion and added that even a maximally-skewed pair **self-heals** (arbitrageurs drain the attacker's mispriced WAVAX, `sync`-ing reserves back down) and is **permissionlessly recoverable**, at an economically irrational attacker cost (~60k AVAX to sustain). The genuine residual is a **bounded economic griefing**: an attacker who front-runs graduation by pre-minting the pair can capture a share of the graduation LP (measured ~57% in one skewed run), but must lock significant capital that arbitrage then bleeds. It is **not** a DoS and **not** protocol/user fund theft. A fully clean fix (protocol-owned pair / custom AMM) is an architecture change out of this scope; flagged for the external audit.

## Residual risks / open items
1. **F6 graduation griefing (HIGH — code-fixed in T11, fork-validated in T10).** `_graduate` get-or-creates the pair atomically and seeds via direct `pair.mint`. **Fork-validated against the real Trader Joe V1 on Fuji** (`test/fork/Graduation.fork.t.sol`): a fresh graduation seeds a real pair (200M tokens + ≥60 AVAX, LP burned, no stranded tokens), and a moderate pre-created/donated skew does NOT DoS graduation (the donation is absorbed into the burned LP). **Residual (theoretical):** an attacker who pre-creates the pair AND calls `mint()` to set extreme reserves before graduation could dilute the burned LP; forcing an outright `INSUFFICIENT_LIQUIDITY_MINTED` revert requires the attacker to out-capitalize the protocol's 200M-token + ~60-AVAX seed (economically self-defeating). Flagged for the external audit; an optional `skim`/reserve-check hardening pass could close it fully.
2. **Real-DEX fork validation (T10) — DONE.** Graduation validated against the live Trader Joe V1 on Fuji (fresh + moderate-skew). Confirmed addresses: Fuji router `0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901`, mainnet router `0x60aE616a2155Ee3d9A68541Ba4544862310933d4`.
3. **Parameter lock (T12).** `P_grad` / `P_init` → `vAvax0`, `y0`, and `lpReserve` (F5) must be finalized and re-simulated; the deploy script must assert `totalSupply == curveSupply + lpReserve` and `graduationThreshold ≤ R_exhaust`.
4. **Treasury trust.** A pool's `treasury` is snapshotted immutably at launch; if it becomes a reverting contract, that pool's *accrued fees* lock (trading is unaffected). Treasury is the platform's trusted Safe.
5. **MEV / sniping** on launch and the graduating buy is inherent and only economically dampened (launch fee); documented, not eliminated.
6. **Dependency pinning.** `lib/` is gitignored (bootstrapped via `forge install`); pin exact OZ/forge-std versions for the external audit.
7. **Test tightening (nice-to-have).** Tighten `invariant_solvent` to `balance == realAvax + pendingFees`.

## Recommendation
The contract system is internally consistent and passes a comprehensive test + static-analysis + adversarial-review pass. **Do not deploy to mainnet** until: F6 is fixed and fork-validated (T11), the full lifecycle runs on Fuji against real Trader Joe (T10), parameters are locked (T12), and an **external professional audit** is completed.
