import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying BatchMinter with account:", deployer.address);
console.log(
  "Account balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);

// Read existing deployment addresses
const deploymentsDir = path.resolve(__dirname, "..", "deployments");
const addressesPath = path.join(deploymentsDir, "addresses.json");

if (!fs.existsSync(addressesPath)) {
  console.error("ERROR: deployments/addresses.json not found. Deploy main contracts first.");
  process.exit(1);
}

const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const arenaWarriorAddress = existing.contracts.ArenaWarrior;
console.log("ArenaWarrior address:", arenaWarriorAddress);

// ---------------------------------------------------------------------------
// 1. Deploy BatchMinter
// ---------------------------------------------------------------------------
console.log("\n--- Deploying BatchMinter ---");
const BatchMinter = await ethers.getContractFactory("BatchMinter");
const batchMinter = await BatchMinter.deploy(arenaWarriorAddress);
await batchMinter.waitForDeployment();
const batchMinterAddress = await batchMinter.getAddress();
console.log("BatchMinter deployed to:", batchMinterAddress);

// ---------------------------------------------------------------------------
// 2. Save address
// ---------------------------------------------------------------------------
existing.contracts.BatchMinter = batchMinterAddress;
existing.constructorArgs.BatchMinter = [arenaWarriorAddress];
fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2));
console.log("\nBatchMinter address saved to deployments/addresses.json");

console.log("\n========================================");
console.log("BatchMinter Deployment Summary");
console.log("========================================");
console.log("BatchMinter:", batchMinterAddress);
console.log("ArenaWarrior:", arenaWarriorAddress);
console.log("========================================");
console.log("\nAdd to frontend .env:");
console.log(`NEXT_PUBLIC_BATCH_MINTER_ADDRESS=${batchMinterAddress}`);
