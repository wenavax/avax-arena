# CAR(D) GAME — Scheduled Multiplayer Races (server-opened, every 5 minutes)

**Date:** 2026-07-13
**Status:** Approved design, pending implementation
**Scope:** Multiplayer matchmaking (hub + Next routes + MP UI) and a new
MatchEscrow deployment on Fuji with a 1 AVAX entry fee. The deterministic
engine, the in-race flow (vehicle select → race → settle), Practice mode, and
the contract *source code* are untouched.

## 1. Problem / intent

Today players start multiplayer games themselves: "FIND MATCH" queues wallets
and a match forms whenever four are queued. The user wants match creation to be
**ours**: the system opens a race every 5 minutes; players can only **join** the
upcoming scheduled race, never create or queue one.

## 2. Decisions (user-approved)

| Decision | Choice |
|---|---|
| Under-filled at start | Pure PvP: no bot fill. <4 reservations → slot silently skipped, reservations roll to the next slot (no funds involved). |
| Payment timing | Reserve free (signed intent); the four chosen at T-0 pay in the existing 90s pay window. A no-pay cancels via owner `cancelMatch` → instant refund credits for those who paid. |
| Overflow | One match per slot, first 4 by reservation order; the rest automatically stay reserved at the front for the next slot. |
| Schedule | Fixed wall-clock slots every 5 minutes (UTC :00/:05/:10…). |
| Entry fee | **1 AVAX** (was 0.01). Contract `entryFee` is immutable → new deployment required. |
| Contract path | Redeploy the SAME audited `MatchEscrow.sol` bytecode with new constructor args. Zero Solidity changes; the 108-test forge suite stays valid. |
| Staked mode | Shares the new contract → staked entry also becomes 1 AVAX (single contract for both modes). |

Note: the original "cancel + refund" choice for under-filled slots resolved into
"skip + roll over" once payment moved to T-0 — with free reservations there is
nothing to refund. Refunds only exist for the pay-window failure case.

## 3. New contract deployment (code unchanged)

- Deploy `MatchEscrow.sol` (existing source, existing `Deploy.s.sol` pattern) to
  Fuji with: `entryFee_ = 1 ether`, `rewards_ = [2, 1, 0.5, 0.3] ether`,
  `platformFee_ = 0.2 ether` (invariant `platformFee + Σrewards == 4 × entryFee`
  holds), same treasury, same trustedSigner/operator wiring, same
  `settleWindow` as the current deployment.
- Update the address everywhere it is consumed: `NEXT_PUBLIC_CARDGAME_ESCROW`
  (frontend env, both local and VPS), the server/hub env used by
  `cardgame-mp-wire.mjs` and the staked routes, and the Watch/LiveMatches
  indexer. The old 0.01 contract stays deployed (no open matches; historical
  matches remain auditable/refundable there).
- **Staked side effect (accepted):** house bots now stake 1 AVAX each (3
  AVAX/match). The bot-recycle loop (`server/cardgame-bot-recycle.mjs`)
  recirculates winnings; bot wallets need a one-time top-up to ~10 AVAX each
  from the Fuji faucet/operator so several concurrent matches never starve.

## 4. Hub changes (`server/cardgame-mp.mjs`)

- **Remove queue-triggered matchmaking:** `enqueue`/`dequeue` and the
  4-in-queue trigger of `formMatch` are replaced by a reservation list + slot
  scheduler. `formMatch(group)` itself (createMatch → paying → playing →
  settling lifecycle, pay-window timeout, reconnect grace, bot takeover of
  dropped seats mid-race) is **reused unchanged**.
- **Reservations:** `reserve(address, sig)` (same signature gate as today's
  queue message, new message text `join scheduled race`) appends to an ordered
  list; `unreserve(address)` removes. A wallet can hold one reservation and
  must not be in a live room. A reservation **dies with its socket**: on
  disconnect the address is dropped from the list (no ghost seats causing
  pay-window cancels); reconnecting re-reserves at the back.
- **Slot scheduler:** driven by the injected `now()` clock (headless-testable).
  Slot boundaries are `ceil(now / 5min) × 5min` UTC. At each boundary:
  - `reserved.length >= 4` → splice the first 4 → `formMatch(group)`. Others
    keep their order for the next slot.
  - `< 4` → nothing happens; broadcast the next slot time.
- **Pay-window failure:** when the existing pay timeout fires, in addition to
  `cancelRoom`, the hub calls the new `chain.cancelMatch(matchId)` so payers
  get instant refund credits. The no-payer's reservation is consumed (they
  re-join manually); the payers are automatically re-reserved at the front of
  the next slot.
- **New events:** `cardgame:slot { startsAt, reserved, youReserved, entryFee }`
  broadcast on every reservation change and at least every 15s (lobby
  countdown source of truth). Existing events (`match-found`, `paid-update`,
  `locked`, `state`, …) unchanged.

## 5. Next routes

- `mp/create`, `mp/settle`: unchanged (still secret-gated server-to-server).
- **New `mp/cancel`** (CARDGAME_MP_SECRET-gated): calls `cancelMatch(matchId)`
  with the owner key (the Fuji deployer/operator key already on the VPS — to be
  confirmed as contract owner at implementation time; if a different key owns
  the contract, the route uses that one).

## 6. UI (`app/cardgame/page.tsx` + `lib/cardgame/mountMultiplayer.ts`)

- The MP panel replaces "FIND MATCH" with a **scheduled lobby**:
  - `NEXT RACE 14:35 · starts in 2:41` countdown (from `cardgame:slot`),
  - seat pips `▮▮▯▯ 2/4 reserved`,
  - **JOIN RACE** (one wallet signature, free) / **LEAVE** toggle,
  - copy: "Races start every 5 minutes. Reserve a seat — the first four racers
    pay 1 AVAX when the race locks."
- At T-0 the existing flow takes over unchanged: `match-found` → pay prompt
  (with the 90s deadline shown) → `locked` → vehicle select → race → settle.
- All hardcoded "0.01 AVAX" strings are removed; every fee display derives from
  the `entryFee` the server/contract reports (match-found and slot events carry
  it).

## 7. Testing & verification

- `server/cardgame-mp.test.mjs` extended with a fake-clock scheduled-flow
  suite: slot fills with 4 → race runs to settle (crown-jewel parity assert
  stays); 2 reserved → slot skips and reservations survive; 5 reserved → 4 race
  and 1 rolls over; one no-payer → cancelMatch called, payers re-reserved.
- Engine/forge/bestplay/abilities suites must stay green untouched.
- Post-deploy manual check: reserve with a real wallet, watch the slot fire,
  pay 1 AVAX, race vs 3 other seats (or watch the slot skip with <4).

## 8. Out of scope

- Bot-filled scheduled races (pure PvP was chosen).
- Parallel matches per slot (one match per slot for now).
- Contract source changes / mainnet deployment (mainnet still gated on
  external audit per MAINNET_CHECKLIST).
- Practice mode and the in-race engine.
