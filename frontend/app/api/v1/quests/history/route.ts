import { NextRequest, NextResponse } from 'next/server';
import { getQuestHistory, getPlayerQuestStats } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json({ error: 'wallet parameter required' }, { status: 400, headers: sec() });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20');
    const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0');

    const { runs, total } = getQuestHistory(wallet, limit, offset);
    const stats = getPlayerQuestStats(wallet);

    return NextResponse.json({ runs, total, stats }, { headers: sec() });
  } catch (err) {
    console.error('[v1/quests/history]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
