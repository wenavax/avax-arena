# CAR(D) GAME — ICM Cross-Chain Race Ticket PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ticket bought on Echo L1 arrives on Fuji C-Chain over Avalanche ICM and shows live on frostbite.pro; race results post back to Echo. Spec: `docs/superpowers/specs/2026-07-14-cardgame-icm-crosschain-ticket-design.md`.

**Architecture:** Two small owner-deployed contracts with self-contained Teleporter interfaces (no external lib dependency): `RaceTicketGate` on Echo sends `abi.encode(player)` to `RaceTicketHub` on Fuji, which keeps a 32-slot ring buffer; results go back Fuji→Echo via `postResult`. The site panel reads both chains client-side (viem, public RPCs), env-gated behind `NEXT_PUBLIC_ICM_HUB`/`NEXT_PUBLIC_ICM_GATE` with the existing "coming soon" teaser as fallback. MatchEscrow/hub/engine untouched.

**Tech Stack:** Foundry (solc 0.8.24, existing `cardgame/contracts` project, 108 tests must stay green), viem + npx tsx (frontend scripts), React client component.

**Verified constants (spec §2, on-chain 2026-07-14):**
- `MESSENGER = 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf` (all three chains)
- Fuji blockchainID `0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5`, RPC `https://api.avax-test.network/ext/bc/C/rpc`, chainId 43113
- Echo blockchainID `0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1`, RPC `https://subnets.avax.network/echo/testnet/rpc`, chainId 173750
- Operator/deployer `0x3C056E6f3815019Bae464f70C01BFfBceb41b9E5` (PK in `~/Desktop/cardgame-operator-keys.json`)

**Files:**
- Create: `cardgame/contracts/src/icm/ITeleporter.sol`, `cardgame/contracts/src/icm/RaceTicketHub.sol`, `cardgame/contracts/src/icm/RaceTicketGate.sol`
- Create: `cardgame/contracts/test/IcmRaceTicket.t.sol`
- Create: `cardgame/contracts/script/DeployIcm.s.sol`
- Create: `frontend/scripts/icm-post-result.ts`
- Create: `frontend/components/cardgame/IcmLab.tsx`
- Modify: `frontend/app/cardgame/page.tsx` (swap teaser div → `<IcmLab />`), `frontend/app/cardgame/cardgame.css` (panel styles), `frontend/.env.local` (+VPS env at rollout)

**Gating:** Task 3 (Echo deploy) and Task 6 (live E2E) need ECH gas on the operator wallet — USER performs the Builder Hub faucet step. Everything else proceeds without it (Fuji hub deploy works today; the panel stays on the teaser until envs are set).

---

### Task 1: Contracts + forge tests (TDD)

**Files:**
- Create: `cardgame/contracts/src/icm/ITeleporter.sol`
- Create: `cardgame/contracts/src/icm/RaceTicketHub.sol`
- Create: `cardgame/contracts/src/icm/RaceTicketGate.sol`
- Test: `cardgame/contracts/test/IcmRaceTicket.t.sol`

- [ ] **Step 1: Interfaces file** — `cardgame/contracts/src/icm/ITeleporter.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Minimal, self-contained Teleporter (Avalanche ICM) interfaces — canonical
/// ABI shapes of the deployed TeleporterMessenger; no external lib dependency.
struct TeleporterFeeInfo {
    address feeTokenAddress;
    uint256 amount;
}

struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}

interface ITeleporterMessenger {
    function sendCrossChainMessage(TeleporterMessageInput calldata messageInput)
        external
        returns (bytes32 messageID);
}

interface ITeleporterReceiver {
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external;
}
```

- [ ] **Step 2: Write the failing tests** — `cardgame/contracts/test/IcmRaceTicket.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RaceTicketHub} from "../src/icm/RaceTicketHub.sol";
import {RaceTicketGate} from "../src/icm/RaceTicketGate.sol";
import {ITeleporterMessenger, TeleporterMessageInput} from "../src/icm/ITeleporter.sol";

/// Captures sendCrossChainMessage calls in plain public fields (a struct with
/// dynamic members can't be exposed via an auto-getter) so tests assert simply.
contract MockMessenger is ITeleporterMessenger {
    bytes32 public lastDest;
    address public lastDestAddr;
    uint256 public lastGasLimit;
    bytes public lastMsg;
    uint256 public sent;

    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32) {
        lastDest = input.destinationBlockchainID;
        lastDestAddr = input.destinationAddress;
        lastGasLimit = input.requiredGasLimit;
        lastMsg = input.message;
        sent += 1;
        return keccak256(abi.encode(sent));
    }
}

contract IcmRaceTicketTest is Test {
    bytes32 constant FUJI_ID = 0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5;
    bytes32 constant ECHO_ID = 0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1;

    MockMessenger msgr;
    RaceTicketHub hub;
    RaceTicketGate gate;
    address owner = address(0xA11CE);
    address player = address(0xBEEF);

    function setUp() public {
        msgr = new MockMessenger();
        vm.prank(owner);
        hub = new RaceTicketHub(address(msgr), ECHO_ID);
        gate = new RaceTicketGate(address(msgr), FUJI_ID, address(hub));
        vm.prank(owner);
        hub.setGate(address(gate));
    }

    // ── hub: receive auth ────────────────────────────────────────────
    function test_hub_acceptsTicketFromGate() public {
        vm.prank(address(msgr));
        hub.receiveTeleporterMessage(ECHO_ID, address(gate), abi.encode(player));
        (address[32] memory players,, uint8 count,) = hub.getTickets();
        assertEq(count, 1);
        assertEq(players[0], player);
    }

    function test_hub_rejectsNonMessengerCaller() public {
        vm.expectRevert(RaceTicketHub.NotMessenger.selector);
        hub.receiveTeleporterMessage(ECHO_ID, address(gate), abi.encode(player));
    }

    function test_hub_rejectsWrongOriginChain() public {
        vm.prank(address(msgr));
        vm.expectRevert(RaceTicketHub.BadOrigin.selector);
        hub.receiveTeleporterMessage(FUJI_ID, address(gate), abi.encode(player));
    }

    function test_hub_rejectsWrongOriginSender() public {
        vm.prank(address(msgr));
        vm.expectRevert(RaceTicketHub.BadOrigin.selector);
        hub.receiveTeleporterMessage(ECHO_ID, address(0xDEAD), abi.encode(player));
    }

    function test_hub_setGateOnlyOwnerAndOnce() public {
        vm.expectRevert(RaceTicketHub.NotOwner.selector);
        hub.setGate(address(1));
        vm.prank(owner);
        vm.expectRevert(RaceTicketHub.GateAlreadySet.selector);
        hub.setGate(address(1));
    }

    // ── hub: ring buffer ─────────────────────────────────────────────
    function test_hub_ringBufferWraps() public {
        for (uint160 i = 1; i <= 40; i++) {
            vm.prank(address(msgr));
            hub.receiveTeleporterMessage(ECHO_ID, address(gate), abi.encode(address(i)));
        }
        (address[32] memory players,, uint8 count, uint8 head) = hub.getTickets();
        assertEq(count, 32);
        // 40 tickets into 32 slots: slot (40-1) % 32 = 7 holds the newest (player 40)
        assertEq(players[7], address(40));
        assertEq(head, 8); // next write position
    }

    // ── hub → gate: result flow ──────────────────────────────────────
    function test_hub_postResultOnlyOwner() public {
        address[4] memory ranking = [player, address(2), address(3), address(4)];
        vm.expectRevert(RaceTicketHub.NotOwner.selector);
        hub.postResult(bytes32(uint256(1)), ranking);
    }

    function test_hub_postResultSendsToGateOnEcho() public {
        address[4] memory ranking = [player, address(2), address(3), address(4)];
        vm.prank(owner);
        hub.postResult(bytes32(uint256(7)), ranking);
        assertEq(msgr.sent(), 1);
        assertEq(msgr.lastDest(), ECHO_ID);
        assertEq(msgr.lastDestAddr(), address(gate));
        (bytes32 gotId, address[4] memory gotRank) = abi.decode(msgr.lastMsg(), (bytes32, address[4]));
        assertEq(gotId, bytes32(uint256(7)));
        assertEq(gotRank[0], player);
    }

    function test_gate_storesResultFromHub() public {
        address[4] memory ranking = [player, address(2), address(3), address(4)];
        vm.prank(address(msgr));
        gate.receiveTeleporterMessage(FUJI_ID, address(hub), abi.encode(bytes32(uint256(7)), ranking));
        (bytes32 matchId, address[4] memory got, uint64 postedAt) = gate.lastResult();
        assertEq(matchId, bytes32(uint256(7)));
        assertEq(got[0], player);
        assertGt(postedAt, 0);
    }

    function test_gate_rejectsWrongOrigin() public {
        vm.prank(address(msgr));
        vm.expectRevert(RaceTicketGate.BadOrigin.selector);
        gate.receiveTeleporterMessage(ECHO_ID, address(hub), abi.encode(bytes32(0), [player, player, player, player]));
    }

    // ── gate: buyTicket ──────────────────────────────────────────────
    function test_gate_buyTicketSendsPlayerToHubOnFuji() public {
        vm.prank(player);
        gate.buyTicket();
        assertEq(msgr.sent(), 1);
        assertEq(msgr.lastDest(), FUJI_ID);
        assertEq(msgr.lastDestAddr(), address(hub));
        assertEq(abi.decode(msgr.lastMsg(), (address)), player);
    }
}
```

- [ ] **Step 3: Run tests, verify failure**

Run: `cd cardgame/contracts && forge test --match-contract IcmRaceTicketTest 2>&1 | tail -3`
Expected: compilation failure (`RaceTicketHub` not found).

- [ ] **Step 4: Implement `RaceTicketHub.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ITeleporterMessenger, ITeleporterReceiver, TeleporterMessageInput, TeleporterFeeInfo} from "./ITeleporter.sol";

/// @notice Fuji C-Chain side of the CAR(D) GAME cross-chain ticket PoC.
///         Receives ticket messages from the Echo RaceTicketGate over ICM and
///         keeps the last 32 in a ring buffer for the site's ICM Lab panel;
///         the owner posts race results back to Echo. Holds no funds.
contract RaceTicketHub is ITeleporterReceiver {
    error NotMessenger();
    error NotOwner();
    error BadOrigin();
    error GateAlreadySet();
    error ZeroAddress();

    event CrossChainTicket(address indexed player, uint64 at);
    event ResultPosted(bytes32 indexed matchId);

    uint8 public constant CAPACITY = 32;
    uint256 public constant RESULT_GAS_LIMIT = 200_000;

    address public immutable messenger;
    bytes32 public immutable echoBlockchainID;
    address public owner;
    address public gate; // RaceTicketGate on Echo — set once post-deploy

    address[32] private players;
    uint64[32] private times;
    uint8 private count; // saturates at CAPACITY
    uint8 private head;  // next write slot

    constructor(address messenger_, bytes32 echoBlockchainID_) {
        if (messenger_ == address(0)) revert ZeroAddress();
        messenger = messenger_;
        echoBlockchainID = echoBlockchainID_;
        owner = msg.sender;
    }

    function setGate(address gate_) external {
        if (msg.sender != owner) revert NotOwner();
        if (gate != address(0)) revert GateAlreadySet();
        if (gate_ == address(0)) revert ZeroAddress();
        gate = gate_;
    }

    /// @inheritdoc ITeleporterReceiver
    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        if (msg.sender != messenger) revert NotMessenger();
        if (sourceBlockchainID != echoBlockchainID || originSenderAddress != gate || gate == address(0)) revert BadOrigin();
        address player = abi.decode(message, (address));
        players[head] = player;
        times[head] = uint64(block.timestamp);
        head = uint8((head + 1) % CAPACITY);
        if (count < CAPACITY) count += 1;
        emit CrossChainTicket(player, uint64(block.timestamp));
    }

    /// @notice One call renders the panel: fixed arrays + count + next-write head.
    function getTickets() external view returns (address[32] memory, uint64[32] memory, uint8, uint8) {
        return (players, times, count, head);
    }

    /// @notice Post a settled race's ranking back to the Echo gate over ICM.
    function postResult(bytes32 matchId, address[4] calldata ranking) external {
        if (msg.sender != owner) revert NotOwner();
        ITeleporterMessenger(messenger).sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: echoBlockchainID,
                destinationAddress: gate,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: RESULT_GAS_LIMIT,
                allowedRelayerAddresses: new address[](0),
                message: abi.encode(matchId, ranking)
            })
        );
        emit ResultPosted(matchId);
    }
}
```

- [ ] **Step 5: Implement `RaceTicketGate.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ITeleporterMessenger, ITeleporterReceiver, TeleporterMessageInput, TeleporterFeeInfo} from "./ITeleporter.sol";

/// @notice Echo L1 side of the CAR(D) GAME cross-chain ticket PoC. buyTicket()
///         sends the caller's address to the Fuji RaceTicketHub over ICM; the
///         hub posts race results back here. Holds no funds, free to call.
contract RaceTicketGate is ITeleporterReceiver {
    error NotMessenger();
    error BadOrigin();
    error ZeroAddress();

    event TicketSent(address indexed player);
    event ResultReceived(bytes32 indexed matchId);

    uint256 public constant TICKET_GAS_LIMIT = 200_000;

    address public immutable messenger;
    bytes32 public immutable fujiBlockchainID;
    address public immutable hub; // RaceTicketHub on Fuji (deployed first)

    bytes32 public lastMatchId;
    address[4] private lastRanking;
    uint64 public lastPostedAt;

    constructor(address messenger_, bytes32 fujiBlockchainID_, address hub_) {
        if (messenger_ == address(0) || hub_ == address(0)) revert ZeroAddress();
        messenger = messenger_;
        fujiBlockchainID = fujiBlockchainID_;
        hub = hub_;
    }

    /// @notice Buy a cross-chain race ticket: one tx on Echo → ICM → Fuji hub.
    function buyTicket() external {
        ITeleporterMessenger(messenger).sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: fujiBlockchainID,
                destinationAddress: hub,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: TICKET_GAS_LIMIT,
                allowedRelayerAddresses: new address[](0),
                message: abi.encode(msg.sender)
            })
        );
        emit TicketSent(msg.sender);
    }

    /// @inheritdoc ITeleporterReceiver
    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        if (msg.sender != messenger) revert NotMessenger();
        if (sourceBlockchainID != fujiBlockchainID || originSenderAddress != hub) revert BadOrigin();
        (bytes32 matchId, address[4] memory ranking) = abi.decode(message, (bytes32, address[4]));
        lastMatchId = matchId;
        lastRanking = ranking;
        lastPostedAt = uint64(block.timestamp);
        emit ResultReceived(matchId);
    }

    function lastResult() external view returns (bytes32, address[4] memory, uint64) {
        return (lastMatchId, lastRanking, lastPostedAt);
    }
}
```

- [ ] **Step 6: Run the suite**

Run: `cd cardgame/contracts && forge test 2>&1 | tail -3`
Expected: all pass — 108 existing + ~12 new (the ring-buffer wrap assertion: after 40 inserts, `head == 8` and slot 7 holds `address(40)`).

- [ ] **Step 7: Commit**

```bash
git add cardgame/contracts/src/icm/ cardgame/contracts/test/IcmRaceTicket.t.sol
git commit -m "feat(cardgame): ICM cross-chain race ticket contracts (Echo gate + Fuji hub)"
```

---

### Task 2: Deploy script + Fuji hub deployment

**Files:**
- Create: `cardgame/contracts/script/DeployIcm.s.sol`

- [ ] **Step 1: Script** (chainid-dispatched, mirrors `Deploy.s.sol` conventions):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RaceTicketHub} from "../src/icm/RaceTicketHub.sol";
import {RaceTicketGate} from "../src/icm/RaceTicketGate.sol";

/// Three-step deploy (hub first breaks the circular reference):
///   1) Fuji : forge script script/DeployIcm.s.sol --rpc-url $FUJI_RPC_URL  --broadcast --private-key $PK
///   2) Echo : ICM_HUB=<hub> forge script script/DeployIcm.s.sol --rpc-url $ECHO_RPC_URL --broadcast --private-key $PK
///   3) Fuji : ICM_HUB=<hub> ICM_GATE=<gate> forge script script/DeployIcm.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key $PK
contract DeployIcm is Script {
    address constant MESSENGER = 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf;
    bytes32 constant FUJI_ID = 0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5;
    bytes32 constant ECHO_ID = 0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1;

    function run() external {
        address hub = vm.envOr("ICM_HUB", address(0));
        address gate = vm.envOr("ICM_GATE", address(0));
        vm.startBroadcast();
        if (block.chainid == 43113) {
            if (hub == address(0)) {
                RaceTicketHub deployed = new RaceTicketHub(MESSENGER, ECHO_ID);
                console2.log("RaceTicketHub (Fuji):", address(deployed));
            } else {
                RaceTicketHub(hub).setGate(gate);
                console2.log("setGate done:", gate);
            }
        } else if (block.chainid == 173750) {
            require(hub != address(0), "ICM_HUB required on Echo");
            RaceTicketGate deployed = new RaceTicketGate(MESSENGER, FUJI_ID, hub);
            console2.log("RaceTicketGate (Echo):", address(deployed));
        } else {
            revert("unsupported chain");
        }
        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2: Deploy the hub on Fuji** (operator has Fuji gas; costs ~nothing):

```bash
cd cardgame/contracts
export FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
PK=$(python3 -c "import json;print(json.load(open('/Users/hts_bot/Desktop/cardgame-operator-keys.json'))['operator']['pk'])")
forge script script/DeployIcm.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key "$PK" 2>&1 | grep -E "RaceTicketHub|error"
```

Record `<HUB>`. Verify: `cast call <HUB> "owner()(address)" --rpc-url $FUJI_RPC_URL` → operator address.

- [ ] **Step 3: Commit**

```bash
git add cardgame/contracts/script/DeployIcm.s.sol
git commit -m "feat(cardgame): ICM deploy script + Fuji hub deployment"
```

---

### Task 3: Echo deploy + wiring ⚠️ USER-GATED (needs ECH gas)

Precondition: user funds operator `0x3C056E6f3815019Bae464f70C01BFfBceb41b9E5` with ECH via the Builder Hub faucet (login + captcha).

- [ ] **Step 1: Check gas**: `cast balance 0x3C056E6f3815019Bae464f70C01BFfBceb41b9E5 --rpc-url https://subnets.avax.network/echo/testnet/rpc --ether` → must be > 0.

- [ ] **Step 2: Deploy gate on Echo**:

```bash
cd cardgame/contracts
export ECHO_RPC_URL=https://subnets.avax.network/echo/testnet/rpc
ICM_HUB=<HUB> forge script script/DeployIcm.s.sol --rpc-url $ECHO_RPC_URL --broadcast --private-key "$PK" 2>&1 | grep -E "RaceTicketGate|error"
```

Record `<GATE>`.

- [ ] **Step 3: Wire hub → gate on Fuji**:

```bash
ICM_HUB=<HUB> ICM_GATE=<GATE> forge script script/DeployIcm.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key "$PK" 2>&1 | grep -E "setGate|error"
cast call <HUB> "gate()(address)" --rpc-url $FUJI_RPC_URL   # == <GATE>
```

---

### Task 4: `icm-post-result.ts` operator script

**Files:**
- Create: `frontend/scripts/icm-post-result.ts`

- [ ] **Step 1: Write it** (mirrors the repo's tsx script style; viem is a frontend dep):

```ts
/**
 * CAR(D) GAME — post a settled race result to the Echo gate over ICM.
 * Manual PoC step (automation into the settle flow is future work).
 *
 *   ICM_HUB=0x… PRIVATE_KEY=0x… npx tsx scripts/icm-post-result.ts <matchId> <addr1> <addr2> <addr3> <addr4>
 */
import { createWalletClient, createPublicClient, http, parseAbi, isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const HUB = process.env.ICM_HUB as Hex;
const PK = process.env.PRIVATE_KEY as Hex;
const [matchId, ...ranking] = process.argv.slice(2);
if (!HUB || !PK) { console.error('ICM_HUB and PRIVATE_KEY env required'); process.exit(1); }
if (!/^0x[0-9a-fA-F]{64}$/.test(matchId ?? '') || ranking.length !== 4 || !ranking.every((a) => isAddress(a))) {
  console.error('usage: icm-post-result.ts <bytes32 matchId> <addr1..addr4>'); process.exit(1);
}

const ABI = parseAbi(['function postResult(bytes32 matchId, address[4] ranking)']);
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: avalancheFuji, transport: http() });
const pub = createPublicClient({ chain: avalancheFuji, transport: http() });

const hash = await wallet.writeContract({
  address: HUB, abi: ABI, functionName: 'postResult',
  args: [matchId as Hex, ranking as [Hex, Hex, Hex, Hex]],
});
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`postResult ${rcpt.status} — tx ${hash}`);
```

- [ ] **Step 2: Typecheck**: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep icm-post` → empty.

- [ ] **Step 3: Commit**

```bash
git add frontend/scripts/icm-post-result.ts
git commit -m "feat(cardgame): operator script — post race results to Echo over ICM"
```

---

### Task 5: ICM Lab panel

**Files:**
- Create: `frontend/components/cardgame/IcmLab.tsx`
- Modify: `frontend/app/cardgame/page.tsx` (the `cg-icm` teaser div, currently page.tsx:376)
- Modify: `frontend/app/cardgame/cardgame.css`

- [ ] **Step 1: Component** — `frontend/components/cardgame/IcmLab.tsx`:

```tsx
'use client';

/**
 * ICM Lab — live cross-chain ticket panel for the scheduled-race lobby.
 * Client-side only: reads the Fuji RaceTicketHub and the Echo RaceTicketGate
 * over their public RPCs (no server involvement). Env-gated: without both
 * contract addresses it renders the original "coming soon" teaser.
 */
import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbi, formatEther, type Hex } from 'viem';

const HUB = process.env.NEXT_PUBLIC_ICM_HUB as Hex | undefined;
const GATE = process.env.NEXT_PUBLIC_ICM_GATE as Hex | undefined;
const ECHO_RPC = 'https://subnets.avax.network/echo/testnet/rpc';

const HUB_ABI = parseAbi(['function getTickets() view returns (address[32], uint64[32], uint8, uint8)']);
const GATE_ABI = parseAbi(['function lastResult() view returns (bytes32, address[4], uint64)']);

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

interface Ticket { player: string; at: number }
interface LastResult { matchId: string; winner: string; at: number }

export default function IcmLab({ fujiClient }: { fujiClient?: { readContract: (a: unknown) => Promise<unknown> } }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [result, setResult] = useState<LastResult | null>(null);

  useEffect(() => {
    if (!HUB || !GATE) return;
    const fuji = createPublicClient({ transport: http('https://api.avax-test.network/ext/bc/C/rpc') });
    const echo = createPublicClient({ transport: http(ECHO_RPC) });
    let dead = false;
    const load = async () => {
      try {
        const [players, times, count, head] = await fuji.readContract({ address: HUB, abi: HUB_ABI, functionName: 'getTickets' }) as [string[], bigint[], number, number];
        const out: Ticket[] = [];
        // newest first: walk backwards from head-1 over `count` filled slots
        for (let i = 0; i < count; i++) {
          const idx = (head - 1 - i + 64) % 32;
          out.push({ player: players[idx], at: Number(times[idx]) });
        }
        if (!dead) setTickets(out.slice(0, 5));
      } catch { /* panel is best-effort */ }
      try {
        const [matchId, ranking, postedAt] = await echo.readContract({ address: GATE, abi: GATE_ABI, functionName: 'lastResult' }) as [string, string[], bigint];
        if (!dead && Number(postedAt) > 0) setResult({ matchId, winner: ranking[0], at: Number(postedAt) });
      } catch { /* best-effort */ }
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  if (!HUB || !GATE) {
    return (
      <div className="cg-icm">🔗 Cross-chain race entries from Avalanche L1s — powered by <b>Avalanche ICM</b> · <span className="cg-icm-soon">COMING SOON</span></div>
    );
  }
  return (
    <div className="cg-icmlab">
      <div className="cg-icmlab-hd">🔗 ICM LAB <span className="cg-icm-soon">LIVE · TESTNET</span>
        <span className="cg-icmlab-sub">cross-chain tickets from <b>Echo L1</b> via Avalanche ICM</span></div>
      {tickets.length === 0 ? (
        <div className="cg-icmlab-empty">No cross-chain tickets yet — buy one on Echo and watch it land here.</div>
      ) : (
        <ul className="cg-icmlab-list">
          {tickets.map((t, i) => (
            <li key={`${t.player}-${t.at}-${i}`}><span className="mono">{short(t.player)}</span> from Echo L1 · {ago(t.at)}</li>
          ))}
        </ul>
      )}
      {result && (
        <div className="cg-icmlab-res">🏁 last result relayed back to Echo: <span className="mono">{short(result.winner)}</span> won · {ago(result.at)}</div>
      )}
      <div className="cg-icmlab-links">
        <a href={`https://testnet.snowtrace.io/address/${HUB}`} target="_blank" rel="noopener noreferrer">hub ↗</a>
        <a href={`https://testnet.avascan.info/blockchain/echo/address/${GATE}`} target="_blank" rel="noopener noreferrer">gate ↗</a>
      </div>
    </div>
  );
}
```

(Remove the unused `fujiClient` prop and `formatEther` import if the linter complains — they are not needed; implement clean.)

- [ ] **Step 2: page.tsx swap** — replace the `cg-icm` div (page.tsx:376) with `<IcmLab />`; add `import IcmLab from '@/components/cardgame/IcmLab';` at the top with the other component imports.

- [ ] **Step 3: CSS** — append to `frontend/app/cardgame/cardgame.css` after the `.cg-icm-soon` rule:

```css
/* ICM Lab live panel */
.cgroot .cg-icmlab{margin-top:10px;padding:10px 12px;border:1px solid rgba(77,208,225,.22);border-radius:11px;background:rgba(77,208,225,.05)}
.cgroot .cg-icmlab-hd{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:1.5px;color:var(--cg-ice);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cgroot .cg-icmlab-sub{font-family:inherit;font-weight:400;font-size:11px;letter-spacing:0;color:var(--cg-muted)}
.cgroot .cg-icmlab-sub b{color:var(--cg-text)}
.cgroot .cg-icmlab-empty{font-size:11.5px;color:var(--cg-muted);margin-top:6px}
.cgroot .cg-icmlab-list{list-style:none;margin:6px 0 0;padding:0;font-size:11.5px;color:var(--cg-muted);display:flex;flex-direction:column;gap:3px}
.cgroot .cg-icmlab-res{margin-top:7px;font-size:11.5px;color:var(--cg-gold)}
.cgroot .cg-icmlab-links{margin-top:7px;display:flex;gap:12px;font-size:10.5px}
.cgroot .cg-icmlab-links a{color:var(--cg-ice);text-decoration:none}
```

- [ ] **Step 4: Verify** — `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "icmlab|cardgame/page" | grep -v three` → empty; `npx next build` → `✓ Compiled successfully`. Without envs set, the page still renders the teaser (build-time check is enough; envs are added at rollout).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/cardgame/IcmLab.tsx frontend/app/cardgame/page.tsx frontend/app/cardgame/cardgame.css
git commit -m "feat(cardgame): ICM Lab panel — live cross-chain tickets (env-gated)"
```

---

### Task 6: Live E2E + rollout ⚠️ USER-GATED (after Task 3)

- [ ] **Step 1: Buy a ticket on Echo** (operator doubles as the demo player):

```bash
cast send <GATE> "buyTicket()" --rpc-url https://subnets.avax.network/echo/testnet/rpc --private-key "$PK"
```

- [ ] **Step 2: Watch the hosted relayer deliver** (usually seconds):

```bash
for i in 1 2 3 4 5 6; do cast call <HUB> "getTickets()(address[32],uint64[32],uint8,uint8)" --rpc-url $FUJI_RPC_URL | tail -2; sleep 10; done
```

Expected: `count` flips 0→1 and the operator address appears. **If it never lands, the hosted-relayer assumption failed** — fallback: run `icm-relayer` locally per Builder Hub docs (plan risk noted in spec §2); pause and report rather than debugging blind.

- [ ] **Step 3: Post a result back** — use a real settled matchId from the recent 1 AVAX escrow (or a synthetic bytes32 for the PoC):

```bash
cd frontend && ICM_HUB=<HUB> PRIVATE_KEY="$PK" npx tsx scripts/icm-post-result.ts 0x<matchId> <winner> <p2> <p3> <p4>
cast call <GATE> "lastResult()(bytes32,address[4],uint64)" --rpc-url https://subnets.avax.network/echo/testnet/rpc
```

- [ ] **Step 4: Rollout** — add `NEXT_PUBLIC_ICM_HUB=<HUB>` and `NEXT_PUBLIC_ICM_GATE=<GATE>` to `frontend/.env.local` AND the VPS `/opt/frostbite/mainnet/frontend/.env.local`, then the standard deploy (local `npx next build` → rsync → `pm2 restart frostbite-mainnet`). Verify: the cardgame MP tab shows the ICM LAB panel with the ticket from Step 1.

- [ ] **Step 5: Update memory + report** — final addresses, tx hashes for the demo narrative (Accelerator/Demo Day evidence links).
