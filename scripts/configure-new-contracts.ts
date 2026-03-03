/**
 * Configure newly deployed contracts:
 * - Add TeamBattleEngine as authorized battle contract on ArenaWarrior
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deployer:", deployer.address);

const ARENA_WARRIOR = "0xCe6287B5A81bdD276627813AD1baDb2eC512eaf6";
const TEAM_BATTLE_ENGINE = "0xdE330aaBB3DF6D127431e244302c44cD486f2c34";

// Check ArenaWarrior owner
const ArenaWarrior = await ethers.getContractFactory("ArenaWarrior");
const arenaWarrior = ArenaWarrior.attach(ARENA_WARRIOR);

const owner = await arenaWarrior.owner();
console.log("ArenaWarrior owner:", owner);
console.log("Deployer matches owner:", owner.toLowerCase() === deployer.address.toLowerCase());

// Check if TeamBattleEngine already authorized
const isAuthorized = await arenaWarrior.battleContracts(TEAM_BATTLE_ENGINE);
console.log("TeamBattleEngine already authorized:", isAuthorized);

if (!isAuthorized) {
  // Check code size
  const code = await ethers.provider.getCode(TEAM_BATTLE_ENGINE);
  console.log("TeamBattleEngine has code:", code.length > 2);

  try {
    console.log("Calling addBattleContract...");
    const tx = await arenaWarrior.addBattleContract(TEAM_BATTLE_ENGINE);
    const receipt = await tx.wait();
    console.log("addBattleContract SUCCESS! Tx:", receipt?.hash);
  } catch (e: any) {
    console.error("addBattleContract FAILED:", e.reason || e.message);

    // Try static call to get revert reason
    try {
      await arenaWarrior.addBattleContract.staticCall(TEAM_BATTLE_ENGINE);
    } catch (staticErr: any) {
      console.error("Static call revert reason:", staticErr.reason || staticErr.message);
    }
  }
} else {
  console.log("Already authorized, skipping.");
}
