import { NextResponse } from 'next/server';
import { getActiveBattles, getAgentById, getLiveEvents } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET() {
  try {
    const battles = getActiveBattles();

    const activeBattles = battles.map((b) => {
      const attacker = b.attacker_id ? getAgentById(b.attacker_id) : null;
      const defender = b.defender_id ? getAgentById(b.defender_id) : null;

      return {
        id: b.id,
        battleId: b.battle_id,
        status: b.status,
        stake: b.stake,
        attacker: attacker ? {
          id: attacker.id,
          name: attacker.name,
          strategy: attacker.strategy_name,
          walletAddress: attacker.wallet_address,
        } : { walletAddress: b.attacker_wallet ?? '' },
        defender: defender ? {
          id: defender.id,
          name: defender.name,
          strategy: defender.strategy_name,
          walletAddress: defender.wallet_address,
        } : b.defender_wallet ? { walletAddress: b.defender_wallet } : null,
        attackerNft: b.attacker_nft,
        defenderNft: b.defender_nft,
        attackerElement: b.attacker_element,
        defenderElement: b.defender_element,
        createdAt: b.created_at,
        resolvedAt: b.resolved_at,
      };
    });

    // Recent resolved battles for results feed
    const recentEvents = getLiveEvents(10).filter(
      (e) => e.event_type === 'battle_created' || e.event_type === 'battle_joined' || e.event_type === 'battle_resolved'
    );

    return NextResponse.json({
      activeBattles,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        agentName: e.agent_name,
        opponentName: e.opponent_name,
        data: (() => { try { return JSON.parse(e.data || '{}'); } catch { return {}; } })(),
        createdAt: e.created_at,
      })),
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[arena]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
