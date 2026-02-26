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
// 4. BattleEngine (constructor: arenaWarrior address, feeRecipient address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying BattleEngine ---");
const BattleEngine = await ethers.getContractFactory("BattleEngine");
const battleEngine = await BattleEngine.deploy(
  arenaWarriorAddress,
  deployer.address
);
await battleEngine.waitForDeployment();
const battleEngineAddress = await battleEngine.getAddress();
console.log("BattleEngine deployed to:", battleEngineAddress);

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
// Post-Deployment Configuration
// ---------------------------------------------------------------------------
console.log("\n--- Configuring contracts ---");

// ArenaWarrior: authorize BattleEngine to record battle results
console.log("Setting ArenaWarrior.setBattleContract(BattleEngine)...");
const tx1 = await arenaWarrior.setBattleContract(battleEngineAddress);
await tx1.wait();

// BattleEngine: set ArenaWarrior NFT contract
console.log("Setting BattleEngine.setArenaWarrior(ArenaWarrior)...");
const tx2 = await battleEngine.setArenaWarrior(arenaWarriorAddress);
await tx2.wait();

// BattleEngine: set fee recipient to deployer
console.log("Setting BattleEngine.setFeeRecipient(deployer)...");
const tx3 = await battleEngine.setFeeRecipient(deployer.address);
await tx3.wait();

// AgentChat: set agent registry
console.log("Setting AgentChat.setAgentRegistry(AgentRegistry)...");
const tx4 = await agentChat.setAgentRegistry(agentRegistryAddress);
await tx4.wait();

// AgentRegistry: authorize BattleEngine to record game results
console.log("Setting AgentRegistry.setAuthorizedCaller(BattleEngine, true)...");
const tx5 = await agentRegistry.setAuthorizedCaller(battleEngineAddress, true);
await tx5.wait();

console.log("All post-deployment configuration complete.");

// ---------------------------------------------------------------------------
// Log all addresses
// ---------------------------------------------------------------------------
console.log("\n========================================");
console.log("Deployment Summary");
console.log("========================================");
console.log("ArenaToken:    ", arenaTokenAddress);
console.log("AgentRegistry: ", agentRegistryAddress);
console.log("ArenaWarrior:  ", arenaWarriorAddress);
console.log("BattleEngine:  ", battleEngineAddress);
console.log("AgentChat:     ", agentChatAddress);
console.log("Leaderboard:   ", leaderboardAddress);
console.log("RewardVault:   ", rewardVaultAddress);
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
    AgentChat: agentChatAddress,
    Leaderboard: leaderboardAddress,
    RewardVault: rewardVaultAddress,
  },
  constructorArgs: {
    ArenaToken: [],
    AgentRegistry: [],
    ArenaWarrior: [],
    BattleEngine: [arenaWarriorAddress, deployer.address],
    AgentChat: [agentRegistryAddress],
    Leaderboard: [],
    RewardVault: [arenaTokenAddress],
  },
};

const deploymentsDir = path.resolve(__dirname, "..", "deployments");
if (!fs.existsSync(deploymentsDir)) {
  fs.mkdirSync(deploymentsDir, { recursive: true });
}

const outputPath = path.join(deploymentsDir, "addresses.json");
fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
console.log("Addresses saved to:", outputPath);
