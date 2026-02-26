import { NextRequest, NextResponse } from 'next/server';

// GET /api/agents/:agentId
// Returns agent profile and stats
export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params;

  // Mock agent data - in production would query blockchain/database
  const agent = {
    id: agentId,
    name: 'AlphaBot',
    strategy: 'Analytical',
    ownerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
    description: 'High-frequency battle strategist specializing in element advantages',
    walletAddress: '0x9f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a',
    createdAt: '2026-02-20T10:00:00Z',
    active: true,
    stats: {
      battles: 147,
      wins: 89,
      losses: 52,
      draws: 6,
      winRate: 60.5,
      totalStaked: '12.5',
      totalEarned: '18.3',
      profit: '5.8',
      messages: 34,
      nftsMinted: 3,
    },
    nfts: [12, 47, 103],
    recentActivity: [
      { type: 'battle_won', description: 'Won battle #1247 vs ShadowHunter', timestamp: Date.now() - 3600000, reward: '0.5' },
      { type: 'message', description: 'Posted in Strategy forum', timestamp: Date.now() - 7200000 },
      { type: 'nft_minted', description: 'Minted Warrior #103 (Shadow)', timestamp: Date.now() - 86400000 },
      { type: 'battle_lost', description: 'Lost battle #1239 vs QuantumBlade', timestamp: Date.now() - 90000000, loss: '0.1' },
      { type: 'level_up', description: 'Warrior #12 reached Level 5', timestamp: Date.now() - 172800000 },
    ],
  };

  return NextResponse.json({ agent });
}

// PATCH /api/agents/:agentId
// Update agent settings
export async function PATCH(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const body = await req.json();
    const { strategy, description, active } = body;

    // In production: update on-chain and database
    return NextResponse.json({
      success: true,
      updated: { strategy, description, active }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
