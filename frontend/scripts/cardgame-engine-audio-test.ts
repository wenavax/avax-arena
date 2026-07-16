/**
 * CAR(D) GAME — engine audio pure-math + SSR-safety tests. No DOM, no
 * AudioContext: verifies the gear/rpm/crossfade helpers and that the module
 * is inert-but-safe under plain node.
 *
 *   npx tsx scripts/cardgame-engine-audio-test.ts
 */
import { createEngineAudio, gearOf, gearRpm, loopWeights, rateFor } from '../lib/cardgame/engineAudio';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

console.log('gearOf — monotone gear ladder');
{
  ok(gearOf(0) === 0, 'gearOf(0) = 0');
  ok(gearOf(1) === 5, 'gearOf(1) = 5 (top gear)');
  let mono = true, seen = new Set<number>(), prev = -1;
  for (let s = 0; s <= 1.0001; s += 0.001) {
    const g = gearOf(Math.min(s, 1));
    if (g < prev) mono = false;
    prev = g; seen.add(g);
  }
  ok(mono, 'gearOf monotone non-decreasing across speed01 sweep');
  ok(seen.size === 6 && [...seen].every((g) => g >= 0 && g <= 5), 'gearOf covers exactly gears 0..5');
  ok(gearOf(-0.5) === 0 && gearOf(2) === 5, 'gearOf clamps out-of-range speed');
}

console.log('gearRpm — sawtooth within gears');
{
  let inRange = true;
  for (let s = 0; s <= 1.0001; s += 0.0005) {
    const r = gearRpm(Math.min(s, 1));
    if (r < 0.2 || r > 1.05) inRange = false;
  }
  ok(inRange, 'gearRpm stays in [0.2, 1.05] over dense sweep');
  // just below vs just above each gear boundary: high → low reset
  let resets = true;
  for (let g = 1; g < 6; g++) {
    const b = g / 6;
    if (!(gearRpm(b - 1e-4) > 0.9 && gearRpm(b + 1e-4) < 0.35)) resets = false;
  }
  ok(resets, 'gearRpm resets high→low at every gear boundary');
  ok(gearRpm(0.05) < gearRpm(0.1) && gearRpm(0.1) < gearRpm(0.16), 'gearRpm rises within a gear');
  ok(Math.abs(gearRpm(0) - 0.25) < 1e-9, 'gearRpm idles at 0.25');
}

console.log('loopWeights — crossfade gains');
{
  const n = 4;
  let sumsOk = true, nonNeg = true;
  for (let r = 0; r <= 1.05; r += 0.01) {
    const w = loopWeights(r, n);
    const sum = w.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6) sumsOk = false;
    if (w.some((v) => v < 0)) nonNeg = false;
  }
  ok(sumsOk, 'loopWeights sum to ≈1 across rpm sweep');
  ok(nonNeg, 'loopWeights never negative');
  const peak = (r: number) => { const w = loopWeights(r, n); return w.indexOf(Math.max(...w)); };
  ok(peak(0) === 0, 'low rpm (0) peaks at anchor 0');
  ok(peak(2 / 3) === 2, 'mid-high rpm (2/3) peaks at anchor 2');
  ok(peak(1) === 3, 'high rpm (1) peaks at top anchor');
  ok(loopWeights(0.5, 1).length === 1 && loopWeights(0.5, 1)[0] === 1, 'n=1 degenerate case returns [1]');
}

console.log('rateFor — playbackRate fine-tune');
{
  const n = 4;
  let bounded = true;
  for (let r = 0; r <= 1.05; r += 0.01) {
    for (let i = 0; i < n; i++) {
      const v = rateFor(r, i, n);
      if (v < 0.8 || v > 1.35) bounded = false;
    }
  }
  ok(bounded, 'rateFor within [0.8, 1.35] over rpm × anchor grid');
  let unity = true;
  for (let i = 0; i < n; i++) if (Math.abs(rateFor(i / (n - 1), i, n) - 1) > 1e-9) unity = false;
  ok(unity, 'rateFor = 1.0 exactly on each anchor');
  let mono = true, prev = 0;
  for (let r = 0; r <= 1.0001; r += 0.01) {
    const v = rateFor(r, 1, n);
    if (r > 0 && v < prev - 1e-12) mono = false;
    prev = v;
  }
  ok(mono, 'rateFor monotone non-decreasing in rpm for a fixed anchor');
}

console.log('SSR / plain-node safety — no window, no AudioContext');
{
  ok(typeof window === 'undefined', 'sanity: running without a window');
  let obj: ReturnType<typeof createEngineAudio> | null = null;
  let threw = false;
  try { obj = createEngineAudio(); } catch { threw = true; }
  ok(!threw && !!obj, 'createEngineAudio() does not throw under node');
  threw = false;
  try {
    obj!.raceOn(true);
    obj!.setState({ speed01: 0.3, boosted: false, fin: false });
    obj!.setState({ speed01: 0.6, boosted: true, fin: false });
    obj!.setState({ speed01: 0.1, boosted: false, fin: true });
    obj!.raceOn(false);
  } catch { threw = true; }
  ok(!threw, 'raceOn/setState are safe no-ops without AudioContext');
  threw = false;
  let t1 = true, t2 = false;
  try { const before = obj!.enabled(); t1 = obj!.toggle(); t2 = obj!.toggle(); ok(t1 !== before && t2 === before, 'toggle flips and returns the new state'); } catch { threw = true; fail++; }
  ok(!threw, 'toggle does not throw without localStorage side effects');
  threw = false;
  try { obj!.destroy(); obj!.setState({ speed01: 0.5, boosted: false, fin: false }); obj!.raceOn(true); } catch { threw = true; }
  ok(!threw, 'destroy() safe; post-destroy calls are inert');
}

console.log(`\n${pass}/${pass + fail} PASS`);
if (fail > 0) process.exit(1);
