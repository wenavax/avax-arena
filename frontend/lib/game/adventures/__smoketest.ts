// ─── Frostbite Adventures engine smoke test ───
// Run: npx tsx lib/game/adventures/__smoketest.ts   (from frontend/)
// Deterministic: all time is passed explicitly, no Date.now() in assertions.
import { createInitialState } from './heroes';
import {
  stakeHero, unstakeHero, claimZone, levelUpHero, recruit, settle,
  costToNextLevel, emissionCap, recruitCost, gateCheck, heroWeight, affinityMult,
  ratePerSec, totalRatePerSec, DEMO_SPEED,
} from './engine';
import { ZONE_BY_ID } from './zones';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}`, extra ?? ''); }
}

console.log('Frostbite Adventures — engine smoke test\n');

let s = createInitialState();
const t0 = 1_000_000_000_000;
s.lastSettle = t0;
const ember = s.roster.find((h) => h.id === 'demo:1')!;   // fire rare L12
const volt = s.roster.find((h) => h.id === 'demo:5')!;     // thunder legendary L22
const rime = ZONE_BY_ID['rime-river'];
const lake = ZONE_BY_ID['great-frostlake'];
const pond = ZONE_BY_ID['frostpond'];

// ── gates ──
check('Ember passes Rime River gate (L12≥10)', gateCheck(rime, ember).ok);
check('Terron fails Rime River gate (L5<10)', !gateCheck(rime, s.roster.find(h=>h.id==='demo:4')!).ok);
check('Volt passes Frostlake gate (L22≥20)', gateCheck(lake, volt).ok);

// ── element affinity ──
check('Ember (fire) favored in Frostpond (fire)', affinityMult(pond, ember) > 1);
check('Ember NOT favored in Rime River (ice)', affinityMult(rime, ember) === 1);
check('Affinity raises heroWeight ~1.35x',
  Math.abs(heroWeight(pond, ember) / (heroWeight({ ...pond, favoredElement: 'water' }, ember)) - 1.35) < 1e-9);

// ── staking respects gates ──
s = stakeHero(s, t0, 'demo:4', 'rime-river');
check('Terron NOT staked (gate fail)', s.positions.length === 0);
s = stakeHero(s, t0, 'demo:1', 'rime-river');
check('Ember staked, position has stakedAt', s.positions.length === 1 && s.positions[0].stakedAt === t0);

// ── accrual over 10 game-seconds (single staker → whole pool) ──
const t1 = t0 + 10_000;
s = settle(s, t1);
const expected10s = (rime.ratePerMin / 60) * DEMO_SPEED * 10;
check('Accrued ≈ full zone pool for 10s',
  Math.abs(s.positions[0].accrued - Math.min(emissionCap(ember.level), expected10s)) < 0.01);
check('ratePerSec matches zone/60', Math.abs(ratePerSec(s, 'demo:1') - (rime.ratePerMin/60)*DEMO_SPEED) < 1e-6);

// ── emission cap locks accrual ──
const tCap = t1 + 10_000_000;
s = settle(s, tCap);
check('Accrued clamped to emissionCap', Math.abs(s.positions[0].accrued - emissionCap(ember.level)) < 1e-6);
check('Capped hero earns 0/sec', ratePerSec(s, 'demo:1') === 0);
check('Cap event emitted', s.events.some((e) => e.kind === 'cap'));

// ── idle finds fired over the long span ──
check('Idle finds produced foundShards', s.foundShards > 0, { foundShards: s.foundShards });
check('Find events present', s.events.some((e) => e.kind === 'find' || e.kind === 'rare-find'));

// ── claim banks accrued (tolerant of found shards already in balance) ──
const accruedBefore = Math.floor(s.positions[0].accrued);
const shardsBefore = s.shards;
s = claimZone(s, tCap, 'rime-river');
check('Claim added exactly floored accrued', s.shards === shardsBefore + accruedBefore);
check('Position reset to 0 after claim', s.positions[0].accrued === 0);

// ── level up burns shards, raises level + cap ──
const capBefore = emissionCap(ember.level);
const cost = costToNextLevel(ember.level);
const sb = s.shards;
s = levelUpHero(s, tCap, 'demo:1');
const emberAfter = s.roster.find((h) => h.id === 'demo:1')!;
check('Level up +1 & burned exact cost', emberAfter.level === ember.level + 1 && s.shards === sb - cost);
check('totalBurned tracks the sink', s.totalBurned === cost);
check('Higher level → higher cap', emissionCap(emberAfter.level) > capBefore);
check('Level event emitted', s.events.some((e) => e.kind === 'level'));

// ── recruit grows roster and spends shards ──
s.shards = recruitCost(0) + 50;
const rosterBefore = s.roster.length;
const shardsPre = s.shards;
s = recruit(s, tCap);
check('Recruit added a hero', s.roster.length === rosterBefore + 1);
check('Recruit spent exactly recruitCost', s.shards === shardsPre - recruitCost(0));
check('recruited counter + event', s.recruited === 1 && s.events.some((e) => e.kind === 'recruit'));
check('Recruit is a valid, seeded hero', !!s.roster.at(-1)!.seed && s.roster.at(-1)!.level === 1);

// ── boosting: two stakers split pool by weight ──
let b = createInitialState();
const tb = 2_000_000_000_000;
b.lastSettle = tb;
b = stakeHero(b, tb, 'demo:1', 'frostpond');  // Ember (fire, favored here)
b = stakeHero(b, tb, 'demo:6', 'frostpond');  // Umbra (shadow, not favored)
const wE = heroWeight(pond, b.roster.find(h=>h.id==='demo:1')!);
const wU = heroWeight(pond, b.roster.find(h=>h.id==='demo:6')!);
b = settle(b, tb + 1000);
const pE = b.positions.find(p=>p.heroId==='demo:1')!;
const pU = b.positions.find(p=>p.heroId==='demo:6')!;
check('Two stakers split pool by weight (affinity included)',
  Math.abs((pE.accrued/pU.accrued) - (wE/wU)) < 0.01, { ratio: pE.accrued/pU.accrued, wr: wE/wU });
check('totalRatePerSec = full zone rate (2 uncapped)',
  Math.abs(totalRatePerSec(b) - (pond.ratePerMin/60)*DEMO_SPEED) < 1e-6);
const pEBank = Math.floor(pE.accrued);
b = unstakeHero(b, tb + 1000, 'demo:1');
check('Unstake removes position & banks accrued', !b.positions.find(p=>p.heroId==='demo:1') && b.shards >= pEBank);

console.log(`\n${failures === 0 ? 'ALL PASS ✅' : `${failures} FAILURE(S) ❌`}`);
if (failures > 0) process.exit(1);
