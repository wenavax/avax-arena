import { NextResponse } from 'next/server';
import { isAddress, isHex, type Address, type Hex } from 'viem';
import { settleMatch, matchIdFor, operatorConfigured } from '@/lib/cardgame/server';
import { rateLimit, clientIp, verifyStakeSig, releaseOpenMatch } from '@/lib/cardgame/guard';

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
  const ip = clientIp(req);
  if (!rateLimit(`st:ip:${ip}`, 8, 60_000)) return NextResponse.json({ error: 'rate limited' }, { status: 429 });

  let body: { player?: string; nonce?: number; sig?: string; ranking?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const { player, nonce, sig, ranking } = body;
  if (!player || !isAddress(player)) return NextResponse.json({ error: 'valid player address required' }, { status: 400 });
  if (!Number.isInteger(nonce)) return NextResponse.json({ error: 'integer nonce required' }, { status: 400 });
  if (!sig || !isHex(sig)) return NextResponse.json({ error: 'stake signature required' }, { status: 400 });
  if (!Array.isArray(ranking) || ranking.length !== 4 || ranking.some((a) => !isAddress(a))) {
    return NextResponse.json({ error: 'ranking must be 4 valid addresses' }, { status: 400 });
  }

  const p = player as Address;
  if (!(await verifyStakeSig(p, nonce as number, sig as Hex))) {
    return NextResponse.json({ error: 'invalid stake signature' }, { status: 401 });
  }

  try {
    const matchId = matchIdFor(p, nonce as number);
    const result = await settleMatch(matchId, ranking as Address[]);
    releaseOpenMatch(p); // match resolved — free the player's slot
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    const clean = /permutation|not locked|signature/i.test(msg) ? msg.slice(0, 120) : 'settle failed';
    return NextResponse.json({ error: clean }, { status: 400 });
  }
}
