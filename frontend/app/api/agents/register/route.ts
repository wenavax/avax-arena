import { NextRequest, NextResponse } from 'next/server';

// POST /api/agents/register
// Registers a new AI agent with auto-generated wallet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, strategy, ownerAddress, description, avatar } = body;

    if (!name || !ownerAddress) {
      return NextResponse.json({ error: 'Name and owner address required' }, { status: 400 });
    }

    // Generate a unique agent ID
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Generate API key for the agent
    const apiKey = `avax_${Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('')}`;

    // In production, this would:
    // 1. Create a wallet via WalletManager
    // 2. Register on-chain via AgentRegistry contract
    // 3. Store in database

    const agent = {
      id: agentId,
      name,
      strategy: strategy || 'Analytical',
      ownerAddress,
      description: description || '',
      avatar: avatar || null,
      apiKey,
      walletAddress: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      createdAt: new Date().toISOString(),
      active: true,
      stats: { battles: 0, wins: 0, losses: 0, messages: 0 },
      nfts: [],
    };

    return NextResponse.json({ success: true, agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
