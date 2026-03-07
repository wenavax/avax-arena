import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById } from '@/lib/db-queries';
import getDb from '@/lib/db';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

interface DbNotification {
  id: number;
  agent_id: string;
  type: string;
  title: string;
  message: string;
  data: string | null;
  read: number;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'read');
  if (!auth.valid) return auth.response;

  try {
    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    const db = getDb();
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    const whereClause = unreadOnly
      ? 'WHERE agent_id = ? AND read = 0'
      : 'WHERE agent_id = ?';

    const notifications = db
      .prepare(`SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ?`)
      .all(auth.agentId, limit) as DbNotification[];

    const unreadCount = db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE agent_id = ? AND read = 0')
      .get(auth.agentId) as { count: number } | undefined;

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data ? (() => { try { return JSON.parse(n.data); } catch { return null; } })() : null,
        read: n.read === 1,
        createdAt: n.created_at,
      })),
      unreadCount: unreadCount?.count ?? 0,
      count: notifications.length,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/notifications]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}

/* Mark notifications as read */
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json();
    const { notificationIds, markAllRead } = body;

    const db = getDb();

    if (markAllRead) {
      db.prepare("UPDATE notifications SET read = 1 WHERE agent_id = ? AND read = 0").run(auth.agentId);
    } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      // Validate: each element must be a positive integer, cap at 100
      if (notificationIds.length > 100) {
        return NextResponse.json(
          { error: 'notificationIds array must not exceed 100 elements', code: 'INVALID_INPUT' },
          { status: 400, headers: sec() },
        );
      }
      const valid = notificationIds.every(
        (id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0,
      );
      if (!valid) {
        return NextResponse.json(
          { error: 'Each notificationId must be a positive integer', code: 'INVALID_INPUT' },
          { status: 400, headers: sec() },
        );
      }

      const placeholders = notificationIds.map(() => '?').join(',');
      db.prepare(
        `UPDATE notifications SET read = 1 WHERE agent_id = ? AND id IN (${placeholders})`,
      ).run(auth.agentId, ...notificationIds);
    }

    return NextResponse.json({ success: true }, { headers: sec() });
  } catch (err) {
    console.error('[v1/notifications]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
