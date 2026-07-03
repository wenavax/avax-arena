// Run: npx tsx lib/game/expeditions/__smoketest.ts   (from frontend/)
import { startRun, descend, takeRelic, healAndAdvance, extract } from './run';
import type { ExpeditionWarrior, RunState } from './types';

const WARRIORS: ExpeditionWarrior[] = [
  { tokenId: 1, attack: 72, defense: 40, speed: 55, element: 'fire', specialPower: 60, level: 8 },
  { tokenId: 2, attack: 48, defense: 66, speed: 38, element: 'ice', specialPower: 30, level: 6 },
  { tokenId: 3, attack: 60, defense: 30, speed: 70, element: 'thunder', specialPower: 80, level: 7 },
];

type Strategy = 'greedy' | 'smart';

function autoPlay(seed: string, strategy: Strategy = 'greedy') {
  const run: RunState = startRun({ seed, warriors: WARRIORS });
  let guard = 0;
  while ((run.status === 'active' || run.status === 'choosing') && guard++ < 100) {
    if (run.status === 'active') { descend(run); continue; }
    // status === 'choosing'
    const hpPct = run.squad.hp / run.squad.maxHp;
    if (strategy === 'smart') {
      if (run.floor >= 10 && hpPct < 0.6) { extract(run); continue; } // bank a deep run
      if (hpPct < 0.45) { healAndAdvance(run); continue; }            // heal when low
    }
    takeRelic(run, run.offeredRelics[0].id);
  }
  return {
    status: run.status,
    floor: run.floor,
    reward: run.reward,
    relics: run.squad.relics.map((r) => r.id).join(','),
    logHash: run.log.join('|'),
  };
}

// 1) DETERMINISM: same seed twice must be byte-identical
const a = autoPlay('seed-alpha');
const b = autoPlay('seed-alpha');
const identical = JSON.stringify(a) === JSON.stringify(b);
console.log(`\n[determinism] same seed identical: ${identical ? '✅ PASS' : '❌ FAIL'}`);
if (!identical) { console.log('A', a); console.log('B', b); }

// 2) BALANCE: greedy (never heal) vs smart (heal/extract) across seeds
const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
for (const strat of ['greedy', 'smart'] as const) {
  let extracts = 0, sumFloor = 0, sumReward = 0;
  console.log(`\n[balance:${strat}]`);
  for (const s of seeds) {
    const r = autoPlay(s, strat);
    if (r.status === 'extracted') extracts++;
    sumFloor += r.floor; sumReward += r.reward;
    console.log(`  ${s}: ${r.status.padEnd(9)} floor ${String(r.floor).padStart(2)}  reward ${String(r.reward).padStart(4)} FSB`);
  }
  console.log(`  → avg floor ${(sumFloor / seeds.length).toFixed(1)}, extracts ${extracts}/${seeds.length}, avg reward ${Math.round(sumReward / seeds.length)} FSB`);
}

// 3) SANITY: a run must terminate in a terminal state
const term = autoPlay('term-check');
console.log(`\n[sanity] terminal state reached: ${(term.status === 'extracted' || term.status === 'dead') ? '✅ PASS' : '❌ FAIL'} (${term.status})`);
console.log('');
