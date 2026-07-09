import { NextResponse } from 'next/server';
import { isAddress, type Address } from 'viem';
import { openMatchMP, operatorConfigured } from '@/lib/cardgame/server';
import { globalLimit } from '@/lib/cardgame/guard';
import { mpAuthorized } from '../secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SERVER-TO-SERVER (frostbite-mp → Next). POST { players:[4], salt } → createMatch
 * for a real 4-player match. Gated by the shared CARDGAME_MP_SECRET header so only
 * the multiplayer server (never a browser) can open matches on the operator's gas.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) return NextResponse.json({ error: 'staked matches unavailable' }, { status: 503 });
  if (!mpAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!globalLimit('mpCreate', 30, 60_000)) return NextResponse.json({ error: 'busy' }, { status: 429 });

  let body: { players?: string[]; salt?: number | string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { players, salt } = body;
  if (!Array.isArray(players) || players.length !== 4 || !players.every((p) => isAddress(p))) {
    return NextResponse.json({ error: 'players must be 4 valid addresses' }, { status: 400 });
  }
  if (new Set(players.map((p) => p.toLowerCase())).size !== 4) {
    return NextResponse.json({ error: 'players must be distinct' }, { status: 400 });
  }
  if (salt === undefined || (typeof salt !== 'number' && typeof salt !== 'string')) {
    return NextResponse.json({ error: 'salt required' }, { status: 400 });
  }

  try {
    const result = await openMatchMP(players as Address[], salt);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: 'createMatch failed' }, { status: 500 });
  }
}
