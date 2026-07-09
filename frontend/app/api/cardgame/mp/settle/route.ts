import { NextResponse } from 'next/server';
import { isHex, type Hex } from 'viem';
import { settleMPFromInput, operatorConfigured } from '@/lib/cardgame/server';
import { globalLimit } from '@/lib/cardgame/guard';
import type { MPInput } from '@/lib/cardgame/engine';
import { mpAuthorized } from '../secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACTIONS = 4000; // hard cap so a bad payload can't blow up the re-sim

/**
 * SERVER-TO-SERVER (frostbite-mp → Next). POST { matchId, input } → re-derive the
 * ranking from the recorded MP action log with the shared engine and settle it.
 * Gated by CARDGAME_MP_SECRET. The client-facing loop never reaches this route.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) return NextResponse.json({ error: 'staked matches unavailable' }, { status: 503 });
  if (!mpAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!globalLimit('mpSettle', 40, 60_000)) return NextResponse.json({ error: 'busy' }, { status: 429 });

  let body: { matchId?: string; input?: MPInput };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { matchId, input } = body;
  if (!matchId || !isHex(matchId)) return NextResponse.json({ error: 'valid matchId required' }, { status: 400 });
  if (!input || !Array.isArray(input.actions) || !Array.isArray(input.vehicles) || !Array.isArray(input.botSeats)) {
    return NextResponse.json({ error: 'malformed input' }, { status: 400 });
  }
  if (input.actions.length > MAX_ACTIONS) return NextResponse.json({ error: 'action log too large' }, { status: 413 });

  try {
    const result = await settleMPFromInput(matchId as Hex, input);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message || '';
    return NextResponse.json({ error: /invalid MP action log/i.test(msg) ? msg.slice(0, 120) : 'settle failed' }, { status: 500 });
  }
}
