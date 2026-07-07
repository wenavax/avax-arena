// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FrostbiteAdventures} from "../src/FrostbiteAdventures.sol";
import {IFrostbiteHeroes} from "../src/interfaces/IFrostbiteHeroes.sol";
import {MockFSB} from "../test/mocks/MockFSB.sol";
import {MockFrostbiteHeroes} from "../test/mocks/MockFrostbiteHeroes.sol";

/// Dry run : forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL
/// Broadcast: add --broadcast --private-key $DEPLOYER_PK
contract Deploy is Script {
    // ── Live addresses (Avalanche C-Chain 43114) ─────────────────────────────
    address constant FSB_MAINNET = 0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214;
    address constant HEROES_MAINNET = 0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523;
    address constant SAFE = 0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07; // Gnosis Safe 2/3

    function run() external {
        // P0-faithful placeholder rates (1 shard = 1e18 FSB wei):
        // zones.ts ratePerMin 60/60/60/150/300/600 → wei/sec. MUST be recalibrated
        // (Phase-2 economy model) before any real pool is funded on mainnet.
        uint128[6] memory rates = [
            uint128(1e18), // Frostpond        60/min
            uint128(1e18), // Glacier Stream   60/min
            uint128(1e18), // Frozen Marsh     60/min
            uint128(2.5e18), // Rime River    150/min
            uint128(5e18), // Whitewood Forest 300/min
            uint128(10e18) // Great Frostlake  600/min
        ];

        vm.startBroadcast();

        IERC20 fsb;
        IFrostbiteHeroes heroes;
        address adventuresOwner;

        if (block.chainid == 43113) {
            // Fuji: no live FSB/Heroes — deploy faithful mocks; deployer keeps
            // ownership for the rehearsal (fund pool, settle, tune).
            MockFSB mockFsb = new MockFSB();
            MockFrostbiteHeroes mockHeroes = new MockFrostbiteHeroes();
            mockFsb.mint(msg.sender, 1_000_000 ether);
            fsb = IERC20(address(mockFsb));
            heroes = IFrostbiteHeroes(address(mockHeroes));
            adventuresOwner = msg.sender;
            console2.log("MockFSB:", address(mockFsb));
            console2.log("MockHeroes:", address(mockHeroes));
        } else if (block.chainid == 43114) {
            fsb = IERC20(FSB_MAINNET);
            heroes = IFrostbiteHeroes(HEROES_MAINNET);
            adventuresOwner = SAFE;
        } else {
            revert("unsupported chain");
        }

        FrostbiteAdventures adventures = new FrostbiteAdventures(fsb, heroes, adventuresOwner, rates);

        vm.stopBroadcast();

        console2.log("chainId:", block.chainid);
        console2.log("FrostbiteAdventures:", address(adventures));
        console2.log("owner:", adventuresOwner);
    }
}
