import { NextRequest, NextResponse } from 'next/server';
import { generateAgentWallet, getAgentByOwner } from '@/lib/wallet-manager';
import { createAgent, addActivity, addLiveEvent } from '@/lib/db-queries';
import { generatePersonality } from '@/lib/personality-generator';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { verifyChallenge } from '@/lib/challenge-store';

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

const VALID_STRATEGIES = [0, 1, 2, 3] as const; // Aggressive, Defensive, Analytical, Random
const STRATEGY_NAMES = ['Aggressive', 'Defensive', 'Analytical', 'Random'];
const ETHEREUM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const NAME_RE = /^[a-zA-Z0-9 ]{1,50}$/;

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

/* ---------------------------------------------------------------------------
 * POST /api/agents/register
 *
 * Creates a new agent wallet, encrypts the private key, and stores it.
 * The caller must then call registerAgent() on-chain with the returned address.
 *
 * Body: { name, strategy, ownerAddress, challengeId?, challengeAnswer? }
 * Returns: { walletAddress, name, strategy, strategyName }
 * ------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    // Rate limiting (SQLite-backed)
    const ip = getClientIp(req);

    const rateCheck = checkRateLimit(`register:${ip}`, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many registration requests. Try again later.', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429, headers: { ...securityHeaders(), 'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)) } }
      );
    }

    // Content-Type check
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json', code: 'INVALID_CONTENT_TYPE' },
        { status: 415, headers: securityHeaders() }
      );
    }

    const body = await req.json();
    const { name, strategy, ownerAddress, challengeId, challengeAnswer } = body;

    // Validate challenge (optional for backward compatibility, but recommended)
    if (challengeId !== undefined || challengeAnswer !== undefined) {
      if (!challengeId || typeof challengeId !== 'string' || typeof challengeAnswer !== 'number') {
        return NextResponse.json(
          { error: 'Both challengeId (string) and challengeAnswer (number) are required', code: 'INVALID_CHALLENGE' },
          { status: 400, headers: securityHeaders() }
        );
      }
      if (!verifyChallenge(challengeId, challengeAnswer)) {
        return NextResponse.json(
          { error: 'Invalid or expired challenge answer. Request a new challenge.', code: 'CHALLENGE_FAILED' },
          { status: 403, headers: securityHeaders() }
        );
      }
    } else {
      console.warn('[agent-register] Registration without challenge from IP:', ip);
    }

    // Validate name
    if (!name || typeof name !== 'string' || !NAME_RE.test(name)) {
      return NextResponse.json(
        { error: 'Name must be 1-50 alphanumeric characters', code: 'INVALID_NAME' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Validate ownerAddress
    if (!ownerAddress || typeof ownerAddress !== 'string' || !ETHEREUM_ADDRESS_RE.test(ownerAddress)) {
      return NextResponse.json(
        { error: 'ownerAddress must be a valid Ethereum address', code: 'INVALID_OWNER_ADDRESS' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Validate strategy (accept number or string)
    let strategyNum: number;
    if (typeof strategy === 'number') {
      strategyNum = strategy;
    } else if (typeof strategy === 'string') {
      const idx = STRATEGY_NAMES.indexOf(strategy);
      strategyNum = idx >= 0 ? idx : -1;
    } else {
      strategyNum = 2; // default: Analytical
    }

    if (!VALID_STRATEGIES.includes(strategyNum as 0 | 1 | 2 | 3)) {
      return NextResponse.json(
        { error: 'Strategy must be 0-3 (Aggressive, Defensive, Analytical, Random)', code: 'INVALID_STRATEGY' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Check if owner already has an agent
    const existing = getAgentByOwner(ownerAddress);
    if (existing) {
      return NextResponse.json(
        { error: 'This wallet already has a registered agent', code: 'ALREADY_REGISTERED', walletAddress: existing.walletAddress },
        { status: 409, headers: securityHeaders() }
      );
    }

    // Generate wallet and store encrypted
    const { walletAddress } = generateAgentWallet({
      name: name.trim(),
      strategy: strategyNum,
      ownerAddress,
    });

    // Save to database
    const dbAgent = createAgent({
      walletAddress,
      ownerAddress,
      name: name.trim(),
      strategy: strategyNum,
    });

    // Log activity
    addActivity({
      agentId: dbAgent.id,
      agentName: dbAgent.name,
      type: 'registered',
      description: `New agent "${dbAgent.name}" registered with ${STRATEGY_NAMES[strategyNum]} strategy`,
    });

    // Auto-generate personality
    generatePersonality(dbAgent);

    // Emit live event
    addLiveEvent({
      eventType: 'agent_started',
      agentId: dbAgent.id,
      agentName: dbAgent.name,
      data: { strategy: STRATEGY_NAMES[strategyNum] },
    });

    return NextResponse.json(
      {
        success: true,
        agentId: dbAgent.id,
        walletAddress,
        name: name.trim(),
        strategy: strategyNum,
        strategyName: STRATEGY_NAMES[strategyNum],
      },
      { status: 201, headers: securityHeaders() }
    );
  } catch (err) {
    console.error('[agent-register]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
