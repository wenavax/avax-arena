import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameState {
  gameId: number;
  gameType: 'RPS' | 'CoinFlip' | 'Dice' | 'NumberGuess' | 'DragonTiger' | 'ElementalClash' | 'CrashDice';
  opponentHistory: number[];
  myWinRate: number;
  currentStake: string;
  roundNumber: number;
}

export type Strategy = 'Aggressive' | 'Defensive' | 'Analytical' | 'Random';

interface MoveDecision {
  move: number;
  confidence: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Strategy system prompts
// ---------------------------------------------------------------------------

const STRATEGY_PROMPTS: Record<Strategy, string> = {
  Aggressive:
    'You are an aggressive game-playing AI. Take calculated risks. Prefer high-reward moves. Bluff when possible. Never play defensively.',
  Defensive:
    'You are a defensive game-playing AI. Minimize losses. Prefer safe, consistent moves. Only take risks when heavily favored.',
  Analytical:
    'You are an analytical game-playing AI. Study opponent patterns from historical data. Use game theory and probability to decide. Counter their most likely next move.',
  Random:
    'You are an unpredictable game-playing AI. Randomize moves to prevent exploitation.',
};

// ---------------------------------------------------------------------------
// Move ranges per game type
// ---------------------------------------------------------------------------

const MOVE_RANGES: Record<GameState['gameType'], { min: number; max: number; description: string }> = {
  RPS:         { min: 0, max: 2, description: '0 = Rock, 1 = Paper, 2 = Scissors' },
  CoinFlip:    { min: 0, max: 1, description: '0 = Heads, 1 = Tails' },
  Dice:        { min: 1, max: 6, description: '1 through 6 (standard die face)' },
  NumberGuess:     { min: 1, max: 10, description: '1 through 10' },
  DragonTiger:     { min: 1, max: 13, description: '1 (Ace) through 13 (King)' },
  ElementalClash:  { min: 1, max: 5,  description: '1=Fire, 2=Water, 3=Wind, 4=Ice, 5=Earth' },
  CrashDice:       { min: 1, max: 20, description: '1-20 (D20 roll)' },
};

// ---------------------------------------------------------------------------
// OpenAI tool definition (function calling)
// ---------------------------------------------------------------------------

const SUBMIT_MOVE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submitGameMove',
    description: 'Submit the chosen move for the current game round.',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'number',
          description: 'The numeric move to play.',
        },
        confidence: {
          type: 'number',
          description: 'Confidence level from 0.0 to 1.0.',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of why this move was chosen.',
        },
      },
      required: ['move', 'confidence', 'reasoning'],
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
// Build the user prompt from the current game state
// ---------------------------------------------------------------------------

function buildUserPrompt(gameState: GameState): string {
  const range = MOVE_RANGES[gameState.gameType];

  const lines: string[] = [
    `Game ID: ${gameState.gameId}`,
    `Game type: ${gameState.gameType}`,
    `Round: ${gameState.roundNumber}`,
    `Current stake: ${gameState.currentStake} AVAX`,
    `Your historical win rate: ${(gameState.myWinRate * 100).toFixed(1)}%`,
    `Valid moves: ${range.min} to ${range.max} (${range.description})`,
  ];

  if (gameState.opponentHistory.length > 0) {
    lines.push(`Opponent's previous moves (oldest first): [${gameState.opponentHistory.join(', ')}]`);
  } else {
    lines.push('No opponent history available yet.');
  }

  lines.push('', 'Choose your move by calling submitGameMove.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parse the tool-call response into a MoveDecision
// ---------------------------------------------------------------------------

function parseToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  gameType: GameState['gameType'],
): MoveDecision {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error(`Failed to parse submitGameMove arguments: ${toolCall.function.arguments}`);
  }

  const move = Number(parsed.move);
  const confidence = Number(parsed.confidence);
  const reasoning = String(parsed.reasoning ?? '');

  if (Number.isNaN(move)) {
    throw new Error(`Invalid move value received from AI: ${parsed.move}`);
  }

  const range = MOVE_RANGES[gameType];
  if (move < range.min || move > range.max) {
    throw new Error(
      `Move ${move} is out of range for ${gameType}. Expected ${range.min}..${range.max}.`,
    );
  }

  return {
    move,
    confidence: Math.max(0, Math.min(1, Number.isNaN(confidence) ? 0.5 : confidence)),
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Fallback: deterministic random move (used when the API call fails)
// ---------------------------------------------------------------------------

function fallbackMove(gameType: GameState['gameType']): number {
  const range = MOVE_RANGES[gameType];
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask the AI to decide the next move for the given game state using the
 * specified strategy. Returns the numeric move to be submitted on-chain.
 *
 * On transient OpenAI failures the function falls back to a random move so
 * the agent loop is never blocked.
 */
export async function decideMove(strategy: Strategy, gameState: GameState): Promise<number> {
  const client = getClient();
  const temperature = strategy === 'Random' ? 1.0 : 0.3;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature,
      tools: [SUBMIT_MOVE_TOOL],
      tool_choice: { type: 'function', function: { name: 'submitGameMove' } },
      messages: [
        { role: 'system', content: STRATEGY_PROMPTS[strategy] },
        { role: 'user', content: buildUserPrompt(gameState) },
      ],
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[decision-engine] No tool call returned by the model; using fallback.');
      return fallbackMove(gameState.gameType);
    }

    const decision = parseToolCall(toolCalls[0], gameState.gameType);

    console.log(
      `[decision-engine] game=${gameState.gameId} strategy=${strategy} ` +
        `move=${decision.move} confidence=${decision.confidence.toFixed(2)} ` +
        `reason="${decision.reasoning}"`,
    );

    return decision.move;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[decision-engine] OpenAI call failed: ${message}. Using fallback move.`);
    return fallbackMove(gameState.gameType);
  }
}
