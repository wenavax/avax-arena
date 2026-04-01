import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard, getLeaderboardAllTime, getWalletPoints, getPreviousMonthTop10, checkAndArchivePreviousMonth } from '@/lib/db-queries';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=15' };
}

function mapPlayer(p: any, rank: number) {
  return {
    rank,
    wallet: p.wallet,
    fsbPoints: p.monthly_points ?? p.fsb_points ?? 0,
    totalPoints: p.fsb_points ?? 0,
    totalBattles: p.total_battles ?? 0,
    wins: p.wins ?? 0,
    losses: p.losses ?? 0,
    wins3v3: p.wins_3v3 ?? 0,
    losses3v3: p.losses_3v3 ?? 0,
    quests: (p.quests_completed ?? 0) + (p.quests_failed ?? 0),
    mints: p.mints ?? 0,
    fusions: p.fusions ?? 0,
    winRate: p.total_battles > 0 ? Math.round((p.wins / p.total_battles) * 100) : 0,
    avaxWon: p.total_avax_won ?? '0',
  };
}

export function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
    const wallet = url.searchParams.get('wallet');
    const mode = url.searchParams.get('mode') ?? 'monthly'; // 'monthly' | 'alltime'

    if (wallet) {
      const points = getWalletPoints(wallet);
      if (!points) {
        return NextResponse.json({ leaderboard: [], total: 0 }, { headers: sec() });
      }
      const db = getDb();
      const rankCol = mode === 'alltime' ? 'fsb_points' : 'monthly_points';
      const rankVal = mode === 'alltime' ? points.fsb_points : (points.monthly_points ?? 0);
      const rankRow = db.prepare(`SELECT COUNT(*) as rank FROM wallet_points WHERE ${rankCol} > ?`).get(rankVal) as { rank: number };

      return NextResponse.json({
        leaderboard: [mapPlayer(points, rankRow.rank + 1)],
        total: 1,
        mode,
      }, { headers: sec() });
    }

    // Auto-archive previous month
    checkAndArchivePreviousMonth();

    const { players, total } = mode === 'alltime'
      ? getLeaderboardAllTime(limit, offset)
      : getLeaderboard(limit, offset);

    // Get previous month's top 10
    const previousMonth = getPreviousMonthTop10();

    // Calculate month end for countdown
    const now = new Date();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return NextResponse.json({
      leaderboard: players.map((p: any, i: number) => mapPlayer(p, offset + i + 1)),
      total,
      limit,
      offset,
      mode,
      monthEnd: monthEnd.toISOString(),
      previousMonth: previousMonth ? {
        monthKey: previousMonth.monthKey,
        top10: previousMonth.players.map((p: any) => ({
          rank: p.rank,
          wallet: p.wallet,
          points: p.monthly_points,
          wins: p.wins,
          wins3v3: p.wins_3v3,
          mints: p.mints,
          fusions: p.fusions,
        })),
      } : null,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/leaderboard]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
