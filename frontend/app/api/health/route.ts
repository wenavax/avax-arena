// Public, unauthenticated, cheap liveness + readiness probe.
// Served at /avalanche/api/health (next.config basePath = '/avalanche').
// Used by scripts/smoke-test.sh and as the post-deploy / blue-green cutover gate.
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic'; // never cache a health check

export async function GET() {
  try {
    // Cheapest possible readiness signal: DB is open and answering.
    const db = getDb();
    db.prepare('SELECT 1').get();
    return NextResponse.json(
      { ok: true, db: 'up', ts: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: 'down', error: String(err) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
