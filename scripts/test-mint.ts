/**
 * Test mint on the new ArenaWarrior contract
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deployer:", deployer.address);
console.log(
  "Balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);

const ARENA_WARRIOR = "0x7F8Cda03B13b776207D4A36e81a36cc1A0f35877";

const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = ArenaWarrior.attach(ARENA_WARRIOR);

// Check basic info
const name = await arenaWarrior.name();
const symbol = await arenaWarrior.symbol();
const totalSupply = await arenaWarrior.totalSupply();
console.log(`\nContract: ${name} (${symbol})`);
console.log(`Total supply: ${totalSupply}`);

// Test mint
console.log("\n--- Testing mint ---");
try {
  const tx = await arenaWarrior.mint({ value: ethers.parseEther("0.01") });
  const receipt = await tx.wait();
  console.log("Mint tx:", receipt?.hash);

  // Check the minted warrior
  const newSupply = await arenaWarrior.totalSupply();
  console.log("New total supply:", newSupply.toString());

  const tokenId = Number(newSupply) - 1;
  const warrior = await arenaWarrior.getWarrior(tokenId);
  console.log(`\nWarrior #${tokenId}:`);
  console.log(`  Attack: ${warrior.attack}`);
  console.log(`  Defense: ${warrior.defense}`);
  console.log(`  Speed: ${warrior.speed}`);
  console.log(`  Element: ${warrior.element}`);
  console.log(`  Special Power: ${warrior.specialPower}`);
  console.log(`  Level: ${warrior.level}`);
  console.log(`  Power Score: ${warrior.powerScore}`);

  const owner = await arenaWarrior.ownerOf(tokenId);
  console.log(`  Owner: ${owner}`);

  console.log("\nMINT SUCCESS!");
} catch (e: any) {
  console.error("Mint FAILED:", e.reason || e.shortMessage || e.message?.substring(0, 300));
}
