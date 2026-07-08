import { NextResponse } from 'next/server';
import { isAddress, isHex, type Address, type Hex } from 'viem';
import { settleFromInput, matchIdFor, operatorConfigured } from '@/lib/cardgame/server';
import { rateLimit, globalLimit, clientIp, verifyStakeSig, releaseOpenMatch } from '@/lib/cardgame/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { player, nonce, sig, ranking: address[4] } → server (trustedSigner)
 * signs the ranking and submits settle. Guarded by the player's stake signature
 * and rate limits, so a third party cannot settle someone else's match. The
 * matchId is derived server-side from (player, nonce) — a caller can only settle
 * matches they authorized.
 *
 * NOTE (Phase-1 gap): the ranking is still client-reported, not re-derived by a
 * server-authoritative engine. Testnet only; the wallet-owning player can still
 * claim 1st against the house bots. Closing this needs the seeded server engine.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) return NextResponse.json({ error: 'staked matches unavailable' }, { status: 503 });
  if (!globalLimit('settle', 30, 60_000)) return NextResponse.json({ error: 'settlement busy — retry shortly' }, { status: 429 });
  const ip = clientIp(req);
  if (!rateLimit(`st:ip:${ip}`, 8, 60_000)) return NextResponse.json({ error: 'rate limited' }, { status: 429 });

  let body: { player?: string; nonce?: number; sig?: string; input?: { vehicles?: string[]; plays?: unknown[] } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { player, nonce, sig, input } = body;
  if (!player || !isAddress(player)) return NextResponse.json({ error: 'valid player address required' }, { status: 400 });
  if (!Number.isInteger(nonce)) return NextResponse.json({ error: 'integer nonce required' }, { status: 400 });
  if (!sig || !isHex(sig)) return NextResponse.json({ error: 'stake signature required' }, { status: 400 });
  if (!input || !Array.isArray(input.vehicles) || !Array.isArray(input.plays)) {
    return NextResponse.json({ error: 'play input {vehicles, plays} required' }, { status: 400 });
  }
  if (input.plays.length > 2000) return NextResponse.json({ error: 'play log too long' }, { status: 400 });

  const p = player as Address;
  if (!(await verifyStakeSig(p, nonce as number, sig as Hex))) {
    return NextResponse.json({ error: 'invalid stake signature' }, { status: 401 });
  }
  if (!rateLimit(`st:pl:${p.toLowerCase()}`, 6, 60_000)) {
    return NextResponse.json({ error: 'rate limited for this wallet' }, { status: 429 });
  }

  try {
    const matchId = matchIdFor(p, nonce as number);
    // Server re-derives the ranking from (seed, input) — client result untrusted.
    const result = await settleFromInput(matchId, input as { vehicles: string[]; plays: never[] });
    releaseOpenMatch(p);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    const clean = /invalid play|not locked|signature|permutation/i.test(msg) ? msg.slice(0, 140) : 'settle failed';
    return NextResponse.json({ error: clean }, { status: 400 });
  }
}
