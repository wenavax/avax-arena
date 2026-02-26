import hre from "hardhat";
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Load deployment addresses
// ---------------------------------------------------------------------------
const addressesPath = path.resolve(__dirname, "..", "deployments", "addresses.json");

if (!fs.existsSync(addressesPath)) {
  console.error("ERROR: deployments/addresses.json not found.");
  console.error("Run the deploy script first: npx hardhat run scripts/deploy.ts --network <network>");
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
const { contracts, constructorArgs } = deployment;

console.log("Verifying contracts from deployment:", addressesPath);
console.log("Network:", deployment.network, "(chain ID:", deployment.chainId, ")");
console.log();

// ---------------------------------------------------------------------------
// Verify helper
// ---------------------------------------------------------------------------
async function verifyContract(
  name: string,
  address: string,
  args: string[],
): Promise<void> {
  console.log(`--- Verifying ${name} at ${address} ---`);
  try {
    await hre.tasks.getTask("verify").run({
      address,
      constructorArgs: args.map(String),
      force: false,
    });
    console.log(`${name}: verification submitted successfully.\n`);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message.includes("Already Verified") || err.message.includes("already verified")) {
      console.log(`${name}: contract is already verified.\n`);
    } else {
      console.error(`${name}: verification failed -`, err.message, "\n");
    }
  }
}

// ---------------------------------------------------------------------------
// Verify each contract with its constructor arguments
// ---------------------------------------------------------------------------
const contractNames = [
  "ArenaToken",
  "Leaderboard",
  "RewardVault",
  "GameEngine",
  "Tournament",
  "AgentRegistry",
  "GameRegistry",
] as const;

for (const name of contractNames) {
  const address = contracts[name];
  const args = constructorArgs[name] ?? [];

  if (!address) {
    console.warn(`WARNING: No address found for ${name}, skipping.`);
    continue;
  }

  await verifyContract(name, address, args);
}

console.log("========================================");
console.log("Verification process complete.");
console.log("========================================");
