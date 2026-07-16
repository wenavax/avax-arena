import { NextResponse, type NextRequest } from 'next/server';
import { isAddress } from 'viem';
import { advanceScan, boardRows } from '@/lib/cardgame/leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One scan advance + aggregate per TTL window — spectator floods serve the
// cached board instead of hammering the RPC (same pattern as /matches).
let cache: { at: number; data: unknown } | null = null;
const TTL = 30_000;

/** GET → global leaderboard from indexed MatchSettled events.
 *  ?me=0x… additionally returns that wallet's row/rank (from the FULL board,
 *  not just the visible top). */
export async function GET(req: NextRequest) {
  const meParam = req.nextUrl.searchParams.get('me') ?? undefined;
  const me = meParam && isAddress(meParam) ? meParam : undefined;
  try {
    if (!cache || Date.now() - cache.at >= TTL) {
      const scan = await advanceScan();
      cache = { at: Date.now(), data: { ...boardRows(20), scan } };
    }
    const data = cache.data as ReturnType<typeof boardRows> & { scan: unknown };
    // `me` is per-caller — recompute the tiny aggregate off the shared cache window
    const body = me ? { ...data, ...{ me: boardRows(20, me).me } } : data;
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    if (cache) return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ error: 'leaderboard unavailable', rows: [] }, { status: 500 });
  }
}
