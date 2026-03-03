import { NextRequest, NextResponse } from 'next/server';
import {
  getMarketplaceListingByToken,
  getMarketplaceBids,
  getMarketplaceOffers,
} from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

// GET /api/marketplace/[tokenId]
export async function GET(
  _req: NextRequest,
  { params }: { params: { tokenId: string } }
) {
  try {
    const tokenId = parseInt(params.tokenId, 10);
    if (isNaN(tokenId) || tokenId < 0) {
      return NextResponse.json(
        { error: 'Invalid tokenId', code: 'INVALID_TOKEN_ID' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const listing = getMarketplaceListingByToken(tokenId);
    const bids = getMarketplaceBids(tokenId);
    const offers = getMarketplaceOffers(tokenId);

    return NextResponse.json(
      {
        tokenId,
        listing: listing
          ? {
              id: listing.id,
              seller: listing.seller,
              price: listing.price,
              type: listing.type,
              status: listing.status,
              txHash: listing.tx_hash,
              createdAt: new Date(listing.created_at).getTime(),
            }
          : null,
        bids: bids.map((b) => ({
          id: b.id,
          bidder: b.bidder,
          amount: b.amount,
          txHash: b.tx_hash,
          createdAt: new Date(b.created_at).getTime(),
        })),
        offers: offers.map((o) => ({
          id: o.id,
          offerer: o.offerer,
          amount: o.amount,
          status: o.status,
          txHash: o.tx_hash,
          createdAt: new Date(o.created_at).getTime(),
        })),
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
