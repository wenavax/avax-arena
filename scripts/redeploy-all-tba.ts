/**
 * Redeploy all TBA + Agent contracts after audit fixes.
 *
 * Deploys: FrostbiteAccount, FrostbiteAccountV2, IdentityRegistry, ReputationRegistry
 * Then sets authorized callers on ReputationRegistry.
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

// Read existing addresses
const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");
const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const ERC6551_REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const ARENA_WARRIOR = existing.contracts.ArenaWarrior;

console.log("ArenaWarrior:", ARENA_WARRIOR);
console.log("ERC6551 Registry:", ERC6551_REGISTRY);
console.log("");

// 1. FrostbiteAccount V1 (audit fix: dynamic offset)
console.log("1. Deploying FrostbiteAccount (V1 fixed)...");
const V1 = await ethers.getContractFactory("FrostbiteAccount");
const v1 = await V1.deploy();
await v1.waitForDeployment();
const v1Addr = await v1.getAddress();
console.log("   FrostbiteAccount:", v1Addr);

// 2. FrostbiteAccountV2 (audit fix: delegation restrictions)
console.log("2. Deploying FrostbiteAccountV2 (fixed)...");
const V2 = await ethers.getContractFactory("FrostbiteAccountV2");
const v2 = await V2.deploy();
await v2.waitForDeployment();
const v2Addr = await v2.getAddress();
console.log("   FrostbiteAccountV2:", v2Addr);

// 3. IdentityRegistry (audit fix: fusion cleanup, zero-address checks, tokenId 0 fix)
console.log("3. Deploying FrostbiteIdentityRegistry (fixed)...");
const IR = await ethers.getContractFactory("FrostbiteIdentityRegistry");
const ir = await IR.deploy(ERC6551_REGISTRY, v1Addr, ARENA_WARRIOR);
await ir.waitForDeployment();
const irAddr = await ir.getAddress();
console.log("   FrostbiteIdentityRegistry:", irAddr);

// 4. ReputationRegistry (audit fix: clearReputation for fusion)
console.log("4. Deploying FrostbiteReputationRegistry (fixed)...");
const RR = await ethers.getContractFactory("FrostbiteReputationRegistry");
const rr = await RR.deploy();
await rr.waitForDeployment();
const rrAddr = await rr.getAddress();
console.log("   FrostbiteReputationRegistry:", rrAddr);

// 5. Set authorized callers
console.log("\n5. Setting authorized callers on ReputationRegistry...");
const battleEngine = existing.contracts.BattleEngine;
const teamBattleEngine = existing.contracts.TeamBattleEngine;
const questEngine = existing.contracts.QuestEngine;

await (await rr.addAuthorizedCaller(battleEngine)).wait();
console.log("   Added BattleEngine:", battleEngine);
await (await rr.addAuthorizedCaller(teamBattleEngine)).wait();
console.log("   Added TeamBattleEngine:", teamBattleEngine);
await (await rr.addAuthorizedCaller(questEngine)).wait();
console.log("   Added QuestEngine:", questEngine);

// 6. Update addresses.json
existing.contracts.FrostbiteAccount = v1Addr;
existing.contracts.FrostbiteAccountV2 = v2Addr;
existing.contracts.FrostbiteIdentityRegistry = irAddr;
existing.contracts.FrostbiteReputationRegistry = rrAddr;
existing.contracts.ERC6551Registry = ERC6551_REGISTRY;
fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2));
console.log("\n6. Updated deployments/addresses.json");

// Print env vars
console.log("\n=== Add to .env ===");
console.log(`NEXT_PUBLIC_FROSTBITE_ACCOUNT_ADDRESS=${v1Addr}`);
console.log(`NEXT_PUBLIC_FROSTBITE_ACCOUNT_V2_ADDRESS=${v2Addr}`);
console.log(`NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=${irAddr}`);
console.log(`NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=${rrAddr}`);

console.log("\n✅ All contracts redeployed with audit fixes!");
