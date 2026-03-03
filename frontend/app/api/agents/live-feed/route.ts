import { NextRequest, NextResponse } from 'next/server';
import { getLiveEvents } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
    const since = url.searchParams.get('since') ?? undefined;

    const events = getLiveEvents(limit, since);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        agentId: e.agent_id,
        agentName: e.agent_name,
        opponentId: e.opponent_id,
        opponentName: e.opponent_name,
        data: JSON.parse(e.data || '{}'),
        createdAt: e.created_at,
      })),
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[live-feed]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
