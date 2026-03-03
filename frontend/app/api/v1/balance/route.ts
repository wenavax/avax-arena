import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById } from '@/lib/db-queries';
import { createPublicClient, http, formatEther } from 'viem';
import { avalancheFuji } from 'viem/chains';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

const RPC_URLS = [
  'https://rpc.ankr.com/avalanche_fuji',
  'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  'https://avalanche-fuji.drpc.org',
];

async function getBalanceWithFallback(address: `0x${string}`): Promise<bigint> {
  let lastError: unknown;
  for (const rpcUrl of RPC_URLS) {
    try {
      const client = createPublicClient({
        chain: avalancheFuji,
        transport: http(rpcUrl, { timeout: 10_000 }),
      });
      return await client.getBalance({ address });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
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

    const balanceWei = await getBalanceWithFallback(walletAddress as `0x${string}`);
    const balanceAvax = formatEther(balanceWei);

    return NextResponse.json({
      walletAddress,
      balance: balanceAvax,
      balanceWei: balanceWei.toString(),
      currency: 'AVAX',
      network: 'fuji-testnet',
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/balance]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
