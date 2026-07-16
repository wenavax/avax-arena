import { network } from "hardhat";
const TREASURY = "0x301b013280317a75f808a3c0d23e82e9027a6b77";
const HERO = "0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523";
const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
console.log("Deployer:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");

// 1. BattleRoyale (fixed: pull-payment)
console.log("\n--- BattleRoyale (fixed) ---");
const BR = await ethers.getContractFactory("FrostbiteBattleRoyale");
const br = await BR.deploy(TREASURY);
await br.waitForDeployment();
const brAddr = await br.getAddress();
console.log("BattleRoyale:", brAddr);
await (await br.setAuthorized(deployer.address, true)).wait();

// 2. PotionShop (fixed: pull-payment)
console.log("\n--- PotionShop (fixed) ---");
const PS = await ethers.getContractFactory("FrostbitePotionShop");
const ps = await PS.deploy(TREASURY);
await ps.waitForDeployment();
const psAddr = await ps.getAddress();
console.log("PotionShop:", psAddr);

// 3. PlayerProgress (fixed: validation + access control)
console.log("\n--- PlayerProgress (fixed) ---");
const PP = await ethers.getContractFactory("PlayerProgress");
const pp = await PP.deploy();
await pp.waitForDeployment();
const ppAddr = await pp.getAddress();
console.log("PlayerProgress:", ppAddr);
// Set hero contract for linkHero validation
await (await pp.setHeroContract(HERO)).wait();

console.log("\n═══════════════════════════════════════");
console.log("  BattleRoyale:    ", brAddr);
console.log("  PotionShop:      ", psAddr);
console.log("  PlayerProgress:  ", ppAddr);
console.log("═══════════════════════════════════════");
