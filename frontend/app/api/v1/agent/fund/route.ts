import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { getDailyFunded, addDailyFunded, addLiveEvent, getAgentByWallet } from '@/lib/db-queries';

const RPC_URL = process.env.NEXT_PUBLIC_FUJI_RPC_URL || 'https://avalanche-fuji-c-chain-rpc.publicnode.com';
const FUND_AMOUNT = parseEther('0.05');
const DAILY_FUND_LIMIT = parseEther('0.1'); // max 0.1 AVAX per agent per day

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentWallet } = body;

    if (!agentWallet) {
      return NextResponse.json(
        { error: 'agentWallet is required' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const faucetKey = process.env.FAUCET_PRIVATE_KEY;
    if (!faucetKey) {
      // No faucet configured, emit warning
      try {
        const dbAgent = getAgentByWallet(agentWallet);
        if (dbAgent) {
          addLiveEvent({
            eventType: 'low_balance',
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            data: { warning: 'Low balance and no faucet configured' },
          });
        }
      } catch { /* ignore */ }
      return NextResponse.json(
        { error: 'Faucet not configured', funded: false },
        { status: 503, headers: securityHeaders() }
      );
    }

    // Check daily limit
    const today = getTodayDateStr();
    const dailyFunded = getDailyFunded(agentWallet, today);
    if (dailyFunded + FUND_AMOUNT > DAILY_FUND_LIMIT) {
      return NextResponse.json(
        { error: 'Daily funding limit reached', funded: false, dailyFunded: formatEther(dailyFunded) },
        { status: 429, headers: securityHeaders() }
      );
    }

    // Send funds
    const faucetAccount = privateKeyToAccount(faucetKey as `0x${string}`);
    const walletClient = createWalletClient({
      account: faucetAccount,
      chain: avalancheFuji,
      transport: http(RPC_URL),
    });

    const hash = await walletClient.sendTransaction({
      to: agentWallet as `0x${string}`,
      value: FUND_AMOUNT,
    });

    // Record funding
    addDailyFunded(agentWallet, today, FUND_AMOUNT);

    // Emit event
    try {
      const dbAgent = getAgentByWallet(agentWallet);
      if (dbAgent) {
        addLiveEvent({
          eventType: 'agent_funded',
          agentId: dbAgent.id,
          agentName: dbAgent.name,
          data: { amount: formatEther(FUND_AMOUNT), txHash: hash },
        });
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      funded: true,
      amount: formatEther(FUND_AMOUNT),
      txHash: hash,
      dailyFunded: formatEther(dailyFunded + FUND_AMOUNT),
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[fund]', err);
    return NextResponse.json(
      { error: 'Internal server error', funded: false },
      { status: 500, headers: securityHeaders() }
    );
  }
}
