import * as dotenv from 'dotenv';
import { AgentOrchestrator } from './agent-orchestrator.js';
import { Strategy } from './decision-engine.js';

dotenv.config();

async function main() {
  const strategy = (process.env.AGENT_STRATEGY || 'Analytical') as Strategy;

  const orchestrator = new AgentOrchestrator({
    agentName: process.env.AGENT_NAME || 'AlphaBot',
    strategy,
    gameEngineAddress: process.env.GAME_ENGINE_ADDRESS || '',
    agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS || '',
    securityPolicy: {
      dailySpendLimitAvax: process.env.DAILY_SPEND_LIMIT || '5.0',
      maxStakePerGameAvax: process.env.MAX_STAKE_PER_GAME || '0.5',
      maxGamesPerDay: parseInt(process.env.MAX_GAMES_PER_DAY || '50'),
      stopLossLimitAvax: process.env.STOP_LOSS_LIMIT || '3.0',
      maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '5'),
      sessionDurationHours: parseInt(process.env.SESSION_DURATION_HOURS || '24'),
    },
  });

  // Handle SIGINT (Ctrl+C) for graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT. Graceful shutdown...');
    orchestrator.stop();
  });

  // Handle SIGTERM for emergency stop
  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM. Emergency stop...');
    await orchestrator.emergencyStop();
    process.exit(0);
  });

  try {
    // Initialize: create wallet, register, fund
    const state = await orchestrator.initialize();
    console.log('Agent State:', JSON.stringify(state, null, 2));

    // Start playing
    await orchestrator.run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Fatal error: ${msg}`);
    process.exit(1);
  }
}

main();
