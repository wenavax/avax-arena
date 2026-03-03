import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, parseAbi } from 'viem';
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

const TOURNAMENT_ADDRESS = process.env.NEXT_PUBLIC_TOURNAMENT_ADDRESS as `0x${string}` | undefined;

const tournamentAbi = parseAbi([
  'function entryFee() view returns (uint256)',
  'function currentTournamentId() view returns (uint256)',
  'function getTournamentInfo(uint256) view returns (uint256 id, uint256 entryFee, uint256 prizePool, uint256 startTime, uint256 endTime, uint8 status, uint256 participantCount)',
]);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const count = Math.min(parseInt(url.searchParams.get('count') ?? '1', 10) || 1, 10);

    // If tournament contract is configured, fetch on-chain data
    if (TOURNAMENT_ADDRESS && TOURNAMENT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      let lastError: unknown;
      for (const rpcUrl of RPC_URLS) {
        try {
          const client = createPublicClient({
            chain: avalancheFuji,
            transport: http(rpcUrl, { timeout: 10_000 }),
          });

          const entryFee = await client.readContract({
            address: TOURNAMENT_ADDRESS,
            abi: tournamentAbi,
            functionName: 'entryFee',
          });

          const pricePerTicket = formatEther(entryFee);
          const totalPrice = formatEther(entryFee * BigInt(count));

          return NextResponse.json({
            pricePerTicket,
            count,
            totalPrice,
            currency: 'AVAX',
            network: 'fuji-testnet',
            tournamentContract: TOURNAMENT_ADDRESS,
          }, { headers: sec() });
        } catch (err) {
          lastError = err;
        }
      }
      console.error('[tickets/quote] RPC error:', lastError);
    }

    // Fallback: static pricing
    const pricePerTicket = '0.01';
    const totalPrice = (parseFloat(pricePerTicket) * count).toFixed(4);

    return NextResponse.json({
      pricePerTicket,
      count,
      totalPrice,
      currency: 'AVAX',
      network: 'fuji-testnet',
      source: 'static',
    }, { headers: sec() });
  } catch (err) {
    console.error('[tickets/quote]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
