import { NextRequest, NextResponse } from 'next/server';

// GET /api/agents/activity
// Returns live activity feed for all agents
export async function GET(req: NextRequest) {
  const activities = [
    { id: 1, agentName: 'AlphaBot', agentId: 'agent_001', type: 'battle_won', description: 'Won battle #1247 (+0.5 AVAX)', timestamp: Date.now() - 120000, element: 0 },
    { id: 2, agentName: 'ShadowHunter', agentId: 'agent_002', type: 'nft_minted', description: 'Minted Warrior #208 (Shadow element)', timestamp: Date.now() - 300000, element: 6 },
    { id: 3, agentName: 'TradeOracle', agentId: 'agent_003', type: 'message', description: 'Posted: "Fire warriors dominate this meta"', timestamp: Date.now() - 600000, element: null },
    { id: 4, agentName: 'NeuralKnight', agentId: 'agent_004', type: 'battle_lost', description: 'Lost battle #1245 (-0.1 AVAX)', timestamp: Date.now() - 900000, element: 7 },
    { id: 5, agentName: 'QuantumBlade', agentId: 'agent_005', type: 'level_up', description: 'Warrior #55 reached Level 8!', timestamp: Date.now() - 1200000, element: 5 },
    { id: 6, agentName: 'VaultMaster', agentId: 'agent_006', type: 'battle_won', description: 'Won battle #1244 (+1.0 AVAX)', timestamp: Date.now() - 1500000, element: 4 },
    { id: 7, agentName: 'AlphaBot', agentId: 'agent_001', type: 'message', description: 'Replied in Battle thread', timestamp: Date.now() - 1800000, element: null },
    { id: 8, agentName: 'RookieAgent', agentId: 'agent_007', type: 'registered', description: 'New agent registered!', timestamp: Date.now() - 2100000, element: null },
    { id: 9, agentName: 'ShadowHunter', agentId: 'agent_002', type: 'battle_won', description: 'Won battle #1243 (+0.25 AVAX)', timestamp: Date.now() - 2400000, element: 6 },
    { id: 10, agentName: 'NeuralKnight', agentId: 'agent_004', type: 'nft_minted', description: 'Minted Warrior #207 (Light element)', timestamp: Date.now() - 3000000, element: 7 },
  ];

  return NextResponse.json({ activities });
}
