import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

// GET /api/agents/leaderboard
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);

    if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
      return NextResponse.json(
        { error: 'limit must be >= 1 and offset must be >= 0', code: 'INVALID_PAGINATION' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const limit = Math.min(rawLimit, 50);
    const offset = rawOffset;

    const { agents: rawAgents, total } = getLeaderboard(limit, offset);

    const agents = rawAgents.map((a, i) => ({
      rank: offset + i + 1,
      name: a.name,
      id: a.id,
      strategy: a.strategy_name,
      battles: a.total_battles,
      wins: a.wins,
      winRate: a.win_rate,
      profit: a.profit,
      favoriteElement: a.element,
      currentStreak: a.current_streak,
      bestStreak: a.best_streak,
    }));

    const headers = {
      ...securityHeaders(),
      'Cache-Control': 'public, max-age=30',
    };

    return NextResponse.json(
      {
        agents,
        pagination: { total, limit, offset },
      },
      { headers }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
