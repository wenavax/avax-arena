import { network } from "hardhat";

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deployer:", deployer.address);

const ARENA_WARRIOR = "0xfa8C61cD6e6b45d2c78C7DC89638aEec9d374Be9";
const QUEST_ENGINE = "0xcEFCC7Eb9A86a4FB610B594fB739a77544aF13c6";

const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = ArenaWarrior.attach(ARENA_WARRIOR);

const owner = await arenaWarrior.owner();
console.log("ArenaWarrior owner:", owner);

const isAuthorized = await arenaWarrior.battleContracts(QUEST_ENGINE);
console.log("QuestEngine authorized:", isAuthorized);

if (!isAuthorized) {
  console.log("\nAuthorizing QuestEngine as battle contract...");
  const tx = await arenaWarrior.addBattleContract(QUEST_ENGINE);
  console.log("TX hash:", tx.hash);
  await tx.wait();
  console.log("QuestEngine authorized successfully!");

  const verify = await arenaWarrior.battleContracts(QUEST_ENGINE);
  console.log("Verify:", verify);
} else {
  console.log("Already authorized. No action needed.");
}
