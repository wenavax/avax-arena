import {
  createSeason,
  getActiveSeason,
  listSeasons,
  updateSeasonStatus,
  takeSeasonSnapshot,
  finalizeSeasonRewards,
  type DbSeason,
} from './db-queries';

/* ---------------------------------------------------------------------------
 * Season Manager — lifecycle management
 * ------------------------------------------------------------------------- */

const SEASON_DURATION_DAYS = 7;

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Get the next season number based on existing seasons.
 */
function getNextSeasonNumber(): number {
  const seasons = listSeasons();
  if (seasons.length === 0) return 1;
  return Math.max(...seasons.map(s => s.number)) + 1;
}

/**
 * Generate a season name from its number.
 */
function getSeasonName(number: number): string {
  const names = [
    'Frost Dawn', 'Blizzard Rising', 'Avalanche Fury', 'Ice Storm',
    'Winter Siege', 'Frozen Depths', 'Crystal Assault', 'Glacier Clash',
    'Permafrost', 'Snowfall Legacy', 'Tundra War', 'Arctic Dominion',
  ];
  return `Season ${number}: ${names[(number - 1) % names.length]}`;
}

/**
 * Start a new season. Creates the season record and snapshots all agents.
 */
export function startNewSeason(): DbSeason | null {
  const active = getActiveSeason();
  if (active) return null; // already have an active season

  const number = getNextSeasonNumber();
  const now = new Date();
  const endDate = new Date(now.getTime() + SEASON_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const id = createSeason({
    name: getSeasonName(number),
    number,
    startAt: formatDate(now),
    endAt: formatDate(endDate),
    rewardPool: '0',
  });

  updateSeasonStatus(id, 'active');
  takeSeasonSnapshot(id);

  return {
    id,
    name: getSeasonName(number),
    number,
    status: 'active',
    start_at: formatDate(now),
    end_at: formatDate(endDate),
    reward_pool: '0',
    created_at: formatDate(now),
  };
}

/**
 * Finalize the active season — assign rewards, complete it, auto-start next.
 */
export function finalizeSeason(): boolean {
  const active = getActiveSeason();
  if (!active) return false;

  finalizeSeasonRewards(active.id);
  return true;
}

/**
 * Check if the active season has ended and finalize if so.
 * Called from agent-engine tick.
 */
export function checkSeasonSchedule(): void {
  const active = getActiveSeason();
  if (!active) return;

  const now = new Date();
  const endAt = new Date(active.end_at);

  if (now >= endAt) {
    finalizeSeason();
  }
}

/**
 * Ensure there's always an active season running.
 * If no active season, start one.
 */
export function ensureActiveSeason(): void {
  const active = getActiveSeason();
  if (!active) {
    startNewSeason();
  }
}
