import { network } from "hardhat";
const TREASURY = "0x301b013280317a75f808a3c0d23e82e9027a6b77";
const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
console.log("Deploying with:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");
const PS = await ethers.getContractFactory("FrostbitePotionShop");
const ps = await PS.deploy(TREASURY);
await ps.waitForDeployment();
const addr = await ps.getAddress();
console.log("PotionShop deployed to:", addr);
console.log("Treasury:", TREASURY);
// Verify potions
const all = await ps.getAllPotions();
console.log("Potions:", all.names.map((n: string, i: number) => `${n}: ${ethers.formatEther(all.prices[i])} AVAX`));
