// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {BondingCurvePool} from "../../src/BondingCurvePool.sol";
import {MockJoeRouter} from "../mocks/MockJoeRouter.sol";

// ─── Stub factory ─────────────────────────────────────────────────────────────
contract StubFactory4 { function paused() external pure returns (bool) { return false; } }

// ─── Always-reverting treasury ────────────────────────────────────────────────
// Points pool.withdrawFees toward this → _sendAvax will always revert with
// TransferFailed.  pendingFees is rolled back on revert, so the accounting
// identity balance == realAvax + pendingFees must still hold.
contract RevertingTreasury {
    receive() external payable { revert("treasury rejects"); }
}

// ─── Adversarial handler ─────────────────────────────────────────────────────
// Two pools are under test simultaneously:
//   pool1 — normal treasury, extreme buy/sell amounts (1 wei up to max balance)
//   pool2 — reverting treasury (withdrawFees always reverts)
//
// All actions use try/catch so a reverted tx never aborts the fuzzer run.
// The handler does NOT prevent graduation: if graduation fires, the invariant
// check adapts (graduated pool balance goes to 0 as AVAX left for LP).
contract AdversarialHandler is Test {
    BondingCurvePool public pool1; // normal treasury
    BondingCurvePool public pool2; // reverting treasury
    LaunchToken      public token1;
    LaunchToken      public token2;

    address[] public actors;
    uint256 constant CURVE = 800_000_000e18;

    constructor(
        BondingCurvePool _pool1, LaunchToken _token1,
        BondingCurvePool _pool2, LaunchToken _token2
    ) {
        pool1  = _pool1; token1 = _token1;
        pool2  = _pool2; token2 = _token2;
        for (uint160 i = 1; i <= 5; i++) {
            actors.push(address(i));
            vm.deal(address(i), 10_000e18);
        }
    }

    // ── adversarial buy: 1 wei, near-threshold, and arbitrary ────────────────

    function buy1(uint256 actorSeed, uint256 amt) external {
        _buy(pool1, actorSeed, amt);
    }

    function buy2(uint256 actorSeed, uint256 amt) external {
        _buy(pool2, actorSeed, amt);
    }

    function _buy(BondingCurvePool p, uint256 actorSeed, uint256 amt) internal {
        if (uint256(p.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        // Exercise full range: 1 wei → extreme values.
        // bound to [1, min(actor.balance, 200e18)] to avoid OOM on actor.
        amt = bound(amt, 1, a.balance > 200e18 ? 200e18 : a.balance);
        if (amt == 0) return;
        vm.prank(a);
        try p.buy{value: amt}(0, block.timestamp) {} catch {}
    }

    // ── boundary buy: exactly 1 wei ───────────────────────────────────────────
    function buy1_oneWei(uint256 actorSeed) external {
        if (uint256(pool1.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        vm.prank(a);
        try pool1.buy{value: 1}(0, block.timestamp) {} catch {}
    }

    // ── adversarial sell: 1 token, all tokens, arbitrary ─────────────────────

    function sell1(uint256 actorSeed, uint256 amt) external {
        _sell(pool1, token1, actorSeed, amt);
    }

    function sell2(uint256 actorSeed, uint256 amt) external {
        _sell(pool2, token2, actorSeed, amt);
    }

    function _sell(BondingCurvePool p, LaunchToken t, uint256 actorSeed, uint256 amt) internal {
        if (uint256(p.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        uint256 bal = t.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.startPrank(a);
        t.approve(address(p), amt);
        try p.sell(amt, 0, block.timestamp) {} catch {}
        vm.stopPrank();
    }

    // ── withdrawFees ──────────────────────────────────────────────────────────
    // pool1: should succeed (normal treasury)
    // pool2: will always revert (RevertingTreasury); caught here
    function withdrawFees1() external {
        try pool1.withdrawFees() {} catch {}
    }
    function withdrawFees2() external {
        try pool2.withdrawFees() {} catch {}
    }
}

// ─── Invariant test ───────────────────────────────────────────────────────────
contract AdversarialInvariantTest is Test {
    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP    = 200_000_000e18;

    BondingCurvePool pool1;
    BondingCurvePool pool2;
    LaunchToken      token1;
    LaunchToken      token2;
    AdversarialHandler handler;

    function setUp() public {
        LaunchToken      tImpl = new LaunchToken();
        BondingCurvePool pImpl = new BondingCurvePool();
        MockJoeRouter    router = new MockJoeRouter();
        StubFactory4     sf     = new StubFactory4();
        RevertingTreasury badTreasury = new RevertingTreasury();

        // Pool 1: normal treasury (address(0xABCD))
        token1 = LaunchToken(Clones.clone(address(tImpl)));
        pool1  = BondingCurvePool(payable(Clones.clone(address(pImpl))));
        token1.initialize("ADV1", "ADV1", TOTAL, address(pool1));
        pool1.initialize(BondingCurvePool.InitParams({
            factory: address(sf),
            token: address(token1),
            vAvax0: 30e18,
            y0: 1_073_000_000e18,
            curveSupply: CURVE,
            lpReserve: LP,
            graduationThreshold: 60e18,
            tradingFeeBps: 100,
            treasury: address(0xABCD),
            joeRouter: address(router)
        }));

        // Pool 2: reverting treasury — withdrawFees always fails
        token2 = LaunchToken(Clones.clone(address(tImpl)));
        pool2  = BondingCurvePool(payable(Clones.clone(address(pImpl))));
        token2.initialize("ADV2", "ADV2", TOTAL, address(pool2));
        pool2.initialize(BondingCurvePool.InitParams({
            factory: address(sf),
            token: address(token2),
            vAvax0: 30e18,
            y0: 1_073_000_000e18,
            curveSupply: CURVE,
            lpReserve: LP,
            graduationThreshold: 60e18,
            tradingFeeBps: 100,
            treasury: address(badTreasury),
            joeRouter: address(router)
        }));

        handler = new AdversarialHandler(pool1, token1, pool2, token2);
        targetContract(address(handler));
    }

    // ── Invariant 1: state-aware solvency.
    //
    // During Trading:   balance == realAvax + pendingFees
    //   (all AVAX in the pool is either live reserve or accrued fees)
    //
    // After Graduated:  balance == pendingFees
    //   _graduate() sends the full realAvax to WAVAX as LP seed, but the
    //   realAvax field is NOT reset to zero (it is a bonding-curve bookkeeper,
    //   no longer meaningful post-graduation).  Any pendingFees that were not
    //   withdrawn before graduation still sit in the pool until withdrawFees
    //   is called.
    //
    // This is EXPECTED CONTRACT DESIGN, not a bug.  The existing PoolInvariant
    // avoids graduation; this handler allows it and uses the correct state-aware
    // predicate instead.

    function _assertSolvent(BondingCurvePool p, string memory label) internal view {
        if (uint256(p.state()) == 0) {
            // Trading: exact accounting identity
            assertEq(
                address(p).balance,
                p.realAvax() + p.pendingFees(),
                string.concat(label, ": trading solvency violated")
            );
        } else {
            // Graduated: realAvax was deposited to WAVAX; only pendingFees remain
            assertEq(
                address(p).balance,
                p.pendingFees(),
                string.concat(label, ": graduated balance should equal pendingFees only")
            );
        }
    }

    function invariant_solvent_pool1() public view {
        _assertSolvent(pool1, "pool1");
    }

    function invariant_solvent_pool2() public view {
        _assertSolvent(pool2, "pool2 (reverting treasury)");
    }

    // ── Invariant 2: supply conservation (only while Trading).
    //    tokensSold never exceeds curveSupply, and the pool holds exactly
    //    TOTAL − tokensSold tokens while in Trading state.
    function invariant_supplyConserved_pool1() public view {
        if (uint256(pool1.state()) == 0) { // State.Trading
            assertLe(pool1.tokensSold(), CURVE, "pool1: tokensSold exceeds curveSupply");
            assertEq(
                token1.balanceOf(address(pool1)),
                TOTAL - pool1.tokensSold(),
                "pool1: token balance mismatch"
            );
        }
    }

    function invariant_supplyConserved_pool2() public view {
        if (uint256(pool2.state()) == 0) { // State.Trading
            assertLe(pool2.tokensSold(), CURVE, "pool2: tokensSold exceeds curveSupply");
            assertEq(
                token2.balanceOf(address(pool2)),
                TOTAL - pool2.tokensSold(),
                "pool2: token balance mismatch"
            );
        }
    }

    // ── Invariant 3: reverting treasury never corrupts accounting.
    //    Fees accumulate in pendingFees and stay there (stuck but not lost).
    //    The state-aware solvency check above already covers pool2; this
    //    invariant adds an explicit check that pendingFees is never negative
    //    (impossible in Solidity, but asserting it documents the expectation)
    //    and that pool2 never holds MORE AVAX than pendingFees (post-graduation).
    function invariant_revertingTreasury_feesNeverNegative() public view {
        // pendingFees is uint256 so underflow would revert, but document intent.
        // Also verify that if graduated, no extra AVAX is stranded beyond pendingFees.
        if (uint256(pool2.state()) != 0) { // Graduated
            assertLe(
                address(pool2).balance,
                pool2.pendingFees(),
                "pool2 graduated: balance must not exceed pendingFees"
            );
        }
    }
}
