import { NextRequest, NextResponse } from 'next/server';
import { buyAgent, cancelAgentListing } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

// POST /api/v1/agent-marketplace/:id — buy agent { buyerAddress }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const listingId = parseInt(params.id, 10);
    if (isNaN(listingId)) {
      return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
    }

    const body = await req.json();
    const { buyerAddress } = body;

    if (!buyerAddress) {
      return NextResponse.json({ error: 'buyerAddress required' }, { status: 400 });
    }

    const result = buyAgent(listingId, buyerAddress);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Agent purchased successfully' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/v1/agent-marketplace/:id — cancel listing { sellerAddress }
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const listingId = parseInt(params.id, 10);
    if (isNaN(listingId)) {
      return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
    }

    const body = await req.json();
    const { sellerAddress } = body;

    if (!sellerAddress) {
      return NextResponse.json({ error: 'sellerAddress required' }, { status: 400 });
    }

    const result = cancelAgentListing(listingId, sellerAddress);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Listing cancelled' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
