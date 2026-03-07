import { NextRequest, NextResponse } from 'next/server';
import { getAgentById, updateAgent, getActivities, getPersonality, getDecisions, getDecisionStats, getRivalInfo, getAgentTournaments, getEloTier, getXpForNextLevel, getAgentAchievements, checkAchievements } from '@/lib/db-queries';
import { generatePersonality } from '@/lib/personality-generator';
import { authenticateRequest } from '@/lib/api-auth';

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

  // Fetch personality (auto-generate if missing)
  let personality = getPersonality(agentId);
  if (!personality) {
    personality = generatePersonality(agent);
  }

  // Fetch recent decisions
  const { decisions: recentDecisions } = getDecisions(agentId, 10);
  const decisionStats = getDecisionStats(agentId);

  // Check & unlock any new achievements, then fetch
  try { checkAchievements(agentId); } catch { /* ignore */ }
  const achievements = getAgentAchievements(agentId);
  const xpInfo = getXpForNextLevel(agent.xp);

  const response = {
    id: agent.id,
    name: agent.name,
    strategy: agent.strategy_name,
    description: agent.description,
    walletAddress: agent.wallet_address,
    createdAt: agent.created_at,
    active: agent.active === 1,
    lastActiveAt: agent.last_active_at,
    isOnline: agent.last_active_at ? (Date.now() - new Date(agent.last_active_at).getTime()) < 120_000 : false,
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
      totalDecisions: agent.total_decisions,
      favoriteAction: agent.favorite_action ?? 'wait',
      elo: agent.elo_rating,
      eloTier: getEloTier(agent.elo_rating),
      xp: agent.xp,
      level: agent.level,
      prestige: agent.prestige,
      xpProgress: xpInfo.progress,
      xpForNextLevel: xpInfo.nextLevelXp,
    },
    achievements: achievements.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      category: a.category,
      icon: a.icon,
      rarity: a.rarity,
      unlockedAt: a.unlocked_at,
    })),
    personality: personality ? {
      bio: personality.bio,
      catchphrase: personality.catchphrase,
      personalityType: personality.personality_type,
      avatarSeed: personality.avatar_seed,
      avatarGradient: personality.avatar_gradient,
      tauntStyle: personality.taunt_style,
      favoriteElement: personality.favorite_element,
    } : null,
    recentDecisions: recentDecisions.map((d) => ({
      id: d.id,
      action: d.action,
      reasoning: d.reasoning,
      gameStateSummary: (() => { try { return JSON.parse(d.game_state_summary || '{}'); } catch { return {}; } })(),
      success: d.success === 1,
      createdAt: d.created_at,
    })),
    decisionStats,
    recentActivity: activities.map((a) => ({
      type: a.type,
      description: a.description,
      timestamp: new Date(a.created_at).getTime(),
      txHash: a.tx_hash,
    })),
    rival: getRivalInfo(agentId),
    tournaments: getAgentTournaments(agentId).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      score: t.score,
      wins: t.wins,
      losses: t.losses,
      prize_pool: t.prize_pool,
      winner_id: t.winner_id,
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
    // Authenticate the request
    const auth = authenticateRequest(req, 'write');
    if (!auth.valid) {
      return auth.response;
    }

    const { agentId } = params;

    if (!agentId || !AGENT_ID_RE.test(agentId)) {
      return NextResponse.json(
        { error: 'Invalid agentId format. Must match pattern agent_*', code: 'INVALID_AGENT_ID' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Verify the authenticated agent matches the requested agentId
    if (auth.agentId !== agentId) {
      return NextResponse.json(
        { error: 'Forbidden: API key does not belong to this agent', code: 'FORBIDDEN' },
        { status: 403, headers: securityHeaders() }
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
