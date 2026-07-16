import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
console.log("Deploying with:", deployer.address);
console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");

console.log("\n--- Deploying FrostbiteItems ---");
const Items = await ethers.getContractFactory("FrostbiteItems");
const items = await Items.deploy(deployer.address);
await items.waitForDeployment();
const itemsAddress = await items.getAddress();
console.log("FrostbiteItems deployed to:", itemsAddress);

// Update addresses file
const outPath = path.join(__dirname, "..", "deployments", "world-nft-mainnet.json");
const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
existing.FrostbiteItems = itemsAddress;
fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
console.log("Updated:", outPath);
