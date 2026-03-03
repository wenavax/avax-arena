import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceListings } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

// GET /api/marketplace/auctions
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);

    if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters', code: 'INVALID_PAGINATION' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const limit = Math.min(rawLimit, 50);
    const { listings, total } = getMarketplaceListings(limit, rawOffset, 'active', 'auction');

    return NextResponse.json(
      {
        auctions: listings.map((l) => ({
          id: l.id,
          tokenId: l.token_id,
          seller: l.seller,
          price: l.price,
          status: l.status,
          txHash: l.tx_hash,
          createdAt: new Date(l.created_at).getTime(),
        })),
        pagination: { total, limit, offset: rawOffset },
      },
      { headers: { ...securityHeaders(), 'Cache-Control': 'public, max-age=10' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
