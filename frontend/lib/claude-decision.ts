import Anthropic from '@anthropic-ai/sdk';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export interface WarriorInfo {
  tokenId: number;
  attack: number;
  defense: number;
  speed: number;
  element: number;
  elementName: string;
  powerScore: number;
  level: number;
  battleWins: number;
  battleLosses: number;
}

export interface BattleInfo {
  battleId: number;
  player1: string;
  nft1: number;
  nft1Stats: WarriorInfo | null;
  stake: string; // AVAX
  createdAt: number;
}

export interface BattleResult {
  battleId: number;
  won: boolean;
  stake: string;
  opponent: string;
  timestamp: number;
}

export interface GameState {
  agentWallet: string;
  agentBalance: string; // AVAX
  warriors: WarriorInfo[];
  openBattles: BattleInfo[];
  recentHistory: BattleResult[];
  strategy: string;
  dailySpent: string;     // AVAX spent today
  dailyLimit: string;     // max AVAX per day
  maxStakePerGame: string; // max per battle
}

export interface AgentAction {
  action: 'join_battle' | 'create_battle' | 'mint_warrior' | 'post_message' | 'wait';
  battleId?: number;
  tokenId?: number;
  stakeAmount?: string;
  message?: string;
  reasoning: string;
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];

const ELEMENT_ADVANTAGES: Record<number, number> = {
  0: 2, // Fire beats Wind
  2: 3, // Wind beats Ice
  3: 1, // Ice beats Water
  1: 0, // Water beats Fire
  4: 5, // Earth beats Thunder
  5: 6, // Thunder beats Shadow
  6: 7, // Shadow beats Light
  7: 4, // Light beats Earth
};

const SYSTEM_PROMPT = `You are an autonomous AI battle agent in Frostbite, a GameFi PvP platform on Avalanche blockchain.

## Game Rules
- Warriors are NFTs with stats: attack, defense, speed, element, powerScore
- 8 elements with rock-paper-scissors advantages:
  Fire > Wind > Ice > Water > Fire (cycle 1)
  Earth > Thunder > Shadow > Light > Earth (cycle 2)
- Battles require staking AVAX. Winner takes opponent's stake minus 2.5% platform fee.
- You can create a battle (set your own stake) or join an existing open battle.

## Element Advantage
Having element advantage gives a significant combat bonus. Always consider this when choosing battles.

## Your Task
Analyze the current game state and decide the best action. You MUST respond with a single JSON object.

## Available Actions
1. **join_battle** - Join an existing open battle. Provide battleId, tokenId (your warrior), stakeAmount.
2. **create_battle** - Create a new battle. Provide tokenId, stakeAmount.
3. **mint_warrior** - Mint a new warrior NFT (costs 0.01 AVAX). Use when you have no warriors.
4. **post_message** - Post a message in the on-chain chat. Provide message text.
5. **wait** - Do nothing this cycle.

## Safety Rules
- NEVER stake more than maxStakePerGame
- NEVER exceed daily spending limit
- ALWAYS keep at least 0.01 AVAX for gas fees
- Prefer battles where you have element advantage
- Consider opponent powerScore vs your warrior's powerScore

## Response Format
Respond with ONLY a JSON object, no markdown, no explanation outside JSON:
{
  "action": "join_battle|create_battle|mint_warrior|post_message|wait",
  "battleId": 123,
  "tokenId": 456,
  "stakeAmount": "0.05",
  "message": "optional chat message",
  "reasoning": "brief explanation of your decision"
}`;

/* ---------------------------------------------------------------------------
 * Strategy-specific prompts
 * ------------------------------------------------------------------------- */

function getStrategyPrompt(strategy: string): string {
  switch (strategy) {
    case 'Aggressive':
      return `## Your Strategy: AGGRESSIVE
- Prioritize joining/creating battles frequently
- Accept higher risk for higher reward
- Join battles even without element advantage if your powerScore is significantly higher
- Create battles with moderate-to-high stakes to attract opponents
- Rarely wait unless balance is critically low`;

    case 'Defensive':
      return `## Your Strategy: DEFENSIVE
- Only join battles where you have a clear advantage (element + powerScore)
- Prefer lower stakes to minimize risk
- Wait if no favorable battles are available
- Create battles with low stakes
- Preserve capital -- winning consistently matters more than winning big`;

    case 'Analytical':
      return `## Your Strategy: ANALYTICAL
- Calculate expected value for each potential battle
- Consider element advantage weight (~15% bonus)
- Compare powerScores carefully (>10% advantage preferred)
- Balance risk/reward based on remaining daily budget
- Create battles at stakes where you expect positive EV`;

    case 'Random':
      return `## Your Strategy: RANDOM
- Make unpredictable decisions
- Sometimes join battles without clear advantage
- Vary stake amounts
- Occasionally post chat messages
- Mix between aggressive and defensive play`;

    default:
      return '';
  }
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

function getElementAdvantage(attackerElement: number, defenderElement: number): boolean {
  return ELEMENT_ADVANTAGES[attackerElement] === defenderElement;
}

function formatGameStateForClaude(state: GameState): string {
  const lines: string[] = [];

  lines.push(`## Current State`);
  lines.push(`Agent Wallet: ${state.agentWallet}`);
  lines.push(`Balance: ${state.agentBalance} AVAX`);
  lines.push(`Daily Spent: ${state.dailySpent} / ${state.dailyLimit} AVAX`);
  lines.push(`Max Stake Per Game: ${state.maxStakePerGame} AVAX`);
  lines.push('');

  lines.push(`## Your Warriors (${state.warriors.length})`);
  if (state.warriors.length === 0) {
    lines.push('No warriors! You should mint one.');
  } else {
    for (const w of state.warriors) {
      lines.push(
        `- #${w.tokenId}: ${w.elementName} | ATK:${w.attack} DEF:${w.defense} SPD:${w.speed} | PWR:${w.powerScore} | LVL:${w.level} | W:${w.battleWins} L:${w.battleLosses}`
      );
    }
  }
  lines.push('');

  lines.push(`## Open Battles (${state.openBattles.length})`);
  if (state.openBattles.length === 0) {
    lines.push('No open battles available.');
  } else {
    for (const b of state.openBattles) {
      const opponentStats = b.nft1Stats;
      let advantageInfo = '';
      if (opponentStats && state.warriors.length > 0) {
        for (const w of state.warriors) {
          const hasAdv = getElementAdvantage(w.element, opponentStats.element);
          const hasDisadv = getElementAdvantage(opponentStats.element, w.element);
          if (hasAdv) advantageInfo += ` [Your #${w.tokenId} has ADVANTAGE vs ${opponentStats.elementName}]`;
          if (hasDisadv) advantageInfo += ` [Your #${w.tokenId} has DISADVANTAGE vs ${opponentStats.elementName}]`;
        }
      }
      lines.push(
        `- Battle #${b.battleId}: Stake ${b.stake} AVAX | Opponent warrior #${b.nft1}${
          opponentStats
            ? ` (${opponentStats.elementName} ATK:${opponentStats.attack} DEF:${opponentStats.defense} SPD:${opponentStats.speed} PWR:${opponentStats.powerScore})`
            : ''
        }${advantageInfo}`
      );
    }
  }
  lines.push('');

  lines.push(`## Recent Battle History`);
  if (state.recentHistory.length === 0) {
    lines.push('No recent battles.');
  } else {
    for (const h of state.recentHistory) {
      lines.push(
        `- Battle #${h.battleId}: ${h.won ? 'WON' : 'LOST'} | Stake: ${h.stake} AVAX | vs ${h.opponent}`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Send game state to Claude and get a decision.
 */
export async function makeDecision(state: GameState): Promise<AgentAction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = SYSTEM_PROMPT + '\n\n' + getStrategyPrompt(state.strategy);
  const userMessage = formatGameStateForClaude(state);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return { action: 'wait', reasoning: 'No response from Claude' };
  }

  try {
    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(jsonStr) as AgentAction;

    // Validate required fields
    if (!parsed.action || !parsed.reasoning) {
      return { action: 'wait', reasoning: 'Invalid response format from Claude' };
    }

    const validActions = ['join_battle', 'create_battle', 'mint_warrior', 'post_message', 'wait'];
    if (!validActions.includes(parsed.action)) {
      return { action: 'wait', reasoning: `Unknown action: ${parsed.action}` };
    }

    return parsed;
  } catch {
    console.error('[claude-decision] Failed to parse Claude response:', textBlock.text);
    return { action: 'wait', reasoning: 'Failed to parse Claude response' };
  }
}

export { ELEMENT_NAMES, getElementAdvantage };
