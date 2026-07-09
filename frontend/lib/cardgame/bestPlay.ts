/**
 * CAR(D) GAME — "best play" solver for the ✨ Best button. Pure helper over the
 * engine's evaluate(): brute-forces every 1–8 card subset of the hand (hand ≤ 10
 * → ≤1024 subsets, trivial) and returns the highest-effective-multiplier play.
 *
 * Effective score = capped combo multiplier × 1.25^(#NITRO included), i.e. how
 * fast THIS play makes you. NAIL/OIL debuff opponents rather than boosting you,
 * so they don't score here (players fire those tactically themselves).
 * Ties prefer fewer cards, then lower total value — saves your hand.
 */
import { evaluate, type Card } from './engine';

export function bestPlay(hand: Card[]): Card[] {
  const n = hand.length;
  if (n === 0) return [];
  let best: Card[] = [hand[0]];
  let bestScore = -1, bestCount = 99, bestSum = 1e9;
  const pick: Card[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    if (count > 8) continue;
    pick.length = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { pick.push(hand[i]); sum += hand[i].value; }
    const r = evaluate(pick);
    const nitro = r.magic.filter((mg) => mg.type === 'NITRO').length;
    const score = r.mult * Math.pow(1.25, nitro);
    if (
      score > bestScore + 1e-9 ||
      (Math.abs(score - bestScore) <= 1e-9 && (count < bestCount || (count === bestCount && sum < bestSum)))
    ) {
      bestScore = score; bestCount = count; bestSum = sum; best = pick.slice();
    }
  }
  return best;
}
