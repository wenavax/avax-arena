import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

function generateCode(): string {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

// GET /api/v1/wallet-referrals?wallet=0x... — get or create referral code + stats
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase();
  if (!wallet) {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Get or create referral code
    let row = db.prepare('SELECT referral_code FROM wallet_referral_codes WHERE wallet_address = ?')
      .get(wallet) as { referral_code: string } | undefined;

    if (!row) {
      const code = generateCode();
      db.prepare('INSERT INTO wallet_referral_codes (wallet_address, referral_code) VALUES (?, ?)')
        .run(wallet, code);
      row = { referral_code: code };
    }

    // Get referral stats
    const referrals = db.prepare('SELECT referee_wallet, created_at FROM wallet_referrals WHERE referrer_wallet = ? ORDER BY created_at DESC')
      .all(wallet) as { referee_wallet: string; created_at: string }[];

    // Check if this wallet was referred by someone
    const referredBy = db.prepare('SELECT referrer_wallet FROM wallet_referrals WHERE referee_wallet = ?')
      .get(wallet) as { referrer_wallet: string } | undefined;

    return NextResponse.json({
      referralCode: row.referral_code,
      totalReferrals: referrals.length,
      referrals: referrals.map(r => ({
        wallet: r.referee_wallet,
        date: r.created_at,
      })),
      referredBy: referredBy?.referrer_wallet || null,
    });
  } catch (err) {
    console.error('[wallet-referrals] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/wallet-referrals — apply referral { wallet, referralCode }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const wallet = body.wallet?.toLowerCase();
    const referralCode = body.referralCode?.toLowerCase();

    if (!wallet || !referralCode) {
      return NextResponse.json({ error: 'wallet and referralCode required' }, { status: 400 });
    }

    const db = getDb();

    // Check if already referred
    const existing = db.prepare('SELECT id FROM wallet_referrals WHERE referee_wallet = ?')
      .get(wallet);
    if (existing) {
      return NextResponse.json({ error: 'Already referred' }, { status: 400 });
    }

    // Find referrer by code
    const referrer = db.prepare('SELECT wallet_address FROM wallet_referral_codes WHERE referral_code = ?')
      .get(referralCode) as { wallet_address: string } | undefined;
    if (!referrer) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    }

    // Prevent self-referral
    if (referrer.wallet_address === wallet) {
      return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 });
    }

    // Apply referral
    db.prepare('INSERT INTO wallet_referrals (referrer_wallet, referee_wallet) VALUES (?, ?)')
      .run(referrer.wallet_address, wallet);

    return NextResponse.json({ success: true, message: 'Referral applied!' });
  } catch (err) {
    console.error('[wallet-referrals] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
