// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/FrozenFriends.sol";
import "../src/Paymaster.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        string memory baseURI = vm.envString("BASE_TOKEN_URI");

        vm.startBroadcast(pk);
        FrozenFriends ff = new FrozenFriends(baseURI);
        Paymaster pm = new Paymaster();
        vm.stopBroadcast();

        console2.log("FrozenFriends:", address(ff));
        console2.log("Paymaster:    ", address(pm));
    }
}
