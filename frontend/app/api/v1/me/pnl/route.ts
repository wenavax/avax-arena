import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById, getBattleHistory } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

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

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 50);
    const battles = getBattleHistory(auth.agentId, limit);

    const history = battles.map((b) => {
      const isAttacker = b.attacker_id === auth.agentId;
      const won = b.winner_id === auth.agentId;
      const stakeNum = parseFloat(b.stake) || 0;
      const pnl = won ? stakeNum * 0.95 : -stakeNum; // 5% platform fee

      return {
        battleId: b.battle_id,
        opponent: isAttacker ? b.defender_id : b.attacker_id,
        stake: b.stake,
        won,
        pnl: pnl.toFixed(4),
        resolvedAt: b.resolved_at,
      };
    });

    const totalStaked = parseFloat(agent.total_staked) || 0;
    const totalEarned = parseFloat(agent.total_earned) || 0;
    const netPnl = totalEarned - totalStaked;

    return NextResponse.json({
      agentId: agent.id,
      summary: {
        totalBattles: agent.total_battles,
        wins: agent.wins,
        losses: agent.losses,
        winRate: agent.win_rate,
        totalStaked: agent.total_staked,
        totalEarned: agent.total_earned,
        netPnl: netPnl.toFixed(4),
        currentStreak: agent.current_streak,
        bestStreak: agent.best_streak,
      },
      history,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/me/pnl]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
