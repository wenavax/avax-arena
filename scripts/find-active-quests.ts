import { network } from "hardhat";

const { ethers } = await network.connect();

const QUEST_ENGINE = "0xcEFCC7Eb9A86a4FB610B594fB739a77544aF13c6";
const ARENA_WARRIOR = "0xfa8C61cD6e6b45d2c78C7DC89638aEec9d374Be9";

const QuestEngine = await ethers.getContractAt("QuestEngine", QUEST_ENGINE);
const ArenaWarrior = await ethers.getContractAt("ArenaWarrior", ARENA_WARRIOR);

// Get total supply
const totalSupply = await ArenaWarrior.totalSupply();
console.log("Total warriors minted:", totalSupply.toString());

const block = await ethers.provider.getBlock("latest");
const now = block!.timestamp;
console.log("Current block timestamp:", now);

// Check all tokens for active quests
console.log("\n--- Checking all warriors for active quests ---");
let found = 0;
for (let i = 1; i <= Number(totalSupply); i++) {
  const isOnQuest = await QuestEngine.isWarriorOnQuest(i);
  if (isOnQuest) {
    const aq = await QuestEngine.getActiveQuest(i);
    const owner = await ArenaWarrior.ownerOf(i);
    const endsAt = Number(aq.endsAt);
    const timeLeft = endsAt - now;
    console.log(`Token #${i}: ON QUEST`);
    console.log(`  Owner: ${owner}`);
    console.log(`  QuestId: ${aq.questId}`);
    console.log(`  StartedAt: ${aq.startedAt}`);
    console.log(`  EndsAt: ${aq.endsAt} (${timeLeft > 0 ? timeLeft + 's remaining' : 'READY ' + Math.abs(timeLeft) + 's ago'})`);
    console.log(`  Completed: ${aq.completed}`);
    found++;
  }
}

if (found === 0) {
  console.log("No warriors currently on quests.");
}

// Also check completed but not cleared quests
console.log("\n--- Recent quest activity (completed flag = true) ---");
for (let i = 1; i <= Number(totalSupply); i++) {
  const aq = await QuestEngine.getActiveQuest(i);
  if (aq.player !== "0x0000000000000000000000000000000000000000") {
    const isOnQuest = await QuestEngine.isWarriorOnQuest(i);
    if (!isOnQuest && aq.completed) {
      console.log(`Token #${i}: Completed quest ${aq.questId}, won=${aq.won}`);
    }
  }
}
