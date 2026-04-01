/**
 * Deploy Phase 3 — FrostbiteAccountV2 (Delegation-enabled TBA)
 *
 * Usage: npx hardhat run scripts/deploy-phase3.ts --network avalanche
 */

import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying Phase 3 with account:", deployer.address);
console.log(
  "Account balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);

// -------------------------------------------------------------------------
// Load existing addresses
// -------------------------------------------------------------------------

const deploymentsDir = path.resolve(__dirname, "..", "deployments");
const addressesPath = path.join(deploymentsDir, "addresses.json");

if (!fs.existsSync(addressesPath)) {
  throw new Error(
    "deployments/addresses.json not found. Deploy Phase 1 & 2 first."
  );
}

const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));

console.log("\n--- Existing Addresses ---");
console.log("FrostbiteAccount (V1):", addresses.contracts.FrostbiteAccount);
console.log(
  "FrostbiteIdentityRegistry:",
  addresses.contracts.FrostbiteIdentityRegistry
);

// -------------------------------------------------------------------------
// Deploy FrostbiteAccountV2
// -------------------------------------------------------------------------

console.log("\n1. Deploying FrostbiteAccountV2...");
const AccountV2 = await ethers.getContractFactory("FrostbiteAccountV2");
const accountV2 = await AccountV2.deploy();
await accountV2.waitForDeployment();
const accountV2Address = await accountV2.getAddress();
console.log("   FrostbiteAccountV2 deployed to:", accountV2Address);

// -------------------------------------------------------------------------
// Update addresses.json
// -------------------------------------------------------------------------

addresses.contracts.FrostbiteAccountV2 = accountV2Address;
addresses.constructorArgs.FrostbiteAccountV2 = [];

fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
console.log("\n2. Updated deployments/addresses.json");

// -------------------------------------------------------------------------
// Print env vars for frontend
// -------------------------------------------------------------------------

console.log("\n=== Add to .env ===");
console.log(`NEXT_PUBLIC_FROSTBITE_ACCOUNT_V2_ADDRESS=${accountV2Address}`);

console.log("\n--- Phase 3 Deployment Complete ---");
console.log("   FrostbiteAccountV2:", accountV2Address);
console.log(
  "\n   NOTE: Warriors that want delegation must create a NEW TBA"
);
console.log(
  "   using the V2 implementation via the ERC-6551 Registry."
);
console.log(
  "   Existing V1 TBAs remain unchanged and fully functional."
);
console.log(
  "\n   To create a V2 TBA for a warrior:"
);
console.log(
  "   erc6551Registry.createAccount(accountV2Address, 0, chainId, arenaWarrior, tokenId)"
);
