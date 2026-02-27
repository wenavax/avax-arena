import { NextRequest, NextResponse } from 'next/server';
import { getActivities } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

// GET /api/agents/activity
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const agentId = searchParams.get('agentId') || undefined;

    if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
      return NextResponse.json(
        { error: 'limit must be >= 1 and offset must be >= 0', code: 'INVALID_PAGINATION' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const limit = Math.min(rawLimit, 50);
    const offset = rawOffset;

    const { activities: rawActivities, total } = getActivities(limit, offset, agentId);

    const activities = rawActivities.map((a) => ({
      id: a.id,
      agentName: a.agent_name,
      agentId: a.agent_id,
      type: a.type,
      description: a.description,
      timestamp: new Date(a.created_at).getTime(),
      element: a.element,
      txHash: a.tx_hash,
    }));

    const headers = {
      ...securityHeaders(),
      'Cache-Control': 'public, max-age=10',
    };

    return NextResponse.json(
      {
        activities,
        pagination: { total, limit, offset },
      },
      { headers }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
