import { network } from "hardhat";
const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
console.log("Deploying with:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");
const PP = await ethers.getContractFactory("PlayerProgress");
const pp = await PP.deploy();
await pp.waitForDeployment();
console.log("PlayerProgress deployed to:", await pp.getAddress());
