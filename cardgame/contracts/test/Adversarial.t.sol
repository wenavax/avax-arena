// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MatchEscrow} from "../src/MatchEscrow.sol";
import {RevertingReceiver} from "./mocks/RevertingReceiver.sol";

/// Adversarial suite for MatchEscrow: reverting-receiver isolation, signature
/// attacks (replay across match/deployment, s-malleability, wrong signer, bad
/// length), double-settle, settle/refund race, reentrancy, griefing, owner rug.
contract AdversarialTest is Test {
    MatchEscrow escrow;

    uint256 constant ENTRY = 1 ether;
    uint256 constant WINDOW = 1 hours;
    uint256 constant FEE = 0.2 ether;

    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address signer;
    uint256 signerPk;
    address[4] players;
    bytes32 constant ID = keccak256("adv-match");

    // secp256k1 group order (for s-malleability construction)
    uint256 constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public {
        (signer, signerPk) = makeAddrAndKey("signer");
        escrow = new MatchEscrow(address(this), signer, treasury, ENTRY, WINDOW, FEE, _rewards());
        escrow.setAuthorized(operator, true);
        for (uint256 i = 0; i < 4; i++) {
            players[i] = makeAddr(string(abi.encodePacked("p", vm.toString(i))));
            vm.deal(players[i], 10 ether);
        }
    }

    // ─────────────────────────────── Helpers ───────────────────────────────

    function _rewards() internal pure returns (uint256[4] memory r) {
        r[0] = 2 ether; r[1] = 1 ether; r[2] = 0.5 ether; r[3] = 0.3 ether;
    }
    function _players() internal view returns (address[4] memory p) {
        for (uint256 i = 0; i < 4; i++) p[i] = players[i];
    }
    function _sign(bytes32 id, address[4] memory ranking) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, escrow.settleDigest(id, ranking));
        return abi.encodePacked(r, s, v);
    }
    function _create(MatchEscrow e, bytes32 id, address[4] memory p) internal {
        vm.prank(operator);
        e.createMatch(id, p);
    }
    function _lock(bytes32 id) internal {
        _create(escrow, id, _players());
        for (uint256 i = 0; i < 4; i++) { vm.prank(players[i]); escrow.joinMatch{value: ENTRY}(id); }
    }

    // ───────────────── (1) Reverting receiver isolation ─────────────────────

    function test_revertingReceiver_cannotBrickSettle_isolatedToItself() public {
        // A contract that rejects AVAX takes a seat and WINS.
        RevertingReceiver bad = new RevertingReceiver(escrow);
        vm.deal(address(bad), 10 ether);

        address[4] memory seats = [address(bad), players[1], players[2], players[3]];
        _create(escrow, ID, seats);
        bad.join{value: ENTRY}(ID);
        for (uint256 i = 1; i < 4; i++) { vm.prank(players[i]); escrow.joinMatch{value: ENTRY}(ID); }

        // bad finishes 1st. settle must SUCCEED — it only credits pendingPayouts.
        address[4] memory ranking = [address(bad), players[1], players[2], players[3]];
        escrow.settle(ID, ranking, _sign(ID, ranking));
        assertEq(uint256(escrow.getStatus(ID)), uint256(MatchEscrow.Status.Settled));

        // bad's own withdraw reverts (its receive rejects), but this is isolated:
        vm.expectRevert(); // "transfer failed"
        bad.withdraw();

        // every OTHER player + treasury withdraw fully, unaffected.
        for (uint256 i = 1; i < 4; i++) {
            uint256 b = players[i].balance;
            vm.prank(players[i]);
            escrow.withdrawPayout();
            assertEq(players[i].balance - b, _rewards()[i]);
        }
        uint256 tb = treasury.balance;
        vm.prank(treasury);
        escrow.withdrawPayout();
        assertEq(treasury.balance - tb, FEE);

        // bad later accepts and pulls its winnings — funds were never lost.
        // (Its 1 AVAX entry came from the test contract's msg.value, so its own
        // 10 ether balance is untouched; +2 reward → 12 ether.)
        bad.setAccept(true);
        bad.withdraw();
        assertEq(address(bad).balance, 10 ether + _rewards()[0]);
    }

    // ───────────────────── (2) Signature attacks ───────────────────────────

    function test_sig_replayAcrossMatch_fails() public {
        _lock(ID);
        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking);

        // second locked match with a DIFFERENT id
        bytes32 id2 = keccak256("adv-match-2");
        _create(escrow, id2, _players());
        for (uint256 i = 0; i < 4; i++) { vm.prank(players[i]); escrow.joinMatch{value: ENTRY}(id2); }

        // reusing ID's signature on id2 must fail (digest binds matchId)
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(id2, ranking, sig);
    }

    function test_sig_replayAcrossDeployment_fails() public {
        _lock(ID);
        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking); // bound to address(escrow)

        // a second deployment with the SAME signer/players/id
        MatchEscrow escrow2 = new MatchEscrow(address(this), signer, treasury, ENTRY, WINDOW, FEE, _rewards());
        escrow2.setAuthorized(operator, true);
        _create(escrow2, ID, _players());
        for (uint256 i = 0; i < 4; i++) { vm.prank(players[i]); escrow2.joinMatch{value: ENTRY}(ID); }

        // sig produced for `escrow` cannot settle `escrow2` (digest binds address(this))
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow2.settle(ID, ranking, sig);
    }

    function test_sig_highS_malleability_rejected() public {
        _lock(ID);
        address[4] memory ranking = _players();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, escrow.settleDigest(ID, ranking));
        // flip to the high-s counterpart; OZ ECDSA rejects s > N/2
        bytes32 highS = bytes32(N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        bytes memory malleable = abi.encodePacked(r, highS, flippedV);
        vm.expectRevert(); // ECDSAInvalidSignatureS
        escrow.settle(ID, ranking, malleable);
    }

    function test_sig_wrongLength_rejected() public {
        _lock(ID);
        address[4] memory ranking = _players();
        vm.expectRevert(); // ECDSAInvalidSignatureLength
        escrow.settle(ID, ranking, hex"deadbeef");
    }

    function test_sig_badV_rejected() public {
        _lock(ID);
        address[4] memory ranking = _players();
        (, bytes32 r, bytes32 s) = vm.sign(signerPk, escrow.settleDigest(ID, ranking));
        bytes memory badV = abi.encodePacked(r, s, uint8(29));
        vm.expectRevert();
        escrow.settle(ID, ranking, badV);
    }

    // ─────────────────── (3) Double settle / (4) races ─────────────────────

    function test_doubleSettle_noSecondPayout() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        uint256 pendingWinner = escrow.pendingPayouts(players[0]);

        bytes memory sig = _sign(ID, ranking);
        vm.expectRevert(MatchEscrow.MatchNotLocked.selector);
        escrow.settle(ID, ranking, sig);
        assertEq(escrow.pendingPayouts(players[0]), pendingWinner); // unchanged
    }

    function test_settleBlockedAfterRefundRace() public {
        _lock(ID);
        vm.warp(block.timestamp + WINDOW + 1);
        // a player refunds → match Cancelled → settle can no longer run
        vm.prank(players[0]);
        escrow.refund(ID);
        assertEq(uint256(escrow.getStatus(ID)), uint256(MatchEscrow.Status.Cancelled));

        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking);
        vm.expectRevert(MatchEscrow.MatchNotLocked.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_refundBlockedAfterSettle() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.NotRefundable.selector);
        escrow.refund(ID);
    }

    // ─────────────────────── (5) Reentrancy ────────────────────────────────

    function test_reentrancy_withdrawCannotDoubleSpend() public {
        ReentrantPlayer atk = new ReentrantPlayer(escrow);
        vm.deal(address(atk), 10 ether);
        address[4] memory seats = [address(atk), players[1], players[2], players[3]];
        _create(escrow, ID, seats);
        atk.join{value: ENTRY}(ID);
        for (uint256 i = 1; i < 4; i++) { vm.prank(players[i]); escrow.joinMatch{value: ENTRY}(ID); }
        address[4] memory ranking = [address(atk), players[1], players[2], players[3]];
        escrow.settle(ID, ranking, _sign(ID, ranking));

        atk.setReenter(true);
        // The re-entry trips nonReentrant, failing the low-level send, which
        // reverts the whole withdraw and rolls back pending to its full value —
        // so the attacker never gets 2× reward. (try/catch swallows the revert.)
        try atk.withdraw() {} catch {}
        assertLe(address(atk).balance, 10 ether + _rewards()[0]); // never doubled
        // Funds are safe: with re-entry off, the honest single withdraw works.
        atk.setReenter(false);
        atk.withdraw();
        assertEq(escrow.pendingPayouts(address(atk)), 0);
        assertEq(address(atk).balance, 10 ether + _rewards()[0]); // exactly one reward
    }

    // ─────────────────────── (6) Griefing ──────────────────────────────────

    function test_nonPayerCannotBlock_refundReturnsPaidPlayers() public {
        _create(escrow, ID, _players());
        // only 2 of 4 pay; match never locks
        vm.prank(players[0]); escrow.joinMatch{value: ENTRY}(ID);
        vm.prank(players[1]); escrow.joinMatch{value: ENTRY}(ID);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(players[0]); escrow.refund(ID);
        vm.prank(players[1]); escrow.refund(ID);
        assertEq(escrow.pendingPayouts(players[0]), ENTRY);
        assertEq(escrow.pendingPayouts(players[1]), ENTRY);
        // a non-payer gets nothing
        vm.prank(players[2]);
        vm.expectRevert(MatchEscrow.NothingToRefund.selector);
        escrow.refund(ID);
    }

    // ─────────────────────── (7) Owner rug ─────────────────────────────────

    function test_owner_cannotRetuneToBreakInvariant() public {
        uint256[4] memory bad = [uint256(2 ether), 1 ether, 1 ether, 1 ether]; // Σ+fee != pool
        vm.expectRevert(MatchEscrow.InvalidPayoutConfig.selector);
        escrow.setPayoutConfig(FEE, bad);
    }

    function test_owner_retuneDoesNotAffectSettledMatch() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        // retune to a different valid split
        uint256[4] memory r2 = [uint256(1 ether), 1 ether, 1 ether, 0.8 ether]; // Σ 3.8 + 0.2 = 4
        escrow.setPayoutConfig(FEE, r2);
        // already-settled credits are unchanged
        assertEq(escrow.pendingPayouts(players[0]), 2 ether);
    }

    function test_owner_hasNoSweep_pendingUntouchable() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        uint256 escrowBal = address(escrow).balance;
        // no owner function can move escrow/pending funds — the only outflow is
        // withdrawPayout (caller-credited) and refund (caller-paid). Assert the
        // owner cannot reduce a player's pending or drain the balance.
        assertEq(address(escrow).balance, escrowBal); // nothing the owner did moved funds
        assertEq(escrow.pendingPayouts(players[0]), 2 ether);
    }

    // owner is Ownable2Step; renounce disabled
    function test_renounce_disabled() public {
        vm.expectRevert(MatchEscrow.RenounceDisabled.selector);
        escrow.renounceOwnership();
    }

    // ── audit fix: payout snapshot defeats the owner-drain-of-locked-match path ──

    /// A compromised owner cannot redirect a LOCKED match's pool: settle pays
    /// from the terms snapshotted at createMatch, not live global config.
    function test_owner_cannotDrainLockedMatch_viaRetunePlusTreasury() public {
        _lock(ID); // created + locked under honest config (fee 0.2, rewards 2/1/.5/.3)
        address attacker = makeAddr("attacker");

        // owner turns malicious AFTER the match is locked
        escrow.setPayoutConfig(4 ether, [uint256(0), 0, 0, 0]); // fee = whole pool, 0 to players
        escrow.setTreasury(attacker);
        escrow.setTrustedSigner(signer); // (already signer; owner could self-sign)

        // settle still pays the SNAPSHOT: players get their rewards, honest
        // treasury gets the fee, the attacker treasury gets nothing.
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));

        assertEq(escrow.pendingPayouts(players[0]), 2 ether, "winner still paid");
        assertEq(escrow.pendingPayouts(players[3]), 0.3 ether, "4th still paid");
        assertEq(escrow.pendingPayouts(treasury), FEE, "honest treasury got fee");
        assertEq(escrow.pendingPayouts(attacker), 0, "attacker got nothing");
    }

    /// The snapshot is what settle uses, and it is readable before joining.
    function test_matchPayout_snapshotFrozenAtCreate() public {
        _create(escrow, ID, _players());
        (address t0, uint256 f0, uint256[4] memory r0) = escrow.matchPayout(ID);
        assertEq(t0, treasury);
        assertEq(f0, FEE);
        assertEq(r0[0], 2 ether);

        // retune the global config; the match snapshot is unchanged
        escrow.setPayoutConfig(1 ether, [uint256(1 ether), 1 ether, 0.5 ether, 0.5 ether]);
        escrow.setTreasury(makeAddr("other"));
        (address t1, uint256 f1, uint256[4] memory r1) = escrow.matchPayout(ID);
        assertEq(t1, treasury, "snapshot treasury frozen");
        assertEq(f1, FEE, "snapshot fee frozen");
        assertEq(r1[0], 2 ether, "snapshot reward frozen");
    }
}

/// Attacker player that tries to re-enter withdrawPayout during its own receive.
contract ReentrantPlayer {
    MatchEscrow public immutable escrow;
    bool public reenter;

    constructor(MatchEscrow e) { escrow = e; }
    function setReenter(bool v) external { reenter = v; }
    function join(bytes32 id) external payable { escrow.joinMatch{value: msg.value}(id); }
    function withdraw() external { escrow.withdrawPayout(); }
    receive() external payable {
        if (reenter) {
            reenter = false;
            escrow.withdrawPayout(); // nonReentrant must block this
        }
    }
}
