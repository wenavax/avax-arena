/**
 * Deploy FrostbiteSwapRouter — fee-collecting wrapper for Trader Joe LBRouter
 *
 * Usage: npx hardhat run scripts/deploy-swap-router.ts --network avalanche
 */

import { network } from "hardhat";

const LB_ROUTER = "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30";
const FEE_RECIPIENT = "0xe342E070fC9EA5e9A285aBE8904bD4e894c2070F";
const FEE_BPS = 5; // 0.05%

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

console.log("Deploying FrostbiteSwapRouter...");
console.log("  Deployer:", deployer.address);
console.log("  Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");
console.log("  LBRouter:", LB_ROUTER);
console.log("  Fee Recipient:", FEE_RECIPIENT);
console.log("  Fee:", FEE_BPS / 100, "%");

const Factory = await ethers.getContractFactory("FrostbiteSwapRouter");
const contract = await Factory.deploy(LB_ROUTER, FEE_RECIPIENT, FEE_BPS);
await contract.waitForDeployment();

const address = await contract.getAddress();
console.log("\nFrostbiteSwapRouter deployed to:", address);

const tx = contract.deploymentTransaction();
if (tx) {
  console.log("TX hash:", tx.hash);
  await tx.wait(3);
}

console.log("Done!");
