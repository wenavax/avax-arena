/**
 * Deploy FrostbiteAccount — ERC-6551 Token Bound Account implementation.
 *
 * Usage: npx hardhat run scripts/deploy-tba.ts --network mainnet
 */

import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying FrostbiteAccount with account:", deployer.address);
console.log(
  "Account balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);

// Deploy FrostbiteAccount implementation
console.log("\nDeploying FrostbiteAccount (TBA implementation)...");
const FrostbiteAccount = await ethers.getContractFactory("FrostbiteAccount");
const frostbiteAccount = await FrostbiteAccount.deploy();
await frostbiteAccount.waitForDeployment();
const accountAddress = await frostbiteAccount.getAddress();
console.log("FrostbiteAccount deployed to:", accountAddress);

// Verify on ERC-6551 Registry
const ERC6551_REGISTRY = "0x000000006551c19487814612e58FE06813775758";
console.log("\nERC-6551 Registry:", ERC6551_REGISTRY);

// Update addresses.json
const deploymentsDir = path.resolve(__dirname, "..", "deployments");
const addressesPath = path.join(deploymentsDir, "addresses.json");

if (fs.existsSync(addressesPath)) {
  const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
  existing.contracts.FrostbiteAccount = accountAddress;
  existing.contracts.ERC6551Registry = ERC6551_REGISTRY;
  fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2));
  console.log("Updated deployments/addresses.json");
}

// Print env var for frontend
console.log("\n=== Add to .env ===");
console.log(`NEXT_PUBLIC_FROSTBITE_ACCOUNT_ADDRESS=${accountAddress}`);

console.log("\n✅ FrostbiteAccount deployment complete!");
console.log("   Implementation:", accountAddress);
console.log("   Registry:", ERC6551_REGISTRY);
console.log("   ChainId:", 43114);
