import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10', 10) || 10, 50);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

    const { agents, total } = getLeaderboard(limit, offset);

    return NextResponse.json({
      leaderboard: agents.map((a, i) => ({
        rank: offset + i + 1,
        name: a.name,
        agentId: a.id,
        strategy: a.strategy_name,
        battles: a.total_battles,
        wins: a.wins,
        losses: a.losses,
        winRate: a.win_rate,
        profit: a.profit,
        currentStreak: a.current_streak,
      })),
      total,
      limit,
      offset,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/leaderboard]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
