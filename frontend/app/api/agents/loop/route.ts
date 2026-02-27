import { NextRequest, NextResponse } from 'next/server';
import { startAgentLoop, stopAgentLoop } from '@/lib/agent-engine';
import { getStoredAgent } from '@/lib/wallet-manager';

const ETHEREUM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

/* ---------------------------------------------------------------------------
 * POST /api/agents/loop
 *
 * Start or stop the autonomous agent loop.
 *
 * Body: {
 *   action: 'start' | 'stop',
 *   walletAddress: string,   // agent wallet address
 *   ownerAddress: string,    // owner wallet for auth
 * }
 * ------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json', code: 'INVALID_CONTENT_TYPE' },
        { status: 415, headers: securityHeaders() }
      );
    }

    const body = await req.json();
    const { action, walletAddress, ownerAddress } = body;

    // Validate inputs
    if (!action || !['start', 'stop'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "start" or "stop"', code: 'INVALID_ACTION' },
        { status: 400, headers: securityHeaders() }
      );
    }

    if (!walletAddress || !ETHEREUM_ADDRESS_RE.test(walletAddress)) {
      return NextResponse.json(
        { error: 'walletAddress must be a valid Ethereum address', code: 'INVALID_WALLET' },
        { status: 400, headers: securityHeaders() }
      );
    }

    if (!ownerAddress || !ETHEREUM_ADDRESS_RE.test(ownerAddress)) {
      return NextResponse.json(
        { error: 'ownerAddress must be a valid Ethereum address', code: 'INVALID_OWNER' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Auth: check that ownerAddress matches the stored agent's owner
    const storedAgent = getStoredAgent(walletAddress);
    if (!storedAgent) {
      return NextResponse.json(
        { error: 'Agent wallet not found', code: 'AGENT_NOT_FOUND' },
        { status: 404, headers: securityHeaders() }
      );
    }

    if (storedAgent.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Unauthorized: ownerAddress does not match agent owner', code: 'UNAUTHORIZED' },
        { status: 403, headers: securityHeaders() }
      );
    }

    // Check env vars
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured on server', code: 'MISSING_CONFIG' },
        { status: 500, headers: securityHeaders() }
      );
    }

    // Execute action
    const result =
      action === 'start'
        ? startAgentLoop(walletAddress)
        : stopAgentLoop(walletAddress);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: 'LOOP_ERROR' },
        { status: 400, headers: securityHeaders() }
      );
    }

    return NextResponse.json(
      { success: true, action, walletAddress },
      { headers: securityHeaders() }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[agent-loop]', message);
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
