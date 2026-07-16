// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PixelAtlas} from "../src/PixelAtlas.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploy öncesi sanity check. Broadcast YOK — sadece simulate.
/// Kullanım:
///   source .env
///   forge script script/PreflightDeploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL
///
/// Doğrular:
///  - PRIVATE_KEY bakiyesi yeterli mi (gas için)
///  - USDC adresi geçerli ERC-20 mu (decimals=6 mı)
///  - TREASURY contract değil EOA/safe mi
///  - LAND_ROOT formatı
///  - Constructor args
contract PreflightDeploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address usdc = vm.envAddress(_usdcEnvKey());
        address treasury = vm.envAddress("TREASURY");
        bytes32 landRoot = vm.envOr("LAND_ROOT", bytes32(0));

        console2.log("=== Preflight checks ===");
        console2.log("chainId:    ", block.chainid);
        console2.log("deployer:   ", deployer);
        console2.log("USDC:       ", usdc);
        console2.log("treasury:   ", treasury);
        console2.log("landRoot:   ", uint256(landRoot));
        console2.log("");

        // 1) deployer ETH bakiyesi
        // Base'de deploy ~0.0002-0.0005 ETH (gas ~0.1 gwei * 2-3M gas). 5x marj.
        uint256 bal = deployer.balance;
        console2.log("deployer ETH:", bal);
        require(bal >= 0.0005 ether, "deployer ETH too low (need >=0.0005 for deploy)");

        // 2) USDC sanity
        require(usdc.code.length > 0, "USDC address has no code");
        try IERC20Decimals(usdc).decimals() returns (uint8 dec) {
            console2.log("USDC decimals:", dec);
            require(dec == 6, "USDC must have 6 decimals (Base USDC standard)");
        } catch {
            revert("USDC decimals() call failed");
        }
        try IERC20(usdc).totalSupply() returns (uint256 ts) {
            console2.log("USDC totalSupply:", ts);
            require(ts > 0, "USDC totalSupply 0?");
        } catch {
            revert("USDC totalSupply() failed");
        }

        // 3) treasury sanity — EOA ya da Safe; kontrat olmasında sorun yok
        //    ama 0x0 olmamalı
        require(treasury != address(0), "treasury is 0x0");
        if (treasury.code.length > 0) {
            console2.log("NOTE: treasury is a contract (probably Gnosis Safe)");
        } else {
            console2.log("NOTE: treasury is EOA");
        }

        // 4) landRoot — boş olabilir (gating off), formatı bilgi amaçlı log
        if (landRoot == bytes32(0)) {
            console2.log("landRoot empty -> landCheck OFF (default)");
        } else {
            console2.log("landRoot set -> landCheck ON after deploy");
        }

        // 5) Estimate deploy: yeni instance kur (broadcast yok)
        PixelAtlas instance = new PixelAtlas(usdc, treasury, landRoot);
        console2.log("");
        console2.log("Simulated atlas:", address(instance));
        console2.log("mintPrice:      ", instance.mintPrice());
        console2.log("landCheck:      ", instance.landCheck());

        console2.log("");
        console2.log("=== READY to deploy ===");
        console2.log("Next: forge script script/Deploy.s.sol --rpc-url <RPC> --broadcast --verify");
    }

    function _usdcEnvKey() internal view returns (string memory) {
        try vm.envAddress("USDC") returns (address) {
            return "USDC";
        } catch {
            if (block.chainid == 8453) return "USDC_MAINNET";
            if (block.chainid == 84532) return "USDC_SEPOLIA";
            revert("set USDC env (or USDC_MAINNET / USDC_SEPOLIA)");
        }
    }
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}
