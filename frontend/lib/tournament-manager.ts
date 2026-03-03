import {
  createTournament,
  listTournaments,
  getTournament,
  updateTournamentStatus,
  getTournamentParticipants,
  updateTournamentScore,
  addLiveEvent,
  getAgentById,
} from './db-queries';

/* ---------------------------------------------------------------------------
 * Auto Tournament Creation
 * ------------------------------------------------------------------------- */

const TOURNAMENT_NAMES = [
  'Frost Championship',
  'Shadow Brawl',
  'Element Clash',
  'Ice Storm Cup',
  'Thunder Dome',
  'Fire & Ice Invitational',
  'Arena Royale',
  'Avalanche Gauntlet',
];

/**
 * Create an automatic tournament starting in 6 hours from now.
 */
export function createAutoTournament(): number {
  const nameIndex = Math.floor(Date.now() / 1000) % TOURNAMENT_NAMES.length;
  const name = `${TOURNAMENT_NAMES[nameIndex]} #${Math.floor(Math.random() * 1000)}`;

  const startAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  return createTournament({
    name,
    entryFee: '0.01',
    maxPlayers: 8,
    startAt,
  });
}

/**
 * Check for upcoming tournaments that should start now.
 * Starts any tournament whose start_at <= now and has >= 2 participants.
 */
export function checkTournamentSchedule(): void {
  const upcoming = listTournaments('upcoming');
  const now = new Date().toISOString();

  for (const t of upcoming) {
    if (t.start_at <= now) {
      const participants = getTournamentParticipants(t.id);
      if (participants.length >= 2) {
        updateTournamentStatus(t.id, 'active');
        addLiveEvent({
          eventType: 'tournament_started',
          data: { tournamentId: t.id, name: t.name, participants: participants.length },
        });
      } else {
        // Not enough participants, cancel
        updateTournamentStatus(t.id, 'completed');
        addLiveEvent({
          eventType: 'tournament_cancelled',
          data: { tournamentId: t.id, name: t.name, reason: 'Not enough participants' },
        });
      }
    }
  }
}

/**
 * Round-robin matchmaking: pair participants.
 * Returns array of [agentId1, agentId2] pairs.
 */
export function matchParticipants(tournamentId: number): [string, string][] {
  const participants = getTournamentParticipants(tournamentId);
  const pairs: [string, string][] = [];

  // Simple round-robin: pair adjacent participants
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    pairs.push([shuffled[i].agent_id, shuffled[i + 1].agent_id]);
  }

  return pairs;
}

/**
 * Update tournament scores after a battle resolves.
 * Call this from battle resolution logic.
 */
export function updateTournamentScores(tournamentId: number, winnerId: string, loserId: string): void {
  updateTournamentScore(tournamentId, winnerId, true);
  updateTournamentScore(tournamentId, loserId, false);
}

/**
 * Finalize a tournament: determine winner, update status.
 */
export function finalizeTournament(tournamentId: number): {
  winnerId: string | null;
  standings: { agentId: string; score: number; wins: number; losses: number }[];
} {
  const participants = getTournamentParticipants(tournamentId);
  const standings = participants
    .map(p => ({
      agentId: p.agent_id,
      score: p.score,
      wins: p.wins,
      losses: p.losses,
    }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins);

  const winnerId = standings[0]?.agentId ?? null;

  updateTournamentStatus(tournamentId, 'completed', winnerId ?? undefined);

  // Emit event
  if (winnerId) {
    const winner = getAgentById(winnerId);
    const tournament = getTournament(tournamentId);
    addLiveEvent({
      eventType: 'tournament_completed',
      agentId: winnerId,
      agentName: winner?.name ?? 'Unknown',
      data: {
        tournamentId,
        name: tournament?.name,
        prizePool: tournament?.prize_pool,
        standings: standings.slice(0, 3),
      },
    });
  }

  return { winnerId, standings };
}

/**
 * Ensure there's always an upcoming tournament.
 * Call this periodically (e.g., every tick or every few minutes).
 */
export function ensureUpcomingTournament(): void {
  const upcoming = listTournaments('upcoming');
  if (upcoming.length === 0) {
    createAutoTournament();
  }
}
