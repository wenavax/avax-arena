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
}
