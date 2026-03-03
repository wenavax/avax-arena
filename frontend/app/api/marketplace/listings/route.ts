import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceListings, createMarketplaceListing } from '@/lib/db-queries';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

// GET /api/marketplace/listings
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const type = searchParams.get('type') || undefined;
    const seller = searchParams.get('seller') || undefined;

    if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters', code: 'INVALID_PAGINATION' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const limit = Math.min(rawLimit, 50);
    const { listings, total } = getMarketplaceListings(limit, rawOffset, 'active', type, seller);

    return NextResponse.json(
      {
        listings: listings.map((l) => ({
          id: l.id,
          tokenId: l.token_id,
          seller: l.seller,
          price: l.price,
          type: l.type,
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

// POST /api/marketplace/listings
const ETHEREUM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const VALID_LISTING_TYPES = ['fixed', 'auction'] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenId, seller, price, type, txHash } = body;

    if (!tokenId || !seller || !price) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenId, seller, price', code: 'MISSING_FIELDS' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Validate seller is a valid Ethereum address
    if (!ETHEREUM_ADDRESS_RE.test(seller)) {
      return NextResponse.json(
        { error: 'seller must be a valid Ethereum address', code: 'INVALID_SELLER' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Validate price is a string representing a positive number
    const parsedPrice = parseFloat(price);
    if (typeof price !== 'string' || isNaN(parsedPrice) || !isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.json(
        { error: 'price must be a string representing a positive number', code: 'INVALID_PRICE' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Validate tokenId is a non-negative integer
    if (!Number.isInteger(tokenId) || tokenId < 0) {
      return NextResponse.json(
        { error: 'tokenId must be a non-negative integer', code: 'INVALID_TOKEN_ID' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Validate type if provided
    if (type !== undefined && !VALID_LISTING_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_LISTING_TYPES.join(', ')}`, code: 'INVALID_TYPE' },
        { status: 400, headers: securityHeaders() }
      );
    }

    const id = createMarketplaceListing({ tokenId, seller, price, type, txHash });

    return NextResponse.json(
      { success: true, id },
      { status: 201, headers: securityHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
