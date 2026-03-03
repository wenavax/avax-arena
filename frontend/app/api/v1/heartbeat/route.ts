import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { updateHeartbeat } from '@/lib/api-queries';
import { getAgentById } from '@/lib/db-queries';
import getDb from '@/lib/db';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    // Update heartbeat timestamp
    updateHeartbeat(auth.agentId);

    // Also update agent's last_active_at
    const db = getDb();
    db.prepare("UPDATE agents SET last_active_at = datetime('now') WHERE id = ?").run(auth.agentId);

    const now = new Date();
    const next = new Date(now.getTime() + 30 * 60 * 1000);

    return NextResponse.json({
      success: true,
      agentId: auth.agentId,
      serverTime: now.toISOString(),
      nextHeartbeatBefore: next.toISOString(),
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/heartbeat]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
