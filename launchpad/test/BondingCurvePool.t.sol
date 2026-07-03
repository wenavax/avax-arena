// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {BondingCurvePool} from "../src/BondingCurvePool.sol";
import {CurveMath} from "../src/libraries/CurveMath.sol";
import {MockJoeRouter} from "./mocks/MockJoeRouter.sol";

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
        assertEq(address(pool).balance, sent - fee, "AVAX held == realAvax");
        assertEq(address(0x7).balance, fee, "fee to treasury");
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
}
