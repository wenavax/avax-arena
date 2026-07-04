// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LaunchpadFactory} from "../src/LaunchpadFactory.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Deploy — LaunchpadFactory deployment (chain-aware)
/// @notice Picks the Trader Joe V1 router by chainId (Fuji 43113 / Avalanche 43114).
///
///         The tokenomics below are LOCKED (2026-07-05) and fork-validated on Fuji
///         against the real Trader Joe V1. The factory constructor runs
///         `_validateConfig`, so a bad param set reverts the deploy (fail-fast):
///         it enforces `totalSupply == curveSupply + lpReserve`, `y0 > curveSupply`,
///         `tradingFeeBps <= 500`, non-zero treasury/router, and that
///         `graduationThreshold <= vAvax0 * curveSupply / (y0 - curveSupply)` (so
///         graduation is always reachable before the curve exhausts).
///         graduationThreshold is Safe-governable post-deploy; mainnet may scale the
///         raise up (see the tokenomics note below) before its own broadcast.
///
///         Run (dry): forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL
///         Broadcast: forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key $DEPLOYER_PK
contract Deploy is Script {
    // --- Trader Joe V1 routers (verified on-chain; router exposes factory()/WAVAX()) ---
    address constant ROUTER_FUJI = 0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901; // factory 0xF5c7d9733e5f53abCC1695820c4818C59B457C2C
    address constant ROUTER_MAINNET = 0x60aE616a2155Ee3d9A68541Ba4544862310933d4; // factory 0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10

    // --- Project addresses (from project memory; confirm before mainnet) ---
    address constant TREASURY = 0x301b013280317a75f808A3C0D23e82e9027A6b77; // fee recipient
    address constant SAFE = 0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07;     // Gnosis Safe 2/3 → final owner

    // --- LOCKED tokenomics (2026-07-05, fork-validated). ---
    // 1B supply: 800M sold on the curve, 200M seeded to the graduation LP.
    // vAvax0/y0 are pump.fun-style virtual reserves → the curve exhausts at
    // R_exhaust = vAvax0*curveSupply/(y0-curveSupply) ≈ 87.9 AVAX, so the 60-AVAX
    // graduationThreshold is reachable (graduates at ~715M sold). At graduation the
    // DEX opens ~19% above the last curve price — a small listing premium for the
    // top-of-curve buyers, not a down-cliff (F5).
    // For a larger mainnet raise, scale vAvax0/y0 up together and keep
    // graduationThreshold <= vAvax0*curveSupply/(y0-curveSupply).
    uint256 constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 constant CURVE_SUPPLY = 800_000_000e18;
    uint256 constant LP_RESERVE = 200_000_000e18;
    uint256 constant V_AVAX0 = 30e18;
    uint256 constant Y0 = 1_073_000_000e18;
    uint256 constant GRADUATION_THRESHOLD = 60e18; // AVAX raised → graduate (owner-governable)
    uint16 constant TRADING_FEE_BPS = 100;         // 1% on buys/sells → pendingFees → treasury
    uint256 constant LAUNCH_FEE = 1e18;            // 1 AVAX per launch → treasury

    function run() external {
        address router = block.chainid == 43113
            ? ROUTER_FUJI
            : block.chainid == 43114 ? ROUTER_MAINNET : address(0);
        require(router != address(0), "unsupported chain");

        vm.startBroadcast();
        LaunchpadFactory factory = new LaunchpadFactory(
            LaunchpadFactory.Config({
                launchFee: LAUNCH_FEE,
                tradingFeeBps: TRADING_FEE_BPS,
                graduationThreshold: GRADUATION_THRESHOLD,
                vAvax0: V_AVAX0,
                y0: Y0,
                totalSupply: TOTAL_SUPPLY,
                curveSupply: CURVE_SUPPLY,
                lpReserve: LP_RESERVE,
                treasury: TREASURY,
                joeRouter: router
            })
        );
        // Hand config governance + pause to the multisig. The Safe cannot touch pool
        // reserves — only future-launch config and the launch/buy pause.
        Ownable(address(factory)).transferOwnership(SAFE);
        vm.stopBroadcast();

        console2.log("chainId          :", block.chainid);
        console2.log("router           :", router);
        console2.log("LaunchpadFactory :", address(factory));
        console2.log("tokenImpl        :", factory.tokenImpl());
        console2.log("poolImpl         :", factory.poolImpl());
        console2.log("owner (Safe)     :", SAFE);
    }
}
