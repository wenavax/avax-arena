/**
 * CAR(D) GAME — Watch-mode prediction game. Bet-free: viewers pick the winner
 * of an unsettled on-chain match and earn COSMETIC points when the settlement
 * proves them right. Keeps eyeballs between the 5-minute slots (the lightweight
 * web3-spectator retention loop) with zero money involved and zero backend —
 * everything is device-local, resolved client-side against the public feed.
 */

export interface Prediction { matchId: string; pick: string; ts: number; resolved?: 'hit' | 'miss' }
export interface PredStats { points: number; correct: number; total: number; streak: number; bestStreak: number }

export const HIT_POINTS = 100;

const P_KEY = 'cg_predictions', S_KEY = 'cg_pred_stats';
const P_MAX = 50;

function readPreds(): Prediction[] {
  try { const a = JSON.parse(localStorage.getItem(P_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function writePreds(a: Prediction[]) { try { localStorage.setItem(P_KEY, JSON.stringify(a.slice(0, P_MAX))); } catch { /* private mode */ } }

export function getPredStats(): PredStats {
  const base: PredStats = { points: 0, correct: 0, total: 0, streak: 0, bestStreak: 0 };
  try { return { ...base, ...JSON.parse(localStorage.getItem(S_KEY) || '{}') }; } catch { return base; }
}
function writeStats(s: PredStats) { try { localStorage.setItem(S_KEY, JSON.stringify(s)); } catch { /* private mode */ } }

export function getPrediction(matchId: string): Prediction | undefined {
  return readPreds().find((p) => p.matchId === matchId);
}

/** Pick (or change) the winner call for an unsettled match. Changing is fine —
 *  the watcher sees no live race state, so there is nothing to exploit. */
export function setPrediction(matchId: string, pick: string): void {
  const preds = readPreds().filter((p) => p.matchId !== matchId || p.resolved);
  const existing = getPrediction(matchId);
  if (existing?.resolved) return; // settled calls are final
  writePreds([{ matchId, pick, ts: Date.now() }, ...preds]);
}

/** Score pending predictions against the settled matches in the feed.
 *  Returns the newly resolved ones so the UI can celebrate. */
export function resolvePredictions(settled: Array<{ matchId: string; winner: string }>): Prediction[] {
  const preds = readPreds();
  const byId = new Map(settled.map((s) => [s.matchId.toLowerCase(), s.winner.toLowerCase()]));
  const fresh: Prediction[] = [];
  const stats = getPredStats();
  // resolve in the order the calls were MADE — "streak" must mean consecutive
  // correct calls chronologically, not in storage (latest-first) order
  for (const p of [...preds].sort((a, b) => a.ts - b.ts)) {
    if (p.resolved) continue;
    const winner = byId.get(p.matchId.toLowerCase());
    if (!winner) continue;
    const hit = p.pick.toLowerCase() === winner;
    p.resolved = hit ? 'hit' : 'miss';
    stats.total += 1;
    if (hit) {
      stats.correct += 1; stats.points += HIT_POINTS;
      stats.streak += 1; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else stats.streak = 0;
    fresh.push(p);
  }
  if (fresh.length) { writePreds(preds); writeStats(stats); }
  return fresh;
}
