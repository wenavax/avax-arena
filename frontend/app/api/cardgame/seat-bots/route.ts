import { NextResponse } from 'next/server';
import { isAddress, isHex, type Address, type Hex } from 'viem';
import { seatBots, matchIdFor, operatorConfigured } from '@/lib/cardgame/server';
import { rateLimit, clientIp, verifyStakeSig } from '@/lib/cardgame/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { player, nonce, sig } → seat the 3 bots for a match the player has
 * ALREADY paid into. seatBots() re-checks on-chain that the player is a listed
 * player and hasPaid before spending any bot AVAX — the drain-prevention gate.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) return NextResponse.json({ error: 'staked matches unavailable' }, { status: 503 });
  const ip = clientIp(req);
  if (!rateLimit(`sb:ip:${ip}`, 8, 60_000)) return NextResponse.json({ error: 'rate limited' }, { status: 429 });

  let body: { player?: string; nonce?: number; sig?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { player, nonce, sig } = body;
  if (!player || !isAddress(player)) return NextResponse.json({ error: 'valid player address required' }, { status: 400 });
  if (!Number.isInteger(nonce)) return NextResponse.json({ error: 'integer nonce required' }, { status: 400 });
  if (!sig || !isHex(sig)) return NextResponse.json({ error: 'stake signature required' }, { status: 400 });

  const p = player as Address;
  if (!(await verifyStakeSig(p, nonce as number, sig as Hex))) {
    return NextResponse.json({ error: 'invalid stake signature' }, { status: 401 });
  }
  if (!rateLimit(`sb:pl:${p.toLowerCase()}`, 8, 60_000)) {
    return NextResponse.json({ error: 'rate limited for this wallet' }, { status: 429 });
  }

  try {
    const result = await seatBots(matchIdFor(p, nonce as number), p);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    const clean = /not paid|not in this match|already/i.test(msg) ? msg.slice(0, 120) : 'seating failed';
    return NextResponse.json({ error: clean }, { status: 400 });
  }
}
