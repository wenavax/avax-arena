import { ARCH_TO_PLAN, PLANS, monsterPlanFor } from '../lib/game/td/sprites/monsterChibi';
import { ARCHETYPES, MONSTER_VISUALS } from '../lib/game/iso/monsterSprites';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };
ok('plans-6', Object.keys(PLANS).length === 6);
ok('all-20-archetypes-mapped', Object.keys(ARCHETYPES).every(a => !!ARCH_TO_PLAN[a]));
// her canavar tipi bir plana çözülür (null=boss → 'boss' planı)
ok('all-visuals-resolve', Object.keys(MONSTER_VISUALS).every(t => !!monsterPlanFor(t)));
ok('boss-resolves', monsterPlanFor('__unknown_boss__') === 'boss');
console.log('visual count:', Object.keys(MONSTER_VISUALS).length);
console.log(`td-monster: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
