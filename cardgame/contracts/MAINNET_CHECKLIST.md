# CAR(D) GAME — Mainnet Go-Live Checklist

Avalanche C-Chain (chainId **43114**). This is the single source of truth for taking
MatchEscrow from Fuji to mainnet **with real funds**. Nothing here moves money; the
actual mainnet deploy + the money-handling steps require an explicit decision and are
executed by the user / Safe signers.

Status date: 2026-07-08. Prepared alongside the real-multiplayer work (engine now
supports 4 real seats; server-authoritative loop + settle are replay-faithful).

---

## 0. Product decision (still open — "decide later")

The mainnet staked **product** is not yet chosen. It changes what must ship:

| Direction | What it is | Extra requirements | Fairness |
|---|---|---|---|
| **A. Real 4-player PvP** (recommended) | Humans stake vs humans; bots stay free/practice | Deploy `frostbite-mp` cardgame hub + `CARDGAME_MP_SECRET` + engine bundle; Next `mp/*` routes | Fair — no deterministic bot to out-compute |
| **B. Bot staking on mainnet** | 1 human vs 3 house bots for real AVAX | Bot bankroll + recycle cron | **Exploitable** — a player can compute the winning line offline vs deterministic bots and drain bot stakes |
| **C. Both** | Ship A now, keep B as a labelled "house" mode | Both of the above | B carries the exploit risk |

The contract is identical for A and B (`createMatch(matchId, address[4])` + 4 `joinMatch`
+ signed `settle`). Only the off-chain product + ops differ. **Pick before deploy.**

---

## A. Technical — DONE (evidence in repo)

- [x] `MatchEscrow.sol` — pull-payment, OZ ECDSA (s-malleability + `ecrecover(0)` safe),
      chainid+address+matchId-bound signature, Ownable2Step, renounce disabled, Pausable
      (never blocks refund/withdraw), payout snapshot (audit M1 fix).
- [x] **108 Foundry tests green** (77 unit · 17 adversarial · 6 fuzz · 6 invariant · 2 fork).
      Re-run: `forge test` in `cardgame/contracts/`.
- [x] Internal multi-lens audit + Slither: **0 critical / 0 high / 1 medium (fixed)**. See `AUDIT.md`.
- [x] Fuji live + rehearsed: `0xb25Eec9D2C2b4FA5AB099677233A86BD9Aa6EE50`, rehearsal 22/22
      (`frontend/scripts/matchescrow-rehearsal-fuji.ts`), refund path exercised.
- [x] Chain-aware deploy script (`script/Deploy.s.sol`): mainnet branch = 1 AVAX entry,
      fee 0.2, rewards 2/1/0.5/0.3, `owner = Safe`, prints the required post-deploy Safe txs.
- [x] Real-PvP settle path re-derives with the SAME engine the live loop runs
      (`server/cardgame-engine.mjs` bundled from `engine.ts`; parity test 10/10).

## B. Technical — can do now (no money, no external dependency)

- [ ] **Pin dependencies for the auditor.** `lib/forge-std` and `lib/openzeppelin-contracts`
      are vendored as loose copies (not git submodules), so the exact upstream is not
      reproducible. OZ is **5.6.1** (`lib/openzeppelin-contracts/package.json`); solc
      `0.8.24`, optimizer 200 runs, `via_ir = false`. Before external audit: convert both
      to pinned git submodules (OZ tag `v5.6.1`, forge-std a tagged release) so the audited
      commit is reproducible. *(Left as a recommendation — changing the vendored libs could
      disturb the build; do it in a dedicated commit and re-run `forge test`.)*
- [ ] **Etherscan/Routescan verification command** (run after deploy — see §D):
      ```
      forge verify-contract <ESCROW_ADDR> src/MatchEscrow.sol:MatchEscrow \
        --chain 43114 --verifier-url https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan \
        --etherscan-api-key "verifyContract" \
        --constructor-args $(cast abi-encode \
          "constructor(address,address,address,uint256,uint256,uint256,uint256[4])" \
          <OWNER_SAFE> <SIGNER> <TREASURY> 1000000000000000000 3600 200000000000000000 \
          "[2000000000000000000,1000000000000000000,500000000000000000,300000000000000000]")
      ```
- [ ] **Frontend mainnet config**: `frontend/.env.mainnet` currently has the Fuji escrow in
      `NEXT_PUBLIC_CARDGAME_ESCROW` — replace with the mainnet address post-deploy and set
      `CARDGAME_CHAIN_ID`/`lib/cardgame/escrow.ts` to 43114. (One-line change; hold until deploy.)
- [ ] **If direction A (real-PvP)**: set `CARDGAME_MP_SECRET` (shared) in both the Next env and
      the `frostbite-mp` env, set `CARDGAME_NEXT_BASE`, rebuild the engine bundle
      (`node scripts/build-cardgame-engine.mjs` → `cardgame-engine-parity.ts` must pass), deploy
      the updated `multiplayer-server.mjs` + `cardgame-mp*.mjs`, `pm2 restart frostbite-mp`.

## C. User / ops steps (you execute — needs keys / Safe / funds)

- [ ] **Gnosis Safe 2/3 operational** (`0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07`): confirm the
      3 signers are reachable and rehearse a multisig tx on Fuji before mainnet.
- [ ] **Deploy** (money-adjacent — explicit go): `forge script script/Deploy.s.sol --rpc-url
      $AVALANCHE_RPC_URL --broadcast --private-key $DEPLOYER_PK`. Deployer needs ~gas only.
- [ ] **Post-deploy Safe (2/3) transactions** — the deploy script prints these; owner is the Safe
      so they CANNOT be scripted:
  1. `escrow.setAuthorized(0x3C056E6f3815019Bae464f70C01BFfBceb41b9E5, true)` — authorize the
     server operator. **Until this runs, `createMatch` reverts `NotAuthorized`.**
  2. `escrow.setTrustedSigner(<HSM/KMS signer address>)` — rotate the result-signer off the
     deployer key (see §D).
- [ ] **Signer key custody**: move the result-signer to HSM/KMS (AWS KMS / YubiHSM). The signer
      only signs rankings (never moves funds; settle is permissionless, payouts are pull, and
      `fee + Σrewards == pool` is invariant) — but a leak lets an attacker re-order payouts of
      *locked* matches, so custody still matters. Document a rotation runbook.
- [ ] **Operator key**: `CARDGAME_OPERATOR_PK` / `CARDGAME_BOT_PKS` out of `.env.local` and into
      CI secrets or KMS; never commit.
- [ ] **Monitoring**: alert on `MatchCreated/Locked/Settled/RefundCredited/PayoutWithdrawn`;
      watch for settle delays / refund-window hits. Confirm 1 AVAX entry covers on-chain gas.
- [ ] **Fuji dress rehearsal of the mainnet config** (owner=Safe path) before mainnet.

## D. External / legal — BLOCKING for real funds (not mine to do)

- [ ] **External third-party smart-contract audit** (OpenZeppelin / Trail of Bits / Certora).
      Scope: `src/MatchEscrow.sol` + `script/Deploy.s.sol`. ~4–8 weeks. The internal audit is
      not a substitute for real-money launch.
- [ ] **Skill-vs-chance legal opinion** for target jurisdictions. This game is skill-weighted
      (deterministic seed, player card decisions) with an immutable on-chain settlement, but a
      staked outcome still needs a written regulatory determination + any filings before launch.
- [ ] **Public disclosure**: publish the external audit + a plain-language note (skill-based,
      smart-contract-settled, not a casino) to set player expectations.

---

## Residual risks carried into mainnet (from AUDIT.md)

- Trusted signer key leak → can re-order payouts of locked matches (bounded by the pool
  invariant; mitigate with HSM/KMS + rotation).
- Safe compromise (2/3) → can pause / reconfigure *future* matches; the M1 snapshot fix stops
  redirection of in-flight matches, and the owner has no path to escrowed funds.
- `settleWindow` misconfiguration → recoverable via `setSettleWindow`; monitor.
- Unpinned libs → pin before audit (§B).

## Quick commands

```
cd cardgame/contracts
forge test                       # 108 green
forge build                      # compiles Deploy.s.sol (prints mainnet Safe steps on 43114)
# real-PvP engine parity (run from frontend/):
node scripts/build-cardgame-engine.mjs && npx tsx scripts/cardgame-engine-parity.ts
```
