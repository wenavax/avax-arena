/**
 * Deploy Phase 2 — FrostbiteIdentityRegistry + FrostbiteReputationRegistry
 *
 * Usage: npx hardhat run scripts/deploy-phase2.ts --network avalanche
 */

import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying Phase 2 with account:", deployer.address);
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
  throw new Error("deployments/addresses.json not found. Deploy Phase 1 first.");
}

const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const {
  ERC6551Registry: erc6551Registry,
  FrostbiteAccount: frostbiteAccountImpl,
  ArenaWarrior: arenaWarrior,
  BattleEngine: battleEngine,
  TeamBattleEngine: teamBattleEngine,
  QuestEngine: questEngine,
} = addresses.contracts;

console.log("\n--- Existing Addresses ---");
console.log("ERC6551Registry:", erc6551Registry);
console.log("FrostbiteAccount:", frostbiteAccountImpl);
console.log("ArenaWarrior:", arenaWarrior);
console.log("BattleEngine:", battleEngine);
console.log("TeamBattleEngine:", teamBattleEngine);
console.log("QuestEngine:", questEngine);

// -------------------------------------------------------------------------
// Deploy FrostbiteIdentityRegistry
// -------------------------------------------------------------------------

console.log("\n1. Deploying FrostbiteIdentityRegistry...");
const IdentityRegistry = await ethers.getContractFactory("FrostbiteIdentityRegistry");
const identityRegistry = await IdentityRegistry.deploy(
  erc6551Registry,
  frostbiteAccountImpl,
  arenaWarrior
);
await identityRegistry.waitForDeployment();
const identityRegistryAddress = await identityRegistry.getAddress();
console.log("   FrostbiteIdentityRegistry deployed to:", identityRegistryAddress);

// -------------------------------------------------------------------------
// Deploy FrostbiteReputationRegistry
// -------------------------------------------------------------------------

console.log("\n2. Deploying FrostbiteReputationRegistry...");
const ReputationRegistry = await ethers.getContractFactory("FrostbiteReputationRegistry");
const reputationRegistry = await ReputationRegistry.deploy();
await reputationRegistry.waitForDeployment();
const reputationRegistryAddress = await reputationRegistry.getAddress();
console.log("   FrostbiteReputationRegistry deployed to:", reputationRegistryAddress);

// -------------------------------------------------------------------------
// Set authorized callers on ReputationRegistry
// -------------------------------------------------------------------------

console.log("\n3. Setting authorized callers on ReputationRegistry...");

const tx1 = await reputationRegistry.addAuthorizedCaller(battleEngine);
await tx1.wait();
console.log("   Added BattleEngine as authorized caller:", battleEngine);

const tx2 = await reputationRegistry.addAuthorizedCaller(teamBattleEngine);
await tx2.wait();
console.log("   Added TeamBattleEngine as authorized caller:", teamBattleEngine);

const tx3 = await reputationRegistry.addAuthorizedCaller(questEngine);
await tx3.wait();
console.log("   Added QuestEngine as authorized caller:", questEngine);

// -------------------------------------------------------------------------
// Update addresses.json
// -------------------------------------------------------------------------

addresses.contracts.FrostbiteIdentityRegistry = identityRegistryAddress;
addresses.contracts.FrostbiteReputationRegistry = reputationRegistryAddress;

addresses.constructorArgs.FrostbiteIdentityRegistry = [
  erc6551Registry,
  frostbiteAccountImpl,
  arenaWarrior,
];
addresses.constructorArgs.FrostbiteReputationRegistry = [];

fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
console.log("\n4. Updated deployments/addresses.json");

// -------------------------------------------------------------------------
// Print env vars for frontend
// -------------------------------------------------------------------------

console.log("\n=== Add to .env ===");
console.log(`NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=${identityRegistryAddress}`);
console.log(`NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=${reputationRegistryAddress}`);

console.log("\n--- Phase 2 Deployment Complete ---");
console.log("   FrostbiteIdentityRegistry:", identityRegistryAddress);
console.log("   FrostbiteReputationRegistry:", reputationRegistryAddress);
console.log("   Authorized callers set: BattleEngine, TeamBattleEngine, QuestEngine");
