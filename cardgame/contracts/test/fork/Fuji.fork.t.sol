// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MatchEscrow} from "../../src/MatchEscrow.sol";

/// Fork sanity: MatchEscrow has no external dependencies, so the fork test is a
/// real-network deploy + full lifecycle, proving the signature's chainid binding
/// uses the LIVE chainid. Skips gracefully if the RPC is unreachable.
contract FujiForkTest is Test {
    MatchEscrow escrow;
    uint256 constant ENTRY = 0.01 ether;
    uint256 constant FEE = 0.002 ether;
    address treasury = makeAddr("treasury");
    address signer;
    uint256 signerPk;
    address[4] players;
    uint256[4] playerPks;
    bool forked;

    bytes32 constant ID = keccak256("fork-match");

    function setUp() public {
        try vm.createSelectFork(vm.envOr("FUJI_RPC_URL", string("https://api.avax-test.network/ext/bc/C/rpc"))) {
            forked = true;
        } catch {
            forked = false;
            return;
        }
        (signer, signerPk) = makeAddrAndKey("fork-signer");
        for (uint256 i = 0; i < 4; i++) {
            (players[i], playerPks[i]) = makeAddrAndKey(string(abi.encodePacked("fork-player", vm.toString(i))));
            vm.deal(players[i], 1 ether);
        }
        escrow = new MatchEscrow(address(this), signer, treasury, ENTRY, 1 hours, FEE, _rewards());
        escrow.setAuthorized(address(this), true);
    }

    function _rewards() internal pure returns (uint256[4] memory r) {
        r[0] = 0.02 ether; r[1] = 0.01 ether; r[2] = 0.005 ether; r[3] = 0.003 ether;
    }
    function _players() internal view returns (address[4] memory p) {
        for (uint256 i = 0; i < 4; i++) p[i] = players[i];
    }

    function test_fork_fullLifecycle_onLiveChainid() public {
        if (!forked) { vm.skip(true); return; }
        assertEq(block.chainid, 43113, "expected Fuji");

        escrow.createMatch(ID, _players());
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(players[i]);
            escrow.joinMatch{value: ENTRY}(ID);
        }
        assertEq(uint256(escrow.getStatus(ID)), uint256(MatchEscrow.Status.Locked));

        // sign the ranking against the LIVE chainid + deployed address
        address[4] memory ranking = _players();
        bytes32 d = escrow.settleDigest(ID, ranking);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, d);
        escrow.settle(ID, ranking, abi.encodePacked(r, s, v));
        assertEq(uint256(escrow.getStatus(ID)), uint256(MatchEscrow.Status.Settled));

        // each player + treasury pull exact amounts
        for (uint256 i = 0; i < 4; i++) {
            uint256 b = players[i].balance;
            vm.prank(players[i]);
            escrow.withdrawPayout();
            assertEq(players[i].balance - b, _rewards()[i]);
        }
        uint256 tb = treasury.balance;
        vm.prank(treasury);
        escrow.withdrawPayout();
        assertEq(treasury.balance - tb, FEE);
        assertEq(address(escrow).balance, 0);
    }

    function test_fork_chainidBinding_wrongChainidFails() public {
        if (!forked) { vm.skip(true); return; }

        escrow.createMatch(ID, _players());
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(players[i]);
            escrow.joinMatch{value: ENTRY}(ID);
        }
        address[4] memory ranking = _players();

        // hand-build a digest with a DELIBERATELY WRONG chainid (mainnet 43114)
        bytes32 wrongInner = keccak256(abi.encode(ID, ranking, address(escrow), uint256(43114)));
        bytes32 wrongSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", wrongInner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, wrongSigned);
        bytes memory wrongSig = abi.encodePacked(r, s, v);

        // on Fuji (43113) the contract rebuilds with the live chainid → mismatch
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(ID, ranking, wrongSig);
    }
}
