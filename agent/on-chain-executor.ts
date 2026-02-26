import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { decideMove, GameState, Strategy } from './decision-engine';
import { GAME_ENGINE_ABI } from './abis';

dotenv.config();

// ---------------------------------------------------------------------------
// Environment & provider setup
// ---------------------------------------------------------------------------

const RPC_URL = process.env.AVAX_RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc';
const GAME_ENGINE_ADDRESS = process.env.GAME_ENGINE_ADDRESS;

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

function getGameEngineContract(signer: ethers.Wallet): ethers.Contract {
  if (!GAME_ENGINE_ADDRESS) {
    throw new Error('Environment variable GAME_ENGINE_ADDRESS is not set.');
  }
  return new ethers.Contract(GAME_ENGINE_ADDRESS, GAME_ENGINE_ABI, signer);
}

// ---------------------------------------------------------------------------
// Numeric game-type mapping used by the contract
// ---------------------------------------------------------------------------

const GAME_TYPE_TO_UINT8: Record<string, number> = {
  RPS: 0,
  CoinFlip: 1,
  Dice: 2,
  NumberGuess: 3,
};

// ---------------------------------------------------------------------------
// playGameAutonomously
// ---------------------------------------------------------------------------

export interface PlayResult {
  move: number;
  commitTxHash: string;
  revealTxHash: string;
}

/**
 * Full autonomous play cycle for a single game round:
 *  1. Ask the AI decision engine for a move.
 *  2. Generate a cryptographically random salt.
 *  3. Compute the commit hash = keccak256(abi.encodePacked(move, salt)).
 *  4. Send `commitMove` transaction.
 *  5. Wait for the opponent to commit (poll until game state advances).
 *  6. Send `revealMove` transaction.
 */
export async function playGameAutonomously(
  gameId: number,
  strategy: Strategy,
  gameState: GameState,
): Promise<PlayResult> {
  const wallet = getWallet();
  const gameEngine = getGameEngineContract(wallet);

  // 1. Decide move
  const move = await decideMove(strategy, gameState);
  console.log(`[executor] game=${gameId} decided move=${move}`);

  // 2. Random 32-byte salt
  const salt = ethers.randomBytes(32);
  const saltHex = ethers.hexlify(salt);

  // 3. Commit hash  = keccak256(abi.encodePacked(uint8(move), bytes32(salt)))
  const packed = ethers.solidityPacked(['uint8', 'bytes32'], [move, saltHex]);
  const commitHash = ethers.keccak256(packed);

  // 4. Send commitMove TX
  console.log(`[executor] game=${gameId} committing hash=${commitHash}`);
  const commitTx: ethers.TransactionResponse = await gameEngine.commitMove(gameId, commitHash);
  const commitReceipt = await commitTx.wait();
  if (!commitReceipt) {
    throw new Error(`commitMove TX for game ${gameId} was not mined.`);
  }
  const commitTxHash = commitReceipt.hash;
  console.log(`[executor] game=${gameId} commitTx mined: ${commitTxHash}`);

  // 5. Wait for opponent to commit (poll game state every 5 s, timeout 10 min)
  console.log(`[executor] game=${gameId} waiting for opponent to commit...`);
  await waitForOpponentCommit(gameEngine, gameId);

  // 6. Send revealMove TX
  console.log(`[executor] game=${gameId} revealing move=${move}`);
  const revealTx: ethers.TransactionResponse = await gameEngine.revealMove(gameId, move, saltHex);
  const revealReceipt = await revealTx.wait();
  if (!revealReceipt) {
    throw new Error(`revealMove TX for game ${gameId} was not mined.`);
  }
  const revealTxHash = revealReceipt.hash;
  console.log(`[executor] game=${gameId} revealTx mined: ${revealTxHash}`);

  return { move, commitTxHash, revealTxHash };
}

// ---------------------------------------------------------------------------
// waitForOpponentCommit (polls the on-chain game struct)
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

/**
 * Polls the contract's `games(gameId)` view function until the game state
 * value indicates that both players have committed (state >= 3 in a typical
 * commit-reveal flow). The exact numeric value depends on the contract's
 * enum, but state 0 = Created, 1 = Joined, 2 = Player1Committed,
 * 3 = BothCommitted / RevealPhase. We wait until state >= 3.
 */
async function waitForOpponentCommit(
  gameEngine: ethers.Contract,
  gameId: number,
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const gameData = await gameEngine.games(gameId);
      // gameData.state is the 6th returned value (index 5)
      const state = Number(gameData[5]);
      if (state >= 3) {
        console.log(`[executor] game=${gameId} opponent has committed (state=${state}).`);
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[executor] game=${gameId} poll error: ${msg}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`[executor] game=${gameId} timed out waiting for opponent commit.`);
}

// ---------------------------------------------------------------------------
// createAndJoinGame
// ---------------------------------------------------------------------------

/**
 * Creates a new game of the given type with the specified stake and returns
 * the newly created gameId.
 */
export async function createAndJoinGame(
  gameType: string,
  stakeAmount: string,
): Promise<number> {
  const wallet = getWallet();
  const gameEngine = getGameEngineContract(wallet);

  const typeUint8 = GAME_TYPE_TO_UINT8[gameType];
  if (typeUint8 === undefined) {
    throw new Error(`Unknown game type: ${gameType}`);
  }

  const stakeWei = ethers.parseEther(stakeAmount);

  console.log(`[executor] creating game type=${gameType}(${typeUint8}) stake=${stakeAmount} AVAX`);
  const tx: ethers.TransactionResponse = await gameEngine.createGame(typeUint8, { value: stakeWei });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('createGame TX was not mined.');
  }

  // Parse the gameId from the transaction receipt logs. Look for the first
  // event that contains a uint256 topic we can treat as the game id.
  // As a reliable fallback read gameCounter() which returns the latest id.
  let gameId: number;
  try {
    const counter = await gameEngine.gameCounter();
    gameId = Number(counter);
  } catch {
    // If gameCounter is not available, derive from logs length heuristic.
    // This branch should rarely trigger.
    gameId = receipt.logs.length > 0 ? Number(receipt.logs[0].topics[1]) : 0;
  }

  console.log(`[executor] game created: id=${gameId} txHash=${receipt.hash}`);
  return gameId;
}

// ---------------------------------------------------------------------------
// claimGameReward
// ---------------------------------------------------------------------------

/**
 * Claims the reward for a resolved game.
 */
export async function claimGameReward(gameId: number): Promise<string> {
  const wallet = getWallet();
  const gameEngine = getGameEngineContract(wallet);

  console.log(`[executor] claiming reward for game=${gameId}`);
  const tx: ethers.TransactionResponse = await gameEngine.claimReward(gameId);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(`claimReward TX for game ${gameId} was not mined.`);
  }
  console.log(`[executor] reward claimed: txHash=${receipt.hash}`);
  return receipt.hash;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
