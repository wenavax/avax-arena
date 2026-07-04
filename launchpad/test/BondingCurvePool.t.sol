// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {BondingCurvePool} from "../src/BondingCurvePool.sol";
import {CurveMath} from "../src/libraries/CurveMath.sol";
import {MockJoeRouter} from "./mocks/MockJoeRouter.sol";
import {MockJoePair} from "./mocks/MockJoePair.sol";

contract StubFactory {
    bool public paused;
    function setPaused(bool p) external { paused = p; }
}

contract BondingCurvePoolTest is Test {
    LaunchToken tokenImpl;
    BondingCurvePool poolImpl;
    MockJoeRouter router;
    StubFactory factory;

    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP = 200_000_000e18;
    uint256 constant V_AVAX0 = 30e18;
    uint256 constant Y0 = 1_073_000_000e18;
    uint256 constant GRAD = 60e18; // 400e18 unreachable: curve exhausts at ~87.9 AVAX; 60 is safely below that
    uint16 constant FEE = 100; // 1%

    address alice = address(0xA11CE);
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    LaunchToken token;
    BondingCurvePool pool;

    function setUp() public {
        tokenImpl = new LaunchToken();
        poolImpl = new BondingCurvePool();
        router = new MockJoeRouter();
        factory = new StubFactory();

        token = LaunchToken(Clones.clone(address(tokenImpl)));
        pool = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        token.initialize("Meme", "MEME", TOTAL, address(pool));
        pool.initialize(BondingCurvePool.InitParams({
            factory: address(factory),
            token: address(token),
            vAvax0: V_AVAX0,
            y0: Y0,
            curveSupply: CURVE,
            lpReserve: LP,
            graduationThreshold: GRAD,
            tradingFeeBps: FEE,
            treasury: address(0x7),
            joeRouter: address(router)
        }));

        vm.deal(alice, 1000e18);
    }

    function test_buy_transfersTokens_takesFee_advancesReserve() public {
        uint256 sent = 10e18;
        uint256 fee = sent * FEE / 10000;
        uint256 expected = CurveMath.tokensOut(V_AVAX0, Y0, 0, sent - fee);

        vm.prank(alice);
        uint256 out = pool.buy{value: sent}(0, block.timestamp);

        assertEq(out, expected, "tokens out");
        assertEq(token.balanceOf(alice), expected);
        assertEq(pool.realAvax(), sent - fee, "reserve excludes fee");
        assertEq(pool.pendingFees(), fee, "fee accrued as pending");
        assertEq(address(pool).balance, sent, "pool holds reserve + pending fee");
        assertEq(address(0x7).balance, 0, "treasury not paid until withdrawFees");
    }

    function test_buy_revertsOnSlippage() public {
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.Slippage.selector);
        pool.buy{value: 1e18}(type(uint256).max, block.timestamp);
    }

    function test_buy_revertsWhenFactoryPaused() public {
        factory.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.Halted.selector);
        pool.buy{value: 1e18}(0, block.timestamp);
    }

    function test_buy_revertsAfterDeadline() public {
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.Expired.selector);
        pool.buy{value: 1e18}(0, 999);
    }

    function test_sell_returnsAvax_takesFee_reducesReserve() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 10e18}(0, block.timestamp);

        uint256 reserveBefore = pool.realAvax();
        uint256 gross = CurveMath.avaxOut(V_AVAX0, Y0, reserveBefore, bought);
        uint256 fee = gross * FEE / 10000;

        vm.startPrank(alice);
        token.approve(address(pool), bought);
        uint256 got = pool.sell(bought, 0, block.timestamp);
        vm.stopPrank();

        assertEq(got, gross - fee, "net avax to seller");
        assertEq(pool.realAvax(), reserveBefore - gross, "reserve drops by gross");
        assertEq(pool.tokensSold(), 0, "all sold tokens returned");
    }

    function test_sell_worksWhenPaused() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 5e18}(0, block.timestamp);
        factory.setPaused(true); // halt must NOT block exits
        vm.startPrank(alice);
        token.approve(address(pool), bought);
        uint256 got = pool.sell(bought, 0, block.timestamp);
        vm.stopPrank();
        assertGt(got, 0, "sell must remain open under pause");
    }

    function test_sell_revertsOnSlippage() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 5e18}(0, block.timestamp);
        vm.startPrank(alice);
        token.approve(address(pool), bought);
        vm.expectRevert(BondingCurvePool.Slippage.selector);
        pool.sell(bought, type(uint256).max, block.timestamp);
        vm.stopPrank();
    }

    function test_graduation_seedsPair_burnsLp() public {
        vm.prank(alice);
        pool.buy{value: 70e18}(0, block.timestamp);
        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated), "graduated");
        address pair = router.joeFactory().getPair(address(token), address(router.wavax()));
        assertTrue(pair != address(0), "pair created");
        assertEq(MockJoePair(pair).lastMintTo(), DEAD, "LP minted to burn");
        assertEq(token.balanceOf(pair), LP, "pair holds LP token reserve");
        assertGe(router.wavax().balanceOf(pair), GRAD, "pair seeded with >= threshold WAVAX");
    }

    function test_graduation_survivesPreCreatedPair() public {
        // Attacker pre-creates the pair before graduation.
        router.joeFactory().createPair(address(token), address(router.wavax()));
        // Graduation must still succeed (get-or-create finds the existing pair, mints).
        vm.prank(alice);
        pool.buy{value: 70e18}(0, block.timestamp);
        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated), "graduation not DoS'd by pre-created pair");
        address pair = router.joeFactory().getPair(address(token), address(router.wavax()));
        assertEq(MockJoePair(pair).lastMintTo(), DEAD, "LP still minted to burn");
        assertEq(token.balanceOf(pair), LP, "pair seeded with LP tokens");
    }

    function test_buy_revertsAfterGraduation() public {
        vm.prank(alice);
        pool.buy{value: 70e18}(0, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.NotTrading.selector);
        pool.buy{value: 1e18}(0, block.timestamp);
    }

    function test_init_revertsOnUnreachableThreshold() public {
        BondingCurvePool p2 = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        LaunchToken t2 = LaunchToken(Clones.clone(address(tokenImpl)));
        t2.initialize("M2", "M2", TOTAL, address(p2));
        vm.expectRevert(BondingCurvePool.BadCurveParams.selector);
        p2.initialize(BondingCurvePool.InitParams({
            factory: address(factory), token: address(t2), vAvax0: V_AVAX0, y0: Y0,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: 400e18, // > R_exhaust(~88)
            tradingFeeBps: FEE, treasury: address(0x7), joeRouter: address(router)
        }));
    }

    function test_init_revertsOnHighFee() public {
        BondingCurvePool p2 = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        vm.expectRevert(BondingCurvePool.FeeTooHigh.selector);
        p2.initialize(BondingCurvePool.InitParams({
            factory: address(factory), token: address(token), vAvax0: V_AVAX0, y0: Y0,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: GRAD,
            tradingFeeBps: 1001, treasury: address(0x7), joeRouter: address(router)
        }));
    }

    function test_init_revertsOnZeroAddress() public {
        BondingCurvePool p2 = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        vm.expectRevert(BondingCurvePool.ZeroAddress.selector);
        p2.initialize(BondingCurvePool.InitParams({
            factory: address(factory), token: address(0), vAvax0: V_AVAX0, y0: Y0,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: GRAD,
            tradingFeeBps: FEE, treasury: address(0x7), joeRouter: address(router)
        }));
    }

    function test_graduation_burnsUnsoldCurveTokens() public {
        vm.prank(alice);
        pool.buy{value: 70e18}(0, block.timestamp); // graduates (net 69.3 > GRAD 60)
        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated));
        // After graduation the pool holds ZERO tokens: lpReserve went to the router,
        // unsold curve tokens were burned.
        assertEq(token.balanceOf(address(pool)), 0, "no tokens stranded in pool");
    }

    function test_withdrawFees_paysTreasury() public {
        vm.prank(alice);
        pool.buy{value: 10e18}(0, block.timestamp);
        uint256 pending = pool.pendingFees();
        assertGt(pending, 0);
        pool.withdrawFees();
        assertEq(address(0x7).balance, pending, "treasury paid on withdraw");
        assertEq(pool.pendingFees(), 0);
    }

    // ─── Part B: branch-coverage additions ───────────────────────────────────

    /// Buy with tradingFeeBps == 0: hits the fee==0 path in buy (fee stays 0,
    /// pendingFees never grows, treasury receives nothing).
    function test_buy_zeroTradingFee_noFeeAccrued() public {
        BondingCurvePool p0 = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        LaunchToken t0 = LaunchToken(Clones.clone(address(tokenImpl)));
        t0.initialize("Z", "Z", TOTAL, address(p0));
        p0.initialize(BondingCurvePool.InitParams({
            factory: address(factory), token: address(t0),
            vAvax0: V_AVAX0, y0: Y0, curveSupply: CURVE, lpReserve: LP,
            graduationThreshold: GRAD,
            tradingFeeBps: 0, // zero fee
            treasury: address(0x7), joeRouter: address(router)
        }));
        vm.prank(alice);
        uint256 out = p0.buy{value: 10e18}(0, block.timestamp);
        assertGt(out, 0, "tokens received");
        assertEq(p0.pendingFees(), 0, "no fee accrued with feeBps==0");
        assertEq(p0.realAvax(), 10e18, "full value goes to reserve");
        assertEq(address(p0).balance, 10e18, "balance == realAvax (no pending fees)");
    }

    /// deadline == block.timestamp: the guard is strictly >, so this must NOT revert.
    function test_deadline_exactlyBlockTimestamp_doesNotRevert() public {
        vm.warp(1000);
        vm.prank(alice);
        uint256 out = pool.buy{value: 1e18}(0, block.timestamp); // deadline == timestamp
        assertGt(out, 0, "buy succeeds at deadline == now");
    }

    /// Sell exactly tokensSold (full unwind): tokensSold reaches 0, realAvax
    /// drops back to 0 (minus rounding), no ExceedsSold revert.
    function test_sell_fullUnwind() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 5e18}(0, block.timestamp);

        vm.startPrank(alice);
        token.approve(address(pool), bought);
        pool.sell(bought, 0, block.timestamp); // sell exactly tokensSold
        vm.stopPrank();

        assertEq(pool.tokensSold(), 0, "tokensSold back to zero");
        // realAvax may have tiny rounding residue; balance must still equal
        // realAvax + pendingFees (solvency invariant).
        assertEq(address(pool).balance, pool.realAvax() + pool.pendingFees(), "solvency holds");
    }

    /// Sell more than tokensSold reverts ExceedsSold.
    function test_sell_exceedsSold_reverts() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 5e18}(0, block.timestamp);

        vm.startPrank(alice);
        token.approve(address(pool), bought + 1);
        // Mint extra so Alice actually holds bought+1 tokens
        // (we can't, but we can test with 0 tokensSold instead)
        vm.stopPrank();

        // Test with tokenIn = 1 when tokensSold == 0 (no prior buys in fresh pool).
        BondingCurvePool pFresh = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        LaunchToken tFresh = LaunchToken(Clones.clone(address(tokenImpl)));
        tFresh.initialize("F", "F", TOTAL, address(pFresh));
        pFresh.initialize(BondingCurvePool.InitParams({
            factory: address(factory), token: address(tFresh),
            vAvax0: V_AVAX0, y0: Y0, curveSupply: CURVE, lpReserve: LP,
            graduationThreshold: GRAD, tradingFeeBps: FEE,
            treasury: address(0x7), joeRouter: address(router)
        }));
        // tokensSold == 0: selling 1 token exceeds sold
        vm.expectRevert(BondingCurvePool.ExceedsSold.selector);
        pFresh.sell(1, 0, block.timestamp);
    }

    /// graduation where pair does NOT pre-exist: createPair branch (getPair returns 0).
    /// (Complements test_graduation_survivesPreCreatedPair which covers the else path.)
    function test_graduation_createPairBranch_explicitCheck() public {
        // Before graduation, the pair must not exist
        address wavax = address(router.wavax());
        address pairBefore = router.joeFactory().getPair(address(token), wavax);
        assertEq(pairBefore, address(0), "pair absent before graduation");

        vm.prank(alice);
        pool.buy{value: 70e18}(0, block.timestamp);

        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated));
        address pairAfter = router.joeFactory().getPair(address(token), wavax);
        assertTrue(pairAfter != address(0), "pair created during graduation");
    }

    /// withdrawFees when pendingFees == 0: must not revert and must not transfer anything.
    function test_withdrawFees_zeroPendingFees_isNoOp() public {
        assertEq(pool.pendingFees(), 0, "no pending fees at start");
        uint256 treasuryBefore = address(0x7).balance;
        pool.withdrawFees(); // must not revert
        assertEq(pool.pendingFees(), 0);
        assertEq(address(0x7).balance, treasuryBefore, "no transfer when amount==0");
    }

    function test_sell_worksEvenIfTreasuryReverts() public {
        // Point the pool's treasury at a contract that rejects AVAX by re-init on a
        // fresh clone (treasury = a reverting contract).
        RejectAvax bad = new RejectAvax();
        BondingCurvePool p2 = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        LaunchToken t2 = LaunchToken(Clones.clone(address(tokenImpl)));
        t2.initialize("M2", "M2", TOTAL, address(p2));
        p2.initialize(BondingCurvePool.InitParams({
            factory: address(factory), token: address(t2), vAvax0: V_AVAX0, y0: Y0,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: GRAD,
            tradingFeeBps: FEE, treasury: address(bad), joeRouter: address(router)
        }));
        vm.deal(alice, 1000e18);
        vm.prank(alice);
        uint256 bought = p2.buy{value: 5e18}(0, block.timestamp); // fee accrues, no send -> ok
        vm.startPrank(alice);
        t2.approve(address(p2), bought);
        uint256 got = p2.sell(bought, 0, block.timestamp); // must NOT revert despite bad treasury
        vm.stopPrank();
        assertGt(got, 0, "exit stays open even with a reverting treasury");
    }
}

contract RejectAvax {
    receive() external payable { revert("no avax"); }
}
