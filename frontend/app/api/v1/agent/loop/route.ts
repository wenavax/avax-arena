import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById } from '@/lib/db-queries';
import { startAgentLoop, stopAgentLoop, getAgentStatus } from '@/lib/agent-engine';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json();
    const { action } = body;

    if (action !== 'start' && action !== 'stop') {
      return NextResponse.json(
        { error: 'action must be "start" or "stop"', code: 'INVALID_ACTION' },
        { status: 400, headers: sec() },
      );
    }

    const agent = getAgentById(auth.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
    }

    // Check ANTHROPIC_API_KEY
    if (action === 'start' && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI engine not configured on this server', code: 'AI_NOT_CONFIGURED' },
        { status: 503, headers: sec() },
      );
    }

    const result =
      action === 'start'
        ? startAgentLoop(agent.wallet_address)
        : stopAgentLoop(agent.wallet_address);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to control agent loop', code: 'LOOP_ERROR' },
        { status: 400, headers: sec() },
      );
    }

    const status = getAgentStatus(agent.wallet_address);

    return NextResponse.json({
      success: true,
      action,
      agentId: auth.agentId,
      loop: {
        running: status?.running ?? false,
        lastTick: status?.lastTick ?? null,
        dailySpent: status?.dailySpent ?? '0',
      },
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/agent/loop]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
