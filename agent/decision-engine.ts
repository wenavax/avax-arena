import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BattleState {
  availableBattles: Array<{
    battleId: number;
    opponentElement: number;
    opponentPowerScore: number;
    stake: string;
  }>;
  myWarriors: Array<{
    tokenId: number;
    element: number;
    powerScore: number;
    level: number;
    winRate: number;
  }>;
  currentBalance: string;
}

export type Strategy = 'Aggressive' | 'Defensive' | 'Analytical' | 'Random';

export interface BattleDecision {
  action: 'join' | 'create' | 'wait';
  battleId?: number;
  warriorTokenId: number;
  stakeAmount?: string;
  confidence: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Element system
// ---------------------------------------------------------------------------

// Element enum: 0=Fire, 1=Water, 2=Earth, 3=Wind, 4=Ice
export const ELEMENT_NAMES: Record<number, string> = {
  0: 'Fire',
  1: 'Water',
  2: 'Earth',
  3: 'Wind',
  4: 'Ice',
};

/**
 * Returns true if attackerElement has an advantage over defenderElement.
 * Advantage cycle: Fire > Wind > Earth > Water > Fire, Ice > Fire, Wind > Ice
 */
export function hasElementAdvantage(attacker: number, defender: number): boolean {
  const advantages: Record<number, number[]> = {
    0: [3],    // Fire beats Wind
    1: [0],    // Water beats Fire
    2: [1],    // Earth beats Water
    3: [2, 4], // Wind beats Earth and Ice
    4: [0],    // Ice beats Fire
  };
  return (advantages[attacker] ?? []).includes(defender);
}

// ---------------------------------------------------------------------------
// Strategy system prompts
// ---------------------------------------------------------------------------

const STRATEGY_PROMPTS: Record<Strategy, string> = {
  Aggressive:
    'You are an aggressive NFT battle strategist. Seek out battles with high stakes. ' +
    'Prefer to challenge opponents even when at slight disadvantage. Take calculated risks ' +
    'to maximize winnings. Always look for opportunities to fight.',
  Defensive:
    'You are a defensive NFT battle strategist. Only engage when you have a clear advantage. ' +
    'Prefer element matchups in your favor and avoid battles where opponent power score exceeds yours. ' +
    'Protect your warriors and only risk small stakes.',
  Analytical:
    'You are an analytical NFT battle strategist. Carefully evaluate element advantages, power scores, ' +
    'and stake-to-risk ratios. Use probability and game theory to pick optimal matchups. ' +
    'Balance risk and reward based on statistical edge.',
  Random:
    'You are an unpredictable NFT battle strategist. Randomize your battle choices to prevent ' +
    'opponents from predicting your behavior. Sometimes create battles, sometimes join them.',
};

// ---------------------------------------------------------------------------
// OpenAI tool definition (function calling)
// ---------------------------------------------------------------------------

const BATTLE_DECISION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submitBattleDecision',
    description:
      'Submit the battle decision: join an existing battle, create a new one, or wait.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['join', 'create', 'wait'],
          description:
            'The action to take: "join" an existing battle, "create" a new battle, or "wait" for better opportunities.',
        },
        battleId: {
          type: 'number',
          description:
            'The battle ID to join (required if action is "join", omit otherwise).',
        },
        warriorTokenId: {
          type: 'number',
          description: 'The token ID of the warrior to use in the battle.',
        },
        stakeAmount: {
          type: 'string',
          description:
            'Stake amount in AVAX (required if action is "create", omit for "join" since stake is set by creator).',
        },
        confidence: {
          type: 'number',
          description: 'Confidence level from 0.0 to 1.0.',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of why this decision was made.',
        },
      },
      required: ['action', 'warriorTokenId', 'confidence', 'reasoning'],
    },
  },
};

// ---------------------------------------------------------------------------
// Singleton OpenAI client (lazy-initialised)
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Environment variable OPENAI_API_KEY is not set.');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// Build the user prompt from the current battle state
// ---------------------------------------------------------------------------

function buildUserPrompt(battleState: BattleState): string {
  const lines: string[] = [
    '=== Current Battle State ===',
    `Agent balance: ${battleState.currentBalance} AVAX`,
    '',
    '--- Your Warriors ---',
  ];

  if (battleState.myWarriors.length === 0) {
    lines.push('No warriors available. You must wait or mint a new warrior.');
  } else {
    for (const w of battleState.myWarriors) {
      const elName = ELEMENT_NAMES[w.element] ?? `Unknown(${w.element})`;
      lines.push(
        `  Token #${w.tokenId}: Element=${elName} PowerScore=${w.powerScore} ` +
          `Level=${w.level} WinRate=${(w.winRate * 100).toFixed(1)}%`,
      );
    }
  }

  lines.push('', '--- Available Battles to Join ---');

  if (battleState.availableBattles.length === 0) {
    lines.push('No open battles available. Consider creating one.');
  } else {
    for (const b of battleState.availableBattles) {
      const elName = ELEMENT_NAMES[b.opponentElement] ?? `Unknown(${b.opponentElement})`;

      // Indicate element advantages for each of our warriors
      const matchups: string[] = [];
      for (const w of battleState.myWarriors) {
        const adv = hasElementAdvantage(w.element, b.opponentElement);
        const dis = hasElementAdvantage(b.opponentElement, w.element);
        const tag = adv ? 'ADVANTAGE' : dis ? 'DISADVANTAGE' : 'NEUTRAL';
        matchups.push(`Token#${w.tokenId}=${tag}`);
      }

      lines.push(
        `  Battle #${b.battleId}: Opponent Element=${elName} PowerScore=${b.opponentPowerScore} ` +
          `Stake=${b.stake} AVAX | Matchups: ${matchups.join(', ')}`,
      );
    }
  }

  lines.push(
    '',
    'Element advantages: Fire>Wind, Water>Fire, Earth>Water, Wind>Earth, Wind>Ice, Ice>Fire',
    '',
    'Decide: join a battle (specify battleId and warrior), create a new battle (specify warrior and stake), or wait.',
    'Call submitBattleDecision with your choice.',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parse the tool-call response into a BattleDecision
// ---------------------------------------------------------------------------

function parseToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
): BattleDecision {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error(
      `Failed to parse submitBattleDecision arguments: ${toolCall.function.arguments}`,
    );
  }

  const action = String(parsed.action) as BattleDecision['action'];
  if (!['join', 'create', 'wait'].includes(action)) {
    throw new Error(`Invalid action: ${action}. Must be join, create, or wait.`);
  }

  const warriorTokenId = Number(parsed.warriorTokenId);
  if (Number.isNaN(warriorTokenId)) {
    throw new Error(`Invalid warriorTokenId: ${parsed.warriorTokenId}`);
  }

  const confidence = Number(parsed.confidence);
  const reasoning = String(parsed.reasoning ?? '');

  const decision: BattleDecision = {
    action,
    warriorTokenId,
    confidence: Math.max(0, Math.min(1, Number.isNaN(confidence) ? 0.5 : confidence)),
    reasoning,
  };

  if (action === 'join') {
    const battleId = Number(parsed.battleId);
    if (Number.isNaN(battleId)) {
      throw new Error(`Action is "join" but battleId is invalid: ${parsed.battleId}`);
    }
    decision.battleId = battleId;
  }

  if (action === 'create') {
    decision.stakeAmount = String(parsed.stakeAmount ?? '0.01');
  }

  return decision;
}

// ---------------------------------------------------------------------------
// Fallback decision (used when the API call fails)
// ---------------------------------------------------------------------------

function fallbackDecision(battleState: BattleState): BattleDecision {
  // Pick the first warrior with best power score
  const sortedWarriors = [...battleState.myWarriors].sort(
    (a, b) => b.powerScore - a.powerScore,
  );
  const bestWarrior = sortedWarriors[0];

  if (!bestWarrior) {
    return {
      action: 'wait',
      warriorTokenId: 0,
      confidence: 0,
      reasoning: 'No warriors available; waiting.',
    };
  }

  // If there are battles with element advantage, join the first one
  for (const battle of battleState.availableBattles) {
    if (hasElementAdvantage(bestWarrior.element, battle.opponentElement)) {
      return {
        action: 'join',
        battleId: battle.battleId,
        warriorTokenId: bestWarrior.tokenId,
        confidence: 0.6,
        reasoning: 'Fallback: joining battle with element advantage.',
      };
    }
  }

  // Otherwise, create a new battle
  return {
    action: 'create',
    warriorTokenId: bestWarrior.tokenId,
    stakeAmount: '0.01',
    confidence: 0.4,
    reasoning: 'Fallback: no favorable battles found; creating one.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask the AI to decide the next battle action given the current state.
 * Uses the specified strategy to shape decision-making.
 *
 * On transient OpenAI failures the function falls back to a heuristic
 * decision so the agent loop is never blocked.
 */
export async function decideBattle(
  strategy: Strategy,
  battleState: BattleState,
): Promise<BattleDecision> {
  const client = getClient();
  const temperature = strategy === 'Random' ? 1.0 : 0.3;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature,
      tools: [BATTLE_DECISION_TOOL],
      tool_choice: { type: 'function', function: { name: 'submitBattleDecision' } },
      messages: [
        { role: 'system', content: STRATEGY_PROMPTS[strategy] },
        { role: 'user', content: buildUserPrompt(battleState) },
      ],
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[decision-engine] No tool call returned by the model; using fallback.');
      return fallbackDecision(battleState);
    }

    const decision = parseToolCall(toolCalls[0]);

    console.log(
      `[decision-engine] strategy=${strategy} action=${decision.action} ` +
        `warrior=#${decision.warriorTokenId} ` +
        (decision.battleId !== undefined ? `battleId=${decision.battleId} ` : '') +
        `confidence=${decision.confidence.toFixed(2)} ` +
        `reason="${decision.reasoning}"`,
    );

    return decision;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[decision-engine] OpenAI call failed: ${message}. Using fallback decision.`);
    return fallbackDecision(battleState);
  }
}
