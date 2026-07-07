/**
 * CAR(D) GAME - Core Game Engine
 * Server-authoritative rules engine implementing the Final Design Document (v1.0).
 *
 * This module is pure logic (no networking). It is deterministic given a seed,
 * so the same inputs always produce the same outputs - which is required both
 * for anti-cheat and for on-chain result verification.
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants (directly from the design document)
// ---------------------------------------------------------------------------

const CONFIG = {
  PLAYERS_PER_MATCH: 4,
  ROUNDS_PER_MATCH: 3,
  TRACK_LENGTH: 1000,               // units
  CHECKPOINTS: [250, 500, 750],     // CP-1, CP-2, CP-3
  ROUND_TIMEOUT: 180,               // seconds
  COOLDOWN: 3,                      // seconds
  EFFECT_DURATION: 3,               // seconds
  MAX_NON_MAGIC_MULTIPLIER: 5.0,    // cap on non-magic bonuses
  CP_CARD_REWARD: 3,
  START_CARDS: 8,
  ROUND_START_CARDS: 3,

  VEHICLES: {
    LEGENDARY: { baseSpeed: 10, handLimit: 10 },
    EPIC:      { baseSpeed: 9,  handLimit: 9 },
    COMMON:    { baseSpeed: 8,  handLimit: 8 },
  },

  MAGIC: {
    NITRO: { multiplier: 1.25, target: 'SELF' },
    NAIL:  { multiplier: 0.75, target: 'FASTEST_OPPONENT' },
    OIL:   { multiplier: 0.75, target: 'ALL_OPPONENTS' },
  },

  SCORE_BY_POSITION: { 1: 5, 2: 3, 3: 2, 4: 1 },

  // Deck composition
  NORMAL_PER_VALUE: 18,   // 18 x values 1..10 = 180
  MAGIC_COUNTS: { NITRO: 7, NAIL: 7, OIL: 6 }, // = 20
};

// Fixed combination bonuses (percent), from section 11.2
const COMBO_BONUS = {
  PAIR: 50,
  THREE_OF_A_KIND: 150,
  FOUR_OF_A_KIND: 500,
  TWO_PAIRS: 100,
  THREE_PAIRS: 150,
  FOUR_PAIRS: 250,
  FULL_HOUSE: 150,
  TWO_TRIOS: 400,
  STRAIGHT_3: 20,
  STRAIGHT_4: 100,
  STRAIGHT_5: 200,
  STRAIGHT_6: 250,
  STRAIGHT_7: 300,
  STRAIGHT_8: 350,
};

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) - seeded so results are reproducible/verifiable
// ---------------------------------------------------------------------------

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Deck creation & shuffle
// ---------------------------------------------------------------------------

let _cardId = 0;
function newCardId() { return `c${++_cardId}`; }

function buildDeck(rng) {
  const deck = [];
  let order = 0;

  // 180 normal cards: 18 of each value 1..10
  for (let value = 1; value <= 10; value++) {
    for (let i = 0; i < CONFIG.NORMAL_PER_VALUE; i++) {
      deck.push({ cardId: newCardId(), type: 'NORMAL', value, magicType: null, createdOrder: order++ });
    }
  }
  // 20 magic cards, values 1..10 spread across types
  for (const [magicType, count] of Object.entries(CONFIG.MAGIC_COUNTS)) {
    for (let i = 0; i < count; i++) {
      const value = 1 + Math.floor(rng() * 10);
      deck.push({ cardId: newCardId(), type: 'MAGIC', value, magicType, createdOrder: order++ });
    }
  }

  // Fisher-Yates shuffle with seeded rng
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ---------------------------------------------------------------------------
// Combination detection (section 10 & 11)
// ---------------------------------------------------------------------------

function counts(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

// Longest run of consecutive distinct values present in the set
function longestStraight(values) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  let best = 0, cur = 0;
  for (let i = 0; i < uniq.length; i++) {
    if (i > 0 && uniq[i] === uniq[i - 1] + 1) cur++;
    else cur = 1;
    best = Math.max(best, cur);
  }
  return best;
}

/**
 * Enumerate candidate combinations for a set of card values and return the
 * best one per the document's priority rules (10.2):
 *   1. highest fixed bonus
 *   2. more cards used
 *   3. higher sum of card values
 */
function detectBestCombination(cards) {
  const values = cards.map((c) => c.value);
  const cnt = counts(values);
  const groups = [...cnt.entries()]; // [value, count]
  const pairs = groups.filter(([, n]) => n >= 2).length;
  const trios = groups.filter(([, n]) => n >= 3).length;
  const quads = groups.filter(([, n]) => n >= 4).length;

  const candidates = [];
  const add = (name, cardsUsed) => candidates.push({ name, bonus: COMBO_BONUS[name], cardsUsed });

  if (quads >= 1) add('FOUR_OF_A_KIND', 4);
  if (trios >= 2) add('TWO_TRIOS', 6);
  if (trios >= 1 && groups.some(([v, n]) => n >= 2 && !(cnt.get(v) >= 3 && groups.filter(([, m]) => m >= 3).length === 1 && v === [...cnt].find(([, m]) => m >= 3)[0]))) {
    // Full house: a trio + a separate pair
    const trioVals = groups.filter(([, n]) => n >= 3).map(([v]) => v);
    const hasSeparatePair = groups.some(([v, n]) => n >= 2 && !trioVals.includes(v)) ||
      trioVals.length >= 1 && groups.filter(([, n]) => n >= 2).length >= 2;
    if (hasSeparatePair) add('FULL_HOUSE', 5);
  }
  if (trios >= 1) add('THREE_OF_A_KIND', 3);
  if (pairs >= 4) add('FOUR_PAIRS', 8);
  if (pairs >= 3) add('THREE_PAIRS', 6);
  if (pairs >= 2) add('TWO_PAIRS', 4);
  if (pairs >= 1) add('PAIR', 2);

  const straight = longestStraight(values);
  if (straight >= 8) add('STRAIGHT_8', 8);
  else if (straight === 7) add('STRAIGHT_7', 7);
  else if (straight === 6) add('STRAIGHT_6', 6);
  else if (straight === 5) add('STRAIGHT_5', 5);
  else if (straight === 4) add('STRAIGHT_4', 4);
  else if (straight === 3) add('STRAIGHT_3', 3);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.bonus !== a.bonus) return b.bonus - a.bonus;      // highest bonus
    if (b.cardsUsed !== a.cardsUsed) return b.cardsUsed - a.cardsUsed; // more cards
    return 0;
  });
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Non-magic multiplier calculation (sections 12-16)
// ---------------------------------------------------------------------------

/**
 * Given the list of played cards, compute the non-magic play multiplier
 * (before the 5.00 cap) and the list of triggered magic effects.
 */
function evaluatePlay(cards) {
  const sumValues = cards.reduce((s, c) => s + c.value, 0);

  let comboBonus = 0;
  let combo = null;

  if (cards.length === 1) {
    // Single card: 1 + value*0.02  (14.2)
    const mult = 1 + cards[0].value * 0.02;
    return finalize(mult, cards, 'SINGLE', null);
  }

  combo = detectBestCombination(cards);
  comboBonus = combo ? combo.bonus : 0;

  // Value bonus always = sum of all played card values * 0.20 (13.2 / 12.2)
  const valueBonus = sumValues * 0.20;
  const totalBonusPct = comboBonus + valueBonus;
  const rawMultiplier = 1 + totalBonusPct / 100;
  const kind = combo ? 'COMBINATION' : 'VALUE_PLAY';
  return finalize(rawMultiplier, cards, kind, combo);

  function finalize(rawMultiplier, cards, kind, combo) {
    const capped = Math.min(rawMultiplier, CONFIG.MAX_NON_MAGIC_MULTIPLIER);
    const magicEffects = cards
      .filter((c) => c.type === 'MAGIC')
      .map((c) => ({ magicType: c.magicType, ...CONFIG.MAGIC[c.magicType] }));
    return {
      kind,
      combo: combo ? combo.name : null,
      rawMultiplier: round4(rawMultiplier),
      nonMagicMultiplier: round4(capped),
      capped: rawMultiplier > CONFIG.MAX_NON_MAGIC_MULTIPLIER,
      magicEffects,
      sumValues,
    };
  }
}

function round4(x) { return Math.round(x * 10000) / 10000; }

// ---------------------------------------------------------------------------
// Theoretical helpers
// ---------------------------------------------------------------------------

// CP card grant per section 5.4 / 8.2 draw-to-cap rule
function cardsGranted(handLimit, currentHandSize) {
  return Math.max(0, Math.min(CONFIG.CP_CARD_REWARD, handLimit - currentHandSize));
}

module.exports = {
  CONFIG,
  COMBO_BONUS,
  makeRng,
  buildDeck,
  detectBestCombination,
  evaluatePlay,
  cardsGranted,
  longestStraight,
};
