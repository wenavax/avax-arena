import { NextResponse } from 'next/server';
import { getRecentMatches } from '@/lib/cardgame/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Short server-side cache so a flood of spectators can't turn each hit into a
// fresh unbounded getLogs sweep against the RPC.
let cache: { at: number; data: unknown } | null = null;
const TTL = 4000;

/** GET → recent MatchEscrow matches (live spectator feed), newest first. */
export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL) {
      return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } });
    }
    const data = await getRecentMatches();
    cache = { at: Date.now(), data };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    if (cache) return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ error: 'feed unavailable', matches: [] }, { status: 500 });
  }
}
