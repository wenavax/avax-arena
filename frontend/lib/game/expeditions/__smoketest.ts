// Run: npx tsx lib/game/expeditions/__smoketest.ts   (from frontend/)
import { startRun, descend, takeRelic, healAndAdvance, extract } from './run';
import type { ExpeditionWarrior, RunState, BossFlavor } from './types';

const WARRIORS: ExpeditionWarrior[] = [
  { tokenId: 1, attack: 72, defense: 40, speed: 55, element: 'fire', specialPower: 60, level: 8 },
  { tokenId: 2, attack: 48, defense: 66, speed: 38, element: 'ice', specialPower: 30, level: 6 },
  { tokenId: 3, attack: 60, defense: 30, speed: 70, element: 'thunder', specialPower: 80, level: 7 },
];

type Strategy = 'greedy' | 'smart';

function autoPlay(seed: string, strategy: Strategy = 'greedy', flavors?: Record<number, BossFlavor>) {
  const run: RunState = startRun({ seed, warriors: WARRIORS, flavors });
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

// 4) FLAVOR-INVARIANCE: AI-authored boss identity must NOT change the run's
//    mechanical outcome (anti-cheat: flavor never touches combat stats). Only
//    the log text (which embeds boss names) may differ.
const FAKE_FLAVORS: Record<number, BossFlavor> = {};
for (let f = 1; f <= 20; f++) {
  FAKE_FLAVORS[f] = {
    name: `Testwraith${f}`, title: 'the Mocked',
    lore: 'a mock boss', entranceDialogue: 'mock taunt', defeatDialogue: 'mock death',
  };
}
const plain = autoPlay('flavor-check', 'smart');
const flavored = autoPlay('flavor-check', 'smart', FAKE_FLAVORS);
const combatIdentical =
  plain.status === flavored.status &&
  plain.floor === flavored.floor &&
  plain.reward === flavored.reward &&
  plain.relics === flavored.relics;
const flavorApplied = flavored.logHash.includes('Testwraith');
console.log(`\n[flavor-invariance] combat outcome unchanged by AI flavor: ${combatIdentical ? '✅ PASS' : '❌ FAIL'}`);
console.log(`[flavor-invariance] flavor actually reached boss + logs:    ${flavorApplied ? '✅ PASS' : '❌ FAIL'}`);
if (!combatIdentical) { console.log('  plain', plain); console.log('  flavored', flavored); }

// 5) HOSTILE-SHAPE: a malicious/oddly-shaped AI response that smuggles
//    combat-shaped keys (atk/def/element/maxHp/...) must STILL not change the
//    run. This guards against a future regression where applyFlavor spreads the
//    flavor instead of picking identity fields.
const HOSTILE: Record<number, any> = {};
for (let f = 1; f <= 20; f++) {
  HOSTILE[f] = {
    name: `Testwraith${f}`, title: 'the Mocked', lore: '', entranceDialogue: 'x', defeatDialogue: '',
    element: 'shadow', maxHp: 1, hp: 1, atk: 999999, def: 0, spd: 999, isElite: false, level: 99, __proto__: { atk: 5 },
  };
}
const hostile = autoPlay('flavor-check', 'smart', HOSTILE as any);
const hostileSafe =
  plain.status === hostile.status &&
  plain.floor === hostile.floor &&
  plain.reward === hostile.reward &&
  plain.relics === hostile.relics;
console.log(`[hostile-shape] injected combat keys cannot reach combat:  ${hostileSafe ? '✅ PASS' : '❌ FAIL'}`);
if (!hostileSafe) { console.log('  plain', plain); console.log('  hostile', hostile); }
console.log('');
