/**
 * Redeploy ArenaWarrior and reconfigure all dependent contracts:
 * 1. Deploy new ArenaWarrior
 * 2. Update BattleEngine → setArenaWarrior(new)
 * 3. Update TeamBattleEngine → setArenaWarrior(new)
 * 4. Update FrostbiteMarketplace → setNftContract(new)
 * 5. Authorize BattleEngine + TeamBattleEngine on new ArenaWarrior
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

const BATTLE_ENGINE = contracts.BattleEngine;                     // 0x6f636ea5D2b8c2909baDb32491e7df47F7bd1B42
const TEAM_BATTLE_ENGINE = contracts.TeamBattleEngine;            // 0xdE330aaBB3DF6D127431e244302c44cD486f2c34
const MARKETPLACE = contracts.FrostbiteMarketplace;               // 0xbb22a472AE914d9DACd18064123BA8519a8F728a

console.log("\nExisting contracts:");
console.log("  BattleEngine:", BATTLE_ENGINE);
console.log("  TeamBattleEngine:", TEAM_BATTLE_ENGINE);
console.log("  FrostbiteMarketplace:", MARKETPLACE);
console.log("  Old ArenaWarrior:", contracts.ArenaWarrior);

// ---------------------------------------------------------------------------
// 1. Deploy new ArenaWarrior
// ---------------------------------------------------------------------------
console.log("\n--- 1. Deploying new ArenaWarrior ---");
const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = await ArenaWarrior.deploy();
await arenaWarrior.waitForDeployment();
const newArenaWarriorAddress = await arenaWarrior.getAddress();
console.log("New ArenaWarrior:", newArenaWarriorAddress);

// ---------------------------------------------------------------------------
// 2. Update BattleEngine → setArenaWarrior
// ---------------------------------------------------------------------------
console.log("\n--- 2. BattleEngine.setArenaWarrior ---");
const BattleEngine = await ethers.getContractFactory("BattleEngine");
const battleEngine = BattleEngine.attach(BATTLE_ENGINE);
const tx1 = await battleEngine.setArenaWarrior(newArenaWarriorAddress);
await tx1.wait();
console.log("BattleEngine updated!");

// ---------------------------------------------------------------------------
// 3. Update TeamBattleEngine → setArenaWarrior
// ---------------------------------------------------------------------------
console.log("\n--- 3. TeamBattleEngine.setArenaWarrior ---");
const TeamBattleEngine = await ethers.getContractFactory("TeamBattleEngine");
const teamBattleEngine = TeamBattleEngine.attach(TEAM_BATTLE_ENGINE);
const tx2 = await teamBattleEngine.setArenaWarrior(newArenaWarriorAddress);
await tx2.wait();
console.log("TeamBattleEngine updated!");

// ---------------------------------------------------------------------------
// 4. Update FrostbiteMarketplace → setNftContract
// ---------------------------------------------------------------------------
console.log("\n--- 4. FrostbiteMarketplace.setNftContract ---");
const FrostbiteMarketplace = await ethers.getContractFactory("FrostbiteMarketplace");
const marketplace = FrostbiteMarketplace.attach(MARKETPLACE);
const tx3 = await marketplace.setNftContract(newArenaWarriorAddress);
await tx3.wait();
console.log("FrostbiteMarketplace updated!");

// ---------------------------------------------------------------------------
// 5. Authorize battle contracts on new ArenaWarrior
// ---------------------------------------------------------------------------
console.log("\n--- 5. ArenaWarrior.addBattleContract ---");

console.log("Adding BattleEngine...");
const tx4 = await arenaWarrior.addBattleContract(BATTLE_ENGINE);
await tx4.wait();
console.log("BattleEngine authorized!");

console.log("Adding TeamBattleEngine...");
const tx5 = await arenaWarrior.addBattleContract(TEAM_BATTLE_ENGINE);
await tx5.wait();
console.log("TeamBattleEngine authorized!");

// ---------------------------------------------------------------------------
// 6. Verify
// ---------------------------------------------------------------------------
console.log("\n--- Verification ---");
const isBeAuth = await arenaWarrior.battleContracts(BATTLE_ENGINE);
const isTbeAuth = await arenaWarrior.battleContracts(TEAM_BATTLE_ENGINE);
const ownerAddr = await arenaWarrior.owner();
console.log("Owner:", ownerAddr);
console.log("BattleEngine authorized:", isBeAuth);
console.log("TeamBattleEngine authorized:", isTbeAuth);

// ---------------------------------------------------------------------------
// 7. Update addresses.json
// ---------------------------------------------------------------------------
existingAddresses.contracts.ArenaWarrior = newArenaWarriorAddress;
existingAddresses.arenaWarriorRedeployedAt = new Date().toISOString();

fs.writeFileSync(addressesPath, JSON.stringify(existingAddresses, null, 2));
console.log("\nAddresses updated in:", addressesPath);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n========================================");
console.log("Redeploy Summary");
console.log("========================================");
console.log("New ArenaWarrior:    ", newArenaWarriorAddress);
console.log("BattleEngine:        ", BATTLE_ENGINE, "(setArenaWarrior done)");
console.log("TeamBattleEngine:    ", TEAM_BATTLE_ENGINE, "(setArenaWarrior done)");
console.log("Marketplace:         ", MARKETPLACE, "(setNftContract done)");
console.log("Battle auth:         ", isBeAuth ? "OK" : "FAIL");
console.log("TeamBattle auth:     ", isTbeAuth ? "OK" : "FAIL");
console.log("========================================");
console.log(
  "\nRemaining balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);
