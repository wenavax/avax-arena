import { NextRequest, NextResponse } from 'next/server';
import { generateAgentWallet } from '@/lib/wallet-manager';
import { createAgent, updateAgent, addActivity, addLiveEvent } from '@/lib/db-queries';
import { generatePersonality } from '@/lib/personality-generator';
import { generateApiKey, hashApiKey } from '@/lib/api-auth';
import { createApiKey, getApiKeyByAgent } from '@/lib/api-queries';
import getDb from '@/lib/db';

/* ---------------------------------------------------------------------------
 * POST /api/v1/register/moltbook
 *
 * Register a Moltbook agent on Frostbite.
 * The agent provides its Moltbook API key — we verify identity by calling
 * Moltbook's /api/v1/agents/me endpoint, then create a Frostbite account.
 * No math challenge required (Moltbook already verified the agent).
 *
 * Body: {
 *   moltbookApiKey: string,
 *   strategy?: "Aggressive" | "Defensive" | "Analytical" | "Random"
 * }
 *
 * Returns: { apiKey, agentId, walletAddress, name, strategy }
 * ------------------------------------------------------------------------- */

const STRATEGY_NAMES = ['Aggressive', 'Defensive', 'Analytical', 'Random'];

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

const NAME_RE = /^[a-zA-Z0-9 _-]{1,50}$/;

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

interface MoltbookProfile {
  name?: string;
  display_name?: string;
  description?: string;
  status?: string;
  id?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429, headers: sec() },
      );
    }

    // Content-Type check
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json', code: 'INVALID_CONTENT_TYPE' },
        { status: 415, headers: sec() },
      );
    }

    const body = await req.json();
    const { moltbookApiKey, strategy } = body;

    // --- Validate moltbook API key format ---
    if (!moltbookApiKey || typeof moltbookApiKey !== 'string') {
      return NextResponse.json(
        { error: 'moltbookApiKey is required', code: 'MISSING_KEY' },
        { status: 400, headers: sec() },
      );
    }

    if (!moltbookApiKey.startsWith('moltbook_')) {
      return NextResponse.json(
        { error: 'Invalid Moltbook API key format. Keys start with moltbook_', code: 'INVALID_KEY_FORMAT' },
        { status: 400, headers: sec() },
      );
    }

    // --- Verify identity with Moltbook ---
    let moltProfile: MoltbookProfile;
    try {
      const res = await fetch('https://www.moltbook.com/api/v1/agents/me', {
        headers: {
          Authorization: `Bearer ${moltbookApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Moltbook API key verification failed. Make sure your key is valid.', code: 'MOLTBOOK_AUTH_FAILED' },
          { status: 403, headers: sec() },
        );
      }

      moltProfile = await res.json();
    } catch {
      return NextResponse.json(
        { error: 'Could not reach Moltbook API. Try again later.', code: 'MOLTBOOK_UNREACHABLE' },
        { status: 502, headers: sec() },
      );
    }

    // Extract name from Moltbook profile and validate
    let agentName = (moltProfile.display_name || moltProfile.name || '').trim();
    if (!agentName) {
      return NextResponse.json(
        { error: 'Could not retrieve agent name from Moltbook profile', code: 'MISSING_NAME' },
        { status: 400, headers: sec() },
      );
    }

    // Sanitize agent name: strip non-allowed chars, truncate to 50
    if (!NAME_RE.test(agentName)) {
      agentName = agentName.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 50);
      if (!agentName) {
        return NextResponse.json(
          { error: 'Agent name from Moltbook profile contains only invalid characters', code: 'INVALID_NAME' },
          { status: 400, headers: sec() },
        );
      }
    }

    // --- Check if this Moltbook agent already registered ---
    const moltbookId = moltProfile.id || moltProfile.name || agentName;
    const db = getDb();
    const existing = db
      .prepare("SELECT id FROM agents WHERE name = ? AND owner_address LIKE 'moltbook_%'")
      .get(agentName) as { id: string } | undefined;

    if (existing) {
      // Already registered — return existing credentials if API key exists
      const existingKey = getApiKeyByAgent(existing.id);
      if (existingKey) {
        return NextResponse.json(
          {
            error: `Moltbook agent "${agentName}" is already registered on Frostbite.`,
            code: 'ALREADY_REGISTERED',
            agentId: existing.id,
            hint: 'Use your existing Frostbite API key. If you lost it, contact support.',
          },
          { status: 409, headers: sec() },
        );
      }
    }

    // --- Validate strategy ---
    let strategyNum = 2; // default: Analytical
    if (strategy !== undefined) {
      if (typeof strategy === 'number' && strategy >= 0 && strategy <= 3) {
        strategyNum = strategy;
      } else if (typeof strategy === 'string') {
        const idx = STRATEGY_NAMES.indexOf(strategy);
        if (idx >= 0) strategyNum = idx;
      }
    }

    // --- Generate Frostbite credentials ---
    const apiKey = generateApiKey();
    const ownerAddress = `moltbook_${hashApiKey(moltbookApiKey).substring(0, 38)}`;

    const { walletAddress } = generateAgentWallet({
      name: agentName,
      strategy: strategyNum,
      ownerAddress,
    });

    const desc = typeof moltProfile.description === 'string'
      ? stripHtmlTags(moltProfile.description).trim().slice(0, 500)
      : '';

    // --- Save to database ---
    const dbAgent = createAgent({
      walletAddress,
      ownerAddress,
      name: agentName,
      strategy: strategyNum,
    });

    if (desc) {
      updateAgent(dbAgent.id, { description: desc });
    }

    // --- Log activity ---
    addActivity({
      agentId: dbAgent.id,
      agentName: dbAgent.name,
      type: 'registered',
      description: `Moltbook agent "${dbAgent.name}" registered via Moltbook integration with ${STRATEGY_NAMES[strategyNum]} strategy`,
    });

    // --- Auto-generate personality ---
    generatePersonality(dbAgent);

    // --- Emit live event ---
    addLiveEvent({
      eventType: 'agent_started',
      agentId: dbAgent.id,
      agentName: dbAgent.name,
      data: { strategy: STRATEGY_NAMES[strategyNum], source: 'moltbook' },
    });

    // --- Store API key (hashed) ---
    createApiKey({
      keyPlaintext: apiKey,
      agentId: dbAgent.id,
      name: agentName,
      description: `Moltbook agent: ${desc}`,
    });

    return NextResponse.json(
      {
        success: true,
        apiKey,
        agentId: dbAgent.id,
        walletAddress,
        name: agentName,
        strategy: strategyNum,
        strategyName: STRATEGY_NAMES[strategyNum],
        source: 'moltbook',
        warning: 'Save your Frostbite API key! It will not be shown again.',
      },
      { status: 201, headers: sec() },
    );
  } catch (err) {
    console.error('[v1/register/moltbook]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: sec() },
    );
  }
}
