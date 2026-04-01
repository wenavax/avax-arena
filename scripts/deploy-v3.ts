/**
 * Deploy FrostbiteAccountV3 — fully secured TBA implementation.
 */
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

console.log("Deployer:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX\n");

console.log("Deploying FrostbiteAccountV3...");
const V3 = await ethers.getContractFactory("FrostbiteAccountV3");
const v3 = await V3.deploy();
await v3.waitForDeployment();
const v3Addr = await v3.getAddress();
console.log("FrostbiteAccountV3:", v3Addr);

// Update addresses.json
const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");
if (fs.existsSync(addressesPath)) {
  const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
  existing.contracts.FrostbiteAccountV3 = v3Addr;
  fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2));
  console.log("Updated addresses.json");
}

console.log("\n=== Add to .env ===");
console.log(`NEXT_PUBLIC_FROSTBITE_ACCOUNT_V3_ADDRESS=${v3Addr}`);
console.log("\n✅ FrostbiteAccountV3 deployed!");
