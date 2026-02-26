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
// 2. Leaderboard (no constructor args)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying Leaderboard ---");
const Leaderboard = await ethers.getContractFactory("Leaderboard");
const leaderboard = await Leaderboard.deploy();
await leaderboard.waitForDeployment();
const leaderboardAddress = await leaderboard.getAddress();
console.log("Leaderboard deployed to:", leaderboardAddress);

// ---------------------------------------------------------------------------
// 3. RewardVault (constructor: arenaToken address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying RewardVault ---");
const RewardVault = await ethers.getContractFactory("RewardVault");
const rewardVault = await RewardVault.deploy(arenaTokenAddress);
await rewardVault.waitForDeployment();
const rewardVaultAddress = await rewardVault.getAddress();
console.log("RewardVault deployed to:", rewardVaultAddress);

// ---------------------------------------------------------------------------
// 4. GameEngine (constructor: rewardVault address, leaderboard address)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying GameEngine ---");
const GameEngine = await ethers.getContractFactory("GameEngine");
const gameEngine = await GameEngine.deploy(rewardVaultAddress, leaderboardAddress);
await gameEngine.waitForDeployment();
const gameEngineAddress = await gameEngine.getAddress();
console.log("GameEngine deployed to:", gameEngineAddress);

// ---------------------------------------------------------------------------
// 5. Tournament (no constructor args, Ownable)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying Tournament ---");
const Tournament = await ethers.getContractFactory("Tournament");
const tournament = await Tournament.deploy();
await tournament.waitForDeployment();
const tournamentAddress = await tournament.getAddress();
console.log("Tournament deployed to:", tournamentAddress);

// ---------------------------------------------------------------------------
// 6. AgentRegistry (no constructor args)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying AgentRegistry ---");
const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
const agentRegistry = await AgentRegistry.deploy();
await agentRegistry.waitForDeployment();
const agentRegistryAddress = await agentRegistry.getAddress();
console.log("AgentRegistry deployed to:", agentRegistryAddress);

// ---------------------------------------------------------------------------
// 7. GameRegistry (no constructor args, registers 4 default game types)
// ---------------------------------------------------------------------------
console.log("\n--- Deploying GameRegistry ---");
const GameRegistry = await ethers.getContractFactory("GameRegistry");
const gameRegistry = await GameRegistry.deploy();
await gameRegistry.waitForDeployment();
const gameRegistryAddress = await gameRegistry.getAddress();
console.log("GameRegistry deployed to:", gameRegistryAddress);

// ---------------------------------------------------------------------------
// Set Permissions
// ---------------------------------------------------------------------------
console.log("\n--- Setting Permissions ---");

// ArenaToken: authorise GameEngine and Tournament to mint rewards
console.log("Setting ArenaToken.setGameEngine...");
const tx1 = await arenaToken.setGameEngine(gameEngineAddress);
await tx1.wait();

console.log("Setting ArenaToken.setTournament...");
const tx2 = await arenaToken.setTournament(tournamentAddress);
await tx2.wait();

// Leaderboard: authorise GameEngine to update scores
console.log("Setting Leaderboard.setGameEngine...");
const tx3 = await leaderboard.setGameEngine(gameEngineAddress);
await tx3.wait();

// AgentRegistry: authorise GameEngine to record game results
console.log("Setting AgentRegistry.setAuthorizedCaller(gameEngine, true)...");
const tx4 = await agentRegistry.setAuthorizedCaller(gameEngineAddress, true);
await tx4.wait();

console.log("All permissions set successfully.");

// ---------------------------------------------------------------------------
// Log all addresses
// ---------------------------------------------------------------------------
console.log("\n========================================");
console.log("Deployment Summary");
console.log("========================================");
console.log("ArenaToken:    ", arenaTokenAddress);
console.log("Leaderboard:   ", leaderboardAddress);
console.log("RewardVault:   ", rewardVaultAddress);
console.log("GameEngine:    ", gameEngineAddress);
console.log("Tournament:    ", tournamentAddress);
console.log("AgentRegistry: ", agentRegistryAddress);
console.log("GameRegistry:  ", gameRegistryAddress);
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
    Leaderboard: leaderboardAddress,
    RewardVault: rewardVaultAddress,
    GameEngine: gameEngineAddress,
    Tournament: tournamentAddress,
    AgentRegistry: agentRegistryAddress,
    GameRegistry: gameRegistryAddress,
  },
  constructorArgs: {
    ArenaToken: [],
    Leaderboard: [],
    RewardVault: [arenaTokenAddress],
    GameEngine: [rewardVaultAddress, leaderboardAddress],
    Tournament: [],
    AgentRegistry: [],
    GameRegistry: [],
  },
};

const deploymentsDir = path.resolve(__dirname, "..", "deployments");
if (!fs.existsSync(deploymentsDir)) {
  fs.mkdirSync(deploymentsDir, { recursive: true });
}

const outputPath = path.join(deploymentsDir, "addresses.json");
fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
console.log("Addresses saved to:", outputPath);
