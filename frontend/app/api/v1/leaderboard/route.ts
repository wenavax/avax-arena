import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard, getWalletPoints } from '@/lib/db-queries';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=15' };
}

export function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
    const wallet = url.searchParams.get('wallet');

    // Single wallet lookup — return same format as leaderboard for frontend compatibility
    if (wallet) {
      const points = getWalletPoints(wallet);
      if (!points) {
        return NextResponse.json({ leaderboard: [], total: 0 }, { headers: sec() });
      }
      // Calculate rank
      const db = getDb();
      const rankRow = db.prepare('SELECT COUNT(*) as rank FROM wallet_points WHERE fsb_points > ?').get(points.fsb_points) as { rank: number };
      const rank = rankRow.rank + 1;

      return NextResponse.json({
        leaderboard: [{
          rank,
          wallet: points.wallet,
          fsbPoints: points.fsb_points,
          totalBattles: points.total_battles,
          wins: points.wins,
          losses: points.losses,
          winRate: points.total_battles > 0 ? Math.round((points.wins / points.total_battles) * 100) : 0,
          avaxWon: points.total_avax_won,
        }],
        total: 1,
      }, { headers: sec() });
    }

    const { players, total } = getLeaderboard(limit, offset);

    return NextResponse.json({
      leaderboard: players.map((p, i) => ({
        rank: offset + i + 1,
        wallet: p.wallet,
        fsbPoints: p.fsb_points,
        totalBattles: p.total_battles,
        wins: p.wins,
        losses: p.losses,
        winRate: p.total_battles > 0 ? Math.round((p.wins / p.total_battles) * 100) : 0,
        avaxWon: p.total_avax_won,
      })),
      total,
      limit,
      offset,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/leaderboard]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
