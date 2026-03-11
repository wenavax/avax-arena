import { NextRequest, NextResponse } from 'next/server';
import { formatEther, parseAbi } from 'viem';
import { withRpcFallback, networkLabel } from '@/lib/chain';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

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
      try {
        const entryFee = await withRpcFallback((client) =>
          client.readContract({
            address: TOURNAMENT_ADDRESS!,
            abi: tournamentAbi,
            functionName: 'entryFee',
          }),
        );

        const pricePerTicket = formatEther(entryFee);
        const totalPrice = formatEther(entryFee * BigInt(count));

        return NextResponse.json({
          pricePerTicket,
          count,
          totalPrice,
          currency: 'AVAX',
          network: networkLabel,
          tournamentContract: TOURNAMENT_ADDRESS,
        }, { headers: sec() });
      } catch (err) {
        console.error('[tickets/quote] RPC error:', err);
      }
    }

    // Fallback: static pricing
    const pricePerTicket = '0.01';
    const totalPrice = (parseFloat(pricePerTicket) * count).toFixed(4);

    return NextResponse.json({
      pricePerTicket,
      count,
      totalPrice,
      currency: 'AVAX',
      network: networkLabel,
      source: 'static',
    }, { headers: sec() });
  } catch (err) {
    console.error('[tickets/quote]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
