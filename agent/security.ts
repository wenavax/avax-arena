import { ethers } from 'ethers';

export interface SecurityPolicy {
  dailySpendLimitAvax: string;    // e.g. "5.0" AVAX
  maxStakePerGameAvax: string;    // e.g. "1.0" AVAX
  maxGamesPerDay: number;         // e.g. 50
  stopLossLimitAvax: string;      // e.g. "3.0" AVAX - stop if cumulative loss exceeds this
  minBalanceAvax: string;         // e.g. "0.1" AVAX - stop if balance drops below
  profitSweepThresholdAvax: string; // e.g. "10.0" AVAX - auto-sweep profits above this
  maxConsecutiveLosses: number;   // e.g. 5 - pause after N consecutive losses
  allowedGameTypes: number[];     // e.g. [0,1,2,3,4,5,6] - which game type IDs are allowed
  sessionDurationHours: number;   // e.g. 24
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  dailySpendLimitAvax: '5.0',
  maxStakePerGameAvax: '1.0',
  maxGamesPerDay: 50,
  stopLossLimitAvax: '3.0',
  minBalanceAvax: '0.1',
  profitSweepThresholdAvax: '10.0',
  maxConsecutiveLosses: 5,
  allowedGameTypes: [0, 1, 2, 3, 4, 5, 6],
  sessionDurationHours: 24,
};

export interface SecurityState {
  dailySpent: bigint;
  dailyGamesPlayed: number;
  lastDayReset: number;           // timestamp
  consecutiveLosses: number;
  totalProfit: bigint;            // can be negative
  sessionStart: number;
  isPaused: boolean;
  pauseReason: string;
}

export class SecurityGuard {
  private policy: SecurityPolicy;
  private state: SecurityState;

  constructor(policy: SecurityPolicy) {
    this.policy = policy;
    this.state = {
      dailySpent: 0n,
      dailyGamesPlayed: 0,
      lastDayReset: Date.now(),
      consecutiveLosses: 0,
      totalProfit: 0n,
      sessionStart: Date.now(),
      isPaused: false,
      pauseReason: '',
    };
  }

  /**
   * Check if a game action is allowed given current state and policy.
   * Returns { allowed: boolean, reason?: string }
   */
  canPlay(stakeAvax: string, gameType: number): { allowed: boolean; reason?: string } {
    // Check if paused
    if (this.state.isPaused) {
      return { allowed: false, reason: `Agent paused: ${this.state.pauseReason}` };
    }

    // Check session duration
    const sessionElapsed = (Date.now() - this.state.sessionStart) / (1000 * 60 * 60);
    if (sessionElapsed >= this.policy.sessionDurationHours) {
      return { allowed: false, reason: 'Session duration exceeded' };
    }

    // Check allowed game types
    if (!this.policy.allowedGameTypes.includes(gameType)) {
      return { allowed: false, reason: `Game type ${gameType} not allowed` };
    }

    // Reset daily counters if new day
    this.maybeResetDailyCounters();

    // Check daily game limit
    if (this.state.dailyGamesPlayed >= this.policy.maxGamesPerDay) {
      return { allowed: false, reason: 'Daily game limit reached' };
    }

    const stakeWei = ethers.parseEther(stakeAvax);

    // Check max stake per game
    const maxStakeWei = ethers.parseEther(this.policy.maxStakePerGameAvax);
    if (stakeWei > maxStakeWei) {
      return { allowed: false, reason: `Stake ${stakeAvax} AVAX exceeds max ${this.policy.maxStakePerGameAvax} AVAX` };
    }

    // Check daily spend limit
    const dailyLimitWei = ethers.parseEther(this.policy.dailySpendLimitAvax);
    if (this.state.dailySpent + stakeWei > dailyLimitWei) {
      return { allowed: false, reason: 'Daily spend limit would be exceeded' };
    }

    // Check stop-loss
    const stopLossWei = ethers.parseEther(this.policy.stopLossLimitAvax);
    if (this.state.totalProfit < 0n && (-this.state.totalProfit) >= stopLossWei) {
      return { allowed: false, reason: `Stop-loss triggered (loss: ${ethers.formatEther(-this.state.totalProfit)} AVAX)` };
    }

    // Check consecutive losses
    if (this.state.consecutiveLosses >= this.policy.maxConsecutiveLosses) {
      return { allowed: false, reason: `${this.state.consecutiveLosses} consecutive losses - cooling down` };
    }

    return { allowed: true };
  }

  /**
   * Record a game result. Updates all tracking state.
   */
  recordGame(stakeAvax: string, result: 'win' | 'loss' | 'draw'): void {
    const stakeWei = ethers.parseEther(stakeAvax);

    this.state.dailyGamesPlayed++;
    this.state.dailySpent += stakeWei;

    if (result === 'win') {
      this.state.totalProfit += stakeWei; // net gain = opponent's stake
      this.state.consecutiveLosses = 0;
    } else if (result === 'loss') {
      this.state.totalProfit -= stakeWei;
      this.state.consecutiveLosses++;
    } else {
      // draw - no profit change
      this.state.consecutiveLosses = 0;
    }
  }

  /**
   * Check if profits should be swept to owner wallet.
   */
  shouldSweepProfits(): boolean {
    if (this.state.totalProfit <= 0n) return false;
    const threshold = ethers.parseEther(this.policy.profitSweepThresholdAvax);
    return this.state.totalProfit >= threshold;
  }

  /**
   * Check if balance is too low to continue.
   */
  isBalanceTooLow(currentBalanceAvax: string): boolean {
    const balance = ethers.parseEther(currentBalanceAvax);
    const minBalance = ethers.parseEther(this.policy.minBalanceAvax);
    return balance < minBalance;
  }

  /**
   * Manually pause the agent.
   */
  pause(reason: string): void {
    this.state.isPaused = true;
    this.state.pauseReason = reason;
    console.log(`[security] Agent paused: ${reason}`);
  }

  /**
   * Resume a paused agent.
   */
  resume(): void {
    this.state.isPaused = false;
    this.state.pauseReason = '';
    this.state.consecutiveLosses = 0; // reset consecutive losses on resume
    console.log('[security] Agent resumed');
  }

  /**
   * Get current security state snapshot.
   */
  getState(): SecurityState {
    return { ...this.state };
  }

  /**
   * Get the current policy.
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  /**
   * Update policy at runtime.
   */
  updatePolicy(updates: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    console.log('[security] Policy updated');
  }

  private maybeResetDailyCounters(): void {
    const now = Date.now();
    const elapsed = now - this.state.lastDayReset;
    if (elapsed >= 24 * 60 * 60 * 1000) {
      this.state.dailySpent = 0n;
      this.state.dailyGamesPlayed = 0;
      this.state.lastDayReset = now;
      console.log('[security] Daily counters reset');
    }
  }
}
