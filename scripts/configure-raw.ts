/**
 * Configure TeamBattleEngine using raw ABI encoding
 * to diagnose ABI mismatch with on-chain ArenaWarrior
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

const [deployer] = await ethers.getSigners();
console.log("Deployer:", deployer.address);

const ARENA_WARRIOR = "0xCe6287B5A81bdD276627813AD1baDb2eC512eaf6";
const TEAM_BATTLE_ENGINE = "0xdE330aaBB3DF6D127431e244302c44cD486f2c34";

// Check contract code exists
const awCode = await ethers.provider.getCode(ARENA_WARRIOR);
console.log("ArenaWarrior code exists:", awCode.length > 2);

const tbCode = await ethers.provider.getCode(TEAM_BATTLE_ENGINE);
console.log("TeamBattleEngine code exists:", tbCode.length > 2);

// Try owner() call via raw interface
const iface = new ethers.Interface([
  "function owner() view returns (address)",
  "function battleContracts(address) view returns (bool)",
  "function addBattleContract(address) external",
]);

// Call owner()
try {
  const ownerData = iface.encodeFunctionData("owner");
  const ownerResult = await ethers.provider.call({ to: ARENA_WARRIOR, data: ownerData });
  const [ownerAddr] = iface.decodeFunctionResult("owner", ownerResult);
  console.log("Owner (raw call):", ownerAddr);
} catch (e: any) {
  console.error("owner() raw call failed:", e.message?.substring(0, 200));
}

// Call battleContracts(address) for an existing authorized address
const BATTLE_ENGINE = "0x6f636ea5D2b8c2909baDb32491e7df47F7bd1B42";
try {
  const checkData = iface.encodeFunctionData("battleContracts", [BATTLE_ENGINE]);
  const checkResult = await ethers.provider.call({ to: ARENA_WARRIOR, data: checkData });
  const [isAuth] = iface.decodeFunctionResult("battleContracts", checkResult);
  console.log("BattleEngine authorized (raw):", isAuth);
} catch (e: any) {
  console.error("battleContracts() raw call failed:", e.message?.substring(0, 200));
}

// Try addBattleContract
try {
  const addData = iface.encodeFunctionData("addBattleContract", [TEAM_BATTLE_ENGINE]);
  console.log("Sending addBattleContract tx...");
  const tx = await deployer.sendTransaction({
    to: ARENA_WARRIOR,
    data: addData,
  });
  const receipt = await tx.wait();
  console.log("addBattleContract SUCCESS! Tx:", receipt?.hash);
} catch (e: any) {
  console.error("addBattleContract failed:", e.reason || e.shortMessage || e.message?.substring(0, 300));
}
