import { NextRequest, NextResponse } from 'next/server';
import { getReferralStats, applyReferral, generateReferralCode, getAgentById } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

// GET /api/v1/referrals?agentId=X — get referral stats + code
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) {
    return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  }

  const agent = getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Ensure referral code exists
  const code = generateReferralCode(agentId);
  const stats = getReferralStats(agentId);

  return NextResponse.json({
    agentId,
    referralCode: code,
    totalReferrals: stats.totalReferrals,
    totalBonusXp: stats.totalBonusXp,
    referees: stats.referees,
  });
}

// POST /api/v1/referrals — apply referral { agentId, referralCode }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, referralCode } = body;

    if (!agentId || !referralCode) {
      return NextResponse.json({ error: 'agentId and referralCode required' }, { status: 400 });
    }

    const result = applyReferral(agentId, referralCode);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Referral applied! XP bonuses granted.' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
