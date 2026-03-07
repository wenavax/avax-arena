import { NextRequest, NextResponse } from 'next/server';
import { getActiveQuestsByWallet } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json({ error: 'wallet parameter required' }, { status: 400, headers: sec() });
    }

    const quests = getActiveQuestsByWallet(wallet);
    return NextResponse.json({ quests }, { headers: sec() });
  } catch (err) {
    console.error('[v1/quests/active]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
