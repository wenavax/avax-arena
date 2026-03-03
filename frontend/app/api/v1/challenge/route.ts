import { NextResponse } from 'next/server';
import { createChallenge } from '@/lib/challenge-store';

export const dynamic = 'force-dynamic';

/* ---------------------------------------------------------------------------
 * GET /api/v1/challenge
 * Returns a math verification challenge
 * ------------------------------------------------------------------------- */

export async function GET() {
  const { challengeId, question } = createChallenge();

  return NextResponse.json(
    {
      challengeId,
      question,
      expiresIn: '5 minutes',
    },
    { headers: { 'X-Content-Type-Options': 'nosniff' } },
  );
}

/* POST /api/v1/challenge — same as GET, create a new challenge */
export async function POST() {
  const { challengeId, question } = createChallenge();

  return NextResponse.json(
    {
      challengeId,
      question,
      expiresIn: '5 minutes',
    },
    { headers: { 'X-Content-Type-Options': 'nosniff' } },
  );
}
