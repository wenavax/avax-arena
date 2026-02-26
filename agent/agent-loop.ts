import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { playGameAutonomously, createAndJoinGame, claimGameReward } from './on-chain-executor';
import { GameState, Strategy } from './decision-engine';
import { GAME_ENGINE_ABI } from './abis';

dotenv.config();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  strategy: Strategy;
  maxGamesPerDay: number;
  maxStakePerGame: string; // in AVAX
  stopLossLimit: string;   // in AVAX  (cumulative loss that triggers shutdown)
  preferredGameTypes: string[];
  sessionDuration: number; // hours
}

interface AgentStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  profit: string; // AVAX (may be negative)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000; // 10 seconds between game cycles

// ---------------------------------------------------------------------------
// AgentLoop class
// ---------------------------------------------------------------------------

export class AgentLoop {
  private config: AgentConfig;
  private running: boolean = false;
  private stats: AgentStats = {
    gamesPlayed: 0,
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
   * Start the autonomous play loop.  Resolves when the session ends
   * (either by duration, stop-loss, game cap, or an explicit stop() call).
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[agent-loop] Already running.');
      return;
    }

    this.running = true;
    this.stopRequested = false;
    this.sessionStartTime = Date.now();

    const sessionEndMs = this.sessionStartTime + this.config.sessionDuration * 60 * 60 * 1_000;

    console.log('[agent-loop] Session started.');
    console.log(`[agent-loop] Strategy: ${this.config.strategy}`);
    console.log(`[agent-loop] Max games/day: ${this.config.maxGamesPerDay}`);
    console.log(`[agent-loop] Max stake/game: ${this.config.maxStakePerGame} AVAX`);
    console.log(`[agent-loop] Stop-loss limit: ${this.config.stopLossLimit} AVAX`);
    console.log(`[agent-loop] Preferred types: ${this.config.preferredGameTypes.join(', ')}`);
    console.log(`[agent-loop] Session duration: ${this.config.sessionDuration}h`);

    try {
      while (!this.stopRequested) {
        // --- Guard: session duration ---
        if (Date.now() >= sessionEndMs) {
          console.log('[agent-loop] Session duration reached. Stopping.');
          break;
        }

        // --- Guard: daily game cap ---
        if (this.stats.gamesPlayed >= this.config.maxGamesPerDay) {
          console.log('[agent-loop] Daily game cap reached. Stopping.');
          break;
        }

        // --- Guard: stop-loss ---
        const stopLossWei = ethers.parseEther(this.config.stopLossLimit);
        if (this.profitWei < 0n && (-this.profitWei) >= stopLossWei) {
          console.log(
            `[agent-loop] Stop-loss triggered (loss=${ethers.formatEther(-this.profitWei)} AVAX). Stopping.`,
          );
          break;
        }

        // --- Pick a game type ---
        const gameType = this.pickGameType();

        // --- Play one game cycle ---
        try {
          await this.playOneCycle(gameType);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[agent-loop] Error during game cycle: ${msg}`);
        }

        // --- Cooldown ---
        if (!this.stopRequested) {
          await this.sleep(POLL_INTERVAL_MS);
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
   * Run a single game from creation through play to reward claim.
   */
  private async playOneCycle(gameType: string): Promise<void> {
    const stake = this.config.maxStakePerGame;
    const stakeWei = ethers.parseEther(stake);

    console.log(`[agent-loop] --- Game cycle #${this.stats.gamesPlayed + 1} ---`);
    console.log(`[agent-loop] Type=${gameType}  Stake=${stake} AVAX`);

    // 1. Create (and implicitly join) a new game
    const gameId = await createAndJoinGame(gameType, stake);

    // 2. Build the game-state object for the AI
    const gameState: GameState = {
      gameId,
      gameType: gameType as GameState['gameType'],
      opponentHistory: [],
      myWinRate: this.stats.gamesPlayed > 0
        ? this.stats.wins / this.stats.gamesPlayed
        : 0.5,
      currentStake: stake,
      roundNumber: 1,
    };

    // 3. Play autonomously (commit & reveal)
    const result = await playGameAutonomously(gameId, this.config.strategy, gameState);
    console.log(
      `[agent-loop] Played move=${result.move} commit=${result.commitTxHash} reveal=${result.revealTxHash}`,
    );

    // 4. Determine outcome by reading on-chain state
    const outcome = await this.resolveOutcome(gameId);

    // 5. If we won, claim the reward
    if (outcome === 'win') {
      try {
        await claimGameReward(gameId);
        // Net profit = opponent's stake (we get our own back + theirs)
        this.profitWei += stakeWei;
        this.stats.wins += 1;
        console.log(`[agent-loop] game=${gameId} result=WIN +${stake} AVAX`);
      } catch (claimErr: unknown) {
        const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
        console.error(`[agent-loop] game=${gameId} failed to claim reward: ${msg}`);
        // Still count as a win even if claim TX reverts (e.g. already claimed)
        this.profitWei += stakeWei;
        this.stats.wins += 1;
      }
    } else if (outcome === 'loss') {
      this.profitWei -= stakeWei;
      this.stats.losses += 1;
      console.log(`[agent-loop] game=${gameId} result=LOSS -${stake} AVAX`);
    } else {
      // Draw - stake returned, net zero
      this.stats.draws += 1;
      console.log(`[agent-loop] game=${gameId} result=DRAW`);
    }

    this.stats.gamesPlayed += 1;
    this.logStats();
  }

  /**
   * Read the on-chain game struct to determine if we won, lost, or drew.
   */
  private async resolveOutcome(gameId: number): Promise<'win' | 'loss' | 'draw'> {
    const rpcUrl = process.env.AVAX_RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const address = process.env.GAME_ENGINE_ADDRESS;
    if (!address) {
      throw new Error('GAME_ENGINE_ADDRESS is not set.');
    }
    const gameEngine = new ethers.Contract(address, GAME_ENGINE_ABI, provider);

    const agentKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentKey) {
      throw new Error('AGENT_PRIVATE_KEY is not set.');
    }
    const agentAddress = new ethers.Wallet(agentKey).address;

    // Poll until the game has a winner or is resolved (state >= 4 means resolved)
    const deadline = Date.now() + 5 * 60 * 1_000; // 5 min timeout
    while (Date.now() < deadline) {
      try {
        const gameData = await gameEngine.games(gameId);
        const state = Number(gameData[5]);    // state enum
        const winner: string = gameData[6];   // winner address

        // state >= 4 typically means "Resolved"
        if (state >= 4) {
          if (winner === ethers.ZeroAddress) {
            return 'draw';
          }
          return winner.toLowerCase() === agentAddress.toLowerCase() ? 'win' : 'loss';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[agent-loop] game=${gameId} outcome poll error: ${msg}`);
      }

      await this.sleep(5_000);
    }

    // If we timed out assume a draw (stake may be reclaimable separately)
    console.warn(`[agent-loop] game=${gameId} timed out resolving outcome; assuming draw.`);
    return 'draw';
  }

  /**
   * Randomly pick a game type from the configured preferences.
   */
  private pickGameType(): string {
    const types = this.config.preferredGameTypes;
    if (types.length === 0) {
      return 'RPS'; // sensible default
    }
    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Log current cumulative stats.
   */
  private logStats(): void {
    const s = this.getStats();
    console.log(
      `[agent-loop] Stats: played=${s.gamesPlayed} W=${s.wins} L=${s.losses} D=${s.draws} profit=${s.profit} AVAX`,
    );
  }

  /**
   * Async sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
