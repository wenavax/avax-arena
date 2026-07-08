import { NextResponse } from 'next/server';
import { isAddress, type Address } from 'viem';
import { createStakedMatch, operatorConfigured } from '@/lib/cardgame/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { player, nonce } → creates a Fuji staked match [player, bot1..3] and
 * joins the 3 bots. The player then joins client-side (real 0.01 AVAX tx).
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json({ error: 'staked matches unavailable (operator not configured)' }, { status: 503 });
  }
  let body: { player?: string; nonce?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const { player, nonce } = body;
  if (!player || !isAddress(player)) {
    return NextResponse.json({ error: 'valid player address required' }, { status: 400 });
  }
  const n = Number.isFinite(nonce) ? Math.floor(nonce as number) : 0;

  try {
    const result = await createStakedMatch(player as Address, n);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
