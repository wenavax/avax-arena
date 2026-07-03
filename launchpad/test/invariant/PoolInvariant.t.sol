// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {BondingCurvePool} from "../../src/BondingCurvePool.sol";
import {MockJoeRouter} from "../mocks/MockJoeRouter.sol";

contract StubFactory2 { function paused() external pure returns (bool) { return false; } }

/// Bounded actor that buys and sells but never lets the pool graduate, so the
/// balance-based invariants apply to a live curve for the whole run.
contract Handler is Test {
    BondingCurvePool public pool;
    LaunchToken public token;
    address[] public actors;

    constructor(BondingCurvePool _pool, LaunchToken _token) {
        pool = _pool;
        token = _token;
        for (uint160 i = 1; i <= 5; i++) {
            actors.push(address(i));
            vm.deal(address(i), 100e18);
        }
    }

    function buy(uint256 actorSeed, uint256 amt) external {
        if (uint256(pool.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        amt = bound(amt, 1e14, 20e18);
        if (a.balance < amt) return;
        // never graduate: skip buys that would approach the threshold
        if (pool.realAvax() + amt >= 50e18) return;
        vm.prank(a);
        try pool.buy{value: amt}(0, block.timestamp) {} catch {}
    }

    function sell(uint256 actorSeed, uint256 amt) external {
        if (uint256(pool.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.startPrank(a);
        token.approve(address(pool), amt);
        try pool.sell(amt, 0, block.timestamp) {} catch {}
        vm.stopPrank();
    }
}

contract PoolInvariantTest is Test {
    BondingCurvePool pool;
    LaunchToken token;
    Handler handler;

    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP = 200_000_000e18;

    function setUp() public {
        LaunchToken tImpl = new LaunchToken();
        BondingCurvePool pImpl = new BondingCurvePool();
        MockJoeRouter router = new MockJoeRouter();
        StubFactory2 f = new StubFactory2();

        token = LaunchToken(Clones.clone(address(tImpl)));
        pool = BondingCurvePool(payable(Clones.clone(address(pImpl))));
        token.initialize("Meme", "MEME", TOTAL, address(pool));
        pool.initialize(BondingCurvePool.InitParams({
            factory: address(f), token: address(token), vAvax0: 30e18, y0: 1_073_000_000e18,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: 60e18,
            tradingFeeBps: 100, treasury: address(0x7), joeRouter: address(router)
        }));

        handler = new Handler(pool, token);
        targetContract(address(handler));
    }

    /// The pool's AVAX balance always covers its accounted reserve.
    function invariant_solvent() public view {
        assertGe(address(pool).balance, pool.realAvax());
    }

    /// Never sell more than the curve allows; pool holds every unsold token.
    function invariant_supplyConserved() public view {
        assertLe(pool.tokensSold(), CURVE);
        assertEq(token.balanceOf(address(pool)), TOTAL - pool.tokensSold());
    }
}
