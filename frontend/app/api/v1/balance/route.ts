import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById } from '@/lib/db-queries';
import { formatEther } from 'viem';
import { withRpcFallback, networkLabel } from '@/lib/chain';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const addressParam = url.searchParams.get('address');

    let walletAddress: string;

    if (addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      walletAddress = addressParam;
    } else {
      const auth = authenticateRequest(req, 'read');
      if (!auth.valid) return auth.response;

      const agent = getAgentById(auth.agentId);
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found', code: 'NOT_FOUND' }, { status: 404, headers: sec() });
      }
      walletAddress = agent.wallet_address;
    }

    const balanceWei = await withRpcFallback((client) =>
      client.getBalance({ address: walletAddress as `0x${string}` }),
    );
    const balanceAvax = formatEther(balanceWei);

    return NextResponse.json({
      walletAddress,
      balance: balanceAvax,
      balanceWei: balanceWei.toString(),
      currency: 'AVAX',
      network: networkLabel,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/balance]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
