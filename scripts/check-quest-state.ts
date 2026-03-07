import { network } from "hardhat";

const { ethers } = await network.connect();

const QUEST_ENGINE = "0xcEFCC7Eb9A86a4FB610B594fB739a77544aF13c6";
const ARENA_WARRIOR = "0xfa8C61cD6e6b45d2c78C7DC89638aEec9d374Be9";
const TOKEN_ID = 96;

const QuestEngine = await ethers.getContractAt("QuestEngine", QUEST_ENGINE);
const ArenaWarrior = await ethers.getContractAt("ArenaWarrior", ARENA_WARRIOR);

// Check if warrior is on quest
const isOnQuest = await QuestEngine.isWarriorOnQuest(TOKEN_ID);
console.log(`Token #${TOKEN_ID} isOnQuest:`, isOnQuest);

// Get active quest details
const aq = await QuestEngine.getActiveQuest(TOKEN_ID);
console.log("Active quest data:", {
  questId: aq.questId.toString(),
  tokenId: aq.tokenId.toString(),
  player: aq.player,
  startedAt: aq.startedAt.toString(),
  endsAt: aq.endsAt.toString(),
  completed: aq.completed,
  won: aq.won,
});

// Get quest definition
const questCount = await QuestEngine.questCount();
console.log("Total quests on contract:", questCount.toString());

const quest0 = await QuestEngine.getQuest(0);
console.log("Quest #0 (on-chain):", {
  name: quest0.name,
  duration: quest0.duration.toString(),
  active: quest0.active,
});

// Check warrior owner
const owner = await ArenaWarrior.ownerOf(TOKEN_ID);
console.log(`Token #${TOKEN_ID} owner:`, owner);

// Current timestamp
const block = await ethers.provider.getBlock("latest");
console.log("Current block timestamp:", block!.timestamp);
console.log("Quest endsAt:", Number(aq.endsAt));
console.log("Time difference (seconds):", Number(block!.timestamp) - Number(aq.endsAt));
