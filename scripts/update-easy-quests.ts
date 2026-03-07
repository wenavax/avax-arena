import { network } from "hardhat";

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Updating Easy quests with account:", deployer.address);

const questEngineAddress = "0xcEFCC7Eb9A86a4FB610B594fB739a77544aF13c6";
const questEngine = await ethers.getContractAt("QuestEngine", questEngineAddress);

// Easy quest IDs: zone * 4 + 0 = 0, 4, 8, 12, 16, 20, 24, 28
const easyIds = [0, 4, 8, 12, 16, 20, 24, 28];

// New params: duration=300s, winXP=50, lossXP=15, minLevel=1, minPowerScore=0, baseDifficulty=80
for (const id of easyIds) {
  const before = await questEngine.getQuest(id);
  console.log(`  Quest ${id} (${before.name}): duration=${Number(before.duration)}s → 300s`);

  const tx = await questEngine.updateQuest(id, 300, 50, 15, 1, 0, 80);
  await tx.wait();
  console.log(`    ✓ Updated`);
}

console.log("\nAll Easy quests updated to 300s (5 min), baseDifficulty=80");
