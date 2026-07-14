// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RaceTicketHub} from "../src/icm/RaceTicketHub.sol";
import {RaceTicketGate} from "../src/icm/RaceTicketGate.sol";

/// Three-step deploy (hub first breaks the circular reference):
///   1) Fuji : forge script script/DeployIcm.s.sol --rpc-url $FUJI_RPC_URL  --broadcast --private-key $PK
///   2) Echo : ICM_HUB=<hub> forge script script/DeployIcm.s.sol --rpc-url $ECHO_RPC_URL --broadcast --private-key $PK
///   3) Fuji : ICM_HUB=<hub> ICM_GATE=<gate> forge script script/DeployIcm.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key $PK
contract DeployIcm is Script {
    address constant MESSENGER = 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf;
    bytes32 constant FUJI_ID = 0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5;
    bytes32 constant ECHO_ID = 0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1;

    function run() external {
        address hub = vm.envOr("ICM_HUB", address(0));
        address gate = vm.envOr("ICM_GATE", address(0));
        vm.startBroadcast();
        if (block.chainid == 43113) {
            if (hub == address(0)) {
                RaceTicketHub deployed = new RaceTicketHub(MESSENGER, ECHO_ID);
                console2.log("RaceTicketHub (Fuji):", address(deployed));
            } else {
                RaceTicketHub(hub).setGate(gate);
                console2.log("setGate done:", gate);
            }
        } else if (block.chainid == 173750) {
            require(hub != address(0), "ICM_HUB required on Echo");
            RaceTicketGate deployed = new RaceTicketGate(MESSENGER, FUJI_ID, hub);
            console2.log("RaceTicketGate (Echo):", address(deployed));
        } else {
            revert("unsupported chain");
        }
        vm.stopBroadcast();
    }
}
