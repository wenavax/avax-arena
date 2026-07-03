# Frostbite Launchpad — In-Repo Audit Summary

**Scope:** `launchpad/src/**` — `LaunchpadFactory.sol`, `BondingCurvePool.sol`, `LaunchToken.sol`, `libraries/CurveMath.sol`, `interfaces/*`.
**Reviewed at commit:** `df6f266` (branch `frozenfriends-mvp`).
**Design spec:** `../docs/superpowers/specs/2026-07-03-launchpad-design.md`.
**Status:** Core on-chain system built + tested + reviewed. Real-DEX fork validation and the graduation hardening (F6) are **pending** (need Fuji RPC + confirmed Trader Joe V1 addresses). **External professional audit is recommended before mainnet with real liquidity.**

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
| F6 | **HIGH (liveness)** | Graduation griefable: an attacker pre-creates the Trader Joe pair at a skewed ratio; the exact-min `addLiquidityAVAX` then reverts → permanent graduation DoS for that launch (no theft; holders can still sell) | **OPEN → T11** (needs real router; see below) |
| F5 | INFO | DEX opens ~+19% above the last curve price (a smooth upward step, not a down-cliff). Exact continuity would need `lpReserve ≈ 238M`, not 200M | **DEFERRED → T12** param lock |

### Confirmed sound (no change)
- Curve math solvency + no round-trip profit (fuzz-proven; `avaxOut` clamped to `realAvax`).
- `buy`/`sell` are `nonReentrant` with correct checks-effects-interactions; the non-upgradeable `ReentrancyGuard` functions correctly inside the EIP-1167 clone (default `_status == 0` is treated as not-entered; no storage collision with `Initializable`'s namespaced storage).
- Custody trust property: no owner/withdraw/sweep/upgrade path to pool reserves; only exits are `sell`, the accrued fee (via `withdrawFees`), and graduation → burned LP.
- `paused()` blocks new launches + buys but **never** sells (exits always open).
- Factory clones + initializes token and pool atomically in one tx → the un-access-controlled `initialize` cannot be front-run.
- Non-ruggable token: fixed supply, no owner, no mint/blacklist/fee-on-transfer/transfer-pause.

## Residual risks / open items
1. **F6 graduation griefing (HIGH, open).** Must be fixed in **T11** before any real deployment: create the Trader Joe pair atomically inside `_graduate` (or reject a pre-existing skewed pair) and/or use slippage-tolerant mins, validated by a Fuji fork test that simulates the attack. Currently only mock-router graduation is tested.
2. **Real-DEX fork validation (T10) not done.** Graduation against a live Trader Joe V1 pool is untested; needs `FUJI_RPC_URL` + confirmed router addresses (Fuji + mainnet).
3. **Parameter lock (T12).** `P_grad` / `P_init` → `vAvax0`, `y0`, and `lpReserve` (F5) must be finalized and re-simulated; the deploy script must assert `totalSupply == curveSupply + lpReserve` and `graduationThreshold ≤ R_exhaust`.
4. **Treasury trust.** A pool's `treasury` is snapshotted immutably at launch; if it becomes a reverting contract, that pool's *accrued fees* lock (trading is unaffected). Treasury is the platform's trusted Safe.
5. **MEV / sniping** on launch and the graduating buy is inherent and only economically dampened (launch fee); documented, not eliminated.
6. **Dependency pinning.** `lib/` is gitignored (bootstrapped via `forge install`); pin exact OZ/forge-std versions for the external audit.
7. **Test tightening (nice-to-have).** Tighten `invariant_solvent` to `balance == realAvax + pendingFees`.

## Recommendation
The contract system is internally consistent and passes a comprehensive test + static-analysis + adversarial-review pass. **Do not deploy to mainnet** until: F6 is fixed and fork-validated (T11), the full lifecycle runs on Fuji against real Trader Joe (T10), parameters are locked (T12), and an **external professional audit** is completed.
