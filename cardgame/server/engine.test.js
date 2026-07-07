/**
 * Verifies the engine against worked examples in the design document.
 * Run: node engine.test.js
 */
'use strict';
const { evaluatePlay, detectBestCombination, buildDeck, makeRng, cardsGranted, CONFIG } = require('./engine');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Math.abs(got - want) < 1e-6;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${got} want=${want}`);
  ok ? pass++ : fail++;
}
function is(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${got} want=${want}`);
  ok ? pass++ : fail++;
}

const N = (value) => ({ type: 'NORMAL', value, magicType: null });
const M = (magicType, value) => ({ type: 'MAGIC', value, magicType });

// 14.2 Single card: value 10 -> 1.20
is('single 10 multiplier', evaluatePlay([N(10)]).nonMagicMultiplier, 1.20);
is('single 5 multiplier', evaluatePlay([N(5)]).nonMagicMultiplier, 1.10);

// 13.3 Example 10-10-1-5 -> Pair(50%) + 26*0.20=5.2% -> 1.552
{
  const r = evaluatePlay([N(10), N(10), N(1), N(5)]);
  is('10-10-1-5 combo', r.combo, 'PAIR');
  eq('10-10-1-5 multiplier', r.nonMagicMultiplier, 1.552);
}

// 12.2 Value Play 2-5-9 (no combo) -> 16*0.20=3.2% -> 1.032
{
  const r = evaluatePlay([N(2), N(5), N(9)]);
  is('2-5-9 is value play', r.kind, 'VALUE_PLAY');
  eq('2-5-9 multiplier', r.nonMagicMultiplier, 1.032);
}

// 16.4 Four of a Kind 10-10-10-10 -> 500% + 40*0.20=8% = 508% raw 6.08, capped 5.00
{
  const r = evaluatePlay([N(10), N(10), N(10), N(10)]);
  is('four of a kind combo', r.combo, 'FOUR_OF_A_KIND');
  eq('4oak raw multiplier', r.rawMultiplier, 6.08);
  eq('4oak capped multiplier', r.nonMagicMultiplier, 5.00);
  is('4oak was capped', r.capped, true);
}

// Combination detection priority
is('detect four of a kind', detectBestCombination([N(9),N(9),N(9),N(9)]).name, 'FOUR_OF_A_KIND');
is('detect two pairs', detectBestCombination([N(10),N(10),N(6),N(6)]).name, 'TWO_PAIRS');
is('detect three pairs', detectBestCombination([N(2),N(2),N(5),N(5),N(9),N(9)]).name, 'THREE_PAIRS');
is('detect two trios', detectBestCombination([N(5),N(5),N(5),N(9),N(9),N(9)]).name, 'TWO_TRIOS');
is('detect 5-straight', detectBestCombination([N(3),N(4),N(5),N(6),N(7)]).name, 'STRAIGHT_5');
is('detect 8-straight', detectBestCombination([N(1),N(2),N(3),N(4),N(5),N(6),N(7),N(8)]).name, 'STRAIGHT_8');

// Single magic Nitro 8: single bonus 16% AND magic effect present
{
  const r = evaluatePlay([M('NITRO', 8)]);
  eq('nitro8 single multiplier', r.nonMagicMultiplier, 1.16);
  is('nitro8 magic count', r.magicEffects.length, 1);
  eq('nitro8 magic mult', r.magicEffects[0].multiplier, 1.25);
}

// Deck: 200 cards, 20 magic, 180 normal
{
  const deck = buildDeck(makeRng(12345));
  is('deck size', deck.length, 200);
  is('magic count', deck.filter(c => c.type === 'MAGIC').length, 20);
  is('normal count', deck.filter(c => c.type === 'NORMAL').length, 180);
}

// CP draw-to-cap (5.4): full hand -> 0, 8/10 -> 2
is('cp grant full hand', cardsGranted(10, 10), 0);
is('cp grant 8/10', cardsGranted(10, 8), 2);
is('cp grant 9/10 caps at empty', cardsGranted(10, 9), 1);

// Speed example: Legendary four of a kind = 10 * 5.00 = 50; with Nitro = 62.5
{
  const base = CONFIG.VEHICLES.LEGENDARY.baseSpeed;
  eq('legendary 4oak speed', base * 5.00, 50);
  eq('legendary 4oak + nitro', base * 5.00 * 1.25, 62.5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
