// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MatchEscrow} from "../src/MatchEscrow.sol";

/// Fuzz suite for MatchEscrow's payout math and money-conservation invariants.
///
/// Owner is the test contract (so admin calls need no prank); `operator` is an
/// authorized match-opener; (signer, signerPk) is the trusted server key so we
/// can produce real ECDSA signatures over settleDigest.
contract PayoutFuzzTest is Test {
    MatchEscrow escrow;

    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address signer;
    uint256 signerPk;

    address p1 = makeAddr("p1");
    address p2 = makeAddr("p2");
    address p3 = makeAddr("p3");
    address p4 = makeAddr("p4");

    uint256 constant ENTRY_FEE = 1 ether;
    uint256 constant POOL = 4 * ENTRY_FEE;

    uint256[4] defaultRewards;

    function setUp() public {
        (signer, signerPk) = makeAddrAndKey("signer");

        uint256[4] memory r;
        r[0] = 2e18;
        r[1] = 1e18;
        r[2] = 0.5e18;
        r[3] = 0.3e18;
        defaultRewards = r;

        // platformFee 0.2 + (2 + 1 + 0.5 + 0.3) == 4 == PLAYERS * entryFee
        escrow = new MatchEscrow(address(this), signer, treasury, ENTRY_FEE, 1 hours, 0.2 ether, r);
        escrow.setAuthorized(operator, true);

        vm.deal(p1, 100 ether);
        vm.deal(p2, 100 ether);
        vm.deal(p3, 100 ether);
        vm.deal(p4, 100 ether);
    }

    // ───────────────────────────────── Helpers ─────────────────────────────────

    function _players() internal view returns (address[4] memory pl) {
        pl[0] = p1;
        pl[1] = p2;
        pl[2] = p3;
        pl[3] = p4;
    }

    function _sign(bytes32 matchId, address[4] memory ranking) internal view returns (bytes memory) {
        bytes32 d = escrow.settleDigest(matchId, ranking);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(signerPk, d);
        return abi.encodePacked(rr, ss, v);
    }

    /// Create a match as the operator and drive all four listed players to join,
    /// leaving the match Locked and ready to settle.
    function _createAndFill(bytes32 id, address[4] memory players) internal {
        vm.prank(operator);
        escrow.createMatch(id, players);
        uint256 fee = escrow.entryFee();
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(players[i]);
            escrow.joinMatch{value: fee}(id);
        }
    }

    /// Carve a valid payout config (fee + Σrewards == pool) out of raw fuzz seeds.
    function _validSplit(uint256 pool, uint256 feeSeed, uint256 r0Seed, uint256 r1Seed, uint256 r2Seed)
        internal
        pure
        returns (uint256 fee, uint256[4] memory r)
    {
        fee = bound(feeSeed, 0, pool);
        uint256 rem = pool - fee;
        r[0] = bound(r0Seed, 0, rem);
        rem -= r[0];
        r[1] = bound(r1Seed, 0, rem);
        rem -= r[1];
        r[2] = bound(r2Seed, 0, rem);
        rem -= r[2];
        r[3] = rem;
    }

    /// idx-th permutation (Lehmer/factoradic) of a distinct 4-tuple.
    function _permutation(address[4] memory base, uint256 idx)
        internal
        pure
        returns (address[4] memory out)
    {
        idx = idx % 24;
        uint256[4] memory facts = [uint256(6), 2, 1, 1];
        bool[4] memory used;
        for (uint256 slot = 0; slot < 4; slot++) {
            uint256 d = idx / facts[slot];
            idx = idx % facts[slot];
            uint256 count = 0;
            for (uint256 k = 0; k < 4; k++) {
                if (used[k]) continue;
                if (count == d) {
                    out[slot] = base[k];
                    used[k] = true;
                    break;
                }
                count++;
            }
        }
    }

    function _assertIdentity() internal view {
        assertEq(
            address(escrow).balance,
            escrow.escrowed() + escrow.totalPending(),
            "balance != escrowed + totalPending"
        );
    }

    // ─────────────────── (1) setPayoutConfig accepts iff identity ───────────────

    /// The contract accepts a config exactly when fee + Σrewards == PLAYERS*entryFee,
    /// and reverts InvalidPayoutConfig otherwise. Bounds keep the sum small so the
    /// accept branch is reachable while the revert branch dominates.
    function test_fuzz_setPayoutConfig_matchesIdentity(
        uint256 fee,
        uint256 r0,
        uint256 r1,
        uint256 r2,
        uint256 r3
    ) public {
        fee = bound(fee, 0, 2 * POOL);
        r0 = bound(r0, 0, 2 * POOL);
        r1 = bound(r1, 0, 2 * POOL);
        r2 = bound(r2, 0, 2 * POOL);
        r3 = bound(r3, 0, 2 * POOL);

        uint256[4] memory r;
        r[0] = r0;
        r[1] = r1;
        r[2] = r2;
        r[3] = r3;
        uint256 sum = fee + r0 + r1 + r2 + r3;

        if (sum == POOL) {
            escrow.setPayoutConfig(fee, r);
            assertEq(escrow.platformFee(), fee, "platformFee stored");
            uint256[4] memory stored = escrow.getRewards();
            for (uint256 i = 0; i < 4; i++) assertEq(stored[i], r[i], "reward stored");
        } else {
            vm.expectRevert(MatchEscrow.InvalidPayoutConfig.selector);
            escrow.setPayoutConfig(fee, r);
        }
    }

    /// Any split that is constructed to satisfy the identity is always accepted
    /// and stored verbatim (guarantees the accept branch is exercised every run).
    function test_fuzz_setPayoutConfig_validSplitAccepted(
        uint256 feeSeed,
        uint256 r0Seed,
        uint256 r1Seed,
        uint256 r2Seed
    ) public {
        (uint256 fee, uint256[4] memory r) = _validSplit(POOL, feeSeed, r0Seed, r1Seed, r2Seed);
        assertEq(fee + r[0] + r[1] + r[2] + r[3], POOL, "constructed split is exact");

        escrow.setPayoutConfig(fee, r);
        assertEq(escrow.platformFee(), fee);
        uint256[4] memory stored = escrow.getRewards();
        for (uint256 i = 0; i < 4; i++) assertEq(stored[i], r[i]);
    }

    // ─────────────── (2) any valid config splits exactly the pool ───────────────

    function test_fuzz_settle_creditsExactlyThePool(
        uint256 feeSeed,
        uint256 r0Seed,
        uint256 r1Seed,
        uint256 r2Seed
    ) public {
        (uint256 fee, uint256[4] memory r) = _validSplit(POOL, feeSeed, r0Seed, r1Seed, r2Seed);
        escrow.setPayoutConfig(fee, r);

        address[4] memory players = _players();
        bytes32 id = keccak256("cfg-match");
        _createAndFill(id, players);

        escrow.settle(id, players, _sign(id, players));

        // treasury and the four players are all distinct, so credits don't collide
        assertEq(escrow.pendingPayouts(treasury), fee, "treasury == platformFee");
        uint256 credited = fee;
        for (uint256 i = 0; i < 4; i++) {
            assertEq(escrow.pendingPayouts(players[i]), r[i], "player == rewards[i]");
            credited += r[i];
        }
        assertEq(credited, POOL, "credits sum to the pool, zero remainder");
        assertEq(escrow.escrowed(), 0, "escrow fully drained into pending");
        assertEq(escrow.totalPending(), POOL, "whole pool now pending");
        _assertIdentity();
    }

    // ─────────── (3) accounting identity across a fuzzed op sequence ────────────

    /// Drives a fuzzed sequence of create/join/refund/settle/withdraw calls (each
    /// wrapped so reverts are no-ops that can't change state) and asserts the core
    /// solvency identity balance == escrowed + totalPending after every single step.
    function test_fuzz_accounting_identityAcrossSequence(uint256 seed) public {
        bytes32[2] memory ids = [keccak256("seq-A"), keccak256("seq-B")];
        address[4] memory players = _players();

        _assertIdentity();
        for (uint256 step = 0; step < 24; step++) {
            uint256 s = uint256(keccak256(abi.encode(seed, step)));
            uint256 action = s % 6;
            bytes32 id = ids[(s >> 8) & 1];
            uint256 pIdx = (s >> 16) % 4;

            if (action == 0) {
                vm.prank(operator);
                try escrow.createMatch(id, players) {} catch {}
            } else if (action == 1 || action == 2) {
                vm.prank(players[pIdx]);
                try escrow.joinMatch{value: escrow.entryFee()}(id) {} catch {}
            } else if (action == 3) {
                // advance time so stuck matches can cross the settle window, then refund
                vm.warp(block.timestamp + 40 minutes);
                vm.prank(players[pIdx]);
                try escrow.refund(id) {} catch {}
            } else if (action == 4) {
                // ranking == the (identical) escrowed player set: a valid permutation
                try escrow.settle(id, players, _sign(id, players)) {} catch {}
            } else {
                address who = ((s >> 24) % 5 == 0) ? treasury : players[pIdx];
                vm.prank(who);
                try escrow.withdrawPayout() {} catch {}
            }

            _assertIdentity();
        }
    }

    // ─────────── (4) fuzz entryFee: pool math never overflows, exact split ──────

    function test_fuzz_entryFee_poolDistributesExactly(
        uint256 entryFeeSeed,
        uint256 feeSeed,
        uint256 r0Seed,
        uint256 r1Seed,
        uint256 r2Seed
    ) public {
        // entryFee up to type(uint256).max / 4 so PLAYERS*entryFee can never overflow
        uint256 entryFee = bound(entryFeeSeed, 1, type(uint256).max / 4);
        uint256 pool = 4 * entryFee;
        (uint256 fee, uint256[4] memory r) = _validSplit(pool, feeSeed, r0Seed, r1Seed, r2Seed);

        // fresh deploy (entryFee is immutable); reassign so _sign binds to it
        escrow = new MatchEscrow(address(this), signer, treasury, entryFee, 1 hours, fee, r);
        escrow.setAuthorized(operator, true);
        assertEq(escrow.entryFee(), entryFee);

        address[4] memory players = _players();
        for (uint256 i = 0; i < 4; i++) vm.deal(players[i], entryFee);

        bytes32 id = keccak256("big-fee-match");
        _createAndFill(id, players);
        assertEq(address(escrow).balance, pool, "escrow holds exactly the pool");

        escrow.settle(id, players, _sign(id, players));

        uint256 credited = escrow.pendingPayouts(treasury);
        assertEq(credited, fee, "treasury == platformFee");
        for (uint256 i = 0; i < 4; i++) {
            assertEq(escrow.pendingPayouts(players[i]), r[i]);
            credited += r[i];
        }
        assertEq(credited, pool, "distributed exactly the pool");
        assertEq(escrow.escrowed(), 0);
        assertEq(escrow.totalPending(), pool);
        _assertIdentity();
    }

    // ─────────── (5) fuzz full ranking permutation: position -> reward ──────────

    function test_fuzz_ranking_permutationPaysByPosition(uint256 permSeed) public {
        address[4] memory base = _players();
        address[4] memory ranking = _permutation(base, permSeed);

        // sanity: the permutation is a distinct reordering of the same four players
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = i + 1; j < 4; j++) {
                assertTrue(ranking[i] != ranking[j], "permutation has no repeats");
            }
        }

        bytes32 id = keccak256("perm-match");
        _createAndFill(id, base);
        escrow.settle(id, ranking, _sign(id, ranking));

        uint256[4] memory r = escrow.getRewards();
        for (uint256 i = 0; i < 4; i++) {
            // finishing position i (1st..4th) is paid rewards[i]
            assertEq(escrow.pendingPayouts(ranking[i]), r[i], "position pays rewards[pos]");
        }
        assertEq(escrow.pendingPayouts(treasury), escrow.platformFee(), "treasury == fee");
        _assertIdentity();
    }
}
