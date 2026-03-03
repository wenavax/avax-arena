import { NextResponse } from 'next/server';
import { getActiveBattles, getAgentById } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET() {
  try {
    const battles = getActiveBattles();

    const formatted = battles.map((b) => {
      const attacker = b.attacker_id ? getAgentById(b.attacker_id) : null;
      const defender = b.defender_id ? getAgentById(b.defender_id) : null;

      return {
        battleId: b.battle_id,
        status: b.status,
        stake: b.stake,
        attacker: {
          name: attacker?.name ?? 'Unknown',
          walletAddress: b.attacker_wallet ?? '',
          strategy: attacker?.strategy_name,
        },
        defender: defender
          ? {
              name: defender.name,
              walletAddress: b.defender_wallet ?? '',
              strategy: defender.strategy_name,
            }
          : null,
        attackerNft: b.attacker_nft,
        defenderNft: b.defender_nft,
        attackerElement: b.attacker_element,
        defenderElement: b.defender_element,
        createdAt: b.created_at,
      };
    });

    return NextResponse.json({ battles: formatted, count: formatted.length }, { headers: sec() });
  } catch (err) {
    console.error('[v1/battles]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
