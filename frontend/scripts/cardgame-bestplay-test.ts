/**
 * CAR(D) GAME — bestPlay/bestPlan solver tests. Pure (no DOM, no chain).
 *
 *   npx tsx scripts/cardgame-bestplay-test.ts
 */
import { evaluate, makeRng, type Card } from '../lib/cardgame/engine';
import { bestPlan, bestPlay, planNote } from '../lib/cardgame/bestPlay';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

let nextId = 0;
const N = (value: number): Card => ({ id: nextId++, type: 'NORMAL', value, magic: null });
const M = (magic: string, value: number): Card => ({ id: nextId++, type: 'MAGIC', value, magic });
const gainOf = (cards: Card[]) => evaluate(cards).mult - 1;

console.log('bestPlan — partition beats single mega-combo');
{
  // 4,4,4,5,5: FULL_HOUSE ×2.54 (gain 1.54) vs TRIO + PAIR (gain ≈ 1.52+0.52)
  const hand = [N(4), N(4), N(4), N(5), N(5)];
  const plan = bestPlan(hand, { endgame: true });
  ok(plan.plays.length === 2, `splits into 2 plays (got ${plan.plays.length})`);
  ok(plan.plays[0].eval.combo === 'THREE_OF_A_KIND', `first play is the trio (got ${plan.plays[0].eval.combo})`);
  ok(plan.plays[1]?.eval.combo === 'PAIR', 'second play is the pair');
  const fullHouse = gainOf(hand);
  ok(plan.totalGain > fullHouse + 0.3, `plan gain ${plan.totalGain.toFixed(2)} > full house ${fullHouse.toFixed(2)}`);
  ok(bestPlay(hand).length === 3, 'bestPlay() returns the trio (back-compat: first play)');
}

console.log('bestPlan — respects the ×5 cap (does not stuff a capped play)');
{
  // 4×10 four-of-a-kind is already capped at ×5; a 5th 10 adds nothing inside
  // the play but is worth +0.2 as its own single.
  const hand = [N(10), N(10), N(10), N(10), N(10)];
  const plan = bestPlan(hand, { endgame: true });
  ok(plan.plays.length === 2, `cap-aware split (got ${plan.plays.length} plays)`);
  ok(plan.plays[0].cards.length === 4 && plan.plays[0].eval.mult === 5, 'quad capped at ×5');
  ok(plan.plays[1]?.cards.length === 1, 'fifth 10 fired separately');
}

console.log('bestPlan — hand economy (junk held mid-match, dumped in endgame)');
{
  const hand = [N(1), N(2), N(7), N(7)];
  const mid = bestPlan(hand);
  ok(mid.plays.length === 1 && mid.plays[0].eval.combo === 'PAIR', 'mid-match: only the pair is played');
  ok(mid.held.length === 2, `junk 1,2 held for future combos (held ${mid.held.length})`);
  const end = bestPlan(hand, { endgame: true });
  ok(end.held.length <= 1, `endgame: hand dumped (held ${end.held.length})`);
}

console.log('bestPlan — NITRO attaches to the strongest play');
{
  // NITRO's value must complete a legal combo to ride a play: value 6 turns the
  // 6-6-6 trio into a four-of-a-kind (the strongest legal play in the hand).
  const hand = [N(6), N(6), N(6), N(3), N(3), M('NITRO', 6)];
  const plan = bestPlan(hand, { endgame: true });
  const withNitro = plan.plays.find((p) => p.cards.some((c) => c.magic === 'NITRO'));
  ok(!!withNitro, 'nitro is played, not held');
  ok(withNitro === plan.plays[0], 'nitro rides the biggest play');
  ok(withNitro!.eval.legal && withNitro!.eval.combo === 'FOUR_OF_A_KIND', 'nitro completes a legal quad');
}

console.log('bestPlan — NAIL/OIL fired instead of hoarded');
{
  const hand = [N(2), N(9), M('NAIL', 3), M('OIL', 4)];
  const plan = bestPlan(hand);
  const played = plan.plays.flatMap((p) => p.cards);
  ok(played.some((c) => c.magic === 'NAIL'), 'NAIL in the plan');
  ok(played.some((c) => c.magic === 'OIL'), 'OIL in the plan');
}

console.log('bestPlay — legality on random hands');
{
  const rng = makeRng('bestplay-test');
  let legalAll = true, nonEmptyAll = true;
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(rng() * 10);
    const hand: Card[] = [];
    for (let i = 0; i < n; i++) {
      const r = rng();
      hand.push(r < 0.8 ? N(1 + Math.floor(rng() * 10))
        : M(['NITRO', 'NAIL', 'OIL'][Math.floor(rng() * 3)], 1 + Math.floor(rng() * 10)));
    }
    const pick = bestPlay(hand, { endgame: rng() < 0.5 });
    const ids = new Set(pick.map((c) => c.id));
    if (pick.length < 1 || pick.length > 8) nonEmptyAll = false;
    if (ids.size !== pick.length || !pick.every((c) => hand.includes(c))) legalAll = false;
    // every planned play must be legal too
    for (const p of bestPlan(hand).plays) {
      if (p.cards.length < 1 || p.cards.length > 8 || !p.cards.every((c) => hand.includes(c))) legalAll = false;
    }
  }
  ok(nonEmptyAll, '200 random hands: pick always 1–8 cards (button never no-ops)');
  ok(legalAll, '200 random hands: picks/plans are distinct in-hand cards');
}

console.log('bestPlan — plays are disjoint (a card fires once)');
{
  const rng = makeRng('disjoint');
  let disjoint = true;
  for (let trial = 0; trial < 100; trial++) {
    const hand: Card[] = Array.from({ length: 10 }, () => N(1 + Math.floor(rng() * 10)));
    const plan = bestPlan(hand, { endgame: true });
    const all = plan.plays.flatMap((p) => p.cards).concat(plan.held);
    if (new Set(all.map((c) => c.id)).size !== hand.length || all.length !== hand.length) disjoint = false;
  }
  ok(disjoint, '100 hands: plays + held exactly partition the hand');
}

console.log('bestPlan — never proposes an illegal (incomplete) play');
{
  // 2-2-6-8-10: the ONLY legal multi-card play is the pair 2-2. Best must never
  // suggest 6-8-10 (not consecutive) or any set with an unrelated extra card.
  const hand = [N(2), N(2), N(6), N(8), N(10)];
  const plan = bestPlan(hand, { endgame: true });
  const allLegal = plan.plays.every((p) => p.eval.legal);
  ok(allLegal, 'every planned play is legal (complete combo or single)');
  const pick = bestPlay(hand, { endgame: true });
  ok(pick.length === 1 || (pick.length === 2 && pick.every((c) => c.value === 2)),
    `Best picks the pair or a single, not 6-8-10 (got ${pick.map((c) => c.value).join('-')})`);
  // explicitly: no play equals the illegal {6,8,10}
  const has6810 = plan.plays.some((p) => {
    const vs = p.cards.map((c) => c.value).sort((a, b) => a - b).join(',');
    return vs === '6,8,10';
  });
  ok(!has6810, 'no plan play is the illegal 6-8-10 set');
}

console.log('bestPlan — determinism + note');
{
  const hand = [N(4), N(4), N(9), M('NITRO', 2)];
  const a = bestPlan(hand), b = bestPlan(hand);
  ok(JSON.stringify(a.plays.map((p) => p.cards.map((c) => c.id))) === JSON.stringify(b.plays.map((p) => p.cards.map((c) => c.id))), 'same hand → same plan');
  ok(planNote(a, 0).startsWith('✨ 1/'), `planNote renders (${planNote(a, 0)})`);
  ok(bestPlan([]).plays.length === 0 && bestPlay([]).length === 0, 'empty hand → empty plan/pick');
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ' — FAIL' : ''}`);
if (fail) process.exit(1);
