# Frostbite Launchpad — Design Spec

**Date:** 2026-07-03
**Status:** Approved design → ready for implementation plan
**Scope of this spec:** On-chain contracts + audit only (testnet-first). Frontend and indexer are separate, later phases.

## 1. Goal

A pump.fun-style **token launchpad** on Avalanche C-Chain. Anyone can pay a launch
fee to create a new token that trades against an **AVAX bonding curve**; when the
curve's AVAX reserve reaches a threshold, the token **graduates** to a real
Trader Joe V1 liquidity pool and the curve retires. The immediate deliverable is
the **contract system + its audit**, delivered testnet-first (Fuji) before mainnet.

## 2. Locked decisions

| Axis | Decision |
|---|---|
| Product | pump.fun-style launchpad (many tokens) |
| Permission | **Paid permissionless** — anyone launches by paying a launch fee, with on-chain guardrails |
| Token | A **new** ERC20 per launch (FSB is unrelated and untouched) |
| Sale mechanism | **Bonding curve** — virtual-reserve constant product, priced in AVAX |
| Graduation | **pump.fun-classic** — at a reserve threshold, seed a Trader Joe **V1** pool, burn the LP, retire the curve |
| Custody topology | **Isolated pool per token** (EIP-1167 clone) — one token's funds/bug can never drain another |
| Admin over funds | **Owner cannot touch pool reserves.** Emergency `halt` stops new launches + buys only; **sells always remain open** (funds are never trapped) |
| Graduation threshold | **Governable** factory parameter; final value set before mainnet |
| Chain rollout | Testnet-first (Fuji) → in-repo audit → (external audit) → mainnet |
| This phase | Contracts + tests + audit. **No** frontend/indexer yet |

## 3. Architecture

Three contracts. The Factory is the only singleton; Pool and Token are cloned per launch.

### 3.1 `LaunchpadFactory` (singleton, owner = Gnosis Safe 2/3)
- `createToken(name, symbol, metadataURI) payable`
  - Charges `launchFee` (AVAX) → `treasury`.
  - Deploys an EIP-1167 clone of `LaunchToken` and an EIP-1167 clone of `BondingCurvePool`.
  - Mints the token's **entire supply to the pool** and atomically `initialize`s the pool with the curve parameters (snapshotted from current factory config).
  - Registers `tokenId → {token, pool, creator}` and emits creation events (for the future indexer).
- Governable config (affects **future** launches only): `launchFee`, `tradingFeeBps`,
  `graduationThreshold`, curve parameters (`vAvax0`/`Y0` derivation inputs), `treasury`,
  Trader Joe router + factory addresses, `launchHalted`.
- Exposes a read-only `tradingHalted` flag pools consult to gate **buys** (never sells).

### 3.2 `BondingCurvePool` (clone per token; one audited implementation)
- Custodies **only this token's** AVAX reserve + unsold supply. Cannot reference any other pool.
- `buy(minTokensOut, deadline) payable` — AVAX in → tokens out per curve; trading fee taken from AVAX.
- `sell(tokenIn, minAvaxOut, deadline)` — tokens in → AVAX out per curve; trading fee taken from AVAX out.
- `graduate()` — permissionless trigger, valid only once `realAvax >= graduationThreshold`.
- State machine: `Trading → Graduated`. In `Graduated`, `buy`/`sell` revert (trading moves to Trader Joe).
- **Trust property:** no function lets the owner withdraw reserves. Owner influence is limited to
  the factory `tradingHalted` flag, which can disable `buy` only.
- `ReentrancyGuard`; checks-effects-interactions; `SafeERC20`; safe native transfers (revert on failure).

### 3.3 `LaunchToken` (ERC20 template, clone per token)
- Standard OpenZeppelin ERC20 + `initialize` (clone-safe). Fixed supply minted once, at init, to the pool.
- **No further mint. No owner. No blacklist. No fee-on-transfer. No transfer pause.**
- Consequence: the creator supplies only name/symbol/metadata and **cannot rug** the token.

## 4. Token supply & distribution

- `TOTAL_SUPPLY = 1,000,000,000` (1e9 · 1e18), parametric.
- `CURVE_SUPPLY = 800,000,000` sold via the bonding curve.
- `LP_RESERVE = 200,000,000` set aside for the graduation liquidity pool.
- All of it is minted to the pool at launch; the split is enforced by curve accounting, not by transfers.

## 5. Bonding curve math (virtual-reserve constant product)

The pool models two reserves; only the AVAX side has real backing:
- AVAX side: `X = vAvax0 + realAvax` (`vAvax0` = virtual AVAX, sets the opening price)
- Token side: `Y` (virtual token reserve)
- Invariant: `K = X · Y` (constant)

Operations (fees applied on the AVAX side, see §7):
- **Buy** `dx` AVAX (post-fee): `tokensOut = Y − K/(X + dx)`, then `realAvax += dx`, `tokensRemaining -= tokensOut`.
- **Sell** `dy` tokens: `avaxOut = X − K/(Y + dy)`, then `realAvax -= avaxOut`, `tokensRemaining += dy`.
- Cumulative sold: `tokensSold = Y0 · realAvax / (vAvax0 + realAvax)` — strictly increasing in `realAvax` (monotone price).

Parameter derivation (two economic anchors chosen; the rest is math):
1. `P_grad` = AVAX raised at graduation (governable; final value set before mainnet).
2. `P_init` = opening price (AVAX per token), i.e. starting FDV feel.

From `CURVE_SUPPLY = Y0 · P_grad / (vAvax0 + P_grad)` and `vAvax0 = P_init · Y0`:
- `Y0 = CURVE_SUPPLY · P_grad / (P_grad − CURVE_SUPPLY · P_init)`
- `vAvax0 = P_init · Y0`
- Well-defined for `P_init < P_grad / CURVE_SUPPLY`.

Exact `P_grad` and `P_init` are locked in the implementation plan; the design is parametric so
they can be tuned and re-simulated (fuzz) without structural change.

## 6. Lifecycle

```
createToken (pay launchFee)
  └─ Token + Pool cloned; TOTAL_SUPPLY minted to Pool; Pool.initialize(params)   [state: Trading]
       └─ buy / sell against the AVAX curve
            └─ realAvax >= graduationThreshold
                 └─ graduate():                                                    [state: Graduated]
                      • wrap AVAX → WAVAX
                      • create + seed Trader Joe V1 pair (WAVAX reserve + LP_RESERVE tokens)
                      • send LP tokens to 0x…dEaD (burn) — liquidity permanent
                      • curve disabled; trading continues on Trader Joe
```

## 7. Fees

- `launchFee` — flat AVAX, paid at `createToken` → `treasury`. Primary spam deterrent.
- `tradingFeeBps` — basis points on each buy/sell, taken from the AVAX side → `treasury`.
- Optional `graduationFee` — a fixed AVAX amount skimmed from the reserve at graduation (governable; may be zero).
- All fee params are governable and affect future launches only (pools snapshot at init).

## 8. Graduation mechanics & security (primary audit surface)

- **Pair pre-creation / donation attack:** an attacker front-runs `graduate()` by creating the
  Trader Joe pair and donating tokens to skew reserves. Defense: create/seed with **exact intended
  amounts** and strict `addLiquidity` minimums (equal to our exact amounts) so a skewed pair reverts;
  a documented fallback handles the pre-existing-pair case. Auditor scrutinizes this path.
- **LP burn:** graduation LP tokens go to `0x…dEaD` → liquidity is permanent, no post-graduation rug.
- **Reentrancy:** `graduate()` sets `state = Graduated` **before** any external call (WAVAX/router);
  `nonReentrant` on all state-changing entry points.
- **Solvency invariant** (fuzz + invariant tested): contract AVAX balance ≥ `realAvax` accounting;
  never pays out more AVAX than reserve; never sells more than `tokensRemaining`; rounding favors the protocol.
- **Precision:** 1e18 fixed point; residual dust at graduation burned or sent to treasury.
- **Price continuity:** `LP_RESERVE` and `P_grad` are chosen so the seeded Trader Joe price
  (`P_grad / LP_RESERVE`) is approximately the curve's exit price, avoiding an instant post-graduation
  arbitrage gap. This constraint is validated numerically when parameters are locked (§17).
- **Clone init:** `initialize` is called atomically inside `createToken` and guarded against re-init
  (front-running a clone's initialize is a classic proxy vuln).
- **Sniping/MEV:** launch fee + optional first-block/first-tx buy cap; MEV cannot be fully eliminated — documented.

## 9. Guardrails (permissionless posture)

Non-ruggable token template (no creator mint/blacklist/FoT) · isolated clone pools (blast-radius
containment) · launch fee (economic spam control) · slippage (`minOut`) + `deadline` on every trade ·
optional per-tx / first-block buy cap · `ReentrancyGuard` + `SafeERC20` + safe native transfers ·
metadata length caps + sanitization (images handled off-chain, out of this phase).

## 10. Admin, ownership & pause semantics

- Factory owner = **Gnosis Safe 2/3**. Governable params affect **future** launches only.
- Pool implementation is **immutable** (clones can't be upgraded); launched pools keep their init params forever.
- **Pause semantics (consistent with "owner cannot touch funds"):** emergency `halt` disables
  **new launches** and **buys** only. **Sells always remain enabled**, so no user's funds can ever
  be frozen or seized. There is no admin path to withdraw or migrate a pool's reserves.

## 11. Error handling

Custom errors throughout · checks-effects-interactions ordering · reverts on slippage, expired
deadline, exhausted supply, wrong state (e.g. trading after graduation), re-init · `SafeERC20`
for token moves · native AVAX sends checked and reverted on failure.

## 12. Testing plan (Foundry)

- **Unit:** buy / sell / graduate happy paths + edges (dust, exact-out, threshold boundary).
- **Fuzz:** curve monotonicity (buy never lowers price) · round-trip (buy-then-sell only loses fees,
  never profits) · no free tokens · exact-out bounds.
- **Invariant:** pool solvency (balance ≥ accounting; no over-withdraw) · supply conservation
  (`tokensSold ≤ CURVE_SUPPLY`) · monotone `realAvax ↔ tokensSold`.
- **Fork:** graduation against real Trader Joe V1 (Fuji + mainnet-fork) — pair creation, LP seeding,
  LP burn, and the donation-attack scenario.
- Gas + clone-deploy cost tests.

## 13. Audit plan

- In-repo, automated: `solidity-security` skill review · `semgrep` (Solidity rules) · `security-review`
  skill · optional `variant-analysis`.
- Focus areas: graduation atomicity / donation defense · curve precision & solvency · clone `initialize`
  front-running · reentrancy · access control · fund-trapping / freeze paths.
- **Before mainnet with real liquidity: external professional audit is recommended** (noted, out of this phase's build).

## 14. Rollout (testnet-first)

1. Build + Foundry suite green.
2. Deploy to **Fuji**; run the full lifecycle (launch → trade → graduate) against Trader Joe on Fuji.
3. Run in-repo audit skills; fix findings; re-test.
4. (Recommended) external audit.
5. Mainnet deploy with parameters finalized; transfer ownership to the Safe.

## 15. Repo layout

A new, isolated Foundry project (mirrors the existing `baseworld/contracts` Foundry setup), separate
from the Hardhat-based `contracts/`:

```
launchpad/
  foundry.toml
  lib/ (forge-std, openzeppelin-contracts)
  src/  LaunchpadFactory.sol  BondingCurvePool.sol  LaunchToken.sol
  test/ (unit, fuzz, invariant, fork)
  script/ (Fuji + mainnet deploy)
```

## 16. Out of scope (this phase) → future phases

- Frontend (launch UI, trade UI, token pages, charts).
- Indexer / backend (token list, trade history, holder data, price charts).
- Token image hosting / metadata storage.
- External professional audit engagement.
- Any FSB integration or migration (explicitly none — FSB is untouched).

## 17. Parameters to finalize in the implementation plan

- `P_grad` (graduation AVAX) and `P_init` (opening price) → derive `vAvax0`, `Y0`.
- Validate graduation **price continuity**: choose `P_grad` / `LP_RESERVE` so `P_grad / LP_RESERVE` ≈ curve exit price.
- `launchFee`, `tradingFeeBps`, optional `graduationFee`.
- Trader Joe V1 router + factory addresses (Fuji + mainnet); confirm V1 is the intended target.
- Optional first-block/first-tx buy cap value.
- `TOTAL_SUPPLY` / curve-vs-LP split if changing from 1B / 800M-200M.
