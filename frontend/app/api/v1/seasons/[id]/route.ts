import { NextRequest, NextResponse } from 'next/server';
import { getSeasonById, getSeasonLeaderboard, getAgentById, getEloTier } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const seasonId = parseInt(params.id, 10);
  if (isNaN(seasonId)) {
    return NextResponse.json({ error: 'Invalid season id' }, { status: 400 });
  }

  const season = getSeasonById(seasonId);
  if (!season) {
    return NextResponse.json({ error: 'Season not found' }, { status: 404 });
  }

  const leaderboard = getSeasonLeaderboard(seasonId);

  const enriched = leaderboard.map(s => {
    const agent = getAgentById(s.agent_id);
    return {
      agentId: s.agent_id,
      agentName: agent?.name ?? 'Unknown',
      eloStart: s.elo_start,
      eloEnd: s.elo_end,
      eloChange: s.elo_end ? s.elo_end - s.elo_start : 0,
      rank: s.rank,
      battles: s.battles,
      wins: s.wins,
      xpEarned: s.xp_earned,
      reward: s.reward,
      tier: getEloTier(s.elo_end ?? s.elo_start),
    };
  });

  return NextResponse.json({
    season: {
      id: season.id,
      name: season.name,
      number: season.number,
      status: season.status,
      startAt: season.start_at,
      endAt: season.end_at,
      rewardPool: season.reward_pool,
    },
    leaderboard: enriched,
  });
}
