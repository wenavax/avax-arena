import { NextRequest, NextResponse } from 'next/server';
import { getAgentStatus } from '@/lib/agent-engine';

const ETHEREUM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
}

/* ---------------------------------------------------------------------------
 * GET /api/agents/status?wallet=0x...
 *
 * Returns the current agent loop status, last action, and activity log.
 * ------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');

    if (!wallet || !ETHEREUM_ADDRESS_RE.test(wallet)) {
      return NextResponse.json(
        { error: 'wallet query parameter must be a valid Ethereum address', code: 'INVALID_WALLET' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const status = getAgentStatus(wallet);

    if (!status) {
      return NextResponse.json(
        {
          running: false,
          lastTick: 0,
          lastAction: null,
          lastError: null,
          consecutiveErrors: 0,
          dailySpent: '0',
          activityLog: [],
        },
        { headers: securityHeaders() }
      );
    }

    return NextResponse.json(status, { headers: securityHeaders() });
  } catch (err) {
    console.error('[agent-status]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
