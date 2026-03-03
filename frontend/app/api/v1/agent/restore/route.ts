import { NextResponse } from 'next/server';
import { restoreActiveLoops } from '@/lib/agent-engine';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST() {
  try {
    const { restored, errors } = restoreActiveLoops();

    return NextResponse.json({
      success: true,
      restored,
      errors,
      message: `Restored ${restored.length} agent loop(s)`,
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[restore]', err);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500, headers: securityHeaders() }
    );
  }
}
