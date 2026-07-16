import { network } from "hardhat";

const TREASURY = "0x301b013280317a75f808a3c0d23e82e9027a6b77";

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
console.log("Deploying with:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");

console.log("\n--- Deploying FrostbiteBattleRoyale ---");
const BR = await ethers.getContractFactory("FrostbiteBattleRoyale");
const br = await BR.deploy(TREASURY);
await br.waitForDeployment();
const brAddress = await br.getAddress();
console.log("BattleRoyale deployed to:", brAddress);

// Authorize deployer as server caller
const tx = await br.setAuthorized(deployer.address, true);
await tx.wait();
console.log("Deployer authorized as server caller");

console.log("\n═══════════════════════════════════════");
console.log(`  BattleRoyale: ${brAddress}`);
console.log(`  Treasury:     ${TREASURY}`);
console.log("═══════════════════════════════════════");
