import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById } from '@/lib/db-queries';
import { fetchWarriors } from '@/lib/agent-engine';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'read');
  if (!auth.valid) return auth.response;

  try {
    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    let warriors: Awaited<ReturnType<typeof fetchWarriors>> = [];
    try {
      warriors = await fetchWarriors(agent.wallet_address);
    } catch {
      // Contract call may fail if wallet has no warriors — return empty
    }

    return NextResponse.json({
      warriors: warriors.map((w) => ({
        tokenId: w.tokenId,
        attack: w.attack,
        defense: w.defense,
        speed: w.speed,
        element: w.element,
        elementName: w.elementName,
        level: w.level,
        battleWins: w.battleWins,
        battleLosses: w.battleLosses,
        powerScore: w.powerScore,
      })),
      count: warriors.length,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/warriors]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
