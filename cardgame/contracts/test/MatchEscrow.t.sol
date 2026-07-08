// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MatchEscrow} from "../src/MatchEscrow.sol";
import {RevertingReceiver} from "./mocks/RevertingReceiver.sol";

/// Unit tests for MatchEscrow. The test contract is the Ownable2Step owner;
/// `operator` is an authorized match-opener; `signer` is the trusted server key
/// (its private key is known so real signatures can be produced with vm.sign);
/// `treasury` receives the platform fee; players[0..3] are the four seats.
///
/// Config: entryFee 1 AVAX, settleWindow 1h, platformFee 0.2, rewards
/// [2, 1, 0.5, 0.3] — so platformFee + Σrewards == 4 * entryFee (the structural
/// payout invariant enforced in the constructor and setPayoutConfig).
contract MatchEscrowTest is Test {
    MatchEscrow escrow;

    uint256 constant ENTRY = 1 ether;
    uint256 constant WINDOW = 1 hours;
    uint256 constant FEE = 0.2 ether;

    address operator;
    address treasury;
    address signer;
    uint256 signerPk;

    address[4] players;

    bytes32 constant ID = keccak256("match-1");

    function setUp() public {
        (signer, signerPk) = makeAddrAndKey("signer");
        operator = makeAddr("operator");
        treasury = makeAddr("treasury");

        escrow = new MatchEscrow(address(this), signer, treasury, ENTRY, WINDOW, FEE, _defaultRewards());
        escrow.setAuthorized(operator, true);

        for (uint256 i = 0; i < 4; i++) {
            players[i] = makeAddr(string(abi.encodePacked("player", vm.toString(i))));
            vm.deal(players[i], 10 ether);
        }
        vm.deal(address(this), 100 ether);
    }

    // ─────────────────────────────── Helpers ───────────────────────────────

    function _defaultRewards() internal pure returns (uint256[4] memory r) {
        r[0] = 2 ether;
        r[1] = 1 ether;
        r[2] = 0.5 ether;
        r[3] = 0.3 ether;
    }

    function _players() internal view returns (address[4] memory p) {
        for (uint256 i = 0; i < 4; i++) p[i] = players[i];
    }

    function _sign(bytes32 matchId, address[4] memory ranking) internal view returns (bytes memory) {
        bytes32 d = escrow.settleDigest(matchId, ranking);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, d);
        return abi.encodePacked(r, s, v);
    }

    function _signWith(uint256 pk, bytes32 matchId, address[4] memory ranking)
        internal
        view
        returns (bytes memory)
    {
        bytes32 d = escrow.settleDigest(matchId, ranking);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }

    function _createMatch(bytes32 id) internal {
        vm.prank(operator);
        escrow.createMatch(id, _players());
    }

    function _join(bytes32 id, address p) internal {
        vm.prank(p);
        escrow.joinMatch{value: ENTRY}(id);
    }

    /// create + all four seats paid → status Locked
    function _lock(bytes32 id) internal {
        _createMatch(id);
        for (uint256 i = 0; i < 4; i++) _join(id, players[i]);
    }

    /// deterministic Fisher–Yates permutation of the four players from a seed
    function _permute(uint256 seed) internal view returns (address[4] memory r) {
        for (uint256 i = 0; i < 4; i++) r[i] = players[i];
        for (uint256 i = 3; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (r[i], r[j]) = (r[j], r[i]);
        }
    }

    /// address(escrow).balance == escrowed + totalPending (headline accounting invariant)
    function _assertBalanceInvariant() internal view {
        assertEq(address(escrow).balance, escrow.escrowed() + escrow.totalPending(), "balance invariant");
    }

    // ───────────────────────────── Constructor ─────────────────────────────

    function test_constructor_storesConfig() public view {
        assertEq(escrow.owner(), address(this));
        assertEq(escrow.trustedSigner(), signer);
        assertEq(escrow.treasury(), treasury);
        assertEq(escrow.entryFee(), ENTRY);
        assertEq(escrow.settleWindow(), WINDOW);
        assertEq(escrow.platformFee(), FEE);
        assertEq(escrow.PLAYERS(), 4);
        uint256[4] memory r = escrow.getRewards();
        assertEq(r[0], 2 ether);
        assertEq(r[1], 1 ether);
        assertEq(r[2], 0.5 ether);
        assertEq(r[3], 0.3 ether);
        assertTrue(escrow.authorized(operator));
    }

    function test_constructor_revertsInvalidPayoutConfig() public {
        uint256[4] memory r = _defaultRewards(); // Σ = 3.8; +0.1 fee = 3.9 != 4*entryFee
        vm.expectRevert(MatchEscrow.InvalidPayoutConfig.selector);
        new MatchEscrow(address(this), signer, treasury, ENTRY, WINDOW, 0.1 ether, r);
    }

    function test_constructor_revertsInvalidPayoutConfig_tooHigh() public {
        uint256[4] memory r = _defaultRewards(); // 3.8; +0.3 fee = 4.1 != 4
        vm.expectRevert(MatchEscrow.InvalidPayoutConfig.selector);
        new MatchEscrow(address(this), signer, treasury, ENTRY, WINDOW, 0.3 ether, r);
    }

    function test_constructor_revertsZeroSigner() public {
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        new MatchEscrow(address(this), address(0), treasury, ENTRY, WINDOW, FEE, _defaultRewards());
    }

    function test_constructor_revertsZeroTreasury() public {
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        new MatchEscrow(address(this), signer, address(0), ENTRY, WINDOW, FEE, _defaultRewards());
    }

    function test_constructor_revertsZeroEntryFee() public {
        vm.expectRevert(MatchEscrow.InvalidPayoutConfig.selector);
        new MatchEscrow(address(this), signer, treasury, 0, WINDOW, FEE, _defaultRewards());
    }

    function test_constructor_revertsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new MatchEscrow(address(0), signer, treasury, ENTRY, WINDOW, FEE, _defaultRewards());
    }

    // ─────────────────────────────── createMatch ───────────────────────────

    function test_createMatch_happyPath() public {
        vm.expectEmit(address(escrow));
        emit MatchEscrow.MatchCreated(ID, _players());
        _createMatch(ID);

        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Open));
        assertEq(escrow.createdAt(ID), uint64(block.timestamp));
        assertEq(escrow.paidCount(ID), 0);
        for (uint256 i = 0; i < 4; i++) {
            assertTrue(escrow.isPlayer(ID, players[i]));
            assertFalse(escrow.hasPaid(ID, players[i]));
        }
        address[4] memory got = escrow.getPlayers(ID);
        for (uint256 i = 0; i < 4; i++) assertEq(got[i], players[i]);
    }

    function test_createMatch_revertsNotAuthorized() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(MatchEscrow.NotAuthorized.selector);
        escrow.createMatch(ID, _players());
    }

    function test_createMatch_ownerCanCallWithoutBeingAuthorized() public {
        assertFalse(escrow.authorized(address(this)), "owner not in authorized map");
        // owner (test contract) opens directly, no prank
        escrow.createMatch(ID, _players());
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Open));
    }

    function test_createMatch_revertsMatchExists() public {
        _createMatch(ID);
        vm.prank(operator);
        vm.expectRevert(MatchEscrow.MatchExists.selector);
        escrow.createMatch(ID, _players());
    }

    function test_createMatch_revertsZeroAddressPlayer() public {
        address[4] memory p = _players();
        p[1] = address(0);
        vm.prank(operator);
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        escrow.createMatch(ID, p);
    }

    function test_createMatch_revertsDuplicatePlayer() public {
        address[4] memory p = _players();
        p[2] = p[0];
        vm.prank(operator);
        vm.expectRevert(MatchEscrow.DuplicatePlayer.selector);
        escrow.createMatch(ID, p);
    }

    // ──────────────────────────────── joinMatch ────────────────────────────

    function test_joinMatch_exactFeeEscrows() public {
        _createMatch(ID);

        vm.expectEmit(address(escrow));
        emit MatchEscrow.PlayerJoined(ID, players[0], 1);
        _join(ID, players[0]);

        assertTrue(escrow.hasPaid(ID, players[0]));
        assertEq(escrow.paidCount(ID), 1);
        assertEq(escrow.escrowed(), ENTRY);
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Open));
        _assertBalanceInvariant();
    }

    function test_joinMatch_escrowedIncrementsPerJoin() public {
        _createMatch(ID);
        _join(ID, players[0]);
        assertEq(escrow.escrowed(), 1 ether);
        _join(ID, players[1]);
        assertEq(escrow.escrowed(), 2 ether);
        _join(ID, players[2]);
        assertEq(escrow.escrowed(), 3 ether);
        _assertBalanceInvariant();
    }

    function test_joinMatch_revertsWrongEntryFeeUnder() public {
        _createMatch(ID);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.WrongEntryFee.selector);
        escrow.joinMatch{value: ENTRY - 1}(ID);
    }

    function test_joinMatch_revertsWrongEntryFeeOver() public {
        _createMatch(ID);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.WrongEntryFee.selector);
        escrow.joinMatch{value: ENTRY + 1}(ID);
    }

    function test_joinMatch_revertsNotListedPlayer() public {
        _createMatch(ID);
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 10 ether);
        vm.prank(stranger);
        vm.expectRevert(MatchEscrow.NotListedPlayer.selector);
        escrow.joinMatch{value: ENTRY}(ID);
    }

    function test_joinMatch_revertsAlreadyPaid() public {
        _createMatch(ID);
        _join(ID, players[0]);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.AlreadyPaid.selector);
        escrow.joinMatch{value: ENTRY}(ID);
    }

    function test_joinMatch_revertsMatchNotOpen_none() public {
        // never created → status None
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.MatchNotOpen.selector);
        escrow.joinMatch{value: ENTRY}(ID);
    }

    function test_joinMatch_fourthLocksAndEmits() public {
        _createMatch(ID);
        _join(ID, players[0]);
        _join(ID, players[1]);
        _join(ID, players[2]);

        vm.expectEmit(address(escrow));
        emit MatchEscrow.MatchLocked(ID);
        _join(ID, players[3]);

        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Locked));
        assertEq(escrow.paidCount(ID), 4);
        assertEq(escrow.escrowed(), 4 ether);
        _assertBalanceInvariant();
    }

    function test_joinMatch_revertsMatchNotOpen_afterLocked() public {
        _lock(ID);
        // even a listed, already-paid player cannot re-enter a locked match
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.MatchNotOpen.selector);
        escrow.joinMatch{value: ENTRY}(ID);
    }

    // ──────────────────────────────── settle ───────────────────────────────

    function test_settle_validSigFullPayout() public {
        _lock(ID);
        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking);

        vm.expectEmit(address(escrow));
        emit MatchEscrow.MatchSettled(ID, ranking);
        escrow.settle(ID, ranking, sig);

        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Settled));
        assertEq(escrow.escrowed(), 0, "escrow drained");
        assertEq(escrow.totalPending(), 4 ether, "pool moved to pending");

        assertEq(escrow.pendingPayouts(treasury), FEE);
        assertEq(escrow.pendingPayouts(players[0]), 2 ether);
        assertEq(escrow.pendingPayouts(players[1]), 1 ether);
        assertEq(escrow.pendingPayouts(players[2]), 0.5 ether);
        assertEq(escrow.pendingPayouts(players[3]), 0.3 ether);
        _assertBalanceInvariant();
    }

    function test_settle_creditsFeeToTreasuryEvent() public {
        _lock(ID);
        address[4] memory ranking = _players();
        vm.expectEmit(address(escrow));
        emit MatchEscrow.FeeCredited(ID, treasury, FEE);
        escrow.settle(ID, ranking, _sign(ID, ranking));
    }

    function test_settle_permissionlessRandomCaller() public {
        _lock(ID);
        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking);

        address randomCaller = makeAddr("random");
        vm.prank(randomCaller);
        escrow.settle(ID, ranking, sig);

        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Settled));
        assertEq(escrow.pendingPayouts(players[0]), 2 ether);
    }

    function test_settle_revertsMatchNotLocked_open() public {
        _createMatch(ID);
        _join(ID, players[0]); // still Open, not full
        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking); // hoist: settleDigest is a view call
        vm.expectRevert(MatchEscrow.MatchNotLocked.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_settle_revertsMatchNotLocked_none() public {
        address[4] memory ranking = _players();
        bytes memory sig = _sign(ID, ranking);
        vm.expectRevert(MatchEscrow.MatchNotLocked.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_settle_revertsBadSignature_wrongSigner() public {
        _lock(ID);
        (, uint256 attackerPk) = makeAddrAndKey("attacker");
        address[4] memory ranking = _players();
        bytes memory sig = _signWith(attackerPk, ID, ranking);
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_settle_revertsBadSignature_tamperedRanking() public {
        _lock(ID);
        address[4] memory signedRanking = _players();
        bytes memory sig = _sign(ID, signedRanking); // signature over the honest order

        address[4] memory submitted = _players();
        (submitted[0], submitted[1]) = (submitted[1], submitted[0]); // swap winner/runner-up
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(ID, submitted, sig);
    }

    function test_settle_revertsBadSignature_tamperedMatchId() public {
        _lock(ID);
        address[4] memory ranking = _players();
        // signature is over a DIFFERENT matchId → digest for ID won't recover the signer
        bytes memory sig = _sign(keccak256("other-match"), ranking);
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_settle_revertsRankingNotPermutation_nonPlayer() public {
        _lock(ID);
        address[4] memory ranking = _players();
        ranking[3] = makeAddr("outsider"); // not one of the escrowed players
        // sign the bad ranking so the signature check passes and we reach the permutation guard
        bytes memory sig = _sign(ID, ranking);
        vm.expectRevert(MatchEscrow.RankingNotPermutation.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_settle_revertsRankingNotPermutation_duplicate() public {
        _lock(ID);
        address[4] memory ranking = _players();
        ranking[1] = ranking[0]; // duplicate a real player (all still isPlayer)
        bytes memory sig = _sign(ID, ranking);
        vm.expectRevert(MatchEscrow.RankingNotPermutation.selector);
        escrow.settle(ID, ranking, sig);
    }

    function test_settle_revertsAfterSettled() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        // second settle: status is Settled, not Locked
        bytes memory sig = _sign(ID, ranking);
        vm.expectRevert(MatchEscrow.MatchNotLocked.selector);
        escrow.settle(ID, ranking, sig);
    }

    // ─────────────────────────────── withdrawPayout ────────────────────────

    function test_withdrawPayout_revertsNoPayout() public {
        vm.prank(makeAddr("nobody"));
        vm.expectRevert(MatchEscrow.NoPayout.selector);
        escrow.withdrawPayout();
    }

    function test_withdrawPayout_exactTransferAndDecrement() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));

        uint256 winnerBefore = players[0].balance;
        uint256 pendingBefore = escrow.totalPending();
        uint256 escrowBalBefore = address(escrow).balance;

        vm.expectEmit(address(escrow));
        emit MatchEscrow.PayoutWithdrawn(players[0], 2 ether);
        vm.prank(players[0]);
        escrow.withdrawPayout();

        assertEq(players[0].balance, winnerBefore + 2 ether, "exact reward paid");
        assertEq(escrow.pendingPayouts(players[0]), 0, "credit cleared");
        assertEq(escrow.totalPending(), pendingBefore - 2 ether, "totalPending decremented");
        assertEq(address(escrow).balance, escrowBalBefore - 2 ether);
        _assertBalanceInvariant();

        // draining again reverts
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.NoPayout.selector);
        escrow.withdrawPayout();
    }

    function test_withdrawPayout_treasuryPullsFee() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));

        uint256 tBefore = treasury.balance;
        vm.prank(treasury);
        escrow.withdrawPayout();
        assertEq(treasury.balance, tBefore + FEE);
        assertEq(escrow.pendingPayouts(treasury), 0);
        _assertBalanceInvariant();
    }

    function test_withdrawPayout_allSeatsDrainToZero() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));

        vm.prank(treasury);
        escrow.withdrawPayout();
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(players[i]);
            escrow.withdrawPayout();
        }
        assertEq(escrow.totalPending(), 0);
        assertEq(address(escrow).balance, 0, "fully distributed, no dust");
    }

    // ──────────────────────────────── refund ───────────────────────────────

    function test_refund_revertsRefundTooEarly() public {
        _lock(ID);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.RefundTooEarly.selector);
        escrow.refund(ID);
    }

    function test_refund_afterWindowFlipsCancelledAndCredits() public {
        _lock(ID);
        vm.warp(block.timestamp + WINDOW + 1);

        vm.expectEmit(address(escrow));
        emit MatchEscrow.MatchCancelled(ID);
        vm.expectEmit(address(escrow));
        emit MatchEscrow.RefundCredited(ID, players[0], ENTRY);
        vm.prank(players[0]);
        escrow.refund(ID);

        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Cancelled));
        assertEq(escrow.pendingPayouts(players[0]), ENTRY);
        assertEq(escrow.escrowed(), 3 ether);
        assertEq(escrow.totalPending(), 1 ether);
        assertFalse(escrow.hasPaid(ID, players[0]));
        _assertBalanceInvariant();
    }

    function test_refund_allFourCanRefund() public {
        _lock(ID);
        vm.warp(block.timestamp + WINDOW + 1);
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(players[i]);
            escrow.refund(ID);
            assertEq(escrow.pendingPayouts(players[i]), ENTRY);
        }
        assertEq(escrow.escrowed(), 0);
        assertEq(escrow.totalPending(), 4 ether);
        _assertBalanceInvariant();

        // and everyone can then pull their deposit back
        for (uint256 i = 0; i < 4; i++) {
            uint256 before = players[i].balance;
            vm.prank(players[i]);
            escrow.withdrawPayout();
            assertEq(players[i].balance, before + ENTRY);
        }
        assertEq(address(escrow).balance, 0);
    }

    function test_refund_revertsNothingToRefund_nonPayer() public {
        _lock(ID);
        vm.warp(block.timestamp + WINDOW + 1);
        // a non-listed address: the status flip is attempted but the whole tx reverts
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(MatchEscrow.NothingToRefund.selector);
        escrow.refund(ID);
        // revert rolled the status flip back
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Locked));
    }

    function test_refund_revertsNothingToRefund_doublePull() public {
        _lock(ID);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(players[0]);
        escrow.refund(ID);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.NothingToRefund.selector);
        escrow.refund(ID);
    }

    function test_refund_revertsNotRefundable_settled() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.NotRefundable.selector);
        escrow.refund(ID);
    }

    // ─────────────────────────────── cancelMatch ───────────────────────────

    function test_cancelMatch_revertsNotOwner() public {
        _createMatch(ID);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.cancelMatch(ID);
    }

    function test_cancelMatch_revertsNotRefundable_none() public {
        vm.expectRevert(MatchEscrow.NotRefundable.selector);
        escrow.cancelMatch(ID);
    }

    function test_cancelMatch_revertsNotRefundable_settled() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        vm.expectRevert(MatchEscrow.NotRefundable.selector);
        escrow.cancelMatch(ID);
    }

    function test_cancelMatch_openEnablesImmediateRefund() public {
        _createMatch(ID);
        _join(ID, players[0]);
        _join(ID, players[1]); // still Open, 2 paid

        vm.expectEmit(address(escrow));
        emit MatchEscrow.MatchCancelled(ID);
        escrow.cancelMatch(ID); // owner, no window wait

        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Cancelled));

        // paid players refund immediately (no RefundTooEarly)
        vm.prank(players[0]);
        escrow.refund(ID);
        vm.prank(players[1]);
        escrow.refund(ID);
        assertEq(escrow.escrowed(), 0);
        assertEq(escrow.totalPending(), 2 ether);

        // a listed player who never paid gets nothing
        vm.prank(players[2]);
        vm.expectRevert(MatchEscrow.NothingToRefund.selector);
        escrow.refund(ID);
        _assertBalanceInvariant();
    }

    function test_cancelMatch_lockedEnablesImmediateRefund() public {
        _lock(ID);
        escrow.cancelMatch(ID);
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Cancelled));
        vm.prank(players[0]);
        escrow.refund(ID); // immediate, no window
        assertEq(escrow.pendingPayouts(players[0]), ENTRY);
    }

    // ──────────────────────────────── admin ────────────────────────────────

    function test_setAuthorized_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.setAuthorized(operator, false);
    }

    function test_setAuthorized_revertsZeroAddress() public {
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        escrow.setAuthorized(address(0), true);
    }

    function test_setAuthorized_grantsRevokesAndEmits() public {
        address op2 = makeAddr("op2");
        vm.expectEmit(address(escrow));
        emit MatchEscrow.AuthorizedChanged(op2, true);
        escrow.setAuthorized(op2, true);
        assertTrue(escrow.authorized(op2));

        vm.expectEmit(address(escrow));
        emit MatchEscrow.AuthorizedChanged(operator, false);
        escrow.setAuthorized(operator, false);
        assertFalse(escrow.authorized(operator));

        // revoked operator can no longer open matches
        vm.prank(operator);
        vm.expectRevert(MatchEscrow.NotAuthorized.selector);
        escrow.createMatch(ID, _players());
    }

    function test_setTrustedSigner_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.setTrustedSigner(makeAddr("x"));
    }

    function test_setTrustedSigner_revertsZeroAddress() public {
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        escrow.setTrustedSigner(address(0));
    }

    function test_setTrustedSigner_rotatesKeyAndEmits() public {
        (address newSigner, uint256 newPk) = makeAddrAndKey("newSigner");
        vm.expectEmit(address(escrow));
        emit MatchEscrow.TrustedSignerChanged(newSigner);
        escrow.setTrustedSigner(newSigner);
        assertEq(escrow.trustedSigner(), newSigner);

        // new key now settles; old key is rejected
        _lock(ID);
        address[4] memory ranking = _players();

        bytes memory oldSig = _sign(ID, ranking); // old signerPk
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(ID, ranking, oldSig);

        bytes memory newSig = _signWith(newPk, ID, ranking);
        escrow.settle(ID, ranking, newSig);
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Settled));
    }

    function test_setTreasury_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.setTreasury(makeAddr("x"));
    }

    function test_setTreasury_revertsZeroAddress() public {
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
    }

    function test_setTreasury_redirectsFeeAndEmits() public {
        address newTreasury = makeAddr("newTreasury");
        vm.expectEmit(address(escrow));
        emit MatchEscrow.TreasuryChanged(newTreasury);
        escrow.setTreasury(newTreasury);
        assertEq(escrow.treasury(), newTreasury);

        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        assertEq(escrow.pendingPayouts(newTreasury), FEE, "fee to new treasury");
        assertEq(escrow.pendingPayouts(treasury), 0, "old treasury unpaid");
    }

    function test_setSettleWindow_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.setSettleWindow(1);
    }

    function test_setSettleWindow_setsAndEmits() public {
        vm.expectEmit(address(escrow));
        emit MatchEscrow.SettleWindowChanged(2 days);
        escrow.setSettleWindow(2 days);
        assertEq(escrow.settleWindow(), 2 days);
    }

    function test_setPayoutConfig_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.setPayoutConfig(FEE, _defaultRewards());
    }

    function test_setPayoutConfig_revertsInvalidSum() public {
        uint256[4] memory r = _defaultRewards();
        r[0] = 3 ether; // Σ = 4.8; + 0.2 fee = 5.0 != 4
        vm.expectRevert(MatchEscrow.InvalidPayoutConfig.selector);
        escrow.setPayoutConfig(FEE, r);
    }

    function test_setPayoutConfig_retunesDistribution() public {
        // winner-takes-all: fee 0, rewards [4,0,0,0]
        uint256[4] memory r;
        r[0] = 4 ether;

        vm.expectEmit(address(escrow));
        emit MatchEscrow.PayoutConfigChanged(0, r);
        escrow.setPayoutConfig(0, r);
        assertEq(escrow.platformFee(), 0);
        uint256[4] memory stored = escrow.getRewards();
        assertEq(stored[0], 4 ether);
        assertEq(stored[3], 0);

        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        assertEq(escrow.pendingPayouts(players[0]), 4 ether, "winner takes all");
        assertEq(escrow.pendingPayouts(players[1]), 0);
        assertEq(escrow.pendingPayouts(treasury), 0, "no fee");
        _assertBalanceInvariant();
    }

    // ──────────────────────────────── pausing ──────────────────────────────

    function test_pause_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.pause();
    }

    function test_pause_blocksCreateMatch() public {
        escrow.pause();
        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.createMatch(ID, _players());
    }

    function test_pause_blocksJoinMatch() public {
        _createMatch(ID);
        escrow.pause();
        vm.prank(players[0]);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.joinMatch{value: ENTRY}(ID);
    }

    function test_pause_refundStillWorks() public {
        _lock(ID);
        vm.warp(block.timestamp + WINDOW + 1);
        escrow.pause();
        vm.prank(players[0]);
        escrow.refund(ID); // never pausable
        assertEq(escrow.pendingPayouts(players[0]), ENTRY);
    }

    function test_pause_withdrawStillWorks() public {
        _lock(ID);
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        escrow.pause();
        uint256 before = players[0].balance;
        vm.prank(players[0]);
        escrow.withdrawPayout(); // never pausable
        assertEq(players[0].balance, before + 2 ether);
    }

    function test_pause_settleStillWorks() public {
        // settle() has no whenNotPaused guard — a paused contract can still resolve
        // an already-locked match (the escrowed funds must always be releasable)
        _lock(ID);
        escrow.pause();
        address[4] memory ranking = _players();
        escrow.settle(ID, ranking, _sign(ID, ranking));
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Settled));
    }

    function test_unpause_restoresCreateAndJoin() public {
        escrow.pause();
        escrow.unpause();
        _createMatch(ID);
        _join(ID, players[0]);
        assertEq(escrow.paidCount(ID), 1);
    }

    // ─────────────────────── ownership (Ownable2Step) ──────────────────────

    function test_renounceOwnership_revertsRenounceDisabled() public {
        vm.expectRevert(MatchEscrow.RenounceDisabled.selector);
        escrow.renounceOwnership();
    }

    function test_renounceOwnership_revertsNotOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.renounceOwnership();
    }

    function test_transferOwnership_isTwoStep() public {
        address newOwner = makeAddr("newOwner");
        escrow.transferOwnership(newOwner);
        assertEq(escrow.owner(), address(this), "owner unchanged until accept");
        assertEq(escrow.pendingOwner(), newOwner);

        // old owner still in control until acceptance
        escrow.setSettleWindow(3 hours);

        vm.prank(newOwner);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), newOwner);
        assertEq(escrow.pendingOwner(), address(0));

        // new owner can administer; old owner cannot
        vm.prank(newOwner);
        escrow.setSettleWindow(4 hours);
        assertEq(escrow.settleWindow(), 4 hours);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        escrow.setSettleWindow(5 hours);
    }

    function test_acceptOwnership_revertsWrongCaller() public {
        escrow.transferOwnership(makeAddr("newOwner"));
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        escrow.acceptOwnership();
    }

    // ─────────────── pull-payment isolation (RevertingReceiver) ─────────────

    function test_settle_revertingReceiverCannotBrickSettlement() public {
        RevertingReceiver rr = new RevertingReceiver(escrow);

        // custom roster: the contract player takes seat 0 (the winner slot)
        address[4] memory roster;
        roster[0] = address(rr);
        roster[1] = players[1];
        roster[2] = players[2];
        roster[3] = players[3];

        vm.prank(operator);
        escrow.createMatch(ID, roster);

        rr.join{value: ENTRY}(ID); // contract player deposits via forwarding
        _join(ID, players[1]);
        _join(ID, players[2]);
        _join(ID, players[3]);
        assertEq(uint8(escrow.getStatus(ID)), uint8(MatchEscrow.Status.Locked));

        // settle credits the reverting receiver in pendingPayouts — never sends AVAX
        bytes memory sig = _sign(ID, roster);
        escrow.settle(ID, roster, sig);
        assertEq(escrow.pendingPayouts(address(rr)), 2 ether, "winner credited despite rejecting AVAX");

        // its own pull reverts (isolated), but everyone else can still be paid
        vm.expectRevert(bytes("transfer failed"));
        rr.withdraw();

        uint256 before = players[1].balance;
        vm.prank(players[1]);
        escrow.withdrawPayout();
        assertEq(players[1].balance, before + 1 ether, "other player unaffected");

        // once the receiver accepts AVAX it can pull its credit
        rr.setAccept(true);
        rr.withdraw();
        assertEq(address(rr).balance, 2 ether);
        assertEq(escrow.pendingPayouts(address(rr)), 0);
    }

    // ──────────────────────────────── fuzz ─────────────────────────────────

    function test_fuzz_joinMatch_wrongFeeReverts(uint256 amount) public {
        amount = bound(amount, 0, 5 ether);
        vm.assume(amount != ENTRY);
        _createMatch(ID);
        vm.deal(players[0], amount + 1 ether);
        vm.prank(players[0]);
        vm.expectRevert(MatchEscrow.WrongEntryFee.selector);
        escrow.joinMatch{value: amount}(ID);
    }

    function test_fuzz_settle_anyPermutationPaysByPosition(uint256 seed) public {
        _lock(ID);
        address[4] memory ranking = _permute(seed);
        bytes memory sig = _sign(ID, ranking);
        escrow.settle(ID, ranking, sig);

        uint256[4] memory r = escrow.getRewards();
        // each position credits exactly rewards[i]; players are distinct so no aliasing
        for (uint256 i = 0; i < 4; i++) {
            assertEq(escrow.pendingPayouts(ranking[i]), r[i], "position reward");
        }
        assertEq(escrow.pendingPayouts(treasury), FEE);
        assertEq(escrow.escrowed(), 0);
        assertEq(escrow.totalPending(), 4 ether);
        _assertBalanceInvariant();
    }

    function test_fuzz_settle_wrongSignerAlwaysReverts(uint256 pk) public {
        // any key that isn't the trusted signer must be rejected
        pk = bound(pk, 1, uint256(115792089237316195423570985008687907852837564279074904382605163141518161494337 - 1));
        vm.assume(vm.addr(pk) != signer);
        _lock(ID);
        address[4] memory ranking = _players();
        bytes memory sig = _signWith(pk, ID, ranking);
        vm.expectRevert(MatchEscrow.BadSignature.selector);
        escrow.settle(ID, ranking, sig);
    }
}
