import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { CONTRACT_ADDRESSES } from './constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI, AGENT_CHAT_ABI } from './contracts';
import { getAgentAccount, getStoredAgent } from './wallet-manager';
import {
  makeDecision,
  ELEMENT_NAMES,
  computeElementCoverage,
  type GameState,
  type WarriorInfo,
  type BattleInfo,
  type BattleResult,
  type AgentAction,
  type DecisionRecord,
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
  getDecisions,
  getPersonality,
  updateEloAfterBattle,
  addXp,
  checkAchievements,
  checkAndPrestige,
  recordMerge,
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
        args: [BigInt(action.battleId), BigInt(action.tokenId), '0x' as `0x${string}`],
        value: stakeWei,
      });
      recordSpending(walletAddress, stakeWei);
      addLog(state, 'battle_joined', `Joined battle #${action.battleId} with warrior #${action.tokenId}, stake: ${action.stakeAmount} AVAX`, true, hash);

      // Track battle in DB + emit event + XP
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
        args: [BigInt(action.tokenId), '0x' as `0x${string}`],
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

    case 'merge_warriors': {
      if (!action.mergeTokenIds || action.mergeTokenIds.length !== 2) {
        addLog(state, 'merge_warriors', 'Missing or invalid mergeTokenIds', false);
        return;
      }

      const [tokenId1, tokenId2] = action.mergeTokenIds;

      // Simulate merge: burn 2 NFTs + mint 1 new
      // On-chain merge requires contract support; simulate with 2 burn + 1 mint
      try {
        const balance = await publicClient.getBalance({ address: account.address });
        if (balance < MINT_PRICE + MIN_BALANCE_RESERVE) {
          addLog(state, 'merge_warriors', 'Insufficient balance for merge mint', false);
          return;
        }

        // Mint a new warrior (merge result)
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'mint',
          value: MINT_PRICE,
        });
        recordSpending(walletAddress, MINT_PRICE);
        addLog(state, 'warriors_merged', `Merged warriors #${tokenId1} + #${tokenId2}`, true, hash);

        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          recordMerge({
            agentId: dbAgent.id,
            tokenId1,
            tokenId2,
            txHash: hash,
            success: true,
          });
          incrementAgentMints(dbAgent.id);
          addXp(dbAgent.id, 40, 'merge_warriors');
          addLiveEvent({
            eventType: 'warriors_merged',
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            data: { tokenId1, tokenId2, txHash: hash },
          });
        }
      } catch (mergeErr) {
        addLog(state, 'merge_warriors', `Merge failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`, false);
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          recordMerge({ agentId: dbAgent.id, tokenId1, tokenId2, success: false });
        }
      }
      break;
    }

    case 'join_tournament': {
      if (!action.tournamentId) {
        addLog(state, 'join_tournament', 'Missing tournamentId', false);
        return;
      }

      try {
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          const { joinTournament } = await import('./db-queries');
          const success = joinTournament(action.tournamentId, dbAgent.id);
          if (success) {
            addLog(state, 'tournament_joined', `Joined tournament #${action.tournamentId}`, true);
            addLiveEvent({
              eventType: 'tournament_joined',
              agentId: dbAgent.id,
              agentName: dbAgent.name,
              data: { tournamentId: action.tournamentId },
            });
          } else {
            addLog(state, 'join_tournament', `Could not join tournament #${action.tournamentId}`, false);
          }
        }
      } catch {
        addLog(state, 'join_tournament', 'Failed to join tournament', false);
      }
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

    // 0.3 Tournament schedule check (Faz 6) — runs once per tick, lightweight
    try {
      const { checkTournamentSchedule, ensureUpcomingTournament } = await import('./tournament-manager');
      checkTournamentSchedule();
      ensureUpcomingTournament();
    } catch { /* ignore */ }

    // 0.35 Season schedule check — ensure active season, check expiry
    try {
      const { checkSeasonSchedule, ensureActiveSeason } = await import('./season-manager');
      ensureActiveSeason();
      checkSeasonSchedule();
    } catch { /* ignore */ }

    // 0.5 Auto-funding check (Faz 2)
    const preBalance = await publicClient.getBalance({ address: walletAddress as `0x${string}` });
    if (preBalance < parseEther('0.02')) {
      addLog(state, 'low_balance', `Balance ${formatEther(preBalance)} AVAX is low, requesting funding`, true);
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const fundRes = await fetch(`${baseUrl}/api/v1/agent/fund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentWallet: walletAddress }),
        });
        const fundData = await fundRes.json();
        if (fundData.funded) {
          addLog(state, 'auto_funded', `Received ${fundData.amount} AVAX from faucet`, true, fundData.txHash);
        } else {
          addLog(state, 'fund_failed', fundData.error ?? 'Funding failed', false);
          // Emit low_balance event
          try {
            const dbAgent = getAgentByWallet(walletAddress);
            if (dbAgent) {
              addLiveEvent({
                eventType: 'low_balance',
                agentId: dbAgent.id,
                agentName: dbAgent.name,
                data: { balance: formatEther(preBalance) },
              });
            }
          } catch { /* ignore */ }
        }
      } catch {
        addLog(state, 'fund_error', 'Failed to call funding API', false);
      }
    }

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

    // 1.5 Fetch recent decisions for memory (Faz 1)
    let recentDecisions: DecisionRecord[] = [];
    try {
      const dbAgent = getAgentByWallet(walletAddress);
      if (dbAgent) {
        const { decisions } = getDecisions(dbAgent.id, 10);
        recentDecisions = decisions.map(d => ({
          action: d.action,
          reasoning: d.reasoning,
          success: d.success === 1,
          createdAt: d.created_at,
        }));
      }
    } catch { /* ignore */ }

    // 1.6 Compute element coverage (Faz 4)
    const { coverage: elementCoverage, recommendation: recommendedMint } = computeElementCoverage(warriors);

    // 1.7 Fetch rival info (Faz 3)
    let rival: GameState['rival'] = null;
    try {
      const dbAgent = getAgentByWallet(walletAddress);
      if (dbAgent) {
        const { getRivalInfo } = await import('./db-queries');
        rival = getRivalInfo(dbAgent.id);
      }
    } catch { /* ignore */ }

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
      recentDecisions,
      elementCoverage,
      recommendedMint,
      rival,
    };

    // 3. Ask Claude for decision
    const decision = await makeDecision(gameState);
    state.lastAction = decision;
    state.lastTick = Date.now();

    // Persist tick timestamp (Faz 7)
    try {
      const { updateLoopTick } = await import('./db-queries');
      updateLoopTick(walletAddress);
    } catch { /* ignore */ }

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

    // 4.1 XP rewards for non-battle actions
    try {
      const dbAgent = getAgentByWallet(walletAddress);
      if (dbAgent) {
        const xpMap: Record<string, number> = {
          mint_warrior: 20,
          post_message: 5,
          join_tournament: 30,
        };
        const xpAmount = xpMap[decision.action];
        if (xpAmount) {
          addXp(dbAgent.id, xpAmount, decision.action);
        }
      }
    } catch { /* ignore */ }

    // 4.2 Battle resolution check — detect recently resolved battles for ELO + XP
    try {
      const dbAgent = getAgentByWallet(walletAddress);
      if (dbAgent) {
        const { getBattleHistory } = await import('./db-queries');
        const recentBattles = getBattleHistory(dbAgent.id, 5);
        for (const battle of recentBattles) {
          if (battle.status !== 'resolved' || !battle.winner_id) continue;

          // Check if we already processed this battle (use a simple heuristic: resolved_at within last 2 minutes)
          if (!battle.resolved_at) continue;
          const resolvedAge = Date.now() - new Date(battle.resolved_at).getTime();
          if (resolvedAge > 120_000) continue; // older than 2 min, skip

          const won = battle.winner_id === dbAgent.id;
          const opponentId = battle.attacker_id === dbAgent.id ? battle.defender_id : battle.attacker_id;

          // ELO update
          if (opponentId && won) {
            updateEloAfterBattle(dbAgent.id, opponentId);
          } else if (opponentId && !won) {
            updateEloAfterBattle(opponentId, dbAgent.id);
          }

          // XP for battle result
          addXp(dbAgent.id, won ? 50 : 15, won ? 'battle_win' : 'battle_loss');
        }

        // 4.3 Achievement check
        checkAchievements(dbAgent.id);

        // 4.4 Prestige check
        checkAndPrestige(dbAgent.id);
      }
    } catch { /* ignore */ }

    // 4.5 Auto-detect rival after battles (Faz 3)
    if (decision.action === 'join_battle' || decision.action === 'create_battle') {
      try {
        const dbAgent = getAgentByWallet(walletAddress);
        if (dbAgent) {
          const { autoDetectRival, setRival } = await import('./db-queries');
          const rivalId = autoDetectRival(dbAgent.id);
          if (rivalId) {
            const personality = getPersonality(dbAgent.id);
            if (personality && personality.rival_agent_id !== rivalId) {
              setRival(dbAgent.id, rivalId);
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 4.6 Social interactions — auto trash talk (Faz 5)
    try {
      const dbAgent = getAgentByWallet(walletAddress);
      if (dbAgent) {
        const personality = getPersonality(dbAgent.id);
        if (personality) {
          const { generateTrashTalk } = await import('./personality-generator');
          let autoMessage: string | null = null;
          let messageType = '';

          if (decision.action === 'join_battle' || decision.action === 'create_battle') {
            // Check last battle result to determine win/loss taunt
            const lastResult = recentHistory[0];
            if (lastResult) {
              if (lastResult.won) {
                autoMessage = generateTrashTalk(personality.personality_type, 'win_taunt', walletAddress + Date.now());
                messageType = 'win_taunt';
              } else if (Math.random() < 0.3) {
                // 30% chance of revenge message after loss
                autoMessage = generateTrashTalk(personality.personality_type, 'loss_revenge', walletAddress + Date.now());
                messageType = 'loss_revenge';
              }
            }

            // Rival-specific messages
            if (personality.rival_agent_id && !autoMessage) {
              const rivalInBattle = filteredBattles.some(
                b => b.player1.toLowerCase() === walletAddress.toLowerCase()
              );
              if (rivalInBattle && Math.random() < 0.5) {
                autoMessage = generateTrashTalk(personality.personality_type, 'rival_challenge', walletAddress + Date.now());
                messageType = 'rival_challenge';
              }
            }
          } else if (decision.action === 'mint_warrior') {
            autoMessage = generateTrashTalk(personality.personality_type, 'new_warrior', walletAddress + Date.now());
            messageType = 'new_warrior';
          }

          if (autoMessage) {
            try {
              const account = state.cachedAccount ?? getAgentAccount(walletAddress);
              const walletClient = createWalletClient({
                account,
                chain: avalancheFuji,
                transport: http(RPC_URL),
              });
              const hash = await walletClient.writeContract({
                address: CONTRACT_ADDRESSES.agentChat as `0x${string}`,
                abi: AGENT_CHAT_ABI,
                functionName: 'postMessage',
                args: [autoMessage, 0n, 0],
              });
              addLog(state, 'auto_message', `[${messageType}] ${autoMessage.slice(0, 60)}`, true, hash);
              incrementAgentMessages(dbAgent.id);
              const { addChatMessage } = await import('./db-queries');
              addChatMessage({
                agentId: dbAgent.id,
                agentName: dbAgent.name,
                content: autoMessage,
                txHash: hash,
              });
              addLiveEvent({
                eventType: 'message_posted',
                agentId: dbAgent.id,
                agentName: dbAgent.name,
                data: { message: autoMessage.slice(0, 100), type: messageType },
              });
            } catch { /* ignore message posting failures */ }
          }
        }
      }
    } catch { /* ignore social interaction errors */ }
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

  // Persist loop state to DB (Faz 7)
  try {
    const { setLoopState } = require('./db-queries');
    setLoopState(walletAddress, true);
  } catch { /* ignore */ }

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

  // Persist loop state to DB (Faz 7)
  try {
    const { setLoopState } = require('./db-queries');
    setLoopState(walletAddress, false);
  } catch { /* ignore */ }

  return { success: true };
}

/**
 * Restore all previously running agent loops after server restart (Faz 7).
 * Call this once on server startup.
 */
export function restoreActiveLoops(): { restored: string[]; errors: string[] } {
  const restored: string[] = [];
  const errors: string[] = [];

  try {
    const { getRunningAgents } = require('./db-queries');
    const runningWallets: string[] = getRunningAgents();

    for (const wallet of runningWallets) {
      const result = startAgentLoop(wallet);
      if (result.success) {
        restored.push(wallet);
      } else {
        errors.push(`${wallet}: ${result.error}`);
      }
    }
  } catch (err) {
    errors.push(`Failed to query running agents: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (restored.length > 0) {
    console.log(`[agent-engine] Restored ${restored.length} agent loops`);
  }

  return { restored, errors };
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
