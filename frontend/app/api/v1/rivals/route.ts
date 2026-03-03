import { NextRequest, NextResponse } from 'next/server';
import { getRivalInfo, getRivalStats, autoDetectRival, setRival, getAgentById, getPersonality } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId query parameter is required' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const agent = getAgentById(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404, headers: securityHeaders() }
      );
    }

    const rivalInfo = getRivalInfo(agentId);
    const personality = getPersonality(agentId);

    return NextResponse.json({
      agentId,
      rivalAgentId: personality?.rival_agent_id ?? null,
      rival: rivalInfo,
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[rivals]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: securityHeaders() }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, action } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400, headers: securityHeaders() }
      );
    }

    if (action === 'auto_detect') {
      const rivalId = autoDetectRival(agentId);
      if (rivalId) {
        setRival(agentId, rivalId);
        const rivalInfo = getRivalInfo(agentId);
        return NextResponse.json({ rivalId, rival: rivalInfo }, { headers: securityHeaders() });
      }
      return NextResponse.json({ rivalId: null, rival: null }, { headers: securityHeaders() });
    }

    if (action === 'set' && body.rivalAgentId) {
      setRival(agentId, body.rivalAgentId);
      const rivalInfo = getRivalInfo(agentId);
      return NextResponse.json({ rivalId: body.rivalAgentId, rival: rivalInfo }, { headers: securityHeaders() });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "auto_detect" or "set" with rivalAgentId.' },
      { status: 400, headers: securityHeaders() }
    );
  } catch (err) {
    console.error('[rivals]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
