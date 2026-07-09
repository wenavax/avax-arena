/**
 * CAR(D) GAME — multiplayer engine tests. Proves the generalized 4-seat engine
 * is deterministic and that a LIVE authoritative loop (what the multiplayer
 * server runs) replays bit-identically from its recorded action log — the
 * fraud-proof property that lets any match be independently audited.
 *
 *   npx tsx scripts/cardgame-engine-mp-test.ts
 */
import {
  initMatch, startRoundMP, stepTickMP, roundDone, scoreRound, finalRanking,
  simulateMatchMP, CFG, PIDS, VEHICLES, type MatchState, type MPAction, type MPInput, type Pid,
} from '../lib/cardgame/engine';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// tiny local RNG (independent of the engine) to script "human-like" seat play
function lrng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A scripted seat policy: sometimes play the best same-value group, else a high
 *  single. Reads the CURRENT hand so every returned play is legal. */
function decide(s: MatchState, pid: Pid, r: () => number): number[] | null {
  const p = s.players.find((x) => x.id === pid)!;
  if (p.fin || s.t < p.cdUntil || !p.hand.length || r() > 0.3) return null;
  const byv = new Map<number, number[]>();
  p.hand.forEach((c, i) => { (byv.get(c.value) ?? byv.set(c.value, []).get(c.value)!).push(i); });
  let best: number[] | null = null;
  byv.forEach((idxs) => { if (idxs.length >= 2 && (!best || idxs.length > best.length)) best = idxs.slice(0, 8); });
  if (!best) { let hi = 0; p.hand.forEach((c, i) => { if (c.value > p.hand[hi].value) hi = i; }); best = [hi]; }
  return best.map((i) => p.hand[i].id);
}

/** Run a live 4-seat match the way the server would; capture the action log. */
function liveMatch(seed: string, humanSeats: Pid[], vehiclePlan: Partial<Record<Pid, string>>[]) {
  const s = initMatch(seed);
  const botSeats = new Set<Pid>(PIDS.filter((p) => !humanSeats.includes(p)));
  const actions: MPAction[] = [];
  const vehicles: Partial<Record<Pid, string>>[] = [];
  const r = lrng('policy:' + seed);
  for (let round = 0; round < CFG.ROUNDS; round++) {
    const resolved = startRoundMP(s, vehiclePlan[round] ?? {});
    vehicles.push({ ...resolved });
    let guard = 0;
    while (!roundDone(s) && guard++ < CFG.TIMEOUT_TICKS + 5) {
      const acts: Partial<Record<Pid, number[]>> = {};
      for (const pid of humanSeats) {
        const play = decide(s, pid, r);
        if (play) { acts[pid] = play; actions.push({ pid, round, tick: s.t, cardIds: play }); }
      }
      stepTickMP(s, acts, botSeats);
    }
    scoreRound(s);
  }
  return { ranking: finalRanking(s), input: { vehicles, actions, botSeats: [...botSeats] } as MPInput };
}

const SEEDS = ['0xabc123', 'match:777', 'deadbeefcafe', 'ünïçödé-seed', '0x9999999999'];
const plan = (v: string) => [{ P1: v }, {}, {}] as Partial<Record<Pid, string>>[];

console.log('[1] MP determinism — same seed+input → same ranking');
for (const seed of SEEDS) {
  const { input } = liveMatch(seed, [...PIDS], plan('EPIC'));
  const a = simulateMatchMP(seed, input).ranking.join('>');
  const b = simulateMatchMP(seed, input).ranking.join('>');
  ok(a === b, `deterministic ${seed} (${a})`);
}

console.log('\n[2] live→replay — server loop == recorded-log replay (4 humans)');
for (const seed of SEEDS) {
  const { ranking, input } = liveMatch(seed, [...PIDS], plan('LEGENDARY'));
  const sim = simulateMatchMP(seed, input);
  ok(sim.valid && sim.ranking.join('>') === ranking.join('>'),
    `replay matches ${seed} (live ${ranking.join('>')} vs srv ${sim.ranking.join('>')})`);
}

console.log('\n[3] mixed 2 humans + 2 bot-fill — live→replay identical');
for (const seed of SEEDS) {
  const { ranking, input } = liveMatch(seed, ['P1', 'P3'], plan('COMMON'));
  const sim = simulateMatchMP(seed, input);
  ok(sim.valid && sim.ranking.join('>') === ranking.join('>'),
    `mixed replay ${seed} (${ranking.join('>')})`);
}

console.log('\n[4] anti-cheat — tampered MP input is rejected');
{
  const { input } = liveMatch('0xabc123', [...PIDS], plan('EPIC'));
  const bad: MPInput = { ...input, actions: [{ pid: 'P2', round: 0, tick: 1, cardIds: [999999] }, ...input.actions] };
  ok(simulateMatchMP('0xabc123', bad).valid === false, 'illegal cardId → valid=false');
  const dup: MPInput = { vehicles: input.vehicles, botSeats: [], actions: [
    { pid: 'P1', round: 0, tick: 5, cardIds: [] }, { pid: 'P1', round: 0, tick: 5, cardIds: [] },
  ] };
  ok(simulateMatchMP('0xabc123', dup).valid === false, 'duplicate (pid,tick) → valid=false');
}

console.log('\n[5] vehicle-choice capture — a seat that picks LEGENDARY gets speed 10');
{
  const { input } = liveMatch('0xabc123', [...PIDS], plan('LEGENDARY'));
  ok(input.vehicles[0].P1 === 'LEGENDARY' && CFG.VEH.LEGENDARY.s === 10, 'P1 round-1 pick recorded as LEGENDARY');
  ok(VEHICLES.length === 3, 'three vehicles available');
}

console.log(`\n${fail === 0 ? '★' : '✗'} ${pass}/${pass + fail} PASS — MP engine deterministic & replay-faithful.`);
process.exit(fail === 0 ? 0 : 1);
