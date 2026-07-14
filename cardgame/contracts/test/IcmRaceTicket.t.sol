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
