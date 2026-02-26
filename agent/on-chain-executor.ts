import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { ARENA_WARRIOR_ABI, BATTLE_ENGINE_ABI, AGENT_CHAT_ABI } from './abis';

dotenv.config();

// ---------------------------------------------------------------------------
// Environment & provider setup
// ---------------------------------------------------------------------------

const RPC_URL = process.env.AVAX_RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc';
const ARENA_WARRIOR_ADDRESS = process.env.ARENA_WARRIOR_ADDRESS;
const BATTLE_ENGINE_ADDRESS = process.env.BATTLE_ENGINE_ADDRESS;
const AGENT_CHAT_ADDRESS = process.env.AGENT_CHAT_ADDRESS;

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getWallet(): ethers.Wallet {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) {
    throw new Error('Environment variable AGENT_PRIVATE_KEY is not set.');
  }
  return new ethers.Wallet(key, getProvider());
}

function getArenaWarriorContract(signerOrProvider: ethers.Wallet | ethers.JsonRpcProvider): ethers.Contract {
  if (!ARENA_WARRIOR_ADDRESS) {
    throw new Error('Environment variable ARENA_WARRIOR_ADDRESS is not set.');
  }
  return new ethers.Contract(ARENA_WARRIOR_ADDRESS, ARENA_WARRIOR_ABI, signerOrProvider);
}

function getBattleEngineContract(signerOrProvider: ethers.Wallet | ethers.JsonRpcProvider): ethers.Contract {
  if (!BATTLE_ENGINE_ADDRESS) {
    throw new Error('Environment variable BATTLE_ENGINE_ADDRESS is not set.');
  }
  return new ethers.Contract(BATTLE_ENGINE_ADDRESS, BATTLE_ENGINE_ABI, signerOrProvider);
}

function getAgentChatContract(signer: ethers.Wallet): ethers.Contract {
  if (!AGENT_CHAT_ADDRESS) {
    throw new Error('Environment variable AGENT_CHAT_ADDRESS is not set.');
  }
  return new ethers.Contract(AGENT_CHAT_ADDRESS, AGENT_CHAT_ABI, signer);
}

// ---------------------------------------------------------------------------
// Warrior NFT operations
// ---------------------------------------------------------------------------

/**
 * Mints a new warrior NFT. Costs 0.01 AVAX.
 * Returns the minted token ID.
 */
export async function mintWarrior(): Promise<number> {
  const wallet = getWallet();
  const arenaWarrior = getArenaWarriorContract(wallet);

  const mintCost = ethers.parseEther('0.01');

  console.log('[executor] Minting new warrior NFT (0.01 AVAX)...');
  const tx: ethers.TransactionResponse = await arenaWarrior.mint({ value: mintCost });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('mint TX was not mined.');
  }

  // Parse the WarriorMinted event to get the tokenId
  let tokenId: number | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = arenaWarrior.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === 'WarriorMinted') {
        tokenId = Number(parsed.args.tokenId);
        break;
      }
    } catch {
      // Not a matching event; skip.
    }
  }

  if (tokenId === null) {
    // Fallback: read totalSupply to infer the latest token
    try {
      const supply = await arenaWarrior.totalSupply();
      tokenId = Number(supply);
    } catch {
      throw new Error('Failed to determine minted token ID from logs or totalSupply.');
    }
  }

  console.log(`[executor] Warrior minted: tokenId=${tokenId} txHash=${receipt.hash}`);
  return tokenId;
}

/**
 * Returns the on-chain stats for a specific warrior.
 */
export async function getWarriorStats(tokenId: number): Promise<{
  attack: number;
  defense: number;
  speed: number;
  element: number;
  specialPower: number;
  level: number;
  experience: bigint;
  battleWins: bigint;
  battleLosses: bigint;
  powerScore: bigint;
}> {
  const provider = getProvider();
  const arenaWarrior = getArenaWarriorContract(provider);

  console.log(`[executor] Fetching stats for warrior #${tokenId}...`);
  const w = await arenaWarrior.getWarrior(tokenId);

  return {
    attack: Number(w.attack),
    defense: Number(w.defense),
    speed: Number(w.speed),
    element: Number(w.element),
    specialPower: Number(w.specialPower),
    level: Number(w.level),
    experience: BigInt(w.experience),
    battleWins: BigInt(w.battleWins),
    battleLosses: BigInt(w.battleLosses),
    powerScore: BigInt(w.powerScore),
  };
}

/**
 * Returns an array of token IDs owned by the agent wallet.
 */
export async function getMyWarriors(): Promise<number[]> {
  const wallet = getWallet();
  const provider = getProvider();
  const arenaWarrior = getArenaWarriorContract(provider);

  console.log(`[executor] Fetching warriors owned by ${wallet.address}...`);
  const tokenIds: bigint[] = await arenaWarrior.getWarriorsByOwner(wallet.address);
  const result = tokenIds.map((id) => Number(id));
  console.log(`[executor] Found ${result.length} warrior(s): [${result.join(', ')}]`);
  return result;
}

// ---------------------------------------------------------------------------
// Battle operations
// ---------------------------------------------------------------------------

/**
 * Creates a new battle with the specified warrior and stake amount.
 * Returns the newly created battle ID.
 */
export async function createBattle(tokenId: number, stakeAmount: string): Promise<number> {
  const wallet = getWallet();
  const battleEngine = getBattleEngineContract(wallet);

  const stakeWei = ethers.parseEther(stakeAmount);

  console.log(`[executor] Creating battle: warrior=#${tokenId} stake=${stakeAmount} AVAX`);
  const tx: ethers.TransactionResponse = await battleEngine.createBattle(tokenId, {
    value: stakeWei,
  });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('createBattle TX was not mined.');
  }

  // Parse the BattleCreated event to get battleId
  let battleId: number | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = battleEngine.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === 'BattleCreated') {
        battleId = Number(parsed.args.battleId);
        break;
      }
    } catch {
      // Not a matching event; skip.
    }
  }

  if (battleId === null) {
    // Fallback: read battleCounter
    try {
      const counter = await battleEngine.battleCounter();
      battleId = Number(counter);
    } catch {
      throw new Error('Failed to determine battle ID from logs or battleCounter.');
    }
  }

  console.log(`[executor] Battle created: battleId=${battleId} txHash=${receipt.hash}`);
  return battleId;
}

/**
 * Joins an existing battle with the specified warrior.
 * The stake must match the battle creator's stake (sent as msg.value).
 */
export async function joinBattle(
  battleId: number,
  tokenId: number,
  stakeAmount: string,
): Promise<string> {
  const wallet = getWallet();
  const battleEngine = getBattleEngineContract(wallet);

  const stakeWei = ethers.parseEther(stakeAmount);

  console.log(
    `[executor] Joining battle #${battleId}: warrior=#${tokenId} stake=${stakeAmount} AVAX`,
  );
  const tx: ethers.TransactionResponse = await battleEngine.joinBattle(battleId, tokenId, {
    value: stakeWei,
  });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(`joinBattle TX for battle #${battleId} was not mined.`);
  }

  console.log(`[executor] Joined battle #${battleId}: txHash=${receipt.hash}`);
  return receipt.hash;
}

/**
 * Cancels an open battle that the agent created.
 */
export async function cancelBattle(battleId: number): Promise<string> {
  const wallet = getWallet();
  const battleEngine = getBattleEngineContract(wallet);

  console.log(`[executor] Cancelling battle #${battleId}...`);
  const tx: ethers.TransactionResponse = await battleEngine.cancelBattle(battleId);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(`cancelBattle TX for battle #${battleId} was not mined.`);
  }

  console.log(`[executor] Battle #${battleId} cancelled: txHash=${receipt.hash}`);
  return receipt.hash;
}

/**
 * Returns an array of currently open (joinable) battle IDs.
 */
export async function getOpenBattles(): Promise<number[]> {
  const provider = getProvider();
  const battleEngine = getBattleEngineContract(provider);

  console.log('[executor] Fetching open battles...');
  const ids: bigint[] = await battleEngine.getOpenBattles();
  const result = ids.map((id) => Number(id));
  console.log(`[executor] Found ${result.length} open battle(s): [${result.join(', ')}]`);
  return result;
}

/**
 * Returns the full on-chain battle struct for a given battle ID.
 */
export async function getBattleDetails(battleId: number): Promise<{
  id: number;
  player1: string;
  player2: string;
  nft1: number;
  nft2: number;
  stake: string;
  winner: string;
  resolved: boolean;
  createdAt: number;
  resolvedAt: number;
}> {
  const provider = getProvider();
  const battleEngine = getBattleEngineContract(provider);

  console.log(`[executor] Fetching details for battle #${battleId}...`);
  const b = await battleEngine.getBattle(battleId);

  return {
    id: Number(b.id),
    player1: b.player1,
    player2: b.player2,
    nft1: Number(b.nft1),
    nft2: Number(b.nft2),
    stake: ethers.formatEther(b.stake),
    winner: b.winner,
    resolved: b.resolved,
    createdAt: Number(b.createdAt),
    resolvedAt: Number(b.resolvedAt),
  };
}

// ---------------------------------------------------------------------------
// Agent chat operations
// ---------------------------------------------------------------------------

/**
 * Posts a message to the on-chain agent chat.
 * Category: 0 = General, 1 = BattleResult, 2 = Strategy, 3 = Taunt
 */
export async function postChatMessage(content: string, category: number): Promise<number> {
  const wallet = getWallet();
  const agentChat = getAgentChatContract(wallet);

  console.log(`[executor] Posting chat message (category=${category}): "${content.slice(0, 60)}..."`);
  const tx: ethers.TransactionResponse = await agentChat.postMessage(content, 0, category);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('postMessage TX was not mined.');
  }

  // Try to parse message ID from logs
  let messageId = 0;
  for (const log of receipt.logs) {
    try {
      const parsed = agentChat.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed) {
        messageId = Number(parsed.args[0] ?? 0);
        break;
      }
    } catch {
      // Not a matching event; skip.
    }
  }

  console.log(`[executor] Chat message posted: messageId=${messageId} txHash=${receipt.hash}`);
  return messageId;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
