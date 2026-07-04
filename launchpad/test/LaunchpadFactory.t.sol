// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {LaunchpadFactory} from "../src/LaunchpadFactory.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {BondingCurvePool} from "../src/BondingCurvePool.sol";
import {MockJoeRouter} from "./mocks/MockJoeRouter.sol";

contract LaunchpadFactoryTest is Test {
    LaunchpadFactory factory;
    MockJoeRouter router;
    address treasury = address(0x7);
    address creator = address(0xC0FFEE);

    function setUp() public {
        router = new MockJoeRouter();
        factory = new LaunchpadFactory(
            LaunchpadFactory.Config({
                launchFee: 1e18,
                tradingFeeBps: 100,
                graduationThreshold: 60e18,
                vAvax0: 30e18,
                y0: 1_073_000_000e18,
                totalSupply: 1_000_000_000e18,
                curveSupply: 800_000_000e18,
                lpReserve: 200_000_000e18,
                treasury: treasury,
                joeRouter: address(router)
            })
        );
        vm.deal(creator, 100e18);
    }

    function test_createToken_chargesFee_deploysWiredPair() public {
        vm.prank(creator);
        (address token, address pool) = factory.createToken{value: 1e18}("Meme", "MEME", "ipfs://x");

        assertEq(treasury.balance, 1e18, "launch fee to treasury");
        assertEq(LaunchToken(token).totalSupply(), 1_000_000_000e18);
        assertEq(LaunchToken(token).balanceOf(pool), 1_000_000_000e18, "supply to pool");
        assertEq(address(BondingCurvePool(payable(pool)).token()), token, "pool wired to token");
        assertEq(factory.launchCount(), 1);
    }

    function test_createToken_refundsExcess() public {
        vm.prank(creator);
        factory.createToken{value: 3e18}("Meme", "MEME", "ipfs://x");
        assertEq(creator.balance, 99e18); // 1 fee, 2 refunded
    }

    function test_createToken_revertsBelowFee() public {
        vm.prank(creator);
        vm.expectRevert(LaunchpadFactory.InsufficientFee.selector);
        factory.createToken{value: 0.5e18}("Meme", "MEME", "ipfs://x");
    }

    function test_createToken_revertsWhenPaused() public {
        factory.pause();
        vm.prank(creator);
        vm.expectRevert(); // Pausable: EnforcedPause
        factory.createToken{value: 1e18}("Meme", "MEME", "ipfs://x");
    }

    function test_onlyOwnerCanSetConfig() public {
        vm.prank(creator);
        vm.expectRevert(); // Ownable
        factory.setLaunchFee(2e18);
    }

    // --- defense-in-depth: zero/oversized config param rejection ---

    function _cfg() internal view returns (LaunchpadFactory.Config memory c) {
        c = LaunchpadFactory.Config({
            launchFee: 1e18,
            tradingFeeBps: 100,
            graduationThreshold: 60e18,
            vAvax0: 30e18,
            y0: 1_073_000_000e18,
            totalSupply: 1_000_000_000e18,
            curveSupply: 800_000_000e18,
            lpReserve: 200_000_000e18,
            treasury: treasury,
            joeRouter: address(router)
        });
    }

    function test_ctor_rejectsZeroLpReserve() public {
        LaunchpadFactory.Config memory c = _cfg();
        // lpReserve=0; adjust curveSupply to satisfy totalSupply==curveSupply+lpReserve
        c.lpReserve = 0;
        c.curveSupply = c.totalSupply;
        // "zero param" fires first (lpReserve==0)
        vm.expectRevert(bytes("zero param"));
        new LaunchpadFactory(c);
    }

    function test_ctor_rejectsZeroVAvax0() public {
        LaunchpadFactory.Config memory c = _cfg();
        // vAvax0=0 would also make the threshold unreachable check divide by a
        // potentially odd quotient; set graduationThreshold=0 to isolate, but
        // "zero param" catches either zero first.
        c.vAvax0 = 0;
        c.graduationThreshold = 0;
        vm.expectRevert(bytes("zero param"));
        new LaunchpadFactory(c);
    }

    function test_ctor_rejectsZeroCurveSupply() public {
        LaunchpadFactory.Config memory c = _cfg();
        // curveSupply=0; shift everything to lpReserve to satisfy supply equality
        c.curveSupply = 0;
        c.lpReserve = c.totalSupply;
        // "zero param" fires first (curveSupply==0)
        vm.expectRevert(bytes("zero param"));
        new LaunchpadFactory(c);
    }

    function test_ctor_rejectsZeroGraduationThreshold() public {
        LaunchpadFactory.Config memory c = _cfg();
        c.graduationThreshold = 0;
        // "zero param" fires first (graduationThreshold==0)
        vm.expectRevert(bytes("zero param"));
        new LaunchpadFactory(c);
    }

    // ─── Part A: governance setters ──────────────────────────────────────────

    // Helpers to read individual config fields from the tuple getter.
    // Config field order: launchFee(0) tradingFeeBps(1) graduationThreshold(2)
    //                     vAvax0(3) y0(4) totalSupply(5) curveSupply(6) lpReserve(7)
    //                     treasury(8) joeRouter(9)

    function test_setLaunchFee_updatesValue() public {
        factory.setLaunchFee(2e18);
        (uint256 lf,,,,,,,,,) = factory.config();
        assertEq(lf, 2e18);
    }

    function test_setLaunchFee_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setLaunchFee(2e18);
    }

    function test_setTradingFeeBps_accepts500() public {
        factory.setTradingFeeBps(500);
        (, uint16 feeBps,,,,,,,,) = factory.config();
        assertEq(feeBps, 500);
    }

    function test_setTradingFeeBps_rejects501() public {
        vm.expectRevert(bytes("fee too high"));
        factory.setTradingFeeBps(501);
    }

    function test_setTradingFeeBps_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setTradingFeeBps(50);
    }

    function test_setGraduationThreshold_updates() public {
        factory.setGraduationThreshold(50e18);
        (,, uint256 gt,,,,,,,) = factory.config();
        assertEq(gt, 50e18);
    }

    function test_setGraduationThreshold_unreachableReverts() public {
        // R_exhaust = vAvax0 * curveSupply / (y0 - curveSupply)
        //           = 30e18 * 800_000_000e18 / 273_000_000e18 ≈ 87.9e18
        // 400e18 > 87.9e18 → "threshold unreachable"
        vm.expectRevert(bytes("threshold unreachable"));
        factory.setGraduationThreshold(400e18);
    }

    function test_setGraduationThreshold_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setGraduationThreshold(50e18);
    }

    function test_setCurveParams_updates() public {
        factory.setCurveParams(30e18, 1_200_000_000e18);
        (,,, uint256 va0, uint256 y0_,,,,, ) = factory.config();
        assertEq(va0, 30e18);
        assertEq(y0_, 1_200_000_000e18);
    }

    function test_setCurveParams_y0EqualsCurveSupplyReverts() public {
        // curveSupply == 800_000_000e18; setting y0 == curveSupply violates y0 > curveSupply
        vm.expectRevert(bytes("y0<=curveSupply"));
        factory.setCurveParams(30e18, 800_000_000e18);
    }

    function test_setCurveParams_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setCurveParams(30e18, 1_200_000_000e18);
    }

    function test_setTreasury_updates() public {
        address newT = address(0xBEEF);
        factory.setTreasury(newT);
        (,,,,,,,, address tr,) = factory.config();
        assertEq(tr, newT);
    }

    function test_setTreasury_rejectsZero() public {
        vm.expectRevert();
        factory.setTreasury(address(0));
    }

    function test_setTreasury_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setTreasury(address(0xBEEF));
    }

    function test_setJoeRouter_updates() public {
        address newR = address(0xCAFE);
        factory.setJoeRouter(newR);
        (,,,,,,,,, address jr) = factory.config();
        assertEq(jr, newR);
    }

    function test_setJoeRouter_rejectsZero() public {
        vm.expectRevert();
        factory.setJoeRouter(address(0));
    }

    function test_setJoeRouter_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setJoeRouter(address(0xCAFE));
    }

    function test_pause_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.pause();
    }

    function test_unpause_reEnablesLaunch() public {
        factory.pause();
        assertTrue(factory.paused(), "should be paused");
        factory.unpause();
        assertFalse(factory.paused(), "should be unpaused");
        // createToken works again after unpause
        vm.prank(creator);
        (address tok,) = factory.createToken{value: 1e18}("X", "X", "ipfs://x");
        assertTrue(tok != address(0));
        assertEq(factory.launchCount(), 1);
    }

    function test_unpause_onlyOwner() public {
        factory.pause();
        vm.prank(creator);
        vm.expectRevert();
        factory.unpause();
    }

    function test_createToken_exactFee_noRefund() public {
        // msg.value == launchFee: refund branch (refund > 0) is false
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        factory.createToken{value: 1e18}("E", "E", "ipfs://e");
        assertEq(creator.balance, balBefore - 1e18, "no refund when exact fee");
        assertEq(treasury.balance, 1e18, "fee forwarded to treasury");
    }

    function test_createToken_zeroLaunchFee_hitsFalseBranch() public {
        // Factory with launchFee == 0: hits if(c.launchFee > 0) false branch
        LaunchpadFactory.Config memory c = _cfg();
        c.launchFee = 0;
        LaunchpadFactory zeroFeeFactory = new LaunchpadFactory(c);
        vm.deal(creator, 10e18);
        vm.prank(creator);
        (address tok, address pool) = zeroFeeFactory.createToken{value: 0}("Z", "Z", "ipfs://z");
        assertTrue(tok != address(0), "token deployed");
        assertTrue(pool != address(0), "pool deployed");
        assertEq(treasury.balance, 0, "no fee charged");
        assertEq(zeroFeeFactory.launchCount(), 1);
    }

    function test_launches_getter_returnsStoredData() public {
        vm.prank(creator);
        (address tok, address pool) = factory.createToken{value: 1e18}("G", "G", "ipfs://g");
        (address storedToken, address storedPool, address storedCreator) = factory.launches(0);
        assertEq(storedToken, tok,     "token matches");
        assertEq(storedPool,  pool,    "pool matches");
        assertEq(storedCreator, creator, "creator matches");
    }

    function test_createToken_multipleIds_storeCorrectly() public {
        vm.prank(creator);
        (address tok0, address pool0) = factory.createToken{value: 1e18}("A", "A", "ipfs://a");
        vm.prank(creator);
        (address tok1, address pool1) = factory.createToken{value: 1e18}("B", "B", "ipfs://b");

        assertEq(factory.launchCount(), 2);
        (address st0, address sp0,) = factory.launches(0);
        (address st1, address sp1,) = factory.launches(1);
        assertEq(st0, tok0); assertEq(sp0, pool0);
        assertEq(st1, tok1); assertEq(sp1, pool1);
        assertTrue(tok0 != tok1, "distinct tokens");
    }
}
