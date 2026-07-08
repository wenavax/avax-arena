import { NextResponse } from 'next/server';
import { getRecentMatches } from '@/lib/cardgame/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → recent MatchEscrow matches (live spectator feed), newest first. */
export async function GET() {
  try {
    const data = await getRecentMatches();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, matches: [] }, { status: 500 });
  }
}
