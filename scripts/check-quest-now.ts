import { network } from "hardhat";

const { ethers } = await network.connect();

const QUEST_ENGINE = "0xcEFCC7Eb9A86a4FB610B594fB739a77544aF13c6";
const TOKEN_ID = 96;

const QuestEngine = await ethers.getContractAt("QuestEngine", QUEST_ENGINE);

const isOnQuest = await QuestEngine.isWarriorOnQuest(TOKEN_ID);
console.log(`Token #${TOKEN_ID} isOnQuest:`, isOnQuest);

const aq = await QuestEngine.getActiveQuest(TOKEN_ID);
const block = await ethers.provider.getBlock("latest");
const now = block!.timestamp;
const endsAt = Number(aq.endsAt);
const diff = now - endsAt;

console.log("Quest completed on-chain:", aq.completed);
console.log("Block timestamp:", now);
console.log("Quest endsAt:", endsAt);
console.log("Time since completion:", diff, "seconds", diff > 0 ? "(READY)" : "(NOT YET)");

// Print all 32 on-chain quest durations
console.log("\n--- On-chain quest durations ---");
for (let i = 0; i < 32; i++) {
  const q = await QuestEngine.getQuest(i);
  console.log(`Quest ${i}: ${q.name} | zone=${q.zone} | diff=${q.difficulty} | duration=${q.duration}s | active=${q.active}`);
}
