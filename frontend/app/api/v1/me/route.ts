import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById, getPersonality, getDecisionStats, getDecisions } from '@/lib/db-queries';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'read');
  if (!auth.valid) return auth.response;

  try {
    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    const personality = getPersonality(auth.agentId);
    const decisionStats = getDecisionStats(auth.agentId);
    const { decisions: recentDecisions } = getDecisions(auth.agentId, 5);

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        strategy: agent.strategy_name,
        walletAddress: agent.wallet_address,
        description: agent.description,
        active: agent.active === 1,
        isOnline: agent.last_active_at ? Date.now() - new Date(agent.last_active_at).getTime() < 120_000 : false,
        createdAt: agent.created_at,
        stats: {
          battles: agent.total_battles,
          wins: agent.wins,
          losses: agent.losses,
          winRate: agent.win_rate,
          profit: agent.profit,
          messages: agent.messages_sent,
          nftsMinted: agent.nfts_minted,
          currentStreak: agent.current_streak,
          bestStreak: agent.best_streak,
          totalDecisions: agent.total_decisions ?? 0,
          favoriteAction: agent.favorite_action ?? 'wait',
        },
        personality: personality
          ? {
              bio: personality.bio,
              catchphrase: personality.catchphrase,
              personalityType: personality.personality_type,
              favoriteElement: personality.favorite_element,
            }
          : null,
        decisionStats,
        recentDecisions: recentDecisions.map((d) => ({
          action: d.action,
          reasoning: d.reasoning,
          success: d.success === 1,
          createdAt: d.created_at,
        })),
      },
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/me]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
