/**
 * CAR(D) GAME — "best play" solver for the ✨ Best button.
 *
 * Key game fact: a play's boost lasts DUR_TICKS and the cooldown is the same
 * length, so plays chain back-to-back with no overlap. The round reward of a
 * hand is therefore the SUM of (effective multiplier − 1) over a PARTITION of
 * the hand into plays — not the single biggest play. Example: 4,4,4,5,5 as
 * FULL_HOUSE ×2.54 gains 1.54, but TRIO ×2.52 then PAIR ×1.52 gains 2.04.
 *
 * `bestPlan` runs an exact partition DP over the hand (≤10 cards → ≤1024
 * subsets, submask sweep ≈ 3^n ≈ 59k steps — trivial):
 *   gain(play) = mult × NITRO^n − 1 + debuffBonus(NAIL/OIL) − HOLD × #cards
 * - NITRO multiplies the play it's in (the DP attaches nitros where they pay most).
 * - NAIL/OIL slow opponents; a flat bonus makes the solver fire them instead of
 *   hoarding (their card value also counts toward the play's combo, per evaluate).
 * - HOLD is the option value of keeping a card: rounds 2–3 only draw +3 at the
 *   start, so dumping junk singles (gain 0.02×v) is worse than saving them for
 *   future pairs. In the LAST round holding is worthless → pass endgame:true.
 *
 * Pure view-layer helper over the engine's evaluate(); never touches match
 * state, so it cannot affect determinism or the server re-simulation.
 */
import { evaluate, CFG, type Card, type PlayEval } from './engine';

const HOLD_COST = 0.06; // per-card option value of keeping it for later rounds
const DEBUFF_BONUS: Record<string, number> = { NAIL: 0.25, OIL: 0.45 };
const NITRO_M = CFG.MAGIC.NITRO.m; // 1.25 — stays in sync with the engine
const MAX_PLAY = 8; // applyPlay accepts 1–8 cards
const MAX_DP_N = 12; // hands are ≤10 by the rules; guard against pathological input

export interface PlannedPlay { cards: Card[]; eval: PlayEval; gain: number }
export interface Plan { plays: PlannedPlay[]; held: Card[]; totalGain: number }

function popcount(x: number): number { let c = 0; while (x) { x &= x - 1; c++; } return c; }

/** Effective speed gain of playing this subset now (see module doc). */
function playGain(cards: Card[], r: PlayEval, holdCost: number): number {
  let eff = r.mult, bonus = 0;
  for (const m of r.magic) {
    if (m.type === 'NITRO') eff *= NITRO_M;
    else bonus += DEBUFF_BONUS[m.type] ?? 0;
  }
  return eff - 1 + bonus - holdCost * cards.length;
}

/**
 * Optimal play sequence for the hand. Plays come sorted by gain (fire the
 * biggest first); `held` are cards worth keeping for later rounds.
 */
export function bestPlan(hand: Card[], opts?: { endgame?: boolean }): Plan {
  let cards = hand;
  if (cards.length > MAX_DP_N) cards = [...cards].sort((a, b) => b.value - a.value).slice(0, MAX_DP_N);
  const n = cards.length;
  if (n === 0) return { plays: [], held: [], totalGain: 0 };
  const holdCost = opts?.endgame ? 0 : HOLD_COST;

  // per-subset gain (only subsets of playable size)
  const full = (1 << n) - 1;
  const gains = new Float64Array(full + 1).fill(-Infinity);
  const evals: (PlayEval | null)[] = new Array(full + 1).fill(null);
  const pick: Card[] = [];
  for (let mask = 1; mask <= full; mask++) {
    if (popcount(mask) > MAX_PLAY) continue;
    pick.length = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) pick.push(cards[i]);
    const r = evaluate(pick);
    evals[mask] = r;
    gains[mask] = playGain(pick, r, holdCost);
  }

  // dp[mask] = best total gain over cards in mask (each either held or played);
  // ties prefer playing fewer cards (keeps the hand). choice[mask] = the play
  // containing mask's lowest bit, or 0 if that card is held.
  const dp = new Float64Array(full + 1);
  const dpUsed = new Int8Array(full + 1); // #cards played, for tie-breaks
  const choice = new Int32Array(full + 1);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    const rest = mask ^ low;
    // option: hold the low card
    let bg = dp[rest], bu = dpUsed[rest], bc = 0;
    // option: play a subset containing the low card
    for (let sub = rest; ; sub = (sub - 1) & rest) {
      const s = sub | low;
      const g = gains[s];
      if (g > 0) {
        const tot = g + dp[mask ^ s];
        const used = popcount(s) + dpUsed[mask ^ s];
        if (tot > bg + 1e-9 || (tot > bg - 1e-9 && used < bu)) { bg = tot; bu = used; bc = s; }
      }
      if (sub === 0) break;
    }
    dp[mask] = bg; dpUsed[mask] = bu; choice[mask] = bc;
  }

  // reconstruct
  const plays: PlannedPlay[] = [];
  const held: Card[] = [];
  let mask = full;
  while (mask) {
    const s = choice[mask];
    if (!s) {
      const low = mask & -mask;
      held.push(cards[Math.log2(low) | 0]);
      mask ^= low;
    } else {
      const pc: Card[] = [];
      for (let i = 0; i < n; i++) if (s & (1 << i)) pc.push(cards[i]);
      plays.push({ cards: pc, eval: evals[s]!, gain: gains[s] });
      mask ^= s;
    }
  }
  plays.sort((a, b) => b.gain - a.gain);
  if (hand.length > n) held.push(...[...hand].sort((a, b) => b.value - a.value).slice(n));
  return { plays, held, totalGain: dp[full] };
}

/** Back-compat: the play to make right now = strongest play of the optimal plan. */
export function bestPlay(hand: Card[], opts?: { endgame?: boolean }): Card[] {
  const plan = bestPlan(hand, opts);
  if (plan.plays.length) return plan.plays[0].cards;
  // everything is junk worth holding — still suggest the least-bad single so the
  // button never no-ops (player asked for a play; engine requires 1–8 cards)
  return hand.length ? [hand.reduce((a, b) => (b.value > a.value ? b : a))] : [];
}

/** Short English summary for the UI hint line, e.g.
 *  "✨ 1/3 · next: PAIR ×1.52 +OIL · hold 2". */
export function planNote(plan: Plan, idx: number): string {
  if (!plan.plays.length) return '';
  const label = (p: PlannedPlay) =>
    `${p.eval.combo || p.eval.kind} ×${p.eval.mult.toFixed(2)}` +
    (p.eval.magic.length ? ` +${p.eval.magic.map((m) => m.type).join('/')}` : '');
  const next = plan.plays[(idx + 1) % plan.plays.length];
  let s = `✨ ${idx + 1}/${plan.plays.length}`;
  if (plan.plays.length > 1) s += ` · next: ${label(next)}`;
  if (plan.held.length) s += ` · hold ${plan.held.length}`;
  return s;
}
