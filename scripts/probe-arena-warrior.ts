/**
 * Probe the on-chain ArenaWarrior contract to find which functions exist
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

const ARENA_WARRIOR = "0xCe6287B5A81bdD276627813AD1baDb2eC512eaf6";

// List of function signatures to probe
const functions = [
  "function owner() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function mintCost() view returns (uint256)",
  "function battleContracts(address) view returns (bool)",
  "function authorizedBattleContracts(address) view returns (bool)",
  "function isBattleContract(address) view returns (bool)",
  "function authorizedCallers(address) view returns (bool)",
];

for (const fn of functions) {
  const iface = new ethers.Interface([fn]);
  const fnName = fn.match(/function (\w+)/)?.[1] || "unknown";

  try {
    let data: string;
    if (fn.includes("(address)")) {
      data = iface.encodeFunctionData(fnName, ["0x6f636ea5D2b8c2909baDb32491e7df47F7bd1B42"]);
    } else {
      data = iface.encodeFunctionData(fnName);
    }

    const result = await ethers.provider.call({ to: ARENA_WARRIOR, data });

    if (result === "0x") {
      console.log(`${fnName}: REVERTED (empty)`);
    } else {
      const decoded = iface.decodeFunctionResult(fnName, result);
      console.log(`${fnName}: OK →`, decoded[0]?.toString());
    }
  } catch (e: any) {
    console.log(`${fnName}: FAIL`);
  }
}

// Also check by reading raw storage slots for the mapping
// battleContracts mapping at slot X: keccak256(abi.encode(address, slot))
// Let me find where the mapping might be
console.log("\n--- Checking storage slots for battle contracts ---");

// Try to find the BattleEngine in various common mapping slots (0-10)
const battleEngine = "0x6f636ea5D2b8c2909baDb32491e7df47F7bd1B42";
for (let slot = 0; slot <= 15; slot++) {
  const paddedAddr = ethers.zeroPadValue(battleEngine, 32);
  const paddedSlot = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
  const storageKey = ethers.keccak256(ethers.concat([paddedAddr, paddedSlot]));

  const value = await ethers.provider.getStorage(ARENA_WARRIOR, storageKey);
  if (value !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.log(`Slot ${slot} mapping[BattleEngine] = ${value}`);
  }
}
