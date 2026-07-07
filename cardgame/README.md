# CAR(D) GAME — Blockchain Starter Repo

A runnable starter that turns the CAR(D) GAME design document (v1.0) into code:
a server-authoritative rules engine, an Avalanche escrow contract, a WebSocket
server skeleton, and a playable browser demo.

Read `ARCHITECTURE.md` for the full design and build roadmap.

## Layout

```
card-game/
├── ARCHITECTURE.md          # architecture + phased roadmap
├── contracts/
│   └── MatchEscrow.sol       # entry-fee escrow + signed-result settlement (Avalanche)
├── server/
│   ├── engine.js             # pure rules engine (deck, combos, speed math, 5.00 cap)
│   ├── engine.test.js        # 27 checks against the document's worked examples
│   ├── match.js              # match/round state machine, physics, scoring, tie-breaks
│   ├── simulate.js           # full 3-round bot match -> prints settle payload
│   └── server.js             # WebSocket server skeleton (10 Hz tick loop)
└── demo/
    └── index.html            # zero-dependency, wallet-free playable demo
```

## Quick start

Play the demo — just open it in a browser:

```
open demo/index.html
```

Run the rules-engine tests (no dependencies):

```
cd server && node engine.test.js      # expect: 27 passed, 0 failed
```

Run a full simulated match:

```
cd server && node simulate.js
```

Run the live server (needs the ws transport):

```
cd server && npm install ws && node server.js
```

Compile the contract (Foundry or Hardhat recommended; quick check with solc):

```
cd contracts && npm install solc@0.8.24
node -e "const s=require('solc'),fs=require('fs');const i={language:'Solidity',sources:{'MatchEscrow.sol':{content:fs.readFileSync('MatchEscrow.sol','utf8')}},settings:{outputSelection:{'*':{'*':['abi']}}}};console.log('errors:',(JSON.parse(s.compile(JSON.stringify(i))).errors||[]).length)"
```

## Economics (from the design doc)

Entry 1 AVAX × 4 = 4 AVAX pool. Platform fee 0.2 AVAX. Rewards 2.0 / 1.0 / 0.5 / 0.3
AVAX to positions 1–4 (3.8 + 0.2 = 4.0, balanced). No NFTs, no token, no tradable
in-game assets — blockchain only handles entry and payout.

## Status

Phase 0 (prototype) is complete and verified: engine matches the document exactly
(27/27 tests), a full match simulates end-to-end, and the contract compiles cleanly.
Next up is Phase 1 (TypeScript port + real client). See `ARCHITECTURE.md` §7.
