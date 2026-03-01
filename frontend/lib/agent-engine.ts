import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { CONTRACT_ADDRESSES } from './constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI, AGENT_CHAT_ABI } from './contracts';
import { getAgentAccount, getStoredAgent } from './wallet-manager';
import {
  makeDecision,
  ELEMENT_NAMES,
  type GameState,
  type WarriorInfo,
  type BattleInfo,
  type BattleResult,
  type AgentAction,
} from './claude-decision';
import {
  getAgentByWallet,
  addActivity,
  incrementAgentMints,
  incrementAgentMessages,
  updateAgentStats,
  createBattle as dbCreateBattle,
  addDecision,
  addLiveEvent,
  getDailySpent,
  addDailySpent,
} from './db-queries';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export interface ActivityLogEntry {
  timestamp: number;
  action: string;
  details: string;
  success: boolean;
  txHash?: string;
}

export interface AgentLoopState {
  running: boolean;
  walletAddress: string;
  intervalId: ReturnType<typeof setInterval> | null;
  lastTick: number;
  lastAction: AgentAction | null;
  lastError: string | null;
  consecutiveErrors: number;
  cachedAccount: ReturnType<typeof getAgentAccount> | null;
  activityLog: ActivityLogEntry[];
}

/* ---------------------------------------------------------------------------
 * Globals (persist across Next.js hot reloads)
 * ------------------------------------------------------------------------- */

const globalKey = '__frostbite_agent_loops__' as const;

type GlobalLoops = Record<string, AgentLoopState>;

function getLoops(): GlobalLoops {
  if (!(globalThis as Record<string, unknown>)[globalKey]) {
    (globalThis as Record<string, unknown>)[globalKey] = {};
  }
  return (globalThis as Record<string, unknown>)[globalKey] as GlobalLoops;
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc';
const LOOP_INTERVAL_MS = 30_000; // 30 seconds
const MAX_CONSECUTIVE_ERRORS = 3;
const MIN_BALANCE_RESERVE = parseEther('0.01'); // Keep 0.01 AVAX for gas
const DEFAULT_MAX_STAKE = parseEther('0.1');    // 0.1 AVAX max per battle
const DEFAULT_DAILY_LIMIT = parseEther('1');    // 1 AVAX daily limit
const MAX_ACTIVITY_LOG = 50; // Keep last 50 entries
const MINT_PRICE = parseEther('0.01');

/* ---------------------------------------------------------------------------
 * Chain clients
 * ------------------------------------------------------------------------- */

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(RPC_URL),
});

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function addLog(state: AgentLoopState, action: string, details: string, success: boolean, txHash?: string) {
  state.activityLog.unshift({
    timestamp: Date.now(),
    action,
    details,
    success,
    txHash,
  });
  // Trim to max entries
  if (state.activityLog.length > MAX_ACTIVITY_LOG) {
    state.activityLog.length = MAX_ACTIVITY_LOG;
  }

  // Persist to database
  try {
    const dbAgent = getAgentByWallet(state.walletAddress);
    if (dbAgent) {
      addActivity({
        agentId: dbAgent.id,
        agentName: dbAgent.name,
        type: action,
        description: details,
        txHash,
        success,
      });
    }
  } catch {
    // Don't let DB errors break the agent loop
  }
}

function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getCurrentDailySpent(walletAddress: string): bigint {
  return getDailySpent(walletAddress, getTodayDateStr());
}

function recordSpending(walletAddress: string, amountWei: bigint): void {
  addDailySpent(walletAddress, getTodayDateStr(), amountWei);
}

/* ---------------------------------------------------------------------------
 * Read chain state
 * ------------------------------------------------------------------------- */

export async function fetchWarriors(walletAddress: string): Promise<WarriorInfo[]> {
  const tokenIds = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarriorsByOwner',
    args: [walletAddress as `0x${string}`],
  });

  if (!Array.isArray(tokenIds) || tokenIds.length === 0) return [];

  const warriors: WarriorInfo[] = [];
  for (const tokenId of tokenIds) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'getWarrior',
        args: [tokenId],
      });
      warriors.push({
        tokenId: Number(tokenId),
        attack: Number(raw.attack ?? raw[0] ?? 0),
        defense: Number(raw.defense ?? raw[1] ?? 0),
        speed: Number(raw.speed ?? raw[2] ?? 0),
        element: Number(raw.element ?? raw[3] ?? 0),
        elementName: ELEMENT_NAMES[Number(raw.element ?? raw[3] ?? 0)] ?? 'Unknown',
        powerScore: Number(raw.powerScore ?? raw[9] ?? 0),
        level: Number(raw.level ?? raw[5] ?? 1),
        battleWins: Number(raw.battleWins ?? raw[7] ?? 0),
        battleLosses: Number(raw.battleLosses ?? raw[8] ?? 0),
      });
    } catch {
      // Skip failed warrior reads
    }
  }
  return warriors;
}

async function fetchOpenBattles(): Promise<BattleInfo[]> {
  const battleIds = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
    abi: BATTLE_ENGINE_ABI,
    functionName: 'getOpenBattles',
    args: [0n, 20n],
  });

  if (!Array.isArray(battleIds) || battleIds.length === 0) return [];

  const battles: BattleInfo[] = [];
  for (const battleId of battleIds) {
    if (Number(battleId) === 0) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'getBattle',
        args: [battleId],
      });

      const nft1Id = Number(raw.nft1 ?? raw[3] ?? 0);

      // Try to fetch opponent's warrior stats
      let nft1Stats: WarriorInfo | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wRaw: any = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarrior',
          args: [BigInt(nft1Id)],
        });
        nft1Stats = {
          tokenId: nft1Id,
          attack: Number(wRaw.attack ?? wRaw[0] ?? 0),
          defense: Number(wRaw.defense ?? wRaw[1] ?? 0),
          speed: Number(wRaw.speed ?? wRaw[2] ?? 0),
          element: Number(wRaw.element ?? wRaw[3] ?? 0),
          elementName: ELEMENT_NAMES[Number(wRaw.element ?? wRaw[3] ?? 0)] ?? 'Unknown',
          powerScore: Number(wRaw.powerScore ?? wRaw[9] ?? 0),
          level: Number(wRaw.level ?? wRaw[5] ?? 1),
          battleWins: Number(wRaw.battleWins ?? wRaw[7] ?? 0),
          battleLosses: Number(wRaw.battleLosses ?? wRaw[8] ?? 0),
        };
      } catch {
        // Couldn't fetch opponent stats
      }

      battles.push({
        battleId: Number(battleId),
        player1: String(raw.player1 ?? raw[1] ?? ''),
        nft1: nft1Id,
        nft1Stats,
        stake: formatEther(BigInt(String(raw.stake ?? raw[5] ?? 0))),
        createdAt: Number(raw.createdAt ?? raw[8] ?? 0),
      });
    } catch {
      // Skip failed battle reads
    }
  }
  return battles;
}

async function fetchRecentHistory(walletAddress: string): Promise<BattleResult[]> {
  try {
    const battleIds = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
      abi: BATTLE_ENGINE_ABI,
      functionName: 'getBattleHistory',
      args: [walletAddress as `0x${string}`],
    });

    if (!Array.isArray(battleIds) || battleIds.length === 0) return [];

    const recentIds = battleIds.slice(-5).reverse();
    const results: BattleResult[] = [];

    for (const battleId of recentIds) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'getBattle',
          args: [battleId],
        });

        const winner = String(raw.winner ?? raw[6] ?? '');
        const isWin = winner.toLowerCase() === walletAddress.toLowerCase();
        const player1 = String(raw.player1 ?? raw[1] ?? '');
        const player2 = String(raw.player2 ?? raw[2] ?? '');
        const opponent = player1.toLowerCase() === walletAddress.toLowerCase() ? player2 : player1;

        results.push({
          battleId: Number(battleId),
          won: isWin,
          stake: formatEther(BigInt(String(raw.stake ?? raw[5] ?? 0))),
          opponent,
          timestamp: Number(raw.resolvedAt ?? raw[9] ?? 0),
        });
      } catch {
        // Skip
      }
    }
    return results;
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Execute actions on-chain
 * ------------------------------------------------------------------------- */

async function executeAction(
  walletAddress: string,
  action: AgentAction,
  state: AgentLoopState
): Promise<void> {
  const account = state.cachedAccount ?? getAgentAccount(walletAddress);
  const walletClient = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(RPC_URL),
  });

  switch (action.action) {
    case 'mint_warrior': {
      const balance = await publicClient.getBalance({ address: account.address });
      if (balance < MINT_PRICE + MIN_BALANCE_RESERVE) {
        addLog(state, 'mint_warrior', 'Insufficient balance to mint', false);
        return;
      }

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'mint',
        value: MINT_PRICE,
      });
      recordSpending(walletAddress, MINT_PRICE);
      addLog(state, 'nft_minted', `Minted new warrior`, true, hash);

      // Update DB stats + emit event
      try {
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          incrementAgentMints(dbAgent.id);
          addLiveEvent({
            eventType: 'warrior_minted',
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            data: { txHash: hash },
          });
        }
      } catch { /* ignore */ }
      break;
    }

    case 'join_battle': {
      if (!action.battleId || !action.tokenId || !action.stakeAmount) {
        addLog(state, 'join_battle', 'Missing battleId, tokenId, or stakeAmount', false);
        return;
      }

      const stakeWei = parseEther(action.stakeAmount);
      if (stakeWei > DEFAULT_MAX_STAKE) {
        addLog(state, 'join_battle', `Stake ${action.stakeAmount} exceeds max per game`, false);
        return;
      }

      const dailySpentJoin = getCurrentDailySpent(walletAddress);
      if (dailySpentJoin + stakeWei > DEFAULT_DAILY_LIMIT) {
        addLog(state, 'join_battle', 'Daily spending limit reached', false);
        return;
      }

      const balance = await publicClient.getBalance({ address: account.address });
      if (balance < stakeWei + MIN_BALANCE_RESERVE) {
        addLog(state, 'join_battle', 'Insufficient balance', false);
        return;
      }

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'joinBattle',
        args: [BigInt(action.battleId), BigInt(action.tokenId)],
        value: stakeWei,
      });
      recordSpending(walletAddress, stakeWei);
      addLog(state, 'battle_joined', `Joined battle #${action.battleId} with warrior #${action.tokenId}, stake: ${action.stakeAmount} AVAX`, true, hash);

      // Track battle in DB + emit event
      try {
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          updateAgentStats(dbAgent.id, { won: false, stake: action.stakeAmount });
          addLiveEvent({
            eventType: 'battle_joined',
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            data: { battleId: action.battleId, tokenId: action.tokenId, stake: action.stakeAmount, txHash: hash },
          });
        }
      } catch { /* ignore */ }
      break;
    }

    case 'create_battle': {
      if (!action.tokenId || !action.stakeAmount) {
        addLog(state, 'create_battle', 'Missing tokenId or stakeAmount', false);
        return;
      }

      const stakeWei = parseEther(action.stakeAmount);
      if (stakeWei > DEFAULT_MAX_STAKE) {
        addLog(state, 'create_battle', `Stake ${action.stakeAmount} exceeds max per game`, false);
        return;
      }

      const dailySpentCreate = getCurrentDailySpent(walletAddress);
      if (dailySpentCreate + stakeWei > DEFAULT_DAILY_LIMIT) {
        addLog(state, 'create_battle', 'Daily spending limit reached', false);
        return;
      }

      const balance = await publicClient.getBalance({ address: account.address });
      if (balance < stakeWei + MIN_BALANCE_RESERVE) {
        addLog(state, 'create_battle', 'Insufficient balance', false);
        return;
      }

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'createBattle',
        args: [BigInt(action.tokenId)],
        value: stakeWei,
      });
      recordSpending(walletAddress, stakeWei);
      addLog(state, 'battle_created', `Created battle with warrior #${action.tokenId}, stake: ${action.stakeAmount} AVAX`, true, hash);

      // Track in DB + emit event
      try {
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          dbCreateBattle({
            attackerId: dbAgent.id,
            attackerWallet: walletAddress,
            attackerNft: action.tokenId,
            stake: action.stakeAmount,
            txHash: hash,
          });
          addLiveEvent({
            eventType: 'battle_created',
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            data: { tokenId: action.tokenId, stake: action.stakeAmount, txHash: hash },
          });
        }
      } catch { /* ignore */ }
      break;
    }

    case 'post_message': {
      if (!action.message) {
        addLog(state, 'post_message', 'No message content', false);
        return;
      }

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.agentChat as `0x${string}`,
        abi: AGENT_CHAT_ABI,
        functionName: 'postMessage',
        args: [action.message, 0n, 0],
      });
      addLog(state, 'message', `Posted: "${action.message.slice(0, 60)}"`, true, hash);

      // Track in DB + emit event
      try {
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          incrementAgentMessages(dbAgent.id);
          const { addChatMessage } = await import('./db-queries');
          addChatMessage({
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            content: action.message,
            txHash: hash,
          });
          addLiveEvent({
            eventType: 'message_posted',
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            data: { message: action.message.slice(0, 100), txHash: hash },
          });
        }
      } catch { /* ignore */ }
      break;
    }

    case 'wait': {
      addLog(state, 'wait', action.reasoning, true);
      break;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Tick mutex — prevents concurrent ticks for the same agent
 * ------------------------------------------------------------------------- */

const tickInProgress = new Set<string>();

/* ---------------------------------------------------------------------------
 * Main loop tick
 * ------------------------------------------------------------------------- */

async function tick(walletAddress: string): Promise<void> {
  const key = walletAddress.toLowerCase();
  const loops = getLoops();
  const state = loops[key];
  if (!state || !state.running) return;

  // Prevent concurrent ticks for the same agent
  if (tickInProgress.has(key)) return;
  tickInProgress.add(key);

  try {
    const storedAgent = getStoredAgent(walletAddress);
    if (!storedAgent) {
      addLog(state, 'error', 'Agent not found in storage', false);
      return;
    }

    const strategyNames = ['Aggressive', 'Defensive', 'Analytical', 'Random'];

    // 1. Read chain state
    const [warriors, openBattles, recentHistory, balance] = await Promise.all([
      fetchWarriors(walletAddress),
      fetchOpenBattles(),
      fetchRecentHistory(walletAddress),
      publicClient.getBalance({ address: walletAddress as `0x${string}` }),
    ]);

    // Filter out battles created by this agent
    const filteredBattles = openBattles.filter(
      (b) => b.player1.toLowerCase() !== walletAddress.toLowerCase()
    );

    const currentDailySpent = getCurrentDailySpent(walletAddress);

    // 2. Build game state
    const gameState: GameState = {
      agentWallet: walletAddress,
      agentBalance: formatEther(balance),
      warriors,
      openBattles: filteredBattles,
      recentHistory,
      strategy: strategyNames[storedAgent.strategy] ?? 'Analytical',
      dailySpent: formatEther(currentDailySpent),
      dailyLimit: formatEther(DEFAULT_DAILY_LIMIT),
      maxStakePerGame: formatEther(DEFAULT_MAX_STAKE),
    };

    // 3. Ask Claude for decision
    const decision = await makeDecision(gameState);
    state.lastAction = decision;
    state.lastTick = Date.now();

    // 3.5 Persist decision to DB
    try {
      const dbAgent = getAgentByWallet(walletAddress);
      if (dbAgent) {
        addDecision({
          agentId: dbAgent.id,
          action: decision.action,
          reasoning: decision.reasoning,
          gameStateSummary: JSON.stringify({
            balance: gameState.agentBalance,
            warriors: gameState.warriors.length,
            openBattles: gameState.openBattles.length,
            dailySpent: gameState.dailySpent,
          }),
          battleId: decision.battleId,
          tokenId: decision.tokenId,
          stakeAmount: decision.stakeAmount,
        });
      }
    } catch { /* Don't break loop on DB errors */ }

    // 4. Execute action
    await executeAction(walletAddress, decision, state);
    state.consecutiveErrors = 0;
  } catch (err) {
    state.consecutiveErrors += 1;
    const errorMsg = err instanceof Error ? err.message : String(err);
    state.lastError = errorMsg;
    addLog(state, 'error', errorMsg, false);

    // Pause after too many consecutive errors
    if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      state.running = false;
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
      }
      addLog(state, 'paused', `Paused after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`, false);
    }
  } finally {
    tickInProgress.delete(key);
  }
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

export function startAgentLoop(walletAddress: string): { success: boolean; error?: string } {
  const key = walletAddress.toLowerCase();
  const loops = getLoops();

  if (loops[key]?.running) {
    return { success: false, error: 'Agent loop is already running' };
  }

  // Decrypt private key once per loop start
  let cachedAccount: ReturnType<typeof getAgentAccount> | null = null;
  try {
    cachedAccount = getAgentAccount(walletAddress);
  } catch (err) {
    return { success: false, error: `Failed to decrypt agent key: ${err instanceof Error ? err.message : String(err)}` };
  }

  const state: AgentLoopState = {
    running: true,
    walletAddress: key,
    intervalId: null,
    lastTick: 0,
    lastAction: null,
    lastError: null,
    consecutiveErrors: 0,
    cachedAccount,
    activityLog: loops[key]?.activityLog ?? [],
  };

  // Run first tick immediately, then every 30s
  state.intervalId = setInterval(() => tick(walletAddress), LOOP_INTERVAL_MS);
  loops[key] = state;

  addLog(state, 'started', 'Agent loop started', true);

  // Trigger first tick immediately (async, don't await)
  tick(walletAddress);

  return { success: true };
}

export function stopAgentLoop(walletAddress: string): { success: boolean; error?: string } {
  const key = walletAddress.toLowerCase();
  const loops = getLoops();
  const state = loops[key];

  if (!state || !state.running) {
    return { success: false, error: 'Agent loop is not running' };
  }

  state.running = false;
  state.cachedAccount = null;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  addLog(state, 'stopped', 'Agent loop stopped', true);

  return { success: true };
}

export function getAgentStatus(walletAddress: string): {
  running: boolean;
  lastTick: number;
  lastAction: AgentAction | null;
  lastError: string | null;
  consecutiveErrors: number;
  dailySpent: string;
  activityLog: ActivityLogEntry[];
} | null {
  const key = walletAddress.toLowerCase();
  const loops = getLoops();
  const state = loops[key];

  if (!state) return null;

  return {
    running: state.running,
    lastTick: state.lastTick,
    lastAction: state.lastAction,
    lastError: state.lastError,
    consecutiveErrors: state.consecutiveErrors,
    dailySpent: formatEther(getCurrentDailySpent(state.walletAddress)),
    activityLog: state.activityLog,
  };
}
