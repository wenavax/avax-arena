import { NextRequest, NextResponse } from 'next/server';
import { getAgentById, updateAgent, getActivities } from '@/lib/db-queries';

// --- Validation helpers ---
const AGENT_ID_RE = /^agent_.+$/;
const VALID_STRATEGIES = ['Analytical', 'Aggressive', 'Defensive', 'Random'] as const;
const STRATEGY_MAP: Record<string, number> = { Aggressive: 0, Defensive: 1, Analytical: 2, Random: 3 };

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

// GET /api/agents/:agentId
export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params;

  if (!agentId || !AGENT_ID_RE.test(agentId)) {
    return NextResponse.json(
      { error: 'Invalid agentId format. Must match pattern agent_*', code: 'INVALID_AGENT_ID' },
      { status: 400, headers: securityHeaders() }
    );
  }

  const agent = getAgentById(agentId);
  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'AGENT_NOT_FOUND' },
      { status: 404, headers: securityHeaders() }
    );
  }

  // Fetch recent activity for this agent
  const { activities } = getActivities(5, 0, agentId);

  const response = {
    id: agent.id,
    name: agent.name,
    strategy: agent.strategy_name,
    ownerAddress: agent.owner_address,
    description: agent.description,
    walletAddress: agent.wallet_address,
    createdAt: agent.created_at,
    active: agent.active === 1,
    stats: {
      battles: agent.total_battles,
      wins: agent.wins,
      losses: agent.losses,
      draws: agent.draws,
      winRate: agent.win_rate,
      totalStaked: agent.total_staked,
      totalEarned: agent.total_earned,
      profit: agent.profit,
      messages: agent.messages_sent,
      nftsMinted: agent.nfts_minted,
      currentStreak: agent.current_streak,
      bestStreak: agent.best_streak,
    },
    recentActivity: activities.map((a) => ({
      type: a.type,
      description: a.description,
      timestamp: new Date(a.created_at).getTime(),
      txHash: a.tx_hash,
    })),
  };

  return NextResponse.json({ agent: response }, { headers: securityHeaders() });
}

// PATCH /api/agents/:agentId
export async function PATCH(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const { agentId } = params;

    if (!agentId || !AGENT_ID_RE.test(agentId)) {
      return NextResponse.json(
        { error: 'Invalid agentId format. Must match pattern agent_*', code: 'INVALID_AGENT_ID' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const existing = getAgentById(agentId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Agent not found', code: 'AGENT_NOT_FOUND' },
        { status: 404, headers: securityHeaders() }
      );
    }

    const body = await req.json();
    const { strategy, description, active } = body;

    if (strategy !== undefined && !VALID_STRATEGIES.includes(strategy)) {
      return NextResponse.json(
        { error: `Strategy must be one of: ${VALID_STRATEGIES.join(', ')}`, code: 'INVALID_STRATEGY' },
        { status: 400, headers: securityHeaders() }
      );
    }

    if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
      return NextResponse.json(
        { error: 'Description must be a string of at most 500 characters', code: 'INVALID_DESCRIPTION' },
        { status: 400, headers: securityHeaders() }
      );
    }

    if (active !== undefined && typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'Active must be a boolean', code: 'INVALID_ACTIVE' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const updated = updateAgent(agentId, {
      strategy: strategy !== undefined ? STRATEGY_MAP[strategy] : undefined,
      description: description !== undefined ? stripHtmlTags(description) : undefined,
      active,
    });

    return NextResponse.json(
      { success: true, agent: updated },
      { headers: securityHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
