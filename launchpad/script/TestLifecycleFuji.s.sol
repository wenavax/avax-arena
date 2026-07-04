// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LaunchpadFactory} from "../src/LaunchpadFactory.sol";
import {BondingCurvePool} from "../src/BondingCurvePool.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {IJoeRouter, IJoeFactoryLike} from "../src/interfaces/IJoeRouter.sol";

interface IPairView {
    function getReserves() external view returns (uint112, uint112, uint32);
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function token0() external view returns (address);
}

/// @title TestLifecycleFuji — live end-to-end smoke test on Fuji
/// @notice Deploys a THROWAWAY test-config factory (NOT the production one) and drives
///         a full lifecycle on real Trader Joe V1: launch -> buy -> sell -> buy(graduate)
///         -> withdrawFees, then asserts the graduation seeded a real pair with burned LP.
///         Test config = production tokenomics scaled 1/750 on the AVAX axis (same
///         graduationThreshold/vAvax0 = 2 ratio => same ~19% listing premium economics),
///         so graduation is reachable with ~0.08 AVAX instead of 60.
contract TestLifecycleFuji is Script {
    address constant ROUTER_FUJI = 0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901;
    address constant TREASURY = 0x000000000000000000000000000000000000Fee5; // sentinel fee sink
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant GRAD = 0.08e18;
    uint16 constant FEE_BPS = 100;

    function run() external {
        require(block.chainid == 43113, "fuji only");
        uint256 deadline = block.timestamp + 1 hours;

        vm.startBroadcast();

        // 1) test-config factory (launchFee 0, tiny graduation)
        LaunchpadFactory factory = new LaunchpadFactory(
            LaunchpadFactory.Config({
                launchFee: 0,
                tradingFeeBps: FEE_BPS,
                graduationThreshold: GRAD,
                vAvax0: 0.04e18,
                y0: 1_073_000_000e18,
                totalSupply: 1_000_000_000e18,
                curveSupply: 800_000_000e18,
                lpReserve: 200_000_000e18,
                treasury: TREASURY,
                joeRouter: ROUTER_FUJI
            })
        );

        // 2) launch a token
        (address token, address poolAddr) = factory.createToken("Frostbite Test", "FTEST", "ipfs://frostbite-test");
        BondingCurvePool pool = BondingCurvePool(payable(poolAddr));
        console2.log("factory :", address(factory));
        console2.log("token   :", token);
        console2.log("pool    :", poolAddr);

        // 3) BUY #1
        uint256 out1 = pool.buy{value: 0.04e18}(0, deadline);
        console2.log("buy1 tokensOut :", out1);
        console2.log("realAvax after buy1 :", pool.realAvax());

        // 4) SELL 40% back (proves sell/exit path)
        uint256 sellAmt = (out1 * 40) / 100;
        LaunchToken(token).approve(poolAddr, sellAmt);
        uint256 avaxBack = pool.sell(sellAmt, 0, deadline);
        console2.log("sell tokensIn :", sellAmt);
        console2.log("sell avaxOut  :", avaxBack);
        console2.log("realAvax after sell :", pool.realAvax());

        // 5) BUY #2 sized to just cross the graduation threshold -> auto-graduate
        uint256 ra = pool.realAvax();
        require(ra < GRAD, "already graduated");
        uint256 need = GRAD - ra;                         // net realAvax still needed
        uint256 grossBuy2 = (need * 10000) / (10000 - FEE_BPS) + 0.002e18; // +buffer
        uint256 out2 = pool.buy{value: grossBuy2}(0, deadline);
        console2.log("buy2 avaxIn(gross) :", grossBuy2);
        console2.log("buy2 tokensOut :", out2);
        console2.log("realAvax after buy2 :", pool.realAvax());
        console2.log("state (1=Graduated) :", uint256(pool.state()));

        // 6) withdraw accrued fees to treasury
        pool.withdrawFees();

        vm.stopBroadcast();

        _verify(token, poolAddr);
    }

    function _verify(address token, address poolAddr) internal view {
        BondingCurvePool pool = BondingCurvePool(payable(poolAddr));
        require(uint256(pool.state()) == 1, "not graduated");
        require(pool.pendingFees() == 0, "fees not swept");

        address wavax = IJoeRouter(ROUTER_FUJI).WAVAX();
        address pair = IJoeFactoryLike(IJoeRouter(ROUTER_FUJI).factory()).getPair(token, wavax);
        require(pair != address(0), "no TJ pair");

        (uint112 r0, uint112 r1,) = IPairView(pair).getReserves();
        require(r0 > 0 && r1 > 0, "empty reserves");
        require(IPairView(pair).balanceOf(DEAD) > 0, "LP not burned");
        require(LaunchToken(token).balanceOf(poolAddr) == 0, "leftover not burned");

        console2.log("--- GRADUATION VERIFIED ---");
        console2.log("TJ pair        :", pair);
        console2.log("reserve0       :", uint256(r0));
        console2.log("reserve1       :", uint256(r1));
        console2.log("LP total       :", IPairView(pair).totalSupply());
        console2.log("LP burned(DEAD):", IPairView(pair).balanceOf(DEAD));
        console2.log("pool leftover  :", LaunchToken(token).balanceOf(poolAddr));
        console2.log("treasury fees  :", TREASURY.balance);
    }
}
