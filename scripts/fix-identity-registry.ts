import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const ACCOUNT_V1 = "0x60D97cb53f0CCf12F74013493C6f41Aa11ab00f9";
const WARRIOR = "0x958d7b064224453BB5134279777e5d907B405dE2"; // CORRECT address

console.log("Redeploying IdentityRegistry with CORRECT ArenaWarrior:", WARRIOR);
const IR = await ethers.getContractFactory("FrostbiteIdentityRegistry");
const ir = await IR.deploy(REGISTRY, ACCOUNT_V1, WARRIOR);
await ir.waitForDeployment();
const addr = await ir.getAddress();
console.log("NEW IdentityRegistry:", addr);

const verify = await ir.arenaWarrior();
console.log("Verify arenaWarrior:", verify);

// Update addresses.json
const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");
const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
existing.contracts.FrostbiteIdentityRegistry = addr;
fs.writeFileSync(addressesPath, JSON.stringify(existing, null, 2));

console.log("\nNEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=" + addr);
