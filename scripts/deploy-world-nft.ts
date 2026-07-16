import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying with account:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");

// ---------------------------------------------------------------------------
// 1. FrostbiteHeroes (ERC-721)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying FrostbiteHeroes ---");
const Heroes = await ethers.getContractFactory("FrostbiteHeroes");
const heroes = await Heroes.deploy();
await heroes.waitForDeployment();
const heroesAddress = await heroes.getAddress();
console.log("FrostbiteHeroes deployed to:", heroesAddress);

// ---------------------------------------------------------------------------
// 2. FrostbiteItems (ERC-1155)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying FrostbiteItems ---");
const Items = await ethers.getContractFactory("FrostbiteItems");
const items = await Items.deploy(deployer.address);
await items.waitForDeployment();
const itemsAddress = await items.getAddress();
console.log("FrostbiteItems deployed to:", itemsAddress);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n═══════════════════════════════════════════");
console.log("  DEPLOYMENT COMPLETE");
console.log("═══════════════════════════════════════════");
console.log(`  FrostbiteHeroes:  ${heroesAddress}`);
console.log(`  FrostbiteItems:   ${itemsAddress}`);
console.log("═══════════════════════════════════════════");

// Save addresses
const addresses = {
  FrostbiteHeroes: heroesAddress,
  FrostbiteItems: itemsAddress,
  deployedAt: new Date().toISOString(),
  deployer: deployer.address,
  network: "avalanche-mainnet",
};

const outPath = path.join(__dirname, "..", "deployments", "world-nft-mainnet.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
console.log(`\nAddresses saved to: ${outPath}`);
