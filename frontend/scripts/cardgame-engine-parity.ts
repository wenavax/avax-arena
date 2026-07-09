/**
 * Determinism parity: the bundled Node engine (server/cardgame-engine.mjs, run by
 * the multiplayer server's live loop) must produce byte-identical results to the
 * TS engine (lib/cardgame/engine.ts, used by the Next.js settle route). If they
 * ever diverge — e.g. engine.ts was edited without rebuilding the bundle — a live
 * match would settle to a different ranking than players saw. This guards it.
 *
 *   node scripts/build-cardgame-engine.mjs && npx tsx scripts/cardgame-engine-parity.ts
 */
import * as TS from '../lib/cardgame/engine';
// @ts-ignore — generated JS bundle, no types (resolves when the bundle exists)
import * as MJS from '../../server/cardgame-engine.mjs';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// Build a realistic 4-seat action log with the TS engine's live loop.
function lrng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function buildInput(seed: string): TS.MPInput {
  const s = TS.initMatch(seed);
  const actions: TS.MPAction[] = [];
  const vehicles: Partial<Record<TS.Pid, string>>[] = [];
  const r = lrng('parity:' + seed);
  for (let round = 0; round < TS.CFG.ROUNDS; round++) {
    const resolved = TS.startRoundMP(s, { P1: 'EPIC' });
    vehicles.push({ ...resolved });
    let guard = 0;
    while (!TS.roundDone(s) && guard++ < TS.CFG.TIMEOUT_TICKS + 5) {
      const acts: Partial<Record<TS.Pid, number[]>> = {};
      for (const pid of TS.PIDS) {
        const p = s.players.find((x) => x.id === pid)!;
        if (!p.fin && s.t >= p.cdUntil && p.hand.length && r() < 0.28) {
          const play = [p.hand[p.hand.length - 1].id];
          acts[pid] = play; actions.push({ pid, round, tick: s.t, cardIds: play });
        }
      }
      TS.stepTickMP(s, acts, new Set());
    }
    TS.scoreRound(s);
  }
  return { vehicles, actions, botSeats: [] };
}

const SEEDS = ['0xabc123', 'match:parity', 'deadbeefcafe', 'ünïçödé', '0x424242'];
console.log('[parity] TS engine.ts  ==  bundled server/cardgame-engine.mjs');
for (const seed of SEEDS) {
  const input = buildInput(seed);
  const ts = TS.simulateMatchMP(seed, input);
  const mjs = MJS.simulateMatchMP(seed, input);
  const same = ts.valid && mjs.valid && ts.ranking.join('>') === mjs.ranking.join('>')
    && JSON.stringify(ts.totals) === JSON.stringify(mjs.totals);
  ok(same, `${seed}: ts=${ts.ranking.join('>')} mjs=${mjs.ranking.join('>')}`);
}
// also confirm the single-human path matches (mount uses simulateMatch)
console.log('[parity] single-human simulateMatch');
for (const seed of SEEDS) {
  const input = { vehicles: ['EPIC', 'COMMON', 'LEGENDARY'], plays: [] };
  const a = TS.simulateMatch(seed, input).ranking.join('>');
  const b = MJS.simulateMatch(seed, input).ranking.join('>');
  ok(a === b, `${seed}: ${a}`);
}
console.log(`\n${fail === 0 ? '★' : '✗'} ${pass}/${pass + fail} PASS — live-loop engine == settle engine.`);
process.exit(fail === 0 ? 0 : 1);
