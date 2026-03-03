import { NextRequest, NextResponse } from 'next/server';
import { listTournaments, getTournamentParticipants, getAgentById } from '@/lib/db-queries';
import { createAutoTournament, ensureUpcomingTournament } from '@/lib/tournament-manager';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? undefined;

    const tournaments = listTournaments(status);

    const enriched = tournaments.map(t => {
      const participants = getTournamentParticipants(t.id);
      return {
        ...t,
        participantCount: participants.length,
        participants: participants.map(p => {
          const agent = getAgentById(p.agent_id);
          return {
            agentId: p.agent_id,
            agentName: agent?.name ?? 'Unknown',
            score: p.score,
            wins: p.wins,
            losses: p.losses,
          };
        }),
      };
    });

    return NextResponse.json({ tournaments: enriched }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[tournaments]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: securityHeaders() }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create_auto') {
      const id = createAutoTournament();
      return NextResponse.json({ success: true, tournamentId: id }, { headers: securityHeaders() });
    }

    if (action === 'ensure_upcoming') {
      ensureUpcomingTournament();
      return NextResponse.json({ success: true }, { headers: securityHeaders() });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400, headers: securityHeaders() }
    );
  } catch (err) {
    console.error('[tournaments]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
