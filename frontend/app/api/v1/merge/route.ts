import { NextRequest, NextResponse } from 'next/server';
import { getAgentById, getMergeHistory, recordMerge, addXp } from '@/lib/db-queries';

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

// POST /api/v1/merge — record a warrior merge
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      tokenId1,
      tokenId2,
      resultTokenId,
      txHash,
      element1,
      element2,
      resultElement,
      agentId,
    } = body;

    // Validate required fields
    if (!walletAddress || tokenId1 == null || tokenId2 == null || resultTokenId == null || !txHash) {
      return NextResponse.json(
        { error: 'walletAddress, tokenId1, tokenId2, resultTokenId, and txHash are required' },
        { status: 400 }
      );
    }

    // Validate tokens are different
    if (tokenId1 === tokenId2) {
      return NextResponse.json(
        { error: 'tokenId1 and tokenId2 must be different' },
        { status: 400 }
      );
    }

    // Record the merge — use walletAddress as agentId for wallet users
    const mergeId = recordMerge({
      agentId: walletAddress,
      tokenId1,
      tokenId2,
      resultTokenId,
      element1,
      element2,
      resultElement,
      txHash,
      success: true,
    });

    // Award XP if agentId is provided
    if (agentId) {
      addXp(agentId, 40, 'merge');
    }

    return NextResponse.json({
      success: true,
      mergeId,
      message: 'Merge recorded successfully',
    });
  } catch (err: any) {
    console.error('[POST /api/v1/merge] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
