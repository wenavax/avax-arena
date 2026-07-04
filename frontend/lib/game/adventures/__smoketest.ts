// ─── Frostbite Adventures engine smoke test ───
// Run: npx tsx lib/game/adventures/__smoketest.ts   (from frontend/)
// Deterministic: all time is passed explicitly, no Date.now() in assertions.
import { createInitialState } from './heroes';
import {
  stakeHero, unstakeHero, claimZone, claimAll, levelUpHero, settle,
  costToNextLevel, emissionCap, gateCheck, heroWeight, ratePerSec, totalRatePerSec, DEMO_SPEED,
} from './engine';
import { ZONE_BY_ID } from './zones';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name}`, extra ?? ''); }
}

console.log('Frostbite Adventures — engine smoke test\n');

// ── gates ──
let s = createInitialState();
const t0 = 1_000_000_000_000;
s.lastSettle = t0;
const ember = s.roster.find((h) => h.id === 'demo:1')!;   // fire rare L12
const terron = s.roster.find((h) => h.id === 'demo:4')!;  // earth common L5
const volt = s.roster.find((h) => h.id === 'demo:5')!;    // thunder legendary L22
const rime = ZONE_BY_ID['rime-river'];
const lake = ZONE_BY_ID['great-frostlake'];

check('Ember passes Rime River gate (L12≥10)', gateCheck(rime, ember).ok);
check('Terron fails Rime River gate (L5<10)', !gateCheck(rime, terron).ok, gateCheck(rime, terron).reason);
check('Ember fails Frostlake gate (L12<20)', !gateCheck(lake, ember).ok);
check('Volt passes Frostlake gate (L22≥20)', gateCheck(lake, volt).ok);

// ── staking respects gates ──
s = stakeHero(s, t0, 'demo:4', 'rime-river');
check('Terron NOT staked (gate fail)', s.positions.length === 0);
s = stakeHero(s, t0, 'demo:1', 'rime-river');
check('Ember staked in Rime River', s.positions.length === 1 && s.positions[0].heroId === 'demo:1');
s = stakeHero(s, t0, 'demo:1', 'frostpond');
check('Ember cannot double-stake', s.positions.length === 1);

// ── accrual over 10 game-seconds ──
const t1 = t0 + 10_000; // 10 real seconds
s = settle(s, t1);
const emberPos = s.positions[0];
const expected10s = (rime.ratePerMin / 60) * DEMO_SPEED * 10; // single hero → whole pool
check('Accrued ≈ full zone pool for 10s (single staker)',
  Math.abs(emberPos.accrued - Math.min(emissionCap(ember.level), expected10s)) < 0.01,
  { accrued: emberPos.accrued, expected: expected10s });
check('ratePerSec matches zone/60 (single staker)',
  Math.abs(ratePerSec(s, 'demo:1') - (rime.ratePerMin / 60) * DEMO_SPEED) < 1e-6);

// ── emission cap locks accrual ──
const tCap = t1 + 10_000_000; // huge span
s = settle(s, tCap);
check('Accrued clamped to emissionCap', Math.abs(s.positions[0].accrued - emissionCap(ember.level)) < 1e-6);
check('Capped hero earns 0/sec', ratePerSec(s, 'demo:1') === 0);

// ── claim banks floored accrued, resets ──
const cap = emissionCap(ember.level);
s = claimZone(s, tCap, 'rime-river');
check('Claim banked ~cap shards', s.shards === Math.floor(cap), { shards: s.shards, cap });
check('Position reset to 0 after claim', s.positions[0].accrued === 0);

// ── level up burns shards, raises level + cap ──
const lvlBefore = ember.level;
const costNow = costToNextLevel(lvlBefore);
const shardsBefore = s.shards;
s = levelUpHero(s, tCap, 'demo:1');
const emberAfter = s.roster.find((h) => h.id === 'demo:1')!;
check('Level up +1 level', emberAfter.level === lvlBefore + 1);
check('Level up burned exactly costToNextLevel', s.shards === shardsBefore - costNow);
check('totalBurned tracks the sink', s.totalBurned === costNow);
check('Higher level → higher emission cap', emissionCap(emberAfter.level) > cap);

// ── boosting: capped hero's share redistributes to uncapped teammate ──
let b = createInitialState();
const tb = 2_000_000_000_000;
b.lastSettle = tb;
b = stakeHero(b, tb, 'demo:1', 'frostpond');  // Ember
b = stakeHero(b, tb, 'demo:6', 'frostpond');  // Umbra
const wEmber = heroWeight(ZONE_BY_ID['frostpond'], b.roster.find(h=>h.id==='demo:1')!);
const wUmbra = heroWeight(ZONE_BY_ID['frostpond'], b.roster.find(h=>h.id==='demo:6')!);
b = settle(b, tb + 1000); // 1s: split by weight
const pE = b.positions.find(p=>p.heroId==='demo:1')!;
const pU = b.positions.find(p=>p.heroId==='demo:6')!;
check('Two stakers split pool by weight', Math.abs((pE.accrued/pU.accrued) - (wEmber/wUmbra)) < 0.01,
  { ratio: pE.accrued/pU.accrued, weightRatio: wEmber/wUmbra });
check('totalRatePerSec = full zone rate with 2 uncapped stakers',
  Math.abs(totalRatePerSec(b) - (ZONE_BY_ID['frostpond'].ratePerMin/60)*DEMO_SPEED) < 1e-6);

// ── unstake banks accrued ──
b = unstakeHero(b, tb + 1000, 'demo:1');
check('Unstake removes position', !b.positions.find(p=>p.heroId==='demo:1'));
check('Unstake banked accrued', b.shards === Math.floor(pE.accrued));

console.log(`\n${failures === 0 ? 'ALL PASS ✅' : `${failures} FAILURE(S) ❌`}`);
if (failures > 0) process.exit(1);
