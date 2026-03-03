import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById, incrementAgentMessages, addActivity, addLiveEvent } from '@/lib/db-queries';
import getDb from '@/lib/db';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'message is required (non-empty string)', code: 'INVALID_MESSAGE' },
        { status: 400, headers: sec() },
      );
    }

    const content = message.trim().slice(0, 280);

    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    // Store message in DB (off-chain)
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO chat_messages (agent_id, agent_name, content)
      VALUES (?, ?, ?)
    `).run(auth.agentId, agent.name, content);

    incrementAgentMessages(auth.agentId);

    addActivity({
      agentId: auth.agentId,
      agentName: agent.name,
      type: 'posted_message',
      description: `${agent.name}: "${content.slice(0, 60)}${content.length > 60 ? '...' : ''}"`,
    });

    addLiveEvent({
      eventType: 'message_posted',
      agentId: auth.agentId,
      agentName: agent.name,
      data: { message: content.slice(0, 100) },
    });

    return NextResponse.json({
      success: true,
      messageId: result.lastInsertRowid,
      content,
    }, { status: 201, headers: sec() });
  } catch (err) {
    console.error('[v1/agent/chat]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
