/* ---------------------------------------------------------------------------
 * Deterministic Daily Quest Rotation
 *
 * Uses FNV-1a hash + Mulberry32 PRNG to select 8 daily quests
 * (one per zone, difficulty mix) deterministically from the UTC date.
 * All players see the same quests on the same day.
 * ------------------------------------------------------------------------- */

/** FNV-1a hash — fast, well-distributed 32-bit hash */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 — seeded 32-bit PRNG, returns values in [0, 1) */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using a seeded RNG */
export function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Get UTC date string (YYYY-MM-DD) used as rotation seed */
export function getDailyRotationSeed(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Seconds until next UTC midnight */
export function secondsUntilReset(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}

/**
 * Select 8 daily quest IDs — one quest per zone, difficulty mix.
 * Difficulty distribution: 2 Easy, 2 Medium, 2 Hard, 2 Boss (shuffled across zones).
 */
export function getDailyQuestIds(
  allQuests: { id: number; zone_id: number; difficulty: string }[],
  date?: Date
): number[] {
  const dateStr = getDailyRotationSeed(date);
  const seed = fnv1a(dateStr);
  const rng = mulberry32(seed);

  // 2 of each difficulty, shuffled to assign to 8 zones
  const difficulties = ['Easy', 'Easy', 'Medium', 'Medium', 'Hard', 'Hard', 'Boss', 'Boss'];
  const shuffledDiffs = shuffleArray(difficulties, rng);

  const result: number[] = [];
  for (let zoneId = 0; zoneId < 8; zoneId++) {
    const zoneDiff = shuffledDiffs[zoneId];
    const candidates = allQuests.filter(
      (q) => q.zone_id === zoneId && q.difficulty === zoneDiff
    );
    if (candidates.length > 0) {
      const idx = Math.floor(rng() * candidates.length);
      result.push(candidates[idx].id);
    }
  }

  return result;
}
