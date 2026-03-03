/**
 * Upgrade script for audit-fixed contracts:
 * 1. BattleEngine — UUPS proxy upgrade (new implementation)
 * 2. TeamBattleEngine — Fresh deploy (proxy + implementation) since not previously deployed
 * 3. GameEngine — Fresh deploy (not upgradeable)
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
console.log(
  "Balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);

// Load existing addresses
const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");
const existingAddresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const contracts = existingAddresses.contracts;

console.log("\n========================================");
console.log("Existing Contract Addresses:");
console.log("========================================");
console.log("BattleEngine proxy:", contracts.BattleEngine);
console.log("ArenaWarrior:", contracts.ArenaWarrior);
console.log("Leaderboard:", contracts.Leaderboard);
console.log("RewardVault:", contracts.RewardVault);

// ---------------------------------------------------------------------------
// 1. Upgrade BattleEngine (UUPS Proxy)
// ---------------------------------------------------------------------------
console.log("\n--- 1. Upgrading BattleEngine ---");

// Deploy new implementation
const BattleEngineImpl = await ethers.getContractFactory("BattleEngine");
const newBattleEngineImpl = await BattleEngineImpl.deploy();
await newBattleEngineImpl.waitForDeployment();
const newBattleEngineImplAddress = await newBattleEngineImpl.getAddress();
console.log("New BattleEngine implementation:", newBattleEngineImplAddress);

// Attach to proxy to call upgradeToAndCall
const battleEngineProxy = BattleEngineImpl.attach(contracts.BattleEngine);
const upgradeTx = await battleEngineProxy.upgradeToAndCall(
  newBattleEngineImplAddress,
  "0x" // no additional initialization data
);
await upgradeTx.wait();
console.log("BattleEngine proxy upgraded successfully!");

// ---------------------------------------------------------------------------
// 2. Deploy TeamBattleEngine (Fresh — proxy + implementation)
// ---------------------------------------------------------------------------
console.log("\n--- 2. Deploying TeamBattleEngine (Fresh) ---");

// Deploy implementation
const TeamBattleEngineImpl = await ethers.getContractFactory("TeamBattleEngine");
const teamBattleEngineImpl = await TeamBattleEngineImpl.deploy();
await teamBattleEngineImpl.waitForDeployment();
const teamBattleEngineImplAddress = await teamBattleEngineImpl.getAddress();
console.log("TeamBattleEngine implementation:", teamBattleEngineImplAddress);

// Encode initialize call
const teamInitData = TeamBattleEngineImpl.interface.encodeFunctionData("initialize", [
  contracts.ArenaWarrior,
  deployer.address,
]);

// Deploy proxy
const TeamBattleEngineProxy = await ethers.getContractFactory("TeamBattleEngineProxy");
const teamBattleEngineProxy = await TeamBattleEngineProxy.deploy(
  teamBattleEngineImplAddress,
  teamInitData
);
await teamBattleEngineProxy.waitForDeployment();
const teamBattleEngineAddress = await teamBattleEngineProxy.getAddress();
console.log("TeamBattleEngine proxy:", teamBattleEngineAddress);

// Attach ABI to proxy
const teamBattleEngine = TeamBattleEngineImpl.attach(teamBattleEngineAddress);

// ---------------------------------------------------------------------------
// 3. Deploy GameEngine (Fresh — not upgradeable)
// ---------------------------------------------------------------------------
console.log("\n--- 3. Deploying GameEngine ---");

const GameEngine = await ethers.getContractFactory("GameEngine");
const gameEngine = await GameEngine.deploy(
  contracts.RewardVault,
  contracts.Leaderboard
);
await gameEngine.waitForDeployment();
const gameEngineAddress = await gameEngine.getAddress();
console.log("GameEngine deployed to:", gameEngineAddress);

// ---------------------------------------------------------------------------
// Post-Deployment Configuration
// ---------------------------------------------------------------------------
console.log("\n--- Configuring contracts ---");

// Authorize TeamBattleEngine on ArenaWarrior to record battle results
const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = ArenaWarrior.attach(contracts.ArenaWarrior);

console.log("ArenaWarrior.addBattleContract(TeamBattleEngine)...");
const tx1 = await arenaWarrior.addBattleContract(teamBattleEngineAddress);
await tx1.wait();

console.log("All configuration complete.");

// ---------------------------------------------------------------------------
// Update addresses.json
// ---------------------------------------------------------------------------
existingAddresses.contracts.BattleEngineImpl = newBattleEngineImplAddress;
existingAddresses.contracts.TeamBattleEngine = teamBattleEngineAddress;
existingAddresses.contracts.TeamBattleEngineImpl = teamBattleEngineImplAddress;
existingAddresses.contracts.GameEngine = gameEngineAddress;
existingAddresses.upgradedAt = new Date().toISOString();

fs.writeFileSync(addressesPath, JSON.stringify(existingAddresses, null, 2));
console.log("Addresses updated in:", addressesPath);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n========================================");
console.log("Upgrade/Deploy Summary");
console.log("========================================");
console.log("BattleEngine proxy (unchanged):", contracts.BattleEngine);
console.log("BattleEngine impl (NEW):       ", newBattleEngineImplAddress);
console.log("TeamBattleEngine proxy (NEW):  ", teamBattleEngineAddress);
console.log("TeamBattleEngine impl (NEW):   ", teamBattleEngineImplAddress);
console.log("GameEngine (NEW):              ", gameEngineAddress);
console.log("========================================\n");
