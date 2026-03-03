import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceActivity } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

// GET /api/marketplace/activity
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
    const { sales, total } = getMarketplaceActivity(limit, rawOffset);

    return NextResponse.json(
      {
        sales: sales.map((s) => ({
          id: s.id,
          tokenId: s.token_id,
          seller: s.seller,
          buyer: s.buyer,
          price: s.price,
          type: s.type,
          txHash: s.tx_hash,
          createdAt: new Date(s.created_at).getTime(),
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
