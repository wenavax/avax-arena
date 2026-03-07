import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { getDecisions, getDecisionStats } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId query parameter is required', code: 'MISSING_AGENT_ID' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const detailed = url.searchParams.get('detailed') === 'true';
    const groupBy = url.searchParams.get('groupBy');

    // Daily summary mode
    if (groupBy === 'day') {
      const db = getDb();
      const rows = db.prepare(`
        SELECT
          DATE(created_at) as day,
          COUNT(*) as total_decisions,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN action = 'join_battle' OR action = 'create_battle' THEN 1 ELSE 0 END) as battles,
          SUM(CASE WHEN action = 'mint_warrior' THEN 1 ELSE 0 END) as mints,
          SUM(CASE WHEN action = 'post_message' THEN 1 ELSE 0 END) as messages,
          SUM(CASE WHEN action = 'wait' THEN 1 ELSE 0 END) as waits
        FROM agent_decisions
        WHERE agent_id = ?
        GROUP BY DATE(created_at)
        ORDER BY day DESC
        LIMIT ?
      `).all(agentId, limit) as {
        day: string;
        total_decisions: number;
        successes: number;
        battles: number;
        mints: number;
        messages: number;
        waits: number;
      }[];

      return NextResponse.json({ dailySummary: rows }, { headers: securityHeaders() });
    }

    const { decisions, total } = getDecisions(agentId, limit, offset);
    const stats = getDecisionStats(agentId);

    return NextResponse.json({
      decisions: decisions.map((d) => ({
        id: d.id,
        action: d.action,
        reasoning: d.reasoning,
        gameStateSummary: detailed ? (() => { try { return JSON.parse(d.game_state_summary || '{}'); } catch { return {}; } })() : undefined,
        battleId: d.battle_id,
        tokenId: d.token_id,
        stakeAmount: d.stake_amount,
        success: d.success === 1,
        txHash: d.tx_hash,
        createdAt: d.created_at,
      })),
      total,
      stats,
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[decisions]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
