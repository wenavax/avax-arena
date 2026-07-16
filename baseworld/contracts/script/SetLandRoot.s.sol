// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PixelAtlas} from "../src/PixelAtlas.sol";

/// @notice Deploy sonrası merkle root'u kontrata yaz ve gating'i aç.
/// Kullanım: forge script script/SetLandRoot.s.sol --rpc-url $RPC --broadcast
///   env: PRIVATE_KEY, ATLAS_ADDRESS, LAND_ROOT
contract SetLandRoot is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address atlasAddr = vm.envAddress("ATLAS_ADDRESS");
        bytes32 root = vm.envBytes32("LAND_ROOT");
        require(root != bytes32(0), "LAND_ROOT empty");

        vm.startBroadcast(pk);
        PixelAtlas(atlasAddr).setLandRoot(root, true);
        vm.stopBroadcast();

        console2.log("LandRoot set on:", atlasAddr);
        console2.logBytes32(root);
    }
}
