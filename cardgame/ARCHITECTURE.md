# CAR(D) GAME — Blockchain Architecture & Build Roadmap

This document describes how to turn the CAR(D) GAME design document (v1.0) into a
working blockchain game on Avalanche. It accompanies a runnable starter repo that
already implements the core game engine, a compiled smart contract, a server
skeleton, and a playable browser demo.

## 1. Guiding principle: hybrid on-chain / off-chain

The design document already makes the right architectural call: gameplay is
**server-authoritative and off-chain**, and the blockchain is used **only** for
collecting entry fees and distributing rewards. This is the standard, practical
model for real-time skill games, because writing every physics tick to a chain is
impossible on cost and latency grounds, and because the game contains no NFTs,
no token, and no persistent tradable assets.

The trust problem this creates — "how does the chain know the off-chain result is
honest?" — is solved with **signed results**: the trusted game server signs the
final ranking with its private key, and the on-chain escrow verifies that
signature before paying out. The seed is recorded, so any match can be
deterministically replayed and audited.

## 2. System components

The system is three layers plus the chain.

**Client (browser or Unity).** Renders the race and hand, sends inputs
(`selectVehicle`, `play`), and connects a wallet (Core/MetaMask via wagmi/ethers)
for the join-and-pay and claim steps. The client is display-only: it never
computes speed, distance, draws, or rewards. This is what makes cheating by a
modified client pointless.

**Game server (Node.js).** The authority. It runs matchmaking, builds the seeded
deck, validates every card play (in-hand check, cooldown, finished check),
computes combinations, speed, distance, checkpoints, scoring, and tie-breaks, and
runs the 10 ticks/second physics loop. At match end it produces the final ranking
and signs it. This maps directly onto sections 21–23 of the design doc.

**Escrow smart contract (Solidity, Avalanche C-Chain).** Collects 1 AVAX from each
of the 4 players, locks the room when all four have paid, and on `settle` verifies
the server's signature over the ranking, pays the 0.2 AVAX platform fee to the
treasury, and distributes 2.0 / 1.0 / 0.5 / 0.3 AVAX to positions 1–4. It also
supports refunds if a match never fills or never settles before a deadline.

**Indexer / backend DB (optional but recommended).** Postgres or similar for
match history, matchmaking queue, reconnect state, and a payout retry queue
(design doc 19.4). Off-chain, so it can hold rich state cheaply.

## 3. On-chain vs off-chain split

Everything that affects fairness and money verification lives on chain; everything
real-time lives off chain.

| On chain (contract) | Off chain (server) |
|---|---|
| Entry fee escrow (1 AVAX × 4) | Matchmaking, room creation |
| Room lock when 4 paid | Seeded deck build, card draws |
| Signature verification of result | Card play validation, cooldown |
| Platform fee (0.2 AVAX) | Combination & speed calculation |
| Reward payout (2/1/0.5/0.3) | Distance, checkpoints, finish time |
| Refund on timeout | Scoring, ranking, tie-breaks |

## 4. Trust & security model

The core anti-cheat guarantees from design doc 21.3 (no playing cards not in hand,
no cooldown bypass, no fake speed/distance, no CP re-trigger, no magic-target
manipulation, no finish-time edits) are all enforced by the server being the sole
computer of state. The added blockchain trust layer works as follows:

The server holds a signing key whose public address is stored in the contract as
`trustedSigner`. When a match ends, the server signs
`keccak256(matchId, ranking, contractAddress, chainId)` and anyone can submit that
signature to `settle`. The contract recovers the signer and refuses to pay unless
it matches `trustedSigner`, and it checks that the ranking is a valid permutation
of exactly the four escrowed players. Binding the signature to `contractAddress`
and `chainId` prevents replay across deployments or chains.

For a stronger, less-trusted model later, the seed + full input log can be posted
so that any observer re-runs the deterministic engine and challenges a dishonest
result (an optimistic/fraud-proof scheme). Start with the signed-result model; it
is simple, cheap, and standard.

## 5. Recommended tech stack

Server: Node.js + TypeScript, `ws` for WebSocket transport, `ethers` v6 for signing.
Contract: Solidity 0.8.24, Foundry or Hardhat, deploy to Avalanche Fuji testnet
first, then C-Chain mainnet. Client: TypeScript with PixiJS or Phaser for 2D racing
(or Unity if you want richer visuals), wagmi + viem for wallet. Infra: a single VM
or container for the game server (stateful, sticky sessions), Postgres for history,
and a websocket-friendly host.

## 6. What is already built in this repo

The starter repo turns the design doc into running code:

`server/engine.js` — pure rules engine: seeded 200-card deck, combination detection
with the document's priority order, and the full speed/multiplier math including the
5.00 non-magic cap. `server/engine.test.js` verifies it against every worked example
in the document (single card, 10-10-1-5 pair, 2-5-9 value play, four-of-a-kind cap,
CP draw-to-cap, deck composition) — 27/27 pass.

`server/match.js` — the match/round state machine: vehicle selection with once-per-
type enforcement, automatic discard priority, checkpoints, per-tick physics, magic
targeting, round scoring, and final tie-breaks. `server/simulate.js` runs a full
3-round bot match end-to-end and emits the exact settle payload the contract expects.

`server/server.js` — WebSocket server skeleton wiring the engine to a 10 Hz tick loop.

`contracts/MatchEscrow.sol` — the escrow/settlement contract described above.
Compiles cleanly under solc 0.8.24 (0 warnings).

`demo/index.html` — a zero-dependency, wallet-free browser demo that visualizes the
race, hand, checkpoints, combinations, and scoring so you can feel the mechanics.

## 7. Build roadmap

**Phase 0 — Prototype (done here).** Rules engine, tests, contract, server skeleton,
visual demo. This proves the design is internally consistent and playable.

**Phase 1 — Vertical slice.** Port the engine to TypeScript, finish the WebSocket
protocol (join, vehicle select, play, reconnect), add matchmaking for 4 players, and
build a real client that renders server snapshots. No chain yet — play-money.

**Phase 2 — Testnet integration.** Deploy `MatchEscrow` to Fuji. Wire wallet connect,
`createMatch`/`joinMatch` on entry, and server-signed `settle` on match end. Add the
payout retry queue and reconnect-after-payment handling (design doc 20.2).

**Phase 3 — Hardening.** Third-party smart-contract audit, load testing of the tick
server, deterministic replay tooling for dispute resolution, key management for the
signer (HSM/KMS), and monitoring. Do not skip the audit — real funds are involved.

**Phase 4 — Mainnet launch.** Deploy to Avalanche C-Chain, gas and fee tuning,
anti-abuse (rate limits, Sybil resistance on matchmaking), and legal review — an
AVAX entry-fee-for-reward game may be regulated as a game of skill vs chance
depending on jurisdiction, so get counsel before mainnet.

## 8. Open decisions to confirm before Phase 2

A few things the document leaves to implementation. Whether the entry fee is native
AVAX or a stablecoin (native is simplest; stable removes price volatility from the
prize). Whether to keep the pure signed-result model or move toward fraud proofs.
Who runs and secures the signer key. And the regulatory framing of the reward pool,
which should be settled with a lawyer before handling real deposits.
