# MatchEscrow — Security Audit

**Scope:** `src/MatchEscrow.sol` (CAR(D) GAME entry-fee escrow + signed-result settlement)
**Reviewed at:** 2026-07-08 (post payout-snapshot fix)
**Design:** `cardgame/ARCHITECTURE.md` §1-8, `docs/superpowers/plans/2026-07-07-cardgame-escrow.md`
**Status:** internal multi-layer audit complete — 0 critical / 0 high; 1 medium found and FIXED.

## Methodology

- **108 Foundry tests, all green:** 77 unit (every revert path, exact reward table, pause semantics, Ownable2Step), 6 fuzz (512 runs: payout-config sum invariant, exact-pool split, accounting identity under random op sequences, ranking permutations), 17 adversarial (reverting-receiver isolation, signature replay/malleability/bad-v/bad-length, double-settle, settle↔refund race, cross-function reentrancy, griefing, owner-rug + payout-snapshot), 6 handler-based invariants (256×64: solvency, conservation, pending/escrow accounting, settled-pool-exact — settle path self-sufficient for reliable coverage), 2 mainnet-fork (real Fuji deploy + full lifecycle + chainid-binding proof).
- **Multi-agent adversarial audit:** 5 independent lenses (accounting/solvency, signature/auth, reentrancy/CEI, state-machine/DoS, economics/governance) → every raw finding adversarially verified by an independent agent instructed to refute against the actual code. 1 confirmed, 4 refuted.
- **Slither** (`--filter-paths lib/`): 4 results, all informational (timestamp comparisons = the settleWindow design; the one `.call` = the pull-payment withdraw; OZ lib unindexed events).

## Structural defenses (test-verified)

Pull payments only (`pendingPayouts` + `withdrawPayout`) — a reverting-receiver player cannot brick settlement (`test_revertingReceiver_cannotBrickSettle_isolatedToItself`). OZ `ECDSA.recover` (rejects s-malleability and `ecrecover(0)`) over a digest bound to `matchId + ranking + address(this) + chainid` (replay across match/deployment/chain all revert `BadSignature`; chainid binding proven on the Fuji fork). `settle` is permissionless (a silent server can't strand funds; `refund` is the other exit). `Ownable2Step` owner + `authorized` operator role; `renounceOwnership` reverts. Payout config is owner-tunable but structurally exact: `platformFee + Σrewards == 4 * entryFee`. Accounting identity `balance == escrowed + totalPending` holds across 16 384-call invariant campaigns.

## Findings & status

| ID | Severity | Finding | Status |
|---|---|---|---|
| M1 | medium | Compromised owner could drain a LOCKED match's pool by `setPayoutConfig([0,0,0,0])` + `setTreasury(attacker)` before a permissionless `settle`: `settle` read fee/rewards/treasury from **live global state**, and the signature commits to neither the split nor the fee recipient. Pool conservation was never broken (still pays == pool), but the whole conserved pool of an in-flight match could be routed to an owner-chosen outsider, zeroing player rewards — contradicting the advertised "owner cannot move escrow funds," which was only tested post-settlement. | **FIXED** — payout terms (`treasury`, `platformFee`, `rewards[4]`) are **snapshotted into the Match struct at `createMatch`** and `settle` pays from the snapshot. A compromised owner can no longer redirect an in-flight match; signer rotation can at most permute rewards among the four real players. Terms are readable pre-join via `matchPayout(matchId)`. Tests: `test_owner_cannotDrainLockedMatch_viaRetunePlusTreasury`, `test_matchPayout_snapshotFrozenAtCreate`. |

### Refuted (adversarially verified as non-issues)
- *Post-window refund nullifies a fully-played signed match*: `refund` after `settleWindow` flips to Cancelled and permanently blocks `settle` — but this is the intended liveness/exit tradeoff; `settleWindow` is set well above game+settle latency by ops, and a paid player reclaiming their own entry is not theft.
- *Unbounded `settleWindow` arithmetic overflow bricks refunds*: a near-`type(uint256).max` window is an owner misconfiguration with a tested recovery path (`setSettleWindow`), not an exploitable defect.
- *Mid-flight `setPayoutConfig`/`setTreasury` silently changes who gets paid*: fully neutralized by the M1 snapshot fix — in-flight matches now pay their frozen terms.
- *Retroactive `settleWindow` extension on in-flight matches*: trusted-owner footgun with tested recovery, not an exploit.

## Residual risks (documented, accepted)

1. **Trusted signer.** The `trustedSigner` key authorizes results. If it leaks, an attacker can sign arbitrary rankings — but only for **actually-locked** matches, only among the **four real players**, and the pool is conserved (never exceeds `4*entryFee`, never mints). Mitigate with HSM/KMS on mainnet (`setTrustedSigner` supports rotation). This is the game's core trust assumption (server-authoritative, per ARCHITECTURE §4).
2. **Owner = Gnosis Safe 2/3 on mainnet** (`Deploy.s.sol`); Fuji owner is the deployer EOA (rehearsal only). Post-M1, owner powers are limited to config for FUTURE matches, pause (never blocks exits), operator gating, and signer/treasury/window admin — no path to in-flight or settled funds.
3. **`settleWindow` is owner-set;** pathological values are a footgun with a tested recovery path. Keep it comfortably above real game+settle latency.
4. Deps unpinned (forge-std / OZ 5.6.1 at review time) — pin before any external audit.

## Recommendation

Fit for **Fuji deployment and rehearsal** now. Before MAINNET (real funds — ARCHITECTURE §7 "do not skip the audit"): external third-party audit, signer key in HSM/KMS, owner→Safe confirmed, and legal review of the entry-fee-for-reward model (skill-vs-chance, §8) per jurisdiction.
