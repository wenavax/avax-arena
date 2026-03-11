import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deploying contracts with account:", deployer.address);
console.log(
  "Account balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);

// ---------------------------------------------------------------------------
// 1. ArenaToken (no constructor args, mints 10M to deployer)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying ArenaToken ---");
const ArenaToken = await ethers.getContractFactory("ArenaToken");
const arenaToken = await ArenaToken.deploy();
await arenaToken.waitForDeployment();
const arenaTokenAddress = await arenaToken.getAddress();
console.log("ArenaToken deployed to:", arenaTokenAddress);

// ---------------------------------------------------------------------------
// 2. ArenaWarrior (no constructor args — ERC-721 NFT)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying ArenaWarrior ---");
const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = await ArenaWarrior.deploy();
await arenaWarrior.waitForDeployment();
const arenaWarriorAddress = await arenaWarrior.getAddress();
console.log("ArenaWarrior deployed to:", arenaWarriorAddress);

// ---------------------------------------------------------------------------
// 3. BattleEngine (UUPS Proxy)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying BattleEngine (UUPS Proxy) ---");

const BattleEngineImpl = await ethers.getContractFactory("BattleEngine");
const battleEngineImpl = await BattleEngineImpl.deploy();
await battleEngineImpl.waitForDeployment();
const battleEngineImplAddress = await battleEngineImpl.getAddress();
console.log("BattleEngine implementation:", battleEngineImplAddress);

const initData = BattleEngineImpl.interface.encodeFunctionData("initialize", [
  arenaWarriorAddress,
  deployer.address,
]);

const BattleEngineProxy = await ethers.getContractFactory("BattleEngineProxy");
const battleEngineProxy = await BattleEngineProxy.deploy(
  battleEngineImplAddress,
  initData
);
await battleEngineProxy.waitForDeployment();
const battleEngineAddress = await battleEngineProxy.getAddress();
console.log("BattleEngine proxy:", battleEngineAddress);

const battleEngine = BattleEngineImpl.attach(battleEngineAddress);

// ---------------------------------------------------------------------------
// 4. TeamBattleEngine (UUPS Proxy)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying TeamBattleEngine (UUPS Proxy) ---");

const TeamBattleEngineImpl = await ethers.getContractFactory("TeamBattleEngine");
const teamBattleEngineImpl = await TeamBattleEngineImpl.deploy();
await teamBattleEngineImpl.waitForDeployment();
const teamBattleEngineImplAddress = await teamBattleEngineImpl.getAddress();
console.log("TeamBattleEngine implementation:", teamBattleEngineImplAddress);

const teamInitData = TeamBattleEngineImpl.interface.encodeFunctionData("initialize", [
  arenaWarriorAddress,
  deployer.address,
]);

const TeamBattleEngineProxy = await ethers.getContractFactory("TeamBattleEngineProxy");
const teamBattleEngineProxy = await TeamBattleEngineProxy.deploy(
  teamBattleEngineImplAddress,
  teamInitData
);
await teamBattleEngineProxy.waitForDeployment();
const teamBattleEngineAddress = await teamBattleEngineProxy.getAddress();
console.log("TeamBattleEngine proxy:", teamBattleEngineAddress);

const teamBattleEngine = TeamBattleEngineImpl.attach(teamBattleEngineAddress);

// ---------------------------------------------------------------------------
// 5. Leaderboard
// ---------------------------------------------------------------------------
console.log("\n--- Deploying Leaderboard ---");
const Leaderboard = await ethers.getContractFactory("Leaderboard");
const leaderboard = await Leaderboard.deploy();
await leaderboard.waitForDeployment();
const leaderboardAddress = await leaderboard.getAddress();
console.log("Leaderboard deployed to:", leaderboardAddress);

// ---------------------------------------------------------------------------
// 6. RewardVault (constructor: arenaToken address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying RewardVault ---");
const RewardVault = await ethers.getContractFactory("RewardVault");
const rewardVault = await RewardVault.deploy(arenaTokenAddress);
await rewardVault.waitForDeployment();
const rewardVaultAddress = await rewardVault.getAddress();
console.log("RewardVault deployed to:", rewardVaultAddress);

// ---------------------------------------------------------------------------
// 7. FrostbiteMarketplace (constructor: arenaWarrior, feeRecipient)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying FrostbiteMarketplace ---");
const FrostbiteMarketplace = await ethers.getContractFactory("FrostbiteMarketplace");
const marketplace = await FrostbiteMarketplace.deploy(
  arenaWarriorAddress,
  deployer.address
);
await marketplace.waitForDeployment();
const marketplaceAddress = await marketplace.getAddress();
console.log("FrostbiteMarketplace deployed to:", marketplaceAddress);

// ---------------------------------------------------------------------------
// 8. Tournament
// ---------------------------------------------------------------------------
console.log("\n--- Deploying Tournament ---");
const Tournament = await ethers.getContractFactory("Tournament");
const tournament = await Tournament.deploy();
await tournament.waitForDeployment();
const tournamentAddress = await tournament.getAddress();
console.log("Tournament deployed to:", tournamentAddress);

// ---------------------------------------------------------------------------
// 9. QuestEngine (constructor: arenaWarrior address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying QuestEngine ---");
const QuestEngine = await ethers.getContractFactory("QuestEngine");
const questEngine = await QuestEngine.deploy(arenaWarriorAddress);
await questEngine.waitForDeployment();
const questEngineAddress = await questEngine.getAddress();
console.log("QuestEngine deployed to:", questEngineAddress);

// ---------------------------------------------------------------------------
// 10. BatchMinter (constructor: arenaWarrior address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying BatchMinter ---");
const BatchMinter = await ethers.getContractFactory("BatchMinter");
const batchMinter = await BatchMinter.deploy(arenaWarriorAddress);
await batchMinter.waitForDeployment();
const batchMinterAddress = await batchMinter.getAddress();
console.log("BatchMinter deployed to:", batchMinterAddress);

// ---------------------------------------------------------------------------
// Post-Deployment Configuration
// ---------------------------------------------------------------------------
console.log("\n--- Configuring contracts ---");

// ArenaWarrior: authorize BattleEngine
console.log("1/8 ArenaWarrior.addBattleContract(BattleEngine)...");
await (await arenaWarrior.addBattleContract(battleEngineAddress)).wait();

// ArenaWarrior: authorize TeamBattleEngine
console.log("2/8 ArenaWarrior.addBattleContract(TeamBattleEngine)...");
await (await arenaWarrior.addBattleContract(teamBattleEngineAddress)).wait();

// ArenaWarrior: authorize QuestEngine
console.log("3/8 ArenaWarrior.addBattleContract(QuestEngine)...");
await (await arenaWarrior.addBattleContract(questEngineAddress)).wait();

// BattleEngine: set fee recipient
console.log("4/8 BattleEngine.setFeeRecipient(deployer)...");
await (await battleEngine.setFeeRecipient(deployer.address)).wait();

// TeamBattleEngine: set fee recipient
console.log("5/8 TeamBattleEngine.setFeeRecipient(deployer)...");
await (await teamBattleEngine.setFeeRecipient(deployer.address)).wait();

// Leaderboard: authorize BattleEngine
console.log("6/8 Leaderboard.setGameEngine(BattleEngine)...");
await (await leaderboard.setGameEngine(battleEngineAddress)).wait();

// ArenaToken: authorize BattleEngine for rewards
console.log("7/8 ArenaToken.setGameEngine(BattleEngine)...");
await (await arenaToken.setGameEngine(battleEngineAddress)).wait();

// ArenaToken: authorize Tournament for rewards
console.log("8/8 ArenaToken.setTournament(Tournament)...");
await (await arenaToken.setTournament(tournamentAddress)).wait();

console.log("All post-deployment configuration complete.");

// ---------------------------------------------------------------------------
// Add 32 Quests
// ---------------------------------------------------------------------------
console.log("\n--- Adding 32 quests ---");

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
  const tx = await questEngine.addQuest(name, zone, difficulty, duration, winXP, lossXP, minLevel, minPowerScore, baseDifficulty);
  await tx.wait();
  console.log(`  [${i}] ${name} (Zone ${zone}, ${["Easy","Medium","Hard","Boss"][difficulty]})`);
}

console.log(`All ${questData.length} quests added.`);

// ---------------------------------------------------------------------------
// Summary & Save
// ---------------------------------------------------------------------------
const addresses = {
  network: "avalanche-mainnet",
  chainId: 43114,
  deployer: deployer.address,
  deployedAt: new Date().toISOString(),
  contracts: {
    ArenaToken: arenaTokenAddress,
    ArenaWarrior: arenaWarriorAddress,
    BattleEngine: battleEngineAddress,
    BattleEngineImpl: battleEngineImplAddress,
    TeamBattleEngine: teamBattleEngineAddress,
    TeamBattleEngineImpl: teamBattleEngineImplAddress,
    Leaderboard: leaderboardAddress,
    RewardVault: rewardVaultAddress,
    FrostbiteMarketplace: marketplaceAddress,
    Tournament: tournamentAddress,
    QuestEngine: questEngineAddress,
    BatchMinter: batchMinterAddress,
  },
};

const deploymentsDir = path.resolve(__dirname, "..", "deployments");
if (!fs.existsSync(deploymentsDir)) {
  fs.mkdirSync(deploymentsDir, { recursive: true });
}

const outputPath = path.join(deploymentsDir, "mainnet-addresses.json");
fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));

console.log("\n========================================");
console.log("MAINNET DEPLOYMENT SUMMARY");
console.log("========================================");
console.log("ArenaToken:              ", arenaTokenAddress);
console.log("ArenaWarrior:            ", arenaWarriorAddress);
console.log("BattleEngine (proxy):    ", battleEngineAddress);
console.log("TeamBattleEngine (proxy):", teamBattleEngineAddress);
console.log("Leaderboard:             ", leaderboardAddress);
console.log("RewardVault:             ", rewardVaultAddress);
console.log("FrostbiteMarketplace:    ", marketplaceAddress);
console.log("Tournament:              ", tournamentAddress);
console.log("QuestEngine:             ", questEngineAddress);
console.log("BatchMinter:             ", batchMinterAddress);
console.log("========================================");
console.log("Saved to:", outputPath);

console.log("\n--- Frontend .env values ---");
console.log(`NEXT_PUBLIC_ARENA_TOKEN_ADDRESS=${arenaTokenAddress}`);
console.log(`NEXT_PUBLIC_ARENA_WARRIOR_ADDRESS=${arenaWarriorAddress}`);
console.log(`NEXT_PUBLIC_BATTLE_ENGINE_ADDRESS=${battleEngineAddress}`);
console.log(`NEXT_PUBLIC_TEAM_BATTLE_ENGINE_ADDRESS=${teamBattleEngineAddress}`);
console.log(`NEXT_PUBLIC_LEADERBOARD_ADDRESS=${leaderboardAddress}`);
console.log(`NEXT_PUBLIC_REWARD_VAULT_ADDRESS=${rewardVaultAddress}`);
console.log(`NEXT_PUBLIC_MARKETPLACE_ADDRESS=${marketplaceAddress}`);
console.log(`NEXT_PUBLIC_TOURNAMENT_ADDRESS=${tournamentAddress}`);
console.log(`NEXT_PUBLIC_QUEST_ENGINE_ADDRESS=${questEngineAddress}`);
console.log(`NEXT_PUBLIC_BATCH_MINTER_ADDRESS=${batchMinterAddress}`);

const remaining = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
console.log(`\nRemaining deployer balance: ${remaining} AVAX`);
