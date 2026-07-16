// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PixelAtlas} from "../src/PixelAtlas.sol";

contract Deploy is Script {
    function run() external returns (PixelAtlas atlas) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress(_usdcEnvKey());
        address treasury = vm.envAddress("TREASURY");
        bytes32 landRoot = vm.envOr("LAND_ROOT", bytes32(0));

        require(usdc != address(0), "USDC missing");
        require(treasury != address(0), "TREASURY missing");

        vm.startBroadcast(pk);
        atlas = new PixelAtlas(usdc, treasury, landRoot);
        vm.stopBroadcast();

        console2.log("PixelAtlas:", address(atlas));
        console2.log("USDC:      ", usdc);
        console2.log("Treasury:  ", treasury);
        console2.log("LandRoot:  ", uint256(landRoot));
    }

    function _usdcEnvKey() internal view returns (string memory) {
        // Pick USDC address by chain id. Caller can override with USDC env.
        try vm.envAddress("USDC") returns (address) {
            return "USDC";
        } catch {
            if (block.chainid == 8453) return "USDC_MAINNET";
            if (block.chainid == 84532) return "USDC_SEPOLIA";
            revert("set USDC env (or USDC_MAINNET / USDC_SEPOLIA)");
        }
    }
}
