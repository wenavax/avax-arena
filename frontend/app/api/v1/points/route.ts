import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

const VALID_ACTIVITIES = ['mint', 'fusion', 'market_buy', 'market_list'] as const;

export async function POST(request: NextRequest) {
  try {
    const { wallet, activity, count = 1 } = await request.json();

    if (!wallet || !activity) {
      return NextResponse.json({ error: 'wallet and activity required' }, { status: 400 });
    }

    if (!VALID_ACTIVITIES.includes(activity)) {
      return NextResponse.json({ error: `Invalid activity. Must be: ${VALID_ACTIVITIES.join(', ')}` }, { status: 400 });
    }

    for (let i = 0; i < Math.min(count, 50); i++) {
      recordActivity(wallet, activity);
    }

    return NextResponse.json({ success: true, activity, count });
  } catch (err) {
    console.error('[v1/points]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
