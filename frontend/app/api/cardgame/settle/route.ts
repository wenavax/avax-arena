import { NextResponse } from 'next/server';
import { isAddress, isHex, type Address, type Hex } from 'viem';
import { settleMatch, operatorConfigured } from '@/lib/cardgame/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { matchId, ranking: address[4] } → server (trustedSigner) signs the
 * ranking and submits settle. Credits pull-payment payouts on-chain.
 *
 * NOTE (Phase-1 gap): the ranking is currently client-reported, not yet
 * re-derived by a server-authoritative engine. Testnet only.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json({ error: 'staked matches unavailable (operator not configured)' }, { status: 503 });
  }
  let body: { matchId?: string; ranking?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const { matchId, ranking } = body;
  if (!matchId || !isHex(matchId) || matchId.length !== 66) {
    return NextResponse.json({ error: 'valid matchId (bytes32) required' }, { status: 400 });
  }
  if (!Array.isArray(ranking) || ranking.length !== 4 || ranking.some((a) => !isAddress(a))) {
    return NextResponse.json({ error: 'ranking must be 4 valid addresses' }, { status: 400 });
  }

  try {
    const result = await settleMatch(matchId as Hex, ranking as Address[]);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
