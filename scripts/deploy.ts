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
// 2. AgentRegistry (no constructor args)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying AgentRegistry ---");
const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
const agentRegistry = await AgentRegistry.deploy();
await agentRegistry.waitForDeployment();
const agentRegistryAddress = await agentRegistry.getAddress();
console.log("AgentRegistry deployed to:", agentRegistryAddress);

// ---------------------------------------------------------------------------
// 3. ArenaWarrior (no constructor args — ERC-721 NFT)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying ArenaWarrior ---");
const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = await ArenaWarrior.deploy();
await arenaWarrior.waitForDeployment();
const arenaWarriorAddress = await arenaWarrior.getAddress();
console.log("ArenaWarrior deployed to:", arenaWarriorAddress);

// ---------------------------------------------------------------------------
// 4. BattleEngine (UUPS Proxy)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying BattleEngine (UUPS Proxy) ---");

// Deploy implementation
const BattleEngineImpl = await ethers.getContractFactory("BattleEngine");
const battleEngineImpl = await BattleEngineImpl.deploy();
await battleEngineImpl.waitForDeployment();
const battleEngineImplAddress = await battleEngineImpl.getAddress();
console.log("BattleEngine implementation:", battleEngineImplAddress);

// Encode initialize call
const initData = BattleEngineImpl.interface.encodeFunctionData("initialize", [
  arenaWarriorAddress,
  deployer.address,
]);

// Deploy proxy
const BattleEngineProxy = await ethers.getContractFactory("BattleEngineProxy");
const battleEngineProxy = await BattleEngineProxy.deploy(
  battleEngineImplAddress,
  initData
);
await battleEngineProxy.waitForDeployment();
const battleEngineAddress = await battleEngineProxy.getAddress();
console.log("BattleEngine proxy:", battleEngineAddress);

// Attach ABI to proxy address for subsequent calls
const battleEngine = BattleEngineImpl.attach(battleEngineAddress);

// ---------------------------------------------------------------------------
// 4b. TeamBattleEngine (UUPS Proxy)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying TeamBattleEngine (UUPS Proxy) ---");

// Deploy implementation
const TeamBattleEngineImpl = await ethers.getContractFactory("TeamBattleEngine");
const teamBattleEngineImpl = await TeamBattleEngineImpl.deploy();
await teamBattleEngineImpl.waitForDeployment();
const teamBattleEngineImplAddress = await teamBattleEngineImpl.getAddress();
console.log("TeamBattleEngine implementation:", teamBattleEngineImplAddress);

// Encode initialize call
const teamInitData = TeamBattleEngineImpl.interface.encodeFunctionData("initialize", [
  arenaWarriorAddress,
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

// Attach ABI to proxy address
const teamBattleEngine = TeamBattleEngineImpl.attach(teamBattleEngineAddress);

// ---------------------------------------------------------------------------
// 5. AgentChat (constructor: agentRegistry address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying AgentChat ---");
const AgentChat = await ethers.getContractFactory("AgentChat");
const agentChat = await AgentChat.deploy(agentRegistryAddress);
await agentChat.waitForDeployment();
const agentChatAddress = await agentChat.getAddress();
console.log("AgentChat deployed to:", agentChatAddress);

// ---------------------------------------------------------------------------
// 6. Leaderboard (no constructor args)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying Leaderboard ---");
const Leaderboard = await ethers.getContractFactory("Leaderboard");
const leaderboard = await Leaderboard.deploy();
await leaderboard.waitForDeployment();
const leaderboardAddress = await leaderboard.getAddress();
console.log("Leaderboard deployed to:", leaderboardAddress);

// ---------------------------------------------------------------------------
// 7. RewardVault (constructor: arenaToken address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying RewardVault ---");
const RewardVault = await ethers.getContractFactory("RewardVault");
const rewardVault = await RewardVault.deploy(arenaTokenAddress);
await rewardVault.waitForDeployment();
const rewardVaultAddress = await rewardVault.getAddress();
console.log("RewardVault deployed to:", rewardVaultAddress);

// ---------------------------------------------------------------------------
// 8. FrostbiteMarketplace (constructor: arenaWarrior address, feeRecipient)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying FrostbiteMarketplace ---");
const FrostbiteMarketplace = await ethers.getContractFactory(
  "FrostbiteMarketplace"
);
const marketplace = await FrostbiteMarketplace.deploy(
  arenaWarriorAddress,
  deployer.address
);
await marketplace.waitForDeployment();
const marketplaceAddress = await marketplace.getAddress();
console.log("FrostbiteMarketplace deployed to:", marketplaceAddress);

// ---------------------------------------------------------------------------
// 9. Tournament (no constructor args)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying Tournament ---");
const Tournament = await ethers.getContractFactory("Tournament");
const tournament = await Tournament.deploy();
await tournament.waitForDeployment();
const tournamentAddress = await tournament.getAddress();
console.log("Tournament deployed to:", tournamentAddress);

// ---------------------------------------------------------------------------
// Post-Deployment Configuration
// ---------------------------------------------------------------------------
console.log("\n--- Configuring contracts ---");

// ArenaWarrior: authorize BattleEngine to record battle results
console.log("Setting ArenaWarrior.addBattleContract(BattleEngine)...");
const tx1 = await arenaWarrior.addBattleContract(battleEngineAddress);
await tx1.wait();

// ArenaWarrior: authorize TeamBattleEngine to record battle results
console.log("Setting ArenaWarrior.addBattleContract(TeamBattleEngine)...");
const tx1b = await arenaWarrior.addBattleContract(teamBattleEngineAddress);
await tx1b.wait();

// BattleEngine: set ArenaWarrior NFT contract
console.log("Setting BattleEngine.setArenaWarrior(ArenaWarrior)...");
const tx2 = await battleEngine.setArenaWarrior(arenaWarriorAddress);
await tx2.wait();

// BattleEngine: set fee recipient to deployer
console.log("Setting BattleEngine.setFeeRecipient(deployer)...");
const tx3 = await battleEngine.setFeeRecipient(deployer.address);
await tx3.wait();

// TeamBattleEngine: set ArenaWarrior NFT contract
console.log("Setting TeamBattleEngine.setArenaWarrior(ArenaWarrior)...");
const tx3b = await teamBattleEngine.setArenaWarrior(arenaWarriorAddress);
await tx3b.wait();

// TeamBattleEngine: set fee recipient to deployer
console.log("Setting TeamBattleEngine.setFeeRecipient(deployer)...");
const tx3c = await teamBattleEngine.setFeeRecipient(deployer.address);
await tx3c.wait();

// AgentChat: set agent registry
console.log("Setting AgentChat.setAgentRegistry(AgentRegistry)...");
const tx4 = await agentChat.setAgentRegistry(agentRegistryAddress);
await tx4.wait();

// AgentRegistry: authorize BattleEngine to record game results
console.log("Setting AgentRegistry.setAuthorizedCaller(BattleEngine, true)...");
const tx5 = await agentRegistry.setAuthorizedCaller(battleEngineAddress, true);
await tx5.wait();

// Leaderboard: authorize BattleEngine as game engine
console.log("Setting Leaderboard.setGameEngine(BattleEngine)...");
const tx6 = await leaderboard.setGameEngine(battleEngineAddress);
await tx6.wait();

// ArenaToken: authorize BattleEngine as game engine for minting rewards
console.log("Setting ArenaToken.setGameEngine(BattleEngine)...");
const tx7 = await arenaToken.setGameEngine(battleEngineAddress);
await tx7.wait();

// ArenaToken: authorize Tournament for minting rewards
console.log("Setting ArenaToken.setTournament(Tournament)...");
const tx8 = await arenaToken.setTournament(tournamentAddress);
await tx8.wait();

console.log("All post-deployment configuration complete.");

// ---------------------------------------------------------------------------
// Log all addresses
// ---------------------------------------------------------------------------
console.log("\n========================================");
console.log("Deployment Summary");
console.log("========================================");
console.log("ArenaToken:              ", arenaTokenAddress);
console.log("AgentRegistry:           ", agentRegistryAddress);
console.log("ArenaWarrior:            ", arenaWarriorAddress);
console.log("BattleEngine (proxy):    ", battleEngineAddress);
console.log("BattleEngine (impl):     ", battleEngineImplAddress);
console.log("TeamBattleEngine (proxy):", teamBattleEngineAddress);
console.log("TeamBattleEngine (impl): ", teamBattleEngineImplAddress);
console.log("AgentChat:               ", agentChatAddress);
console.log("Leaderboard:             ", leaderboardAddress);
console.log("RewardVault:             ", rewardVaultAddress);
console.log("FrostbiteMarketplace:    ", marketplaceAddress);
console.log("Tournament:              ", tournamentAddress);
console.log("========================================\n");

// ---------------------------------------------------------------------------
// Save addresses to deployments/addresses.json
// ---------------------------------------------------------------------------
const addresses = {
  network: (await ethers.provider.getNetwork()).name,
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  deployer: deployer.address,
  deployedAt: new Date().toISOString(),
  contracts: {
    ArenaToken: arenaTokenAddress,
    AgentRegistry: agentRegistryAddress,
    ArenaWarrior: arenaWarriorAddress,
    BattleEngine: battleEngineAddress,
    BattleEngineImpl: battleEngineImplAddress,
    TeamBattleEngine: teamBattleEngineAddress,
    TeamBattleEngineImpl: teamBattleEngineImplAddress,
    AgentChat: agentChatAddress,
    Leaderboard: leaderboardAddress,
    RewardVault: rewardVaultAddress,
    FrostbiteMarketplace: marketplaceAddress,
    Tournament: tournamentAddress,
  },
  constructorArgs: {
    ArenaToken: [],
    AgentRegistry: [],
    ArenaWarrior: [],
    BattleEngineImpl: [],
    BattleEngineProxy: [battleEngineImplAddress, "initialize(address,address)"],
    TeamBattleEngineImpl: [],
    TeamBattleEngineProxy: [teamBattleEngineImplAddress, "initialize(address,address)"],
    AgentChat: [agentRegistryAddress],
    Leaderboard: [],
    RewardVault: [arenaTokenAddress],
    FrostbiteMarketplace: [arenaWarriorAddress, deployer.address],
    Tournament: [],
  },
};

const deploymentsDir = path.resolve(__dirname, "..", "deployments");
if (!fs.existsSync(deploymentsDir)) {
  fs.mkdirSync(deploymentsDir, { recursive: true });
}

const outputPath = path.join(deploymentsDir, "addresses.json");
fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
console.log("Addresses saved to:", outputPath);
