// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AtlasTreasury} from "../src/AtlasTreasury.sol";
import {PixelAtlas} from "../src/PixelAtlas.sol";

/// @notice Deploy AtlasTreasury and wire it to a PixelAtlas instance.
/// env:
///   PRIVATE_KEY        — must be the PixelAtlas owner
///   ATLAS_ADDRESS      — PixelAtlas address to repoint
///   USDC               — USDC token address (or USDC_MAINNET/USDC_SEPOLIA)
///   TREASURY_DEST      — wallet that receives swept USDC
///   TREASURY_THRESHOLD — minimum balance to sweep (base units, 50 USDC = 50000000)
contract DeployTreasury is Script {
    function run() external returns (AtlasTreasury vault) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address atlasAddr = vm.envAddress("ATLAS_ADDRESS");
        address usdc = vm.envAddress(_usdcEnvKey());
        address destination = vm.envAddress("TREASURY_DEST");
        uint256 threshold = vm.envUint("TREASURY_THRESHOLD");

        vm.startBroadcast(pk);
        vault = new AtlasTreasury(usdc, destination, threshold);
        // Repoint PixelAtlas treasury to the vault
        PixelAtlas(atlasAddr).setTreasury(address(vault));
        vm.stopBroadcast();

        console2.log("AtlasTreasury:", address(vault));
        console2.log("destination: ", destination);
        console2.log("threshold:   ", threshold);
        console2.log("PixelAtlas treasury now:", address(vault));
    }

    function _usdcEnvKey() internal view returns (string memory) {
        try vm.envAddress("USDC") returns (address) {
            return "USDC";
        } catch {
            if (block.chainid == 8453) return "USDC_MAINNET";
            if (block.chainid == 84532) return "USDC_SEPOLIA";
            revert("set USDC env");
        }
    }
}
