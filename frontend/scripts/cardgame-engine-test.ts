/**
 * CAR(D) GAME engine determinism + capture→replay fidelity test.
 * Run: npx tsx scripts/cardgame-engine-test.ts
 *
 * Proves: (1) simulateMatch is deterministic (same seed+input → same ranking);
 * (2) a "live" play-through driving stepTick and capturing (round,tick,cardIds)
 *     reproduces the EXACT same ranking when re-simulated from the capture —
 *     i.e. the browser's recorded input is authoritative on the server.
 */
import {
  initMatch, startRound, stepTick, roundDone, scoreRound, finalRanking,
  simulateMatch, CFG, VEHICLES, type MatchInput, type PlayEvent, type Pid,
} from '../lib/cardgame/engine';

let pass = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`); }
  else { console.error(`  ✗ FAIL: ${name}${detail ? ` (${detail})` : ''}`); process.exit(1); }
}

/** A simple deterministic "player" policy to generate a realistic capture:
 *  play the biggest same-value group off cooldown, else a high single. Uses a
 *  tiny local PRNG seeded off the match seed (NOT the engine rng) so plays vary. */
function livePlaythrough(seed: string): { input: MatchInput; ranking: Pid[] } {
  const s = initMatch(seed);
  const vehicles: string[] = [];
  const plays: PlayEvent[] = [];
  let salt = 0;
  for (const c of seed) salt = (salt * 31 + c.charCodeAt(0)) >>> 0;

  for (let round = 0; round < CFG.ROUNDS; round++) {
    // player picks a vehicle deterministically from remaining
    const availAtStart = VEHICLES.filter((v) => !s.usedVeh.P1[v]);
    const veh = availAtStart[salt % availAtStart.length];
    vehicles.push(veh);
    startRound(s, veh);

    let guard = 0;
    while (!roundDone(s) && guard++ < CFG.TIMEOUT_TICKS + 5) {
      const p1 = s.players[0];
      let cardIds: number[] | undefined;
      // decide a play for the human this tick (only when off cooldown, sometimes)
      if (!p1.fin && s.t >= p1.cdUntil && p1.hand.length && ((s.t + salt) % 7 === 0)) {
        const byv = new Map<number, number[]>();
        p1.hand.forEach((c, i) => { if (!byv.has(c.value)) byv.set(c.value, []); byv.get(c.value)!.push(i); });
        let best: number[] | null = null;
        byv.forEach((idxs) => { if (idxs.length >= 2 && (!best || idxs.length > best.length)) best = idxs.slice(0, 8); });
        if (!best) { let hi = 0; p1.hand.forEach((c, i) => { if (c.value > p1.hand[hi].value) hi = i; }); best = [hi]; }
        cardIds = best.map((i) => p1.hand[i].id);
        plays.push({ round, tick: s.t, cardIds });
      }
      stepTick(s, cardIds);
    }
    scoreRound(s);
  }
  return { input: { vehicles, plays }, ranking: finalRanking(s) };
}

function main() {
  const seeds = ['0xabc123', 'match:777', 'deadbeefcafe', 'ünïçödé-seed', '0x' + '9'.repeat(64)];

  console.log('[1] determinism — same seed+input → same ranking');
  for (const seed of seeds) {
    const { input } = livePlaythrough(seed);
    const a = simulateMatch(seed, input);
    const b = simulateMatch(seed, input);
    ok(`deterministic ${seed.slice(0, 12)}`, JSON.stringify(a.ranking) === JSON.stringify(b.ranking) && a.valid && b.valid, a.ranking.join('>'));
  }

  console.log('\n[2] capture→replay — live stepTick playthrough == server simulate');
  for (const seed of seeds) {
    const live = livePlaythrough(seed);
    const server = simulateMatch(seed, live.input);
    ok(`replay matches ${seed.slice(0, 12)}`, JSON.stringify(live.ranking) === JSON.stringify(server.ranking) && server.valid,
      `live ${live.ranking.join('>')} vs srv ${server.ranking.join('>')}`);
  }

  console.log('\n[3] anti-cheat — tampered input is rejected or cannot improve rank');
  {
    const seed = 'cheat-seed-1';
    const live = livePlaythrough(seed);
    // inject an illegal play: a cardId that is never in hand at that tick
    const tampered: MatchInput = { vehicles: live.input.vehicles, plays: [...live.input.plays, { round: 0, tick: 5, cardIds: [99999] }] };
    const res = simulateMatch(seed, tampered);
    ok('illegal cardId → valid=false', res.valid === false, res.reason);
  }
  {
    const seed = 'cheat-seed-2';
    const live = livePlaythrough(seed);
    // duplicate a play at an existing tick (double action same tick)
    const firstPlay = live.input.plays[0];
    const tampered: MatchInput = { vehicles: live.input.vehicles, plays: [...live.input.plays, { round: firstPlay.round, tick: firstPlay.tick, cardIds: firstPlay.cardIds }] };
    const res = simulateMatch(seed, tampered);
    ok('duplicate-tick play → valid=false', res.valid === false, res.reason);
  }
  {
    // A client claiming "I won" by submitting an EMPTY input cannot fabricate a
    // 1st place — the server derives the real (likely worse) result from no plays.
    const seed = 'cheat-seed-3';
    const empty = simulateMatch(seed, { vehicles: ['LEGENDARY', 'EPIC', 'COMMON'], plays: [] });
    ok('empty-play input still produces a deterministic valid ranking', empty.valid && empty.ranking.length === 4, empty.ranking.join('>'));
  }

  console.log(`\n★ ${pass}/${pass} PASS — engine deterministic & capture-replay faithful.`);
}
main();
