# CAR(D) GAME — Cross-Chain Race Ticket PoC (Avalanche ICM)

**Date:** 2026-07-14
**Status:** Approved design, pending implementation
**Scope:** Two small purpose-built contracts (Echo L1 + Fuji C-Chain), an
operator result-posting script, and an "ICM Lab" panel on the cardgame page.
The audited MatchEscrow, the live hub, and the deterministic engine are
**untouched**. This is a demonstrable proof-of-concept for the
Accelerator/Demo Day cross-chain narrative — the site teaser shipped 2026-07-14
("coming soon") becomes a live panel.

## 1. What it proves

A player on a different Avalanche L1 (Echo testnet) buys a race ticket with one
transaction; the ticket arrives on Fuji C-Chain via Avalanche ICM (Teleporter)
and is visible on frostbite.pro in real time; after a scheduled race, the
result is posted back over ICM and becomes readable on Echo. Cross-L1 in,
cross-L1 out — with our real game as the anchor.

## 2. Verified network facts (on-chain, 2026-07-14)

| | Fuji C-Chain | Echo L1 | Dispatch L1 |
|---|---|---|---|
| EVM chainId | 43113 | 173750 | 779672 |
| RPC | api.avax-test.network/ext/bc/C/rpc | subnets.avax.network/echo/testnet/rpc | subnets.avax.network/dispatch/testnet/rpc |
| blockchainID (warp precompile) | `0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5` | `0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1` | `0x9f3be606497285d0ffbb5ac9ba24aa60346a9b1812479ed66cb329f394a4b1c7` |
| TeleporterMessenger `0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf` | ✓ deployed | ✓ deployed | ✓ deployed |

PoC uses **Echo** (Dispatch is the spare). Relayer: Ava Labs hosts testnet
relayers between Fuji and Echo/Dispatch; relayer fee 0. This is verified
empirically by the first live message (E2E step) — if delivery fails, the
fallback is running `icm-relayer` locally, documented as a plan risk note.

## 3. Contracts (new dir `cardgame/contracts/src/icm/`, tests alongside)

### `RaceTicketGate.sol` — deployed on Echo
- `buyTicket()` external: free (no value). Sends
  `TeleporterMessenger.sendCrossChainMessage` to the Fuji hub address with
  `abi.encode(msg.sender)`; `requiredGasLimit` ~200k; no fee token. Emits
  `TicketSent(player)`.
- `lastResult()` view returns `(bytes32 matchId, address[4] ranking, uint64 postedAt)`.
- `receiveTeleporterMessage(bytes32 originChainID, address originSender, bytes message)`:
  `require(msg.sender == MESSENGER)`, `require(originChainID == FUJI_ID)`,
  `require(originSender == hub)`; decodes and stores the result; emits
  `ResultReceived(matchId)`.
- Immutable config: messenger, fuji blockchainID, hub address (set once in
  constructor; hub deployed first).

### `RaceTicketHub.sol` — deployed on Fuji C-Chain
- `receiveTeleporterMessage(...)`: `require(msg.sender == MESSENGER)`,
  `require(originChainID == ECHO_ID && originSender == gate)`; decodes player;
  appends `(player, timestamp)` to a fixed ring buffer (last 32 tickets);
  emits `CrossChainTicket(player)`.
- `getTickets() view returns (address[32], uint64[32], uint8 count, uint8 head)`
  — one call renders the panel.
- `postResult(bytes32 matchId, address[4] ranking)` onlyOwner: sends the result
  to the gate on Echo via the messenger. Emits `ResultPosted(matchId)`.
- `setGate(address)` onlyOwner — called once after the gate deploys (breaks the
  circular constructor dependency: hub first, then gate, then setGate).

Both contracts are ~60–80 lines, no funds held, no upgradability, operator key
(`0x3C05…b9E5`) is owner/deployer on both chains.

## 4. Ops & scripts

- `cardgame/contracts/script/DeployIcm.s.sol` — two-phase forge script
  (run once per chain: Fuji deploys hub; Echo deploys gate with hub address;
  then Fuji `setGate`).
- `frontend/scripts/icm-post-result.ts` (`npx tsx`) — operator posts the most
  recent settled match's ranking (args: matchId + 4 addresses) to Echo via
  `hub.postResult`. Manual for the PoC; automation into the settle flow is
  future work.
- **User-gated prerequisite:** the operator wallet needs ECH gas on Echo
  (Builder Hub faucet, login+captcha → user performs) and a Fuji AVAX top-up.

## 5. Site — ICM Lab panel (`frontend/components/cardgame/IcmLab.tsx`)

Replaces the static teaser line on the cardgame page. Client-side only:
- Reads `getTickets()` from Fuji RPC and `lastResult()` from Echo RPC via viem
  `http` clients (both public RPCs, no server involvement), refreshing every
  ~20s while visible.
- Shows: "LIVE ICM LAB · TESTNET" badge, the last few cross-chain tickets
  (short address + how long ago + "from Echo L1"), the last result posted back
  to Echo, and explorer links (testnet.avascan.info for Echo, testnet.snowtrace.io
  for Fuji).
- Env-gated: renders only when `NEXT_PUBLIC_ICM_HUB` and `NEXT_PUBLIC_ICM_GATE`
  are set; otherwise the current "coming soon" teaser stays. No wallet needed
  to view. (Buying a ticket from the site UI is future work — the PoC's ticket
  purchases happen via script/cast; the panel is read-only.)

## 6. Testing

- Forge: mock messenger drives `receiveTeleporterMessage` on both contracts —
  auth reverts (wrong messenger/origin/sender), ring-buffer wrap, result
  storage; `forge test` suite added under the existing cardgame contracts
  project (108 existing tests must stay green).
- Live E2E (scripted, testnets): `cast send gate.buyTicket()` on Echo →
  poll `hub.getTickets()` on Fuji until the ticket lands (proves the hosted
  relayer) → `icm-post-result.ts` → poll `gate.lastResult()` on Echo →
  panel screenshot.

## 7. Out of scope (future work)

- Value transfer (ICTT) — cross-chain entry payment for real seats.
- Auto-posting results from the live settle flow.
- Buying tickets from the site UI; Dispatch as a second origin chain.
- Any change to MatchEscrow, the hub, or the engine.
