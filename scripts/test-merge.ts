/**
 * Test script: Mint 2 warriors → merge them → verify result
 */
import { network } from "hardhat";

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

// Load addresses
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");
const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const ARENA_WARRIOR = addresses.contracts.ArenaWarrior;

console.log("Deployer:", deployer.address);
console.log("ArenaWarrior:", ARENA_WARRIOR);
console.log(
  "Balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX\n"
);

const arenaWarrior = await ethers.getContractAt("ArenaWarrior", ARENA_WARRIOR);

// -----------------------------------------------------------------------
// 1. Mint Warrior #1
// -----------------------------------------------------------------------
console.log("--- Minting Warrior #1 ---");
const tx1 = await arenaWarrior.mint({ value: ethers.parseEther("0.01") });
const receipt1 = await tx1.wait();
const mintEvent1 = receipt1.logs
  .map((log: any) => {
    try { return arenaWarrior.interface.parseLog(log); } catch { return null; }
  })
  .find((e: any) => e?.name === "WarriorMinted");

const tokenId1 = mintEvent1!.args.tokenId;
console.log(`Warrior #${tokenId1} minted!`);

const w1 = await arenaWarrior.getWarrior(tokenId1);
console.log(`  ATK: ${w1.attack}, DEF: ${w1.defense}, SPD: ${w1.speed}`);
console.log(`  Element: ${w1.element}, Special: ${w1.specialPower}`);
console.log(`  Level: ${w1.level}, Power: ${w1.powerScore}`);

// -----------------------------------------------------------------------
// 2. Mint Warrior #2
// -----------------------------------------------------------------------
console.log("\n--- Minting Warrior #2 ---");
const tx2 = await arenaWarrior.mint({ value: ethers.parseEther("0.01") });
const receipt2 = await tx2.wait();
const mintEvent2 = receipt2.logs
  .map((log: any) => {
    try { return arenaWarrior.interface.parseLog(log); } catch { return null; }
  })
  .find((e: any) => e?.name === "WarriorMinted");

const tokenId2 = mintEvent2!.args.tokenId;
console.log(`Warrior #${tokenId2} minted!`);

const w2 = await arenaWarrior.getWarrior(tokenId2);
console.log(`  ATK: ${w2.attack}, DEF: ${w2.defense}, SPD: ${w2.speed}`);
console.log(`  Element: ${w2.element}, Special: ${w2.specialPower}`);
console.log(`  Level: ${w2.level}, Power: ${w2.powerScore}`);

// -----------------------------------------------------------------------
// 3. Merge Warriors
// -----------------------------------------------------------------------
console.log("\n--- Merging Warriors ---");
const mergePrice = await arenaWarrior.mergePrice();
console.log(`Merge price: ${ethers.formatEther(mergePrice)} AVAX`);

const tx3 = await arenaWarrior.mergeWarriors(tokenId1, tokenId2, { value: mergePrice });
const receipt3 = await tx3.wait();

const mergeEvent = receipt3.logs
  .map((log: any) => {
    try { return arenaWarrior.interface.parseLog(log); } catch { return null; }
  })
  .find((e: any) => e?.name === "WarriorsMerged");

if (!mergeEvent) {
  console.error("ERROR: WarriorsMerged event not found!");
  process.exit(1);
}

const newTokenId = mergeEvent.args.resultTokenId;
console.log(`\nNew Warrior #${newTokenId} created from #${tokenId1} + #${tokenId2}!`);

// -----------------------------------------------------------------------
// 4. Verify merged warrior stats
// -----------------------------------------------------------------------
const merged = await arenaWarrior.getWarrior(newTokenId);
console.log("\n--- Merged Warrior Stats ---");
console.log(`  ATK: ${merged.attack} (expected: ${Math.min(100, Math.floor((Number(w1.attack) + Number(w2.attack)) * 6 / 10))})`);
console.log(`  DEF: ${merged.defense} (expected: ${Math.min(100, Math.floor((Number(w1.defense) + Number(w2.defense)) * 6 / 10))})`);
console.log(`  SPD: ${merged.speed} (expected: ${Math.min(100, Math.floor((Number(w1.speed) + Number(w2.speed)) * 6 / 10))})`);
console.log(`  Special: ${merged.specialPower} (expected: ${Math.min(50, Math.floor((Number(w1.specialPower) + Number(w2.specialPower)) * 6 / 10))})`);
console.log(`  Element: ${merged.element} (from stronger parent)`);
console.log(`  Level: ${merged.level} (expected: ${Math.max(Number(w1.level), Number(w2.level)) + 1})`);
console.log(`  Power: ${merged.powerScore}`);

// -----------------------------------------------------------------------
// 5. Verify burned tokens no longer exist
// -----------------------------------------------------------------------
console.log("\n--- Verifying burns ---");
for (const burnedId of [tokenId1, tokenId2]) {
  try {
    await arenaWarrior.ownerOf(burnedId);
    console.error(`ERROR: Token #${burnedId} still exists!`);
  } catch {
    console.log(`Token #${burnedId} burned successfully (ownerOf reverts)`);
  }
}

// -----------------------------------------------------------------------
// 6. Stat validation
// -----------------------------------------------------------------------
console.log("\n--- Stat Validation ---");
const checks = [
  { name: "ATK", actual: Number(merged.attack), expected: Math.min(100, Math.floor((Number(w1.attack) + Number(w2.attack)) * 6 / 10)) },
  { name: "DEF", actual: Number(merged.defense), expected: Math.min(100, Math.floor((Number(w1.defense) + Number(w2.defense)) * 6 / 10)) },
  { name: "SPD", actual: Number(merged.speed), expected: Math.min(100, Math.floor((Number(w1.speed) + Number(w2.speed)) * 6 / 10)) },
  { name: "SPC", actual: Number(merged.specialPower), expected: Math.min(50, Math.floor((Number(w1.specialPower) + Number(w2.specialPower)) * 6 / 10)) },
  { name: "LVL", actual: Number(merged.level), expected: Math.max(Number(w1.level), Number(w2.level)) + 1 },
];

let allPass = true;
for (const c of checks) {
  const pass = c.actual === c.expected;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${c.name}: ${c.actual} ${pass ? "==" : "!="} ${c.expected}`);
  if (!pass) allPass = false;
}

console.log(`\n========================================`);
console.log(`Test result: ${allPass ? "ALL PASSED" : "SOME FAILED"}`);
console.log(`========================================`);
console.log(
  "Remaining balance:",
  ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  "AVAX"
);
