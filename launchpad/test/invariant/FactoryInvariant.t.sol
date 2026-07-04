// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {LaunchpadFactory} from "../../src/LaunchpadFactory.sol";
import {BondingCurvePool} from "../../src/BondingCurvePool.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {MockJoeRouter} from "../mocks/MockJoeRouter.sol";

/// @dev System-level handler: drives the real LaunchpadFactory and all the pools
///      it creates, exercising createToken / buy / sell / withdrawFees across an
///      arbitrary number of launched tokens while keeping every pool below its
///      graduation threshold so the accounting invariants apply for the whole run.
contract FactoryHandler is Test {
    LaunchpadFactory public immutable factory;

    address[] public actors;
    address[] public pools;
    address[] public tokens;

    // Config constants — must match setUp (factory validates them internally).
    uint256 constant LAUNCH_FEE = 1e18;
    uint256 constant TOTAL      = 1e27;         // totalSupply
    uint256 constant CURVE      = 8e26;         // curveSupply

    constructor(LaunchpadFactory _factory) {
        factory = _factory;
        for (uint160 i = 1; i <= 5; i++) {
            actors.push(address(i));
            vm.deal(address(i), 10_000e18);
        }
    }

    // ─── handler actions ────────────────────────────────────────────────────

    /// Launch a new token through the real factory; track the (pool, token) pair.
    function createToken(uint256 actorSeed, uint256 nameSeed) external {
        address a = actors[actorSeed % actors.length];
        if (a.balance < LAUNCH_FEE) return;
        // Unique-ish symbol so duplicate-name edge cases are explored.
        string memory sym = string.concat("M", vm.toString(nameSeed % 9999));
        vm.prank(a);
        try factory.createToken{value: LAUNCH_FEE}("MemeCoin", sym, "ipfs://x") returns (address tok, address pool) {
            tokens.push(tok);
            pools.push(pool);
        } catch {}
    }

    /// Buy tokens in one of the live pools; guard prevents graduation.
    function buy(uint256 poolSeed, uint256 actorSeed, uint256 amt) external {
        if (pools.length == 0) return;
        BondingCurvePool pool = BondingCurvePool(payable(pools[poolSeed % pools.length]));
        if (uint256(pool.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        amt = bound(amt, 1e14, 10e18);
        if (a.balance < amt) return;
        // Stay well below the 60e18 graduation threshold so pools never graduate.
        if (pool.realAvax() + amt >= 50e18) return;
        vm.prank(a);
        try pool.buy{value: amt}(0, block.timestamp) {} catch {}
    }

    /// Sell tokens back into one of the live pools.
    function sell(uint256 poolSeed, uint256 actorSeed, uint256 amt) external {
        if (pools.length == 0) return;
        uint256 idx = poolSeed % pools.length;
        BondingCurvePool pool = BondingCurvePool(payable(pools[idx]));
        LaunchToken tok        = LaunchToken(tokens[idx]);
        if (uint256(pool.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        uint256 bal = tok.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.startPrank(a);
        tok.approve(address(pool), amt);
        try pool.sell(amt, 0, block.timestamp) {} catch {}
        vm.stopPrank();
    }

    /// Flush pending fees to the treasury; exercises the exact accounting identity
    /// after pendingFees drops to zero.
    function withdrawFees(uint256 poolSeed) external {
        if (pools.length == 0) return;
        BondingCurvePool pool = BondingCurvePool(payable(pools[poolSeed % pools.length]));
        try pool.withdrawFees() {} catch {}
    }

    // ─── helpers for invariant assertions ───────────────────────────────────

    function poolsLength() external view returns (uint256) { return pools.length; }
}

contract FactoryInvariantTest is Test {
    LaunchpadFactory factory;
    FactoryHandler   handler;

    uint256 constant TOTAL = 1e27;
    uint256 constant CURVE = 8e26;

    function setUp() public {
        MockJoeRouter router = new MockJoeRouter();

        LaunchpadFactory.Config memory cfg = LaunchpadFactory.Config({
            launchFee:           1e18,
            tradingFeeBps:       100,
            graduationThreshold: 60e18,
            vAvax0:              30e18,
            y0:                  1_073_000_000e18,
            totalSupply:         TOTAL,
            curveSupply:         CURVE,
            lpReserve:           2e26,
            treasury:            address(0x7777),
            joeRouter:           address(router)
        });

        factory = new LaunchpadFactory(cfg);
        handler = new FactoryHandler(factory);
        targetContract(address(handler));
    }

    // ─── invariants ─────────────────────────────────────────────────────────

    /// 1. Every live pool is exactly solvent: balance = realAvax + pendingFees.
    ///    An assertEq failure is a real accounting bug, not a rounding edge case.
    function invariant_poolsSolvent() public view {
        uint256 n = handler.poolsLength();
        for (uint256 i = 0; i < n; i++) {
            BondingCurvePool pool = BondingCurvePool(payable(handler.pools(i)));
            assertEq(
                address(pool).balance,
                pool.realAvax() + pool.pendingFees(),
                "pool accounting identity violated"
            );
        }
    }

    /// 2. Every pool conserves token supply: unsold tokens always sit in the pool
    ///    and tokensSold never exceeds curveSupply.
    function invariant_supplyConserved() public view {
        uint256 n = handler.poolsLength();
        for (uint256 i = 0; i < n; i++) {
            BondingCurvePool pool = BondingCurvePool(payable(handler.pools(i)));
            LaunchToken       tok  = LaunchToken(handler.tokens(i));
            assertLe(pool.tokensSold(), CURVE, "tokensSold exceeds curveSupply");
            assertEq(
                tok.balanceOf(address(pool)),
                TOTAL - pool.tokensSold(),
                "pool token balance does not match TOTAL - tokensSold"
            );
        }
    }

    /// 3. The factory itself never accumulates stuck AVAX.
    ///    launchFee goes to treasury and refunds go back to the caller atomically;
    ///    the factory contract address should always hold zero.
    function invariant_factoryNeverHoldsAvax() public view {
        assertEq(address(factory).balance, 0, "factory has stuck AVAX");
    }

    /// 4. factory.launchCount() exactly tracks the number of successfully
    ///    launched (token, pool) pairs the handler has recorded.
    function invariant_launchCountMatchesPools() public view {
        assertEq(
            factory.launchCount(),
            handler.poolsLength(),
            "launchCount does not match tracked pool count"
        );
    }
}
