/**
 * CAR(D) GAME - Match orchestration & simulation.
 *
 * Implements the full match/round state machine, the per-tick physics loop,
 * checkpoints, scoring, tie-breaks and the final result payload that the
 * smart contract settles. Deterministic given a seed.
 */
'use strict';
const {
  CONFIG, evaluatePlay, buildDeck, makeRng, cardsGranted,
} = require('./engine');

const VEHICLE_NAMES = ['LEGENDARY', 'EPIC', 'COMMON'];

class Match {
  constructor({ matchId, playerIds, seed }) {
    this.matchId = matchId;
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.deck = buildDeck(this.rng);
    this.status = 'MATCHMAKING';
    this.currentRound = 0;
    this.players = playerIds.map((id) => ({
      playerId: id,
      usedVehicles: { LEGENDARY: false, EPIC: false, COMMON: false },
      currentVehicle: null,
      baseSpeed: 0,
      handLimit: 0,
      hand: [],
      distance: 0,
      finished: false,
      finishTime: null,
      cardCooldownUntil: 0,
      activeNonMagicPlayEffect: null,   // {multiplier, endsAt}
      activeMagicEffects: [],           // [{type, multiplier, endsAt}]
      roundScores: [],
      roundTimes: [],
      totalScore: 0,
      cpTriggered: new Set(),
    }));
  }

  draw(n) {
    return this.deck.splice(0, n);
  }

  dealStart() {
    for (const p of this.players) p.hand.push(...this.draw(CONFIG.START_CARDS));
  }

  // Automatic discard (4.6): lowest-value normals, then lowest magics, then oldest
  autoDiscardToLimit(p) {
    while (p.hand.length > p.handLimit) {
      p.hand.sort((a, b) => {
        // Normal considered less valuable than magic
        const typeRank = (c) => (c.type === 'NORMAL' ? 0 : 1);
        if (a.value !== b.value) return a.value - b.value;
        if (typeRank(a) !== typeRank(b)) return typeRank(a) - typeRank(b);
        return a.createdOrder - b.createdOrder;
      });
      p.hand.shift(); // remove lowest priority
    }
  }

  selectVehicle(p, vehicle) {
    if (p.usedVehicles[vehicle]) throw new Error(`Vehicle ${vehicle} already used by ${p.playerId}`);
    p.usedVehicles[vehicle] = true;
    p.currentVehicle = vehicle;
    p.baseSpeed = CONFIG.VEHICLES[vehicle].baseSpeed;
    p.handLimit = CONFIG.VEHICLES[vehicle].handLimit;
  }

  startRound(roundIndex, vehicleChoices) {
    this.currentRound = roundIndex + 1;
    this.status = 'RACE_ACTIVE';
    for (const p of this.players) {
      // 8.4 order: select vehicle -> discard -> grant round-start cards -> race
      const choice = vehicleChoices[p.playerId];
      this.selectVehicle(p, choice);
      this.autoDiscardToLimit(p);
      if (roundIndex > 0) {
        const grant = cardsGranted(p.handLimit, p.hand.length);
        p.hand.push(...this.draw(grant));
      }
      // reset per-round race state
      p.distance = 0;
      p.finished = false;
      p.finishTime = null;
      p.cardCooldownUntil = 0;
      p.activeNonMagicPlayEffect = null;
      p.activeMagicEffects = [];
      p.cpTriggered = new Set();
    }
  }

  currentMultiplier(p, t) {
    let nm = 1.0;
    if (p.activeNonMagicPlayEffect && t < p.activeNonMagicPlayEffect.endsAt) {
      nm = p.activeNonMagicPlayEffect.multiplier;
    }
    let magic = 1.0;
    for (const e of p.activeMagicEffects) {
      if (t < e.endsAt) magic *= e.multiplier;
    }
    return { nm, magic };
  }

  speed(p, t) {
    const { nm, magic } = this.currentMultiplier(p, t);
    return p.baseSpeed * nm * magic;
  }

  // Apply a validated card play at time t
  applyPlay(p, cardIndices, t) {
    if (p.finished) return { ok: false, reason: 'finished' };
    if (t < p.cardCooldownUntil) return { ok: false, reason: 'cooldown' };
    if (cardIndices.length < 1 || cardIndices.length > 8) return { ok: false, reason: 'card_count' };

    const cards = cardIndices.map((i) => p.hand[i]).filter(Boolean);
    if (cards.length !== cardIndices.length) return { ok: false, reason: 'card_not_in_hand' };

    const res = evaluatePlay(cards);

    // Non-magic effect (3s)
    if (res.nonMagicMultiplier !== 1.0 || res.kind === 'SINGLE' || res.kind === 'VALUE_PLAY') {
      p.activeNonMagicPlayEffect = { multiplier: res.nonMagicMultiplier, endsAt: t + CONFIG.EFFECT_DURATION };
    }

    // Magic effects
    for (const m of res.magicEffects) {
      if (m.target === 'SELF') {
        p.activeMagicEffects.push({ type: m.magicType, multiplier: m.multiplier, endsAt: t + CONFIG.EFFECT_DURATION });
      } else if (m.target === 'FASTEST_OPPONENT') {
        const target = this.fastestOpponent(p, t);
        if (target) target.activeMagicEffects.push({ type: m.magicType, multiplier: m.multiplier, endsAt: t + CONFIG.EFFECT_DURATION });
      } else if (m.target === 'ALL_OPPONENTS') {
        for (const q of this.players) {
          if (q !== p && !q.finished) q.activeMagicEffects.push({ type: m.magicType, multiplier: m.multiplier, endsAt: t + CONFIG.EFFECT_DURATION });
        }
      }
    }

    // remove played cards, start cooldown
    const idxSet = new Set(cardIndices);
    p.hand = p.hand.filter((_, i) => !idxSet.has(i));
    p.cardCooldownUntil = t + CONFIG.COOLDOWN;

    return { ok: true, eval: res };
  }

  fastestOpponent(p, t) {
    const opp = this.players.filter((q) => q !== p && !q.finished);
    if (opp.length === 0) return null;
    opp.sort((a, b) => {
      const sa = this.speed(a, t), sb = this.speed(b, t);
      if (sb !== sa) return sb - sa;               // highest speed
      if (b.distance !== a.distance) return b.distance - a.distance; // farther ahead
      return a.playerId.localeCompare(b.playerId);  // deterministic
    });
    return opp[0];
  }

  triggerCheckpoints(p, prevDist, t) {
    for (let i = 0; i < CONFIG.CHECKPOINTS.length; i++) {
      const cp = CONFIG.CHECKPOINTS[i];
      if (!p.cpTriggered.has(i) && p.distance >= cp && !p.finished) {
        p.cpTriggered.add(i);
        const grant = cardsGranted(p.handLimit, p.hand.length);
        p.hand.push(...this.draw(grant));
      }
    }
  }

  // Rank finishers first (by finishTime), then non-finishers by distance (18.2)
  roundRanking() {
    const finished = this.players.filter((p) => p.finished)
      .sort((a, b) => a.finishTime - b.finishTime);
    const notFinished = this.players.filter((p) => !p.finished)
      .sort((a, b) => b.distance - a.distance);
    return [...finished, ...notFinished];
  }

  scoreRound() {
    const ranking = this.roundRanking();
    ranking.forEach((p, i) => {
      const pos = i + 1;
      const pts = CONFIG.SCORE_BY_POSITION[pos];
      p.roundScores.push(pts);
      p.roundTimes.push(p.finishTime ?? CONFIG.ROUND_TIMEOUT);
      p.totalScore += pts;
    });
    return ranking.map((p, i) => ({ playerId: p.playerId, position: i + 1, finishTime: p.finishTime }));
  }

  // Final ranking with tie-breaks (3.3)
  finalRanking() {
    const arr = [...this.players];
    arr.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      const firstsA = a.roundScores.filter((s) => s === 5).length;
      const firstsB = b.roundScores.filter((s) => s === 5).length;
      if (firstsB !== firstsA) return firstsB - firstsA;
      const timeA = a.roundTimes.reduce((s, x) => s + x, 0);
      const timeB = b.roundTimes.reduce((s, x) => s + x, 0);
      if (timeA !== timeB) return timeA - timeB;
      return a.playerId.localeCompare(b.playerId);
    });
    return arr.map((p, i) => ({ playerId: p.playerId, position: i + 1, totalScore: p.totalScore }));
  }
}

module.exports = { Match, VEHICLE_NAMES };
