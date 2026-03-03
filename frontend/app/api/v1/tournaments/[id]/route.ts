import { NextRequest, NextResponse } from 'next/server';
import { getTournament, getTournamentParticipants, joinTournament, getAgentById } from '@/lib/db-queries';
import { finalizeTournament, matchParticipants } from '@/lib/tournament-manager';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id, 10);
    const tournament = getTournament(tournamentId);

    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404, headers: securityHeaders() }
      );
    }

    const participants = getTournamentParticipants(tournamentId);
    const enrichedParticipants = participants.map(p => {
      const agent = getAgentById(p.agent_id);
      return {
        agentId: p.agent_id,
        agentName: agent?.name ?? 'Unknown',
        strategy: agent?.strategy_name ?? 'Unknown',
        score: p.score,
        wins: p.wins,
        losses: p.losses,
        joinedAt: p.joined_at,
      };
    });

    return NextResponse.json({
      tournament: {
        ...tournament,
        participants: enrichedParticipants,
        participantCount: participants.length,
      },
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[tournament-detail]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: securityHeaders() }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id, 10);
    const body = await req.json();
    const { action, agentId } = body;

    if (action === 'join') {
      if (!agentId) {
        return NextResponse.json(
          { error: 'agentId is required' },
          { status: 400, headers: securityHeaders() }
        );
      }

      const success = joinTournament(tournamentId, agentId);
      if (!success) {
        return NextResponse.json(
          { error: 'Cannot join tournament (full, already joined, or not upcoming)' },
          { status: 400, headers: securityHeaders() }
        );
      }

      return NextResponse.json({ success: true }, { headers: securityHeaders() });
    }

    if (action === 'match') {
      const pairs = matchParticipants(tournamentId);
      return NextResponse.json({ pairs }, { headers: securityHeaders() });
    }

    if (action === 'finalize') {
      const result = finalizeTournament(tournamentId);
      return NextResponse.json(result, { headers: securityHeaders() });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "join", "match", or "finalize".' },
      { status: 400, headers: securityHeaders() }
    );
  } catch (err) {
    console.error('[tournament-detail]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
