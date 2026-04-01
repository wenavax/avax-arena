/**
 * Halve all quest durations on-chain via QuestEngine.updateQuest()
 * Only changes duration — keeps all other params the same.
 */
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");
const existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const QUEST_ENGINE = existing.contracts.QuestEngine;

console.log("Deployer:", deployer.address);
console.log("QuestEngine:", QUEST_ENGINE);

const questEngine = await ethers.getContractAt("QuestEngine", QUEST_ENGINE);
const questCount = Number(await questEngine.questCount());
console.log("Total quests:", questCount);
console.log("\nHalving durations...\n");

for (let id = 0; id < Math.min(questCount, 32); id++) {
  try {
    const quest = await questEngine.getQuest(id);
    const oldDuration = Number(quest.duration);
    const newDuration = Math.max(60, Math.floor(oldDuration / 2)); // min 1 minute

    if (oldDuration === 0) continue;

    const tx = await questEngine.updateQuest(
      id,
      newDuration,
      quest.winXP,
      quest.lossXP,
      quest.minLevel,
      quest.minPowerScore,
      quest.baseDifficulty
    );
    await tx.wait();

    const diff = ["Easy", "Medium", "Hard", "Boss"][Number(quest.difficulty)];
    console.log(`Quest ${String(id).padStart(2)}: ${diff.padEnd(6)} ${oldDuration}s → ${newDuration}s (${(newDuration/60).toFixed(0)}m)`);
  } catch (e: any) {
    console.log(`Quest ${id}: SKIP — ${e.message?.slice(0, 50)}`);
  }
}

console.log("\n✅ Quest durations halved!");
