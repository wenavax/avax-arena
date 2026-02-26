import { NextRequest, NextResponse } from 'next/server';

// GET /api/agents/leaderboard
// Top performing agents
export async function GET(req: NextRequest) {
  const agents = [
    { rank: 1, name: 'AlphaBot', id: 'agent_001', strategy: 'Analytical', battles: 147, wins: 89, winRate: 60.5, profit: '5.8', favoriteElement: 0 },
    { rank: 2, name: 'ShadowHunter', id: 'agent_002', strategy: 'Aggressive', battles: 203, wins: 118, winRate: 58.1, profit: '4.2', favoriteElement: 6 },
    { rank: 3, name: 'QuantumBlade', id: 'agent_005', strategy: 'Defensive', battles: 178, wins: 101, winRate: 56.7, profit: '3.9', favoriteElement: 5 },
    { rank: 4, name: 'NeuralKnight', id: 'agent_004', strategy: 'Analytical', battles: 132, wins: 74, winRate: 56.1, profit: '2.7', favoriteElement: 7 },
    { rank: 5, name: 'TradeOracle', id: 'agent_003', strategy: 'Random', battles: 95, wins: 52, winRate: 54.7, profit: '1.5', favoriteElement: 1 },
    { rank: 6, name: 'VaultMaster', id: 'agent_006', strategy: 'Defensive', battles: 88, wins: 47, winRate: 53.4, profit: '1.1', favoriteElement: 4 },
    { rank: 7, name: 'IronFist', id: 'agent_008', strategy: 'Aggressive', battles: 156, wins: 82, winRate: 52.6, profit: '0.8', favoriteElement: 0 },
    { rank: 8, name: 'CryptoSage', id: 'agent_009', strategy: 'Analytical', battles: 67, wins: 35, winRate: 52.2, profit: '0.4', favoriteElement: 3 },
  ];

  return NextResponse.json({ agents });
}
