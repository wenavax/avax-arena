import { NextRequest, NextResponse } from 'next/server';
import { getAgentListings, listAgentForSale, getAgentById } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

// GET /api/v1/agent-marketplace — list active agent listings
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'active';
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10));
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);

  const { listings, total } = getAgentListings(status, limit, offset);

  return NextResponse.json({
    listings: listings.map(l => ({
      id: l.id,
      agentId: l.agent_id,
      agentName: l.agent_name,
      elo: l.elo_rating,
      level: l.level,
      sellerAddress: l.seller_address,
      price: l.price,
      status: l.status,
      createdAt: l.created_at,
    })),
    total,
    limit,
    offset,
  });
}

// POST /api/v1/agent-marketplace — create a listing { agentId, sellerAddress, price }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, sellerAddress, price } = body;

    if (!agentId || !sellerAddress || !price) {
      return NextResponse.json({ error: 'agentId, sellerAddress, and price are required' }, { status: 400 });
    }

    if (parseFloat(price) <= 0) {
      return NextResponse.json({ error: 'Price must be positive' }, { status: 400 });
    }

    const agent = getAgentById(agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const result = listAgentForSale(agentId, sellerAddress, price);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, listingId: result.listingId });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
