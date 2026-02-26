import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { WalletManager } from './wallet-manager.js';
import { SecurityGuard, SecurityPolicy, DEFAULT_SECURITY_POLICY } from './security.js';
import { decideMove, GameState, Strategy } from './decision-engine.js';
import { GAME_ENGINE_ABI, AGENT_REGISTRY_ABI } from './abis.js';

dotenv.config();

// ---- Types ----

export interface OrchestratorConfig {
  agentName: string;
  strategy: Strategy;
  securityPolicy?: Partial<SecurityPolicy>;
  rpcUrl?: string;
  gameEngineAddress: string;
  agentRegistryAddress: string;
}

interface AgentState {
  agentId: string;
  walletAddress: string;
  isRegistered: boolean;
  isActive: boolean;
  sessionExpiry: number;
}

// ---- Main Orchestrator ----

export class AgentOrchestrator {
  private config: OrchestratorConfig;
  private walletManager: WalletManager;
  private securityGuard: SecurityGuard;
  private provider: ethers.JsonRpcProvider;
  private ownerWallet: ethers.Wallet;
  private agentWallet: ethers.Wallet | null = null;
  private agentId: string;
  private running = false;
  private stopRequested = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.agentId = config.agentName.toLowerCase().replace(/[^a-z0-9]/g, '-');

    const walletPassword = process.env.WALLET_PASSWORD;
    if (!walletPassword) throw new Error('WALLET_PASSWORD env variable is required');

    const ownerKey = process.env.PRIVATE_KEY;
    if (!ownerKey) throw new Error('PRIVATE_KEY env variable is required');

    this.walletManager = new WalletManager({ password: walletPassword });

    const policy = { ...DEFAULT_SECURITY_POLICY, ...(config.securityPolicy || {}) };
    this.securityGuard = new SecurityGuard(policy);

    const rpcUrl = config.rpcUrl || process.env.AVAX_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.ownerWallet = new ethers.Wallet(ownerKey, this.provider);
  }

  // ---- Lifecycle Methods ----

  /**
   * Initialize: create or load wallet, register on-chain if needed, fund if needed.
   */
  async initialize(): Promise<AgentState> {
    console.log(`\n[orchestrator] Initializing agent "${this.config.agentName}"...`);

    // Step 1: Create or load wallet
    if (this.walletManager.walletExists(this.agentId)) {
      console.log('[orchestrator] Loading existing wallet...');
      this.agentWallet = this.walletManager.loadWallet(this.agentId, this.provider);
    } else {
      console.log('[orchestrator] Creating new wallet...');
      const { wallet } = this.walletManager.createWallet(this.agentId);
      this.agentWallet = wallet.connect(this.provider);
    }

    console.log(`[orchestrator] Agent wallet: ${this.agentWallet.address}`);

    // Step 2: Check balance and fund if needed
    const balance = await this.provider.getBalance(this.agentWallet.address);
    const minFunding = ethers.parseEther('0.5'); // minimum 0.5 AVAX for gas + games

    if (balance < minFunding) {
      const fundAmount = ethers.parseEther('1.0'); // fund with 1 AVAX
      console.log(`[orchestrator] Agent balance low (${ethers.formatEther(balance)} AVAX). Funding with 1 AVAX...`);

      const tx = await this.ownerWallet.sendTransaction({
        to: this.agentWallet.address,
        value: fundAmount,
      });
      await tx.wait();
      console.log(`[orchestrator] Funded agent. TX: ${tx.hash}`);
    } else {
      console.log(`[orchestrator] Agent balance: ${ethers.formatEther(balance)} AVAX`);
    }

    // Step 3: Register on-chain if not already registered
    const isRegistered = await this.checkRegistration();

    if (!isRegistered) {
      console.log('[orchestrator] Registering agent on-chain...');
      await this.registerOnChain();
    }

    // Step 4: Grant session key
    console.log('[orchestrator] Granting session key...');
    await this.grantSessionKey();

    // Step 5: Set on-chain spending limits
    console.log('[orchestrator] Setting on-chain spending limits...');
    await this.setOnChainLimits();

    const state: AgentState = {
      agentId: this.agentId,
      walletAddress: this.agentWallet.address,
      isRegistered: true,
      isActive: true,
      sessionExpiry: Math.floor(Date.now() / 1000) + this.securityGuard.getPolicy().sessionDurationHours * 3600,
    };

    console.log('[orchestrator] Initialization complete!\n');
    return state;
  }

  /**
   * Start the autonomous play loop with security enforcement.
   */
  async run(): Promise<void> {
    if (!this.agentWallet) throw new Error('Agent not initialized. Call initialize() first.');
    if (this.running) {
      console.log('[orchestrator] Already running.');
      return;
    }

    this.running = true;
    this.stopRequested = false;
    const gameEngine = new ethers.Contract(this.config.gameEngineAddress, GAME_ENGINE_ABI, this.agentWallet);

    console.log('[orchestrator] Starting autonomous play loop...');
    console.log(`[orchestrator] Strategy: ${this.config.strategy}`);
    console.log(`[orchestrator] Security Policy: ${JSON.stringify(this.securityGuard.getPolicy(), null, 2)}\n`);

    try {
      while (!this.stopRequested) {
        // Pick a random allowed game type
        const gameTypes = this.securityGuard.getPolicy().allowedGameTypes;
        const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
        const stake = this.securityGuard.getPolicy().maxStakePerGameAvax;

        // Security check
        const check = this.securityGuard.canPlay(stake, gameType);
        if (!check.allowed) {
          console.log(`[orchestrator] Security blocked: ${check.reason}`);
          break;
        }

        // Check balance
        const balance = await this.provider.getBalance(this.agentWallet!.address);
        if (this.securityGuard.isBalanceTooLow(ethers.formatEther(balance))) {
          console.log(`[orchestrator] Balance too low: ${ethers.formatEther(balance)} AVAX`);

          // Try to auto-fund from owner
          const autoFundAmount = ethers.parseEther('0.5');
          try {
            const tx = await this.ownerWallet.sendTransaction({
              to: this.agentWallet!.address,
              value: autoFundAmount,
            });
            await tx.wait();
            console.log('[orchestrator] Auto-funded 0.5 AVAX');
          } catch {
            console.log('[orchestrator] Failed to auto-fund. Stopping.');
            break;
          }
        }

        // Play one game
        try {
          const result = await this.playOneGame(gameEngine, gameType, stake);
          this.securityGuard.recordGame(stake, result);

          // Check if profits should be swept
          if (this.securityGuard.shouldSweepProfits()) {
            await this.sweepProfits();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[orchestrator] Game error: ${msg}`);
        }

        // Cooldown between games
        if (!this.stopRequested) {
          await this.sleep(10_000);
        }
      }
    } finally {
      this.running = false;
      console.log('\n[orchestrator] Play loop stopped.');
      console.log(`[orchestrator] Final security state: ${JSON.stringify(this.securityGuard.getState())}`);
    }
  }

  /**
   * Stop the agent gracefully.
   */
  stop(): void {
    console.log('[orchestrator] Stop requested...');
    this.stopRequested = true;
  }

  /**
   * Emergency stop: deactivate on-chain + stop loop + sweep funds back.
   */
  async emergencyStop(): Promise<void> {
    console.log('[orchestrator] EMERGENCY STOP!');
    this.stopRequested = true;
    this.securityGuard.pause('Emergency stop activated');

    try {
      // Deactivate on-chain
      const registry = new ethers.Contract(
        this.config.agentRegistryAddress,
        AGENT_REGISTRY_ABI,
        this.ownerWallet
      );
      const tx = await registry.emergencyStop();
      await tx.wait();
      console.log('[orchestrator] Agent deactivated on-chain');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[orchestrator] Failed to deactivate on-chain: ${msg}`);
    }

    // Sweep remaining funds back to owner
    await this.sweepAllFunds();
  }

  /**
   * Get current agent status.
   */
  getStatus() {
    return {
      agentId: this.agentId,
      walletAddress: this.agentWallet?.address,
      running: this.running,
      securityState: this.securityGuard.getState(),
      policy: this.securityGuard.getPolicy(),
    };
  }

  // ---- Internal Methods ----

  private async checkRegistration(): Promise<boolean> {
    try {
      const registry = new ethers.Contract(
        this.config.agentRegistryAddress,
        AGENT_REGISTRY_ABI,
        this.provider
      );
      const agentData = await registry.getAgentByWallet(this.agentWallet!.address);
      return agentData.id > 0n;
    } catch {
      return false;
    }
  }

  private async registerOnChain(): Promise<void> {
    const registry = new ethers.Contract(
      this.config.agentRegistryAddress,
      AGENT_REGISTRY_ABI,
      this.ownerWallet
    );

    const strategyMap: Record<Strategy, number> = {
      Aggressive: 0,
      Defensive: 1,
      Analytical: 2,
      Random: 3,
    };

    const tx = await registry.registerAgent(
      this.agentWallet!.address,
      this.config.agentName,
      strategyMap[this.config.strategy]
    );
    await tx.wait();
    console.log(`[orchestrator] Agent registered on-chain. TX: ${tx.hash}`);
  }

  private async grantSessionKey(): Promise<void> {
    const registry = new ethers.Contract(
      this.config.agentRegistryAddress,
      AGENT_REGISTRY_ABI,
      this.ownerWallet
    );

    const duration = this.securityGuard.getPolicy().sessionDurationHours * 3600;
    const tx = await registry.grantSessionKey(duration);
    await tx.wait();
    console.log(`[orchestrator] Session key granted for ${this.securityGuard.getPolicy().sessionDurationHours}h`);
  }

  private async setOnChainLimits(): Promise<void> {
    try {
      const registry = new ethers.Contract(
        this.config.agentRegistryAddress,
        AGENT_REGISTRY_ABI,
        this.ownerWallet
      );

      const dailyLimit = ethers.parseEther(this.securityGuard.getPolicy().dailySpendLimitAvax);
      const maxStake = ethers.parseEther(this.securityGuard.getPolicy().maxStakePerGameAvax);

      const tx = await registry.setSpendLimits(dailyLimit, maxStake);
      await tx.wait();
      console.log(`[orchestrator] On-chain limits set: daily=${this.securityGuard.getPolicy().dailySpendLimitAvax} AVAX, maxStake=${this.securityGuard.getPolicy().maxStakePerGameAvax} AVAX`);
    } catch (err: unknown) {
      // setSpendLimits might not exist on older contracts
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[orchestrator] Could not set on-chain limits: ${msg}`);
    }
  }

  private async playOneGame(
    gameEngine: ethers.Contract,
    gameType: number,
    stakeAvax: string
  ): Promise<'win' | 'loss' | 'draw'> {
    const gameTypeNames = ['CoinFlip', 'DiceRoll', 'RPS', 'NumberGuess', 'DragonTiger', 'ElementalClash', 'CrashDice'];
    const typeName = gameTypeNames[gameType] || 'Unknown';
    const stakeWei = ethers.parseEther(stakeAvax);

    console.log(`\n[orchestrator] --- New Game: ${typeName} | Stake: ${stakeAvax} AVAX ---`);

    // 1. Create game
    const createTx = await gameEngine.createGame(gameType, { value: stakeWei });
    const createReceipt = await createTx.wait();
    const gameCounter = await gameEngine.gameCounter();
    const gameId = Number(gameCounter);
    console.log(`[orchestrator] Game #${gameId} created. TX: ${createReceipt.hash}`);

    // 2. Wait for opponent to join (poll)
    console.log('[orchestrator] Waiting for opponent...');
    await this.waitForState(gameEngine, gameId, 1); // state 1 = Active

    // 3. Decide move via AI
    const gameState: GameState = {
      gameId,
      gameType: typeName as GameState['gameType'],
      opponentHistory: [],
      myWinRate: 0.5,
      currentStake: stakeAvax,
      roundNumber: 1,
    };
    const move = await decideMove(this.config.strategy, gameState);

    // 4. Commit
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const packed = ethers.solidityPacked(['uint8', 'bytes32'], [move, salt]);
    const commitHash = ethers.keccak256(packed);

    const commitTx = await gameEngine.commitMove(gameId, commitHash);
    await commitTx.wait();
    console.log(`[orchestrator] Committed move. Hash: ${commitHash}`);

    // 5. Wait for opponent commit, then reveal
    await this.waitForBothCommits(gameEngine, gameId);

    const revealTx = await gameEngine.revealMove(gameId, move, salt);
    await revealTx.wait();
    console.log(`[orchestrator] Revealed move: ${move}`);

    // 6. Wait for game resolution and determine outcome
    await this.sleep(3000);
    const game = await gameEngine.games(gameId);
    const state = Number(game.state);
    const winner = game.winner;

    if (state === 2) { // Finished
      if (winner === ethers.ZeroAddress) {
        console.log('[orchestrator] Result: DRAW');
        return 'draw';
      }
      if (winner.toLowerCase() === this.agentWallet!.address.toLowerCase()) {
        console.log('[orchestrator] Result: WIN!');
        return 'win';
      }
      console.log('[orchestrator] Result: LOSS');
      return 'loss';
    }

    console.log('[orchestrator] Game state unclear, assuming draw');
    return 'draw';
  }

  private async waitForState(gameEngine: ethers.Contract, gameId: number, targetState: number): Promise<void> {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const game = await gameEngine.games(gameId);
      if (Number(game.state) >= targetState) return;
      await this.sleep(5000);
    }
    throw new Error(`Timeout waiting for game ${gameId} to reach state ${targetState}`);
  }

  private async waitForBothCommits(gameEngine: ethers.Contract, gameId: number): Promise<void> {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const game = await gameEngine.games(gameId);
      const p1Commit = game.p1Commit;
      const p2Commit = game.p2Commit;
      if (p1Commit !== ethers.ZeroHash && p2Commit !== ethers.ZeroHash) return;
      await this.sleep(5000);
    }
    throw new Error(`Timeout waiting for both commits in game ${gameId}`);
  }

  private async sweepProfits(): Promise<void> {
    if (!this.agentWallet) return;

    const balance = await this.provider.getBalance(this.agentWallet.address);
    const keepAmount = ethers.parseEther('0.5'); // keep 0.5 AVAX for operations

    if (balance <= keepAmount) return;

    const sweepAmount = balance - keepAmount;
    const gasPrice = (await this.provider.getFeeData()).gasPrice || ethers.parseUnits('25', 'gwei');
    const gasCost = gasPrice * 21000n;

    if (sweepAmount <= gasCost) return;

    const tx = await this.agentWallet.sendTransaction({
      to: this.ownerWallet.address,
      value: sweepAmount - gasCost,
    });
    await tx.wait();
    console.log(`[orchestrator] Swept ${ethers.formatEther(sweepAmount - gasCost)} AVAX to owner`);
  }

  private async sweepAllFunds(): Promise<void> {
    if (!this.agentWallet) return;

    const balance = await this.provider.getBalance(this.agentWallet.address);
    const gasPrice = (await this.provider.getFeeData()).gasPrice || ethers.parseUnits('25', 'gwei');
    const gasCost = gasPrice * 21000n;

    if (balance <= gasCost) {
      console.log('[orchestrator] No funds to sweep');
      return;
    }

    const tx = await this.agentWallet.sendTransaction({
      to: this.ownerWallet.address,
      value: balance - gasCost,
    });
    await tx.wait();
    console.log(`[orchestrator] Emergency swept ${ethers.formatEther(balance - gasCost)} AVAX to owner`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
