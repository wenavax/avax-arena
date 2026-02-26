import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import {
  mintWarrior,
  getMyWarriors,
  getWarriorStats,
  getOpenBattles,
  getBattleDetails,
  createBattle,
  joinBattle,
  postChatMessage,
  sleep,
} from './on-chain-executor';
import { decideBattle, BattleState, Strategy, ELEMENT_NAMES } from './decision-engine';

dotenv.config();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  strategy: Strategy;
  maxBattlesPerDay: number;
  maxStakePerBattle: string; // in AVAX
  stopLossLimit: string;     // in AVAX (cumulative loss that triggers shutdown)
  preferredElements: number[]; // element numbers the agent favors (0=Fire,1=Water,2=Earth,3=Wind,4=Ice)
  sessionDuration: number;   // hours
  chatFrequency: number;     // post to chat every N battles
}

interface AgentStats {
  battlesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  profit: string; // AVAX (may be negative)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 15_000;            // 15 seconds between battle cycles
const BATTLE_RESOLUTION_POLL_MS = 10_000;   // 10 seconds between resolution polls
const BATTLE_RESOLUTION_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

// ---------------------------------------------------------------------------
// AgentLoop class
// ---------------------------------------------------------------------------

export class AgentLoop {
  private config: AgentConfig;
  private running: boolean = false;
  private stats: AgentStats = {
    battlesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    profit: '0',
  };
  private profitWei: bigint = 0n;
  private sessionStartTime: number = 0;
  private stopRequested: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Start the autonomous battle loop. Resolves when the session ends
   * (either by duration, stop-loss, battle cap, or an explicit stop() call).
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[agent-loop] Already running.');
      return;
    }

    this.running = true;
    this.stopRequested = false;
    this.sessionStartTime = Date.now();

    const sessionEndMs =
      this.sessionStartTime + this.config.sessionDuration * 60 * 60 * 1_000;

    console.log('[agent-loop] Session started.');
    console.log(`[agent-loop] Strategy: ${this.config.strategy}`);
    console.log(`[agent-loop] Max battles/day: ${this.config.maxBattlesPerDay}`);
    console.log(`[agent-loop] Max stake/battle: ${this.config.maxStakePerBattle} AVAX`);
    console.log(`[agent-loop] Stop-loss limit: ${this.config.stopLossLimit} AVAX`);
    console.log(
      `[agent-loop] Preferred elements: ${this.config.preferredElements.map((e) => ELEMENT_NAMES[e] ?? e).join(', ')}`,
    );
    console.log(`[agent-loop] Session duration: ${this.config.sessionDuration}h`);
    console.log(`[agent-loop] Chat frequency: every ${this.config.chatFrequency} battles`);

    try {
      // --- Ensure agent has at least one warrior ---
      await this.ensureWarrior();

      while (!this.stopRequested) {
        // --- Guard: session duration ---
        if (Date.now() >= sessionEndMs) {
          console.log('[agent-loop] Session duration reached. Stopping.');
          break;
        }

        // --- Guard: daily battle cap ---
        if (this.stats.battlesPlayed >= this.config.maxBattlesPerDay) {
          console.log('[agent-loop] Daily battle cap reached. Stopping.');
          break;
        }

        // --- Guard: stop-loss ---
        const stopLossWei = ethers.parseEther(this.config.stopLossLimit);
        if (this.profitWei < 0n && -this.profitWei >= stopLossWei) {
          console.log(
            `[agent-loop] Stop-loss triggered (loss=${ethers.formatEther(-this.profitWei)} AVAX). Stopping.`,
          );
          break;
        }

        // --- Run one battle cycle ---
        try {
          await this.battleCycle();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[agent-loop] Error during battle cycle: ${msg}`);
        }

        // --- Cooldown ---
        if (!this.stopRequested) {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    } finally {
      this.running = false;
      console.log('[agent-loop] Session ended.');
      this.logStats();
    }
  }

  /**
   * Gracefully request the loop to stop after the current cycle finishes.
   */
  stop(): void {
    console.log('[agent-loop] Stop requested.');
    this.stopRequested = true;
  }

  /**
   * Return a snapshot of the agent's performance stats.
   */
  getStats(): AgentStats {
    return {
      ...this.stats,
      profit: ethers.formatEther(this.profitWei),
    };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Ensure the agent owns at least one warrior. If not, mint one.
   */
  private async ensureWarrior(): Promise<void> {
    console.log('[agent-loop] Checking if agent has warriors...');
    const warriors = await getMyWarriors();

    if (warriors.length === 0) {
      console.log('[agent-loop] No warriors found. Minting initial warrior...');
      const tokenId = await mintWarrior();
      console.log(`[agent-loop] Initial warrior minted: token #${tokenId}`);
    } else {
      console.log(`[agent-loop] Agent owns ${warriors.length} warrior(s): [${warriors.join(', ')}]`);
    }
  }

  /**
   * Run a single battle cycle: gather state, decide, execute, await resolution.
   */
  private async battleCycle(): Promise<void> {
    console.log(`[agent-loop] --- Battle cycle #${this.stats.battlesPlayed + 1} ---`);

    // 1. Build current battle state
    const battleState = await this.buildBattleState();

    if (battleState.myWarriors.length === 0) {
      console.log('[agent-loop] No warriors available. Minting a new one...');
      await mintWarrior();
      return; // Re-enter loop to pick up new warrior next cycle
    }

    // 2. Ask the decision engine what to do
    const decision = await decideBattle(this.config.strategy, battleState);
    console.log(
      `[agent-loop] Decision: action=${decision.action} warrior=#${decision.warriorTokenId} ` +
        `confidence=${decision.confidence.toFixed(2)} reason="${decision.reasoning}"`,
    );

    // 3. Execute the decision
    if (decision.action === 'wait') {
      console.log('[agent-loop] Decision is to wait. Skipping this cycle.');
      return;
    }

    let battleId: number;
    let stakeAmount: string;

    if (decision.action === 'join' && decision.battleId !== undefined) {
      // Join an existing battle
      const battleDetails = await getBattleDetails(decision.battleId);
      stakeAmount = battleDetails.stake;

      // Enforce max stake
      const stakeWei = ethers.parseEther(stakeAmount);
      const maxStakeWei = ethers.parseEther(this.config.maxStakePerBattle);
      if (stakeWei > maxStakeWei) {
        console.log(
          `[agent-loop] Battle #${decision.battleId} stake (${stakeAmount} AVAX) exceeds max ` +
            `(${this.config.maxStakePerBattle} AVAX). Skipping.`,
        );
        return;
      }

      await joinBattle(decision.battleId, decision.warriorTokenId, stakeAmount);
      battleId = decision.battleId;
    } else {
      // Create a new battle
      stakeAmount = decision.stakeAmount ?? this.config.maxStakePerBattle;

      // Enforce max stake
      const stakeWei = ethers.parseEther(stakeAmount);
      const maxStakeWei = ethers.parseEther(this.config.maxStakePerBattle);
      if (stakeWei > maxStakeWei) {
        stakeAmount = this.config.maxStakePerBattle;
      }

      battleId = await createBattle(decision.warriorTokenId, stakeAmount);
    }

    // 4. Wait for the battle to resolve
    console.log(`[agent-loop] Waiting for battle #${battleId} to resolve...`);
    const outcome = await this.waitForBattleResolution(battleId);

    // 5. Record result
    const stakeWei = ethers.parseEther(stakeAmount);

    if (outcome === 'win') {
      this.profitWei += stakeWei;
      this.stats.wins += 1;
      console.log(`[agent-loop] Battle #${battleId} result=WIN +${stakeAmount} AVAX`);
    } else if (outcome === 'loss') {
      this.profitWei -= stakeWei;
      this.stats.losses += 1;
      console.log(`[agent-loop] Battle #${battleId} result=LOSS -${stakeAmount} AVAX`);
    } else {
      this.stats.draws += 1;
      console.log(`[agent-loop] Battle #${battleId} result=DRAW (no change)`);
    }

    this.stats.battlesPlayed += 1;
    this.logStats();

    // 6. Optionally post results to chat
    if (
      this.config.chatFrequency > 0 &&
      this.stats.battlesPlayed % this.config.chatFrequency === 0
    ) {
      await this.postBattleResultToChat(battleId, outcome, stakeAmount);
    }
  }

  /**
   * Build a BattleState object for the decision engine by querying on-chain data.
   */
  private async buildBattleState(): Promise<BattleState> {
    // Get agent's warriors and their stats
    const warriorIds = await getMyWarriors();
    const myWarriors: BattleState['myWarriors'] = [];

    for (const tokenId of warriorIds) {
      try {
        const stats = await getWarriorStats(tokenId);
        const totalBattles = Number(stats.battleWins) + Number(stats.battleLosses);
        const winRate = totalBattles > 0 ? Number(stats.battleWins) / totalBattles : 0.5;

        myWarriors.push({
          tokenId,
          element: stats.element,
          powerScore: Number(stats.powerScore),
          level: stats.level,
          winRate,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[agent-loop] Failed to get stats for warrior #${tokenId}: ${msg}`);
      }
    }

    // Get open battles and their details
    const openBattleIds = await getOpenBattles();
    const availableBattles: BattleState['availableBattles'] = [];

    // Get agent wallet address to filter out own battles
    const agentKey = process.env.AGENT_PRIVATE_KEY;
    const agentAddress = agentKey ? new ethers.Wallet(agentKey).address.toLowerCase() : '';

    for (const bid of openBattleIds) {
      try {
        const details = await getBattleDetails(bid);

        // Skip our own battles (we created them, can't join them)
        if (details.player1.toLowerCase() === agentAddress) {
          continue;
        }

        // Get the opponent's warrior element and power score
        const opponentStats = await getWarriorStats(details.nft1);

        availableBattles.push({
          battleId: bid,
          opponentElement: opponentStats.element,
          opponentPowerScore: Number(opponentStats.powerScore),
          stake: details.stake,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[agent-loop] Failed to get details for battle #${bid}: ${msg}`);
      }
    }

    // Get current balance
    const rpcUrl = process.env.AVAX_RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    let currentBalance = '0';
    if (agentKey) {
      const wallet = new ethers.Wallet(agentKey, provider);
      const balanceWei = await provider.getBalance(wallet.address);
      currentBalance = ethers.formatEther(balanceWei);
    }

    return {
      availableBattles,
      myWarriors,
      currentBalance,
    };
  }

  /**
   * Poll the battle contract until the battle is resolved, then determine outcome.
   */
  private async waitForBattleResolution(
    battleId: number,
  ): Promise<'win' | 'loss' | 'draw'> {
    const agentKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentKey) {
      throw new Error('AGENT_PRIVATE_KEY is not set.');
    }
    const agentAddress = new ethers.Wallet(agentKey).address;

    const deadline = Date.now() + BATTLE_RESOLUTION_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const details = await getBattleDetails(battleId);

        if (details.resolved) {
          if (details.winner === ethers.ZeroAddress) {
            return 'draw';
          }
          return details.winner.toLowerCase() === agentAddress.toLowerCase()
            ? 'win'
            : 'loss';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[agent-loop] Battle #${battleId} resolution poll error: ${msg}`);
      }

      await sleep(BATTLE_RESOLUTION_POLL_MS);
    }

    // Timed out - assume draw (stake may be reclaimable separately)
    console.warn(
      `[agent-loop] Battle #${battleId} timed out waiting for resolution; assuming draw.`,
    );
    return 'draw';
  }

  /**
   * Post a battle result message to the on-chain agent chat.
   */
  private async postBattleResultToChat(
    battleId: number,
    outcome: 'win' | 'loss' | 'draw',
    stakeAmount: string,
  ): Promise<void> {
    try {
      const stats = this.getStats();
      const emoji =
        outcome === 'win' ? 'Victory' : outcome === 'loss' ? 'Defeat' : 'Draw';
      const content =
        `${emoji} in Battle #${battleId}! Stake: ${stakeAmount} AVAX. ` +
        `Record: ${stats.wins}W/${stats.losses}L/${stats.draws}D | ` +
        `Profit: ${stats.profit} AVAX | Strategy: ${this.config.strategy}`;

      // Category 1 = BattleResult
      await postChatMessage(content, 1);
      console.log('[agent-loop] Battle result posted to chat.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[agent-loop] Failed to post chat message: ${msg}`);
    }
  }

  /**
   * Log current cumulative stats.
   */
  private logStats(): void {
    const s = this.getStats();
    console.log(
      `[agent-loop] Stats: battles=${s.battlesPlayed} W=${s.wins} L=${s.losses} D=${s.draws} profit=${s.profit} AVAX`,
    );
  }
}
