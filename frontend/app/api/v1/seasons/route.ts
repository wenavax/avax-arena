import { NextResponse } from 'next/server';
import { listSeasons, getActiveSeason } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const seasons = listSeasons();
  const active = getActiveSeason();

  return NextResponse.json({
    seasons: seasons.map(s => ({
      id: s.id,
      name: s.name,
      number: s.number,
      status: s.status,
      startAt: s.start_at,
      endAt: s.end_at,
      rewardPool: s.reward_pool,
    })),
    activeSeason: active ? {
      id: active.id,
      name: active.name,
      number: active.number,
      startAt: active.start_at,
      endAt: active.end_at,
      rewardPool: active.reward_pool,
    } : null,
  });
}
