import { NextResponse } from 'next/server';
import type { Hex } from 'viem';
import { cancelMatchMP, operatorConfigured } from '@/lib/cardgame/server';
import { globalLimit } from '@/lib/cardgame/guard';
import { mpAuthorized } from '../secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SERVER-TO-SERVER (frostbite-mp → Next). POST { matchId } → cancelMatch so
 * payers of a failed scheduled race can withdraw their entry instantly.
 * Gated by CARDGAME_MP_SECRET — never callable from a browser.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!mpAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!globalLimit('mpCancel', 30, 60_000)) return NextResponse.json({ error: 'busy' }, { status: 429 });

  let body: { matchId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!body.matchId || !/^0x[0-9a-fA-F]{64}$/.test(body.matchId)) {
    return NextResponse.json({ error: 'matchId must be a bytes32 hex' }, { status: 400 });
  }
  try {
    return NextResponse.json(await cancelMatchMP(body.matchId as Hex));
  } catch {
    return NextResponse.json({ error: 'cancel failed' }, { status: 500 });
  }
}
