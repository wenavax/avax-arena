import { NextResponse } from 'next/server';
import { isAddress, isHex, type Address, type Hex } from 'viem';
import { openMatch, matchIdFor, operatorConfigured } from '@/lib/cardgame/server';
import { rateLimit, globalLimit, clientIp, verifyStakeSig, reserveOpenMatch, releaseOpenMatch } from '@/lib/cardgame/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { player, nonce, sig } → open a Fuji staked match (createMatch only).
 * Guarded: the player must sign the stake authorization (proves wallet
 * ownership), per-IP + per-player rate limits, and one un-joined match per
 * player at a time — so an unauthenticated caller cannot spam-create matches
 * or lock up bot funds. Bots are seated later via /seat-bots after the player pays.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json({ error: 'staked matches unavailable' }, { status: 503 });
  }
  // Global operator-gas breaker: a self-issued signature proves nothing (an
  // attacker owns unlimited wallets), so cap total createMatch spend per window
  // regardless of caller identity — this is the real bound on operator gas.
  if (!globalLimit('createMatch', 20, 60_000)) {
    return NextResponse.json({ error: 'match creation is busy — try again shortly' }, { status: 429 });
  }
  const ip = clientIp(req);
  if (!rateLimit(`cm:ip:${ip}`, 6, 60_000)) {
    return NextResponse.json({ error: 'rate limited — slow down' }, { status: 429 });
  }

  let body: { player?: string; nonce?: number; sig?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { player, nonce, sig } = body;
  if (!player || !isAddress(player)) return NextResponse.json({ error: 'valid player address required' }, { status: 400 });
  if (!Number.isInteger(nonce)) return NextResponse.json({ error: 'integer nonce required' }, { status: 400 });
  if (!sig || !isHex(sig)) return NextResponse.json({ error: 'stake signature required' }, { status: 400 });

  const p = player as Address;
  const n = nonce as number;
  if (!(await verifyStakeSig(p, n, sig as Hex))) {
    return NextResponse.json({ error: 'invalid stake signature (sign with your wallet)' }, { status: 401 });
  }
  if (!rateLimit(`cm:pl:${p.toLowerCase()}`, 4, 60_000)) {
    return NextResponse.json({ error: 'rate limited for this wallet' }, { status: 429 });
  }

  const matchId = matchIdFor(p, n);
  const slot = reserveOpenMatch(p, matchId);
  if (!slot.ok) {
    return NextResponse.json({ error: 'you already have an open match — finish or refund it first', matchId: slot.existing }, { status: 409 });
  }

  try {
    const result = await openMatch(p, n);
    return NextResponse.json(result);
  } catch (e) {
    releaseOpenMatch(p);
    return NextResponse.json({ error: sanitize((e as Error).message) }, { status: 500 });
  }
}

/** Strip internal RPC/stack detail from error text before returning to clients. */
function sanitize(msg: string): string {
  if (/signature|already|not paid|not in this match|unsupported/i.test(msg)) return msg.slice(0, 120);
  return 'on-chain call failed';
}
