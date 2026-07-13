// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MatchEscrow} from "../src/MatchEscrow.sol";

/// Dry run : forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL
/// Broadcast: add --broadcast --private-key $DEPLOYER_PK
contract Deploy is Script {
    address constant SAFE = 0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07; // Gnosis Safe 2/3
    address constant TREASURY = 0x301b013280317a75f808A3C0D23e82e9027A6b77;
    // Dedicated server operator (createMatch caller). On mainnet the Safe must
    // authorize it post-deploy (owner==Safe, so this script cannot). See below.
    address constant OPERATOR = 0x3C056E6f3815019Bae464f70C01BFfBceb41b9E5;

    function run() external {
        // Fuji: 0.01 AVAX entry (cheap rehearsal), same 5/2.5/1.25/0.75/0.5% split.
        // Mainnet: 1 AVAX entry, doc economics (fee 0.2, rewards 2/1/0.5/0.3).
        uint256 entryFee;
        uint256 platformFee;
        uint256[4] memory rewards;
        address owner_;
        address signer_;
        uint256 settleWindow = 1 hours;

        address deployer = msg.sender;

        if (block.chainid == 43113) {
            entryFee = 1 ether; // pool 4 — matches the mainnet economics (scheduled races)
            platformFee = 0.2 ether;
            rewards = [uint256(2 ether), 1 ether, 0.5 ether, 0.3 ether]; // Σ 3.8 + 0.2 = 4.0
            owner_ = deployer; // deployer keeps admin (cancelMatch) on testnet
            signer_ = deployer; // deployer signs results in the rehearsal
        } else if (block.chainid == 43114) {
            entryFee = 1 ether; // pool 4
            platformFee = 0.2 ether;
            rewards = [uint256(2 ether), 1 ether, 0.5 ether, 0.3 ether]; // Σ 3.8 + 0.2 = 4.0
            owner_ = SAFE;
            signer_ = deployer; // server signer — rotate to HSM/KMS via setTrustedSigner
        } else {
            revert("unsupported chain");
        }

        vm.startBroadcast();
        MatchEscrow escrow =
            new MatchEscrow(owner_, signer_, TREASURY, entryFee, settleWindow, platformFee, rewards);
        // authorize the server operator to open matches (deployer on both chains for now)
        if (owner_ == deployer) {
            escrow.setAuthorized(deployer, true);
        }
        vm.stopBroadcast();

        console2.log("chainId:", block.chainid);
        console2.log("MatchEscrow:", address(escrow));
        console2.log("owner:", owner_);
        console2.log("signer:", signer_);
        console2.log("entryFee:", entryFee);

        // Mainnet is owner==Safe, so this script CANNOT authorize the operator or
        // rotate the signer. Both must be executed from the Safe post-deploy:
        if (block.chainid == 43114) {
            console2.log("--- REQUIRED post-deploy Safe (2/3) transactions ---");
            console2.log("1) escrow.setAuthorized(OPERATOR, true) - operator:", OPERATOR);
            console2.log("2) escrow.setTrustedSigner(HSM_SIGNER) - rotate off the deployer key");
            console2.log("   (until (1) runs, createMatch reverts NotAuthorized)");
        }
    }
}
