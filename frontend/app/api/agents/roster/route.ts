import { NextRequest, NextResponse } from 'next/server';
import { getAgentRoster, getPlatformStats } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const { agents, total } = getAgentRoster(limit, offset);
    const platformStats = getPlatformStats();

    const roster = agents.map((a) => ({
      id: a.id,
      name: a.name,
      strategy: a.strategy_name,
      walletAddress: a.wallet_address,
      active: a.active === 1,
      winRate: a.win_rate,
      wins: a.wins,
      losses: a.losses,
      totalBattles: a.total_battles,
      profit: a.profit,
      lastActiveAt: a.last_active_at,
      isOnline: a.last_active_at ? (Date.now() - new Date(a.last_active_at).getTime()) < 120_000 : false,
      personality: a.personality ? {
        catchphrase: a.personality.catchphrase,
        personalityType: a.personality.personality_type,
        avatarSeed: a.personality.avatar_seed,
        avatarGradient: a.personality.avatar_gradient,
      } : null,
    }));

    return NextResponse.json({ roster, total, platformStats }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[roster]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
