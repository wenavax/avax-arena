import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying QuestEngine with account:", deployer.address);
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
// 1. Deploy QuestEngine
// ---------------------------------------------------------------------------
console.log("\n--- Deploying QuestEngine ---");
const QuestEngine = await ethers.getContractFactory("QuestEngine");
const questEngine = await QuestEngine.deploy(arenaWarriorAddress);
await questEngine.waitForDeployment();
const questEngineAddress = await questEngine.getAddress();
console.log("QuestEngine deployed to:", questEngineAddress);

// ---------------------------------------------------------------------------
// 2. Authorize QuestEngine on ArenaWarrior
// ---------------------------------------------------------------------------
console.log("\n--- Authorizing QuestEngine on ArenaWarrior ---");
const arenaWarrior = await ethers.getContractAt("ArenaWarrior", arenaWarriorAddress);
const authTx = await arenaWarrior.addBattleContract(questEngineAddress);
await authTx.wait();
console.log("QuestEngine authorized as battle contract on ArenaWarrior.");

// ---------------------------------------------------------------------------
// 3. Add all 32 quests (8 zones × 4 difficulties)
// ---------------------------------------------------------------------------
console.log("\n--- Adding 32 quests ---");

// Quest data: [name, zone, difficulty, durationSecs, winXP, lossXP, minLevel, minPowerScore, baseDifficulty]
const questData: [string, number, number, number, number, number, number, number, number][] = [
  // Zone 0: Inferno Caldera (Fire)
  ["Ember Patrol",          0, 0,   300,  50, 15, 1, 0,    80],
  ["Magma Tunnel Run",      0, 1,  7200, 150, 40, 3, 0,   400],
  ["Flame Wyrm's Lair",     0, 2, 21600, 300, 75, 7, 400, 650],
  ["Inferno Titan Siege",   0, 3, 64800, 600, 150, 12, 0, 850],

  // Zone 1: Abyssal Depths (Water)
  ["Coral Reef Patrol",     1, 0,   420,  50, 15, 1, 0,    80],
  ["Sunken Temple Dive",    1, 1,  5400, 150, 40, 3, 0,   400],
  ["Leviathan's Trench",    1, 2, 18000, 300, 75, 7, 400, 650],
  ["Kraken of the Void",    1, 3, 72000, 600, 150, 12, 0, 850],

  // Zone 2: Stormhowl Peaks (Wind)
  ["Gale Ridge Scouting",   2, 0,   540,  50, 15, 1, 0,    80],
  ["Cyclone Gauntlet",      2, 1,  3600, 150, 40, 3, 0,   400],
  ["Thunderbird Nest",      2, 2, 14400, 300, 75, 7, 400, 650],
  ["Storm Sovereign",       2, 3, 57600, 600, 150, 12, 0, 850],

  // Zone 3: Glacial Expanse (Ice)
  ["Frostfang Patrol",      3, 0,   600,  50, 15, 1, 0,    80],
  ["Crystal Cavern Raid",   3, 1,  7200, 150, 40, 3, 0,   400],
  ["Blizzard Colossus",     3, 2, 28800, 300, 75, 7, 400, 650],
  ["The Eternal Frost",     3, 3, 86400, 600, 150, 12, 0, 850],

  // Zone 4: Ironroot Badlands (Earth)
  ["Canyon Escort",         4, 0,   720,  50, 15, 1, 0,    80],
  ["Root Maze Expedition",  4, 1,  5400, 150, 40, 3, 0,   400],
  ["Tremor Beast Hunt",     4, 2, 21600, 300, 75, 7, 400, 650],
  ["World Eater Awakening", 4, 3, 64800, 600, 150, 12, 0, 850],

  // Zone 5: Voltspire Heights (Thunder)
  ["Spark Field Run",       5, 0,   840,  50, 15, 1, 0,    80],
  ["Conduit Tower Sabotage",5, 1,  3600, 150, 40, 3, 0,   400],
  ["Thunder Drake Pursuit", 5, 2, 18000, 300, 75, 7, 400, 650],
  ["The Living Storm",      5, 3, 57600, 600, 150, 12, 0, 850],

  // Zone 6: Umbral Wastes (Shadow)
  ["Penumbra Sweep",        6, 0,   900,  50, 15, 1, 0,    80],
  ["Void Shard Recovery",   6, 1,  7200, 150, 40, 3, 0,   400],
  ["Nightmare Stalker",     6, 2, 21600, 300, 75, 7, 400, 650],
  ["The Hollow King",       6, 3, 72000, 600, 150, 12, 0, 850],

  // Zone 7: Solaris Citadel (Light)
  ["Beacon Watch",          7, 0,   300,  50, 15, 1, 0,    80],
  ["Prism Vault Heist",     7, 1,  5400, 150, 40, 3, 0,   400],
  ["Solar Guardian Trial",  7, 2, 14400, 300, 75, 7, 400, 650],
  ["The Radiant Devourer",  7, 3, 86400, 600, 150, 12, 0, 850],
];

for (let i = 0; i < questData.length; i++) {
  const [name, zone, difficulty, duration, winXP, lossXP, minLevel, minPowerScore, baseDifficulty] = questData[i];
  const tx = await questEngine.addQuest(
    name,
    zone,
    difficulty,
    duration,
    winXP,
    lossXP,
    minLevel,
    minPowerScore,
    baseDifficulty
  );
  await tx.wait();
  console.log(`  [${i}] ${name} (Zone ${zone}, ${["Easy","Medium","Hard","Boss"][difficulty]}) added`);
}

console.log(`\nAll ${questData.length} quests added successfully.`);

// ---------------------------------------------------------------------------
// 4. Save address
// ---------------------------------------------------------------------------
existing.contracts.QuestEngine = questEngineAddress;
existing.constructorArgs.QuestEngine = [arenaWarriorAddress];
fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2));
console.log("\nQuestEngine address saved to deployments/addresses.json");

console.log("\n========================================");
console.log("QuestEngine Deployment Summary");
console.log("========================================");
console.log("QuestEngine:", questEngineAddress);
console.log("ArenaWarrior:", arenaWarriorAddress);
console.log("Quests added:", questData.length);
console.log("========================================");
console.log("\nAdd to frontend .env:");
console.log(`NEXT_PUBLIC_QUEST_ENGINE_ADDRESS=${questEngineAddress}`);
