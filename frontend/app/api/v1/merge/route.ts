import { NextRequest, NextResponse } from 'next/server';
import { getAgentById, getMergeHistory } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

// GET /api/v1/merge?agentId=X — get merge history
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) {
    return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  }

  const agent = getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const merges = getMergeHistory(agentId);

  return NextResponse.json({
    agentId,
    merges: merges.map(m => ({
      id: m.id,
      tokenId1: m.token_id_1,
      tokenId2: m.token_id_2,
      resultTokenId: m.result_token_id,
      element1: m.element_1,
      element2: m.element_2,
      resultElement: m.result_element,
      txHash: m.tx_hash,
      success: m.success === 1,
      createdAt: m.created_at,
    })),
  });
}
