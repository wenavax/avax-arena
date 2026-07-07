/**
 * Headless full-match simulation with simple bots.
 * Proves the match state machine runs end-to-end and produces a settle payload.
 * Run: node simulate.js
 */
'use strict';
const { Match } = require('./match');
const { CONFIG, evaluatePlay } = require('./engine');

const TICK = 0.1; // 100ms ticks

// Very small bot: occasionally plays its best available action if off cooldown.
function botAct(match, p, t, rng) {
  if (p.finished || t < p.cardCooldownUntil || p.hand.length === 0) return;
  if (rng() > 0.25) return; // don't act every tick

  // Try to find a same-value group (pair/trio/quad) else play best single
  const byVal = new Map();
  p.hand.forEach((c, i) => {
    if (!byVal.has(c.value)) byVal.set(c.value, []);
    byVal.get(c.value).push(i);
  });
  let best = null;
  for (const [, idxs] of byVal) {
    if (idxs.length >= 2) {
      if (!best || idxs.length > best.length) best = idxs.slice(0, Math.min(idxs.length, 8));
    }
  }
  if (!best) {
    // play highest single
    let hi = 0;
    p.hand.forEach((c, i) => { if (c.value > p.hand[hi].value) hi = i; });
    best = [hi];
  }
  match.applyPlay(p, best, t);
}

function runRound(match, roundIndex, vehicleChoices, rng) {
  match.startRound(roundIndex, vehicleChoices);
  let t = 0;
  while (t < CONFIG.ROUND_TIMEOUT) {
    // bots act
    for (const p of match.players) botAct(match, p, t, rng);
    // physics
    for (const p of match.players) {
      if (p.finished) continue;
      const prev = p.distance;
      const v = match.speed(p, t);
      p.distance += v * TICK;
      match.triggerCheckpoints(p, prev, t);
      if (p.distance >= CONFIG.TRACK_LENGTH) {
        // interpolate finish time (17.2)
        const progressNeeded = CONFIG.TRACK_LENGTH - prev;
        const tickProgress = p.distance - prev;
        const ratio = tickProgress > 0 ? progressNeeded / tickProgress : 0;
        p.finished = true;
        p.finishTime = +(t + TICK * ratio).toFixed(3);
        p.distance = CONFIG.TRACK_LENGTH;
      }
    }
    if (match.players.every((p) => p.finished)) break;
    t += TICK;
  }
  return match.scoreRound();
}

function main() {
  const rng = require('./engine').makeRng(2025);
  const match = new Match({ matchId: 'demo-1', playerIds: ['P1', 'P2', 'P3', 'P4'], seed: 777 });
  match.dealStart();

  // Each bot picks a distinct vehicle per round (rotating) so no reuse.
  const rotations = [
    { P1: 'LEGENDARY', P2: 'EPIC', P3: 'COMMON', P4: 'LEGENDARY' },
    { P1: 'EPIC', P2: 'COMMON', P3: 'LEGENDARY', P4: 'EPIC' },
    { P1: 'COMMON', P2: 'LEGENDARY', P3: 'EPIC', P4: 'COMMON' },
  ];

  for (let r = 0; r < CONFIG.ROUNDS_PER_MATCH; r++) {
    const result = runRound(match, r, rotations[r], rng);
    console.log(`\nRound ${r + 1} result:`);
    result.forEach((x) => console.log(`  #${x.position} ${x.playerId}  finishTime=${x.finishTime ?? 'DNF'}`));
  }

  const final = match.finalRanking();
  console.log('\n=== FINAL RANKING ===');
  final.forEach((x) => console.log(`  #${x.position} ${x.playerId}  totalScore=${x.totalScore}`));

  // Settle payload (what the server signs & the contract verifies)
  const rewards = [2.0, 1.0, 0.5, 0.3];
  const settle = {
    matchId: match.matchId,
    seed: match.seed,
    ranking: final.map((x, i) => ({ ...x, rewardAVAX: rewards[i] })),
  };
  console.log('\nSettle payload (to be signed by server & verified on-chain):');
  console.log(JSON.stringify(settle, null, 2));
}

main();
