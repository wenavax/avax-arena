/**
 * CAR(D) GAME — device-local meta progression: match history, personal
 * records and bite-sized daily goals. Pure localStorage, zero backend —
 * a lightweight retention layer (research: daily goals + streaks are the
 * highest-leverage habit loop; personal bests beat a global leaderboard
 * while the player base is small).
 *
 * The mounts call recordMatch() at match end; the page listens for the
 * `cg:progress` window event and re-reads. Also owns the onboarding keys
 * (cg_races / cg_wins) that the ghost hints and the staked gate consume,
 * so every writer goes through one place.
 */

export interface MatchRecord {
  ts: number;                                  // ms epoch
  mode: 'practice' | 'staked' | 'mp';
  place: number;                               // 1..4
  pts: number;
  bestCombo: string | null;                    // strongest play's label
  bestMult: number;                            // strongest play's multiplier
  comboCards: number;                          // biggest play size (cards)
  prize?: string;                              // formatted, e.g. "◆ 2.0"
}

export interface Records {
  races: number; wins: number;
  streak: number; bestStreak: number;          // consecutive wins (any mode)
  bestMult: number; bestCombo: string | null;  // all-time strongest play
}

export interface Daily { date: string; races: number; won: number; bigCombo: number }

export const DAILY_GOALS: Array<{ key: keyof Omit<Daily, 'date'>; label: string; target: number }> = [
  { key: 'races', label: 'Race 3 times', target: 3 },
  { key: 'won', label: 'Win a race', target: 1 },
  { key: 'bigCombo', label: 'Play a 4-card combo', target: 1 },
];

const H_KEY = 'cg_history', R_KEY = 'cg_records', D_KEY = 'cg_daily';
const H_MAX = 20;

function read<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}
function readArr<T>(k: string): T[] {
  try { const v = localStorage.getItem(k); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
function today(): string { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

export function getHistory(): MatchRecord[] { return readArr<MatchRecord>(H_KEY); }
export function getRecords(): Records {
  return read<Records>(R_KEY, { races: 0, wins: 0, streak: 0, bestStreak: 0, bestMult: 0, bestCombo: null });
}
export function getDaily(): Daily {
  const d = read<Daily>(D_KEY, { date: today(), races: 0, won: 0, bigCombo: 0 });
  return d.date === today() ? d : { date: today(), races: 0, won: 0, bigCombo: 0 };
}

export function recordMatch(r: MatchRecord): void {
  // history (latest first, capped)
  write(H_KEY, [r, ...getHistory()].slice(0, H_MAX));

  // records: streaks + all-time strongest play
  const rec = getRecords();
  rec.races += 1;
  if (r.place === 1) { rec.wins += 1; rec.streak += 1; rec.bestStreak = Math.max(rec.bestStreak, rec.streak); }
  else rec.streak = 0;
  if (r.bestMult > rec.bestMult) { rec.bestMult = r.bestMult; rec.bestCombo = r.bestCombo; }
  write(R_KEY, rec);

  // daily goals
  const d = getDaily();
  d.races += 1;
  if (r.place === 1) d.won += 1;
  if (r.comboCards >= 4) d.bigCombo += 1;
  write(D_KEY, d);

  // onboarding keys (ghost hints + staked gate read these; practice-only)
  if (r.mode === 'practice') {
    try {
      localStorage.setItem('cg_races', String(+(localStorage.getItem('cg_races') || 0) + 1));
      if (r.place === 1) localStorage.setItem('cg_wins', String(+(localStorage.getItem('cg_wins') || 0) + 1));
    } catch { /* private mode */ }
  }

  try { window.dispatchEvent(new CustomEvent('cg:progress')); } catch { /* jsdom */ }
}
