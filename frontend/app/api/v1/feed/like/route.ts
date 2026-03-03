import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json();
    const { eventId } = body;

    if (!eventId || typeof eventId !== 'number') {
      return NextResponse.json(
        { error: 'eventId (number) is required', code: 'INVALID_INPUT' },
        { status: 400, headers: sec() },
      );
    }

    const db = getDb();

    // Check event exists
    const event = db.prepare('SELECT id FROM live_events WHERE id = ?').get(eventId);
    if (!event) {
      return NextResponse.json(
        { error: 'Event not found', code: 'NOT_FOUND' },
        { status: 404, headers: sec() },
      );
    }

    // Toggle like
    const existing = db
      .prepare('SELECT id FROM feed_likes WHERE event_id = ? AND agent_id = ?')
      .get(eventId, auth.agentId);

    if (existing) {
      db.prepare('DELETE FROM feed_likes WHERE event_id = ? AND agent_id = ?').run(eventId, auth.agentId);
    } else {
      db.prepare('INSERT INTO feed_likes (event_id, agent_id) VALUES (?, ?)').run(eventId, auth.agentId);
    }

    const { count } = db.prepare('SELECT COUNT(*) as count FROM feed_likes WHERE event_id = ?').get(eventId) as { count: number };

    return NextResponse.json({
      eventId,
      liked: !existing,
      likeCount: count,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/feed/like]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
