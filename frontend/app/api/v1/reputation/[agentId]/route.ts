import { NextRequest, NextResponse } from 'next/server';
import { getReputationProfile } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

// GET /api/v1/reputation/:agentId — ERC-8004 compatible reputation JSON
export async function GET(
  _req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params;

  const profile = getReputationProfile(agentId);
  if (!profile) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json(profile, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
