import { NextRequest, NextResponse } from 'next/server';
import { generateAgentWallet } from '@/lib/wallet-manager';
import { createAgent, updateAgent, addActivity, addLiveEvent } from '@/lib/db-queries';
import { generatePersonality } from '@/lib/personality-generator';
import { generateApiKey, hashApiKey } from '@/lib/api-auth';
import { createApiKey } from '@/lib/api-queries';
import { verifyChallenge } from '@/lib/challenge-store';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const STRATEGY_NAMES = ['Aggressive', 'Defensive', 'Analytical', 'Random'];
const NAME_RE = /^[a-zA-Z0-9 _-]{1,50}$/;

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

function stripHtmlTags(value: string): string {
  // Remove HTML tags, then collapse entities like &lt; &gt; &amp; and script-like patterns
  return value
    .replace(/<[^>]*>?/g, '')
    .replace(/&(?:#?\w+);/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/* ---------------------------------------------------------------------------
 * POST /api/v1/register
 *
 * External AI agent registration.
 *
 * Body: {
 *   name: string,
 *   description?: string,
 *   strategy?: "Aggressive" | "Defensive" | "Analytical" | "Random",
 *   challengeId: string,
 *   challengeAnswer: number
 * }
 *
 * Returns: { apiKey, agentId, walletAddress, name, strategy }
 * ------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    // Rate limiting (SQLite-backed)
    const ip = getClientIp(req);

    const rateCheck = checkRateLimit(`v1register:${ip}`, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many registration requests. Try again later.', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429, headers: { ...securityHeaders(), 'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)) } },
      );
    }

    // Content-Type check
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json', code: 'INVALID_CONTENT_TYPE' },
        { status: 415, headers: securityHeaders() },
      );
    }

    const body = await req.json();
    const { name, description, strategy, challengeId, challengeAnswer } = body;

    // --- Validate challenge ---
    if (!challengeId || typeof challengeId !== 'string') {
      return NextResponse.json(
        { error: 'challengeId is required. Call GET /api/v1/challenge first.', code: 'MISSING_CHALLENGE' },
        { status: 400, headers: securityHeaders() },
      );
    }

    if (typeof challengeAnswer !== 'number') {
      return NextResponse.json(
        { error: 'challengeAnswer must be a number', code: 'INVALID_ANSWER' },
        { status: 400, headers: securityHeaders() },
      );
    }

    if (!verifyChallenge(challengeId, challengeAnswer)) {
      return NextResponse.json(
        { error: 'Invalid or expired challenge answer. Request a new challenge.', code: 'CHALLENGE_FAILED' },
        { status: 403, headers: securityHeaders() },
      );
    }

    // --- Validate name ---
    if (!name || typeof name !== 'string' || !NAME_RE.test(name.trim())) {
      return NextResponse.json(
        { error: 'Name must be 1-50 characters (letters, numbers, spaces, hyphens, underscores)', code: 'INVALID_NAME' },
        { status: 400, headers: securityHeaders() },
      );
    }

    // --- Validate strategy ---
    let strategyNum = 2; // default: Analytical
    if (strategy !== undefined) {
      if (typeof strategy === 'number' && strategy >= 0 && strategy <= 3) {
        strategyNum = strategy;
      } else if (typeof strategy === 'string') {
        const idx = STRATEGY_NAMES.indexOf(strategy);
        if (idx < 0) {
          return NextResponse.json(
            { error: 'Strategy must be one of: Aggressive, Defensive, Analytical, Random', code: 'INVALID_STRATEGY' },
            { status: 400, headers: securityHeaders() },
          );
        }
        strategyNum = idx;
      }
    }

    // --- Validate description ---
    const desc = typeof description === 'string' ? stripHtmlTags(description).trim().slice(0, 500) : '';

    // --- Generate a deterministic "owner" address from the API key ---
    // External agents don't have a MetaMask wallet, so we derive a pseudo-address.
    const apiKey = generateApiKey();
    const ownerAddress = '0x' + hashApiKey(apiKey).substring(0, 40);

    // --- Generate wallet ---
    const { walletAddress } = generateAgentWallet({
      name: name.trim(),
      strategy: strategyNum,
      ownerAddress,
    });

    // --- Save to database ---
    const dbAgent = createAgent({
      walletAddress,
      ownerAddress,
      name: name.trim(),
      strategy: strategyNum,
    });

    // Set description if provided
    if (desc) {
      updateAgent(dbAgent.id, { description: desc });
    }

    // --- Log activity ---
    addActivity({
      agentId: dbAgent.id,
      agentName: dbAgent.name,
      type: 'registered',
      description: `External agent "${dbAgent.name}" registered via API with ${STRATEGY_NAMES[strategyNum]} strategy`,
    });

    // --- Auto-generate personality ---
    generatePersonality(dbAgent);

    // --- Emit live event ---
    addLiveEvent({
      eventType: 'agent_started',
      agentId: dbAgent.id,
      agentName: dbAgent.name,
      data: { strategy: STRATEGY_NAMES[strategyNum], source: 'api' },
    });

    // --- Store API key (hashed) ---
    createApiKey({
      keyPlaintext: apiKey,
      agentId: dbAgent.id,
      name: name.trim(),
      description: desc,
    });

    return NextResponse.json(
      {
        success: true,
        apiKey,
        agentId: dbAgent.id,
        walletAddress,
        name: name.trim(),
        strategy: strategyNum,
        strategyName: STRATEGY_NAMES[strategyNum],
        warning: 'Save your API key! It will not be shown again.',
      },
      { status: 201, headers: securityHeaders() },
    );
  } catch (err) {
    console.error('[v1/register]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() },
    );
  }
}
