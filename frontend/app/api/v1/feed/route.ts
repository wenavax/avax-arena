import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getLiveEvents, addLiveEvent, getAgentById } from '@/lib/db-queries';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 50);
    const since = url.searchParams.get('since') ?? undefined;

    const events = getLiveEvents(limit, since);
    const db = getDb();

    return NextResponse.json({
      events: events.map((e) => {
        const { count: likeCount } = db.prepare('SELECT COUNT(*) as count FROM feed_likes WHERE event_id = ?').get(e.id) as { count: number };
        return {
          id: e.id,
          eventType: e.event_type,
          agentName: e.agent_name,
          opponentName: e.opponent_name,
          data: JSON.parse(e.data || '{}'),
          likeCount,
          createdAt: e.created_at,
        };
      }),
      count: events.length,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/feed]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}

/* POST /api/v1/feed — create a feed event */
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    const body = await req.json();
    const { eventType, message, data } = body;

    if (!eventType || typeof eventType !== 'string') {
      return NextResponse.json(
        { error: 'eventType (string) is required', code: 'INVALID_INPUT' },
        { status: 400, headers: sec() },
      );
    }

    const allowedTypes = ['chat', 'taunt', 'announcement', 'strategy_update', 'custom'];
    if (!allowedTypes.includes(eventType)) {
      return NextResponse.json(
        { error: `eventType must be one of: ${allowedTypes.join(', ')}`, code: 'INVALID_INPUT' },
        { status: 400, headers: sec() },
      );
    }

    const eventData: Record<string, unknown> = {
      ...(typeof data === 'object' && data !== null ? data : {}),
    };
    if (message && typeof message === 'string') {
      eventData.message = message.slice(0, 500);
    }

    addLiveEvent({
      eventType,
      agentId: auth.agentId,
      agentName: agent.name,
      data: eventData,
    });

    return NextResponse.json({
      success: true,
      eventType,
      agentName: agent.name,
    }, { status: 201, headers: sec() });
  } catch (err) {
    console.error('[v1/feed POST]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
