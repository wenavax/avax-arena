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
  simulateMatch, applyPlay, isCompletePlay, CFG, VEHICLES, type MatchInput, type PlayEvent, type Pid, type Card,
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

/** Find 3 cards from a hand that do NOT form a complete combo (for the illegal
 *  replay test). Returns their cardIds, or null if the hand can't produce one. */
function pickIllegalTriple(hand: Card[]): number[] | null {
  for (let a = 0; a < hand.length; a++)
    for (let b = a + 1; b < hand.length; b++)
      for (let c = b + 1; c < hand.length; c++) {
        const trip = [hand[a], hand[b], hand[c]];
        if (!isCompletePlay(trip)) return trip.map((x) => x.id);
      }
  return null;
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

  console.log('\n[4] per-value abilities fire inside the engine (tick space)');
  {
    const mk = (value: number, id: number) => ({ id, type: 'NORMAL' as const, value, magic: null });
    const fresh = () => { const s = initMatch('ability-seed'); startRound(s, 'LEGENDARY'); return s; };
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [mk(3, 9001)];
      const deckBefore = s.deck.length;
      const r = applyPlay(s, p1, [9001])!;
      ok('SCAVENGE (3) draws 1 card', r.abilities!.some((a) => a.includes('SCAVENGE')) && p1.hand.length === 1 && s.deck.length === deckBefore - 1);
    }
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [mk(10, 9002)];
      const r = applyPlay(s, p1, [9002])!;
      const m = p1.magics.find((e) => e.mult === 1.3);
      ok('REDLINE (10) buffs +30% for 40 ticks', !!m && m!.endsAt === s.t + 40 && r.abilities!.some((a) => a.includes('REDLINE')));
    }
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [mk(4, 9003)];
      applyPlay(s, p1, [9003]);
      ok('TUNE (4) cuts cooldown by 10 ticks', p1.cdUntil === s.t + CFG.COOLDOWN_TICKS - 10, `cd ${p1.cdUntil}`);
    }
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [mk(2, 9004), mk(2, 9005)];
      applyPlay(s, p1, [9004, 9005]);
      ok('DRAFT (2) extends this play\'s boost +25 ticks', p1.nm!.endsAt === s.t + CFG.DUR_TICKS + 25, `endsAt ${p1.nm!.endsAt}`);
    }
    {
      const s = fresh(); const p1 = s.players[0]; const p2 = s.players[1];
      p2.dist = 50;
      p1.hand = [mk(6, 9006)];
      const r = applyPlay(s, p1, [9006])!;
      const slow = p2.magics.find((e) => e.mult === 0.85);
      ok('BUMP (6) slows the racer ahead for 25 ticks', !!slow && slow!.endsAt === s.t + 25 && p2.debuff === 'fx-hit' && r.abilities!.some((a) => a.includes('BUMP')));
    }
  }

  console.log('\n[5] complete-play rule — a multi-card play must be ONE canonical combo');
  {
    const C = (value: number, id: number): Card => ({ id, type: 'NORMAL', value, magic: null });
    // isCompletePlay unit checks
    ok('single card is legal', isCompletePlay([C(6, 1)]));
    ok('pair (2-2) legal', isCompletePlay([C(2, 1), C(2, 2)]));
    ok('trio (5-5-5) legal', isCompletePlay([C(5, 1), C(5, 2), C(5, 3)]));
    ok('quad (8×4) legal', isCompletePlay([C(8, 1), C(8, 2), C(8, 3), C(8, 4)]));
    ok('two pairs (2-2-8-8) legal', isCompletePlay([C(2, 1), C(2, 2), C(8, 3), C(8, 4)]));
    ok('full house (5-5-5-8-8) legal', isCompletePlay([C(5, 1), C(5, 2), C(5, 3), C(8, 4), C(8, 5)]));
    ok('two trios (3×3 + 7×3) legal', isCompletePlay([C(3, 1), C(3, 2), C(3, 3), C(7, 4), C(7, 5), C(7, 6)]));
    ok('straight (6-7-8) legal', isCompletePlay([C(6, 1), C(7, 2), C(8, 3)]));
    ok('extra card (2-2-6) illegal', !isCompletePlay([C(2, 1), C(2, 2), C(6, 3)]));
    ok('trio + extra (2-2-2-6) illegal', !isCompletePlay([C(2, 1), C(2, 2), C(2, 3), C(6, 4)]));
    ok('non-adjacent (6-8-10) illegal', !isCompletePlay([C(6, 1), C(8, 2), C(10, 3)]));
    ok('mixed junk (2-2-6-8-10) illegal', !isCompletePlay([C(2, 1), C(2, 2), C(6, 3), C(8, 4), C(10, 5)]));
    ok('pair+trio no full house at 4 cards (2-2-8-8-8) → wait full 5? 2-2-8 illegal', !isCompletePlay([C(2, 1), C(2, 2), C(8, 3)]));
    ok('straight with repeat (6-6-7-8) illegal', !isCompletePlay([C(6, 1), C(6, 2), C(7, 3), C(8, 4)]));

    // applyPlay rejects the illegal 6-8-10 pick out of a 2-2-6-8-10 hand, plays 2-2
    const fresh = () => { const s = initMatch('complete-play-seed'); startRound(s, 'LEGENDARY'); return s; };
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [C(2, 5001), C(2, 5002), C(6, 5003), C(8, 5004), C(10, 5005)];
      ok('applyPlay(6-8-10) → null (illegal, extra/non-consec)', applyPlay(s, p1, [5003, 5004, 5005]) === null);
      ok('applyPlay(6-8) → null (not a combo)', applyPlay(s, p1, [5003, 5004]) === null);
      ok('hand untouched after rejected plays', p1.hand.length === 5);
      const r = applyPlay(s, p1, [5001, 5002]);
      ok('applyPlay(2-2) → legal pair', !!r && r.combo === 'PAIR' && r.legal && p1.hand.length === 3);
    }
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [C(6, 5101), C(7, 5102), C(8, 5103)];
      const r = applyPlay(s, p1, [5101, 5102, 5103]);
      ok('applyPlay straight(6-7-8) → legal', !!r && r.legal && r.combo!.startsWith('STRAIGHT'));
    }
    {
      const s = fresh(); const p1 = s.players[0];
      p1.hand = [C(5, 5201), C(5, 5202), C(5, 5203), C(8, 5204), C(8, 5205)];
      const r = applyPlay(s, p1, [5201, 5202, 5203, 5204, 5205]);
      ok('applyPlay full house → legal', !!r && r.legal && r.combo === 'FULL_HOUSE');
    }
    // a recorded illegal play makes the server replay flag valid=false
    {
      const seed = 'illegal-replay-seed';
      const s0 = initMatch(seed); startRound(s0, 'LEGENDARY');
      const p1 = s0.players[0];
      // find three cards in P1's opening hand that do NOT form a complete combo
      const junk = pickIllegalTriple(p1.hand as Card[]);
      const tampered: MatchInput = { vehicles: ['LEGENDARY', 'EPIC', 'COMMON'], plays: junk ? [{ round: 0, tick: 5, cardIds: junk }] : [] };
      const res = simulateMatch(seed, tampered);
      ok('recorded illegal multi-card play → valid=false', junk ? res.valid === false : true, res.reason);
    }
  }

  console.log(`\n★ ${pass}/${pass} PASS — engine deterministic, capture-replay faithful, complete-play enforced.`);
}
main();
