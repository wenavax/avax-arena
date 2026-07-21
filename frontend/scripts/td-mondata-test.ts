// frontend/scripts/td-mondata-test.ts
import { REGIONS } from '../lib/game/td/worldMap';
import { REGION_MONSTERS, DUNGEON_ROSTERS } from '../lib/game/td/monsterData';
import { monsterPlanFor } from '../lib/game/td/sprites/monsterChibi';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

// (a) her non-town REGION key REGION_MONSTERS'ta ≥3 entry ile var
const nonTownRegions = REGIONS.filter(r => r.key !== 'town');
ok('non-town-regions-17', nonTownRegions.length === 17);
for (const rg of nonTownRegions) {
  const list = REGION_MONSTERS[rg.key];
  ok(`region-${rg.key}-exists`, Array.isArray(list));
  ok(`region-${rg.key}-min3`, !!list && list.length >= 3);
}

// (b) her entry.type monsterPlanFor ile hata atmadan çözülür
let totalEntries = 0;
for (const key of Object.keys(REGION_MONSTERS)) {
  for (const e of REGION_MONSTERS[key]) {
    totalEntries++;
    let resolved = false;
    try { resolved = !!monsterPlanFor(e.type); } catch { resolved = false; }
    ok(`resolve-${key}-${e.type}`, resolved);
  }
}

// (c) DUNGEON_ROSTERS tam 14 kapı key'ini kapsar + her birinde boss isBoss ile var
const DOOR_KEYS = nonTownRegions.map(r => r.key).filter(k => !['forest', 'grassE', 'grassS'].includes(k));
ok('door-keys-14', DOOR_KEYS.length === 14);
const dungeonKeys = Object.keys(DUNGEON_ROSTERS);
ok('dungeon-rosters-count-14', dungeonKeys.length === 14);
ok('dungeon-rosters-cover-door-keys', DOOR_KEYS.every(k => !!DUNGEON_ROSTERS[k]));
ok('dungeon-rosters-no-extra-keys', dungeonKeys.every(k => DOOR_KEYS.includes(k)));
for (const key of DOOR_KEYS) {
  const roster = DUNGEON_ROSTERS[key];
  ok(`dungeon-${key}-has-boss`, !!roster && !!roster.boss);
  ok(`dungeon-${key}-boss-isBoss`, !!roster && roster.boss.isBoss === true);
  ok(`dungeon-${key}-pool-nonempty`, !!roster && Array.isArray(roster.pool) && roster.pool.length >= 3);
  if (roster) {
    totalEntries += roster.pool.length + 1;
    let bossResolved = false;
    try { bossResolved = !!monsterPlanFor(roster.boss.type); } catch { bossResolved = false; }
    ok(`resolve-boss-${key}-${roster.boss.type}`, bossResolved);
    for (const e of roster.pool) {
      let r = false;
      try { r = !!monsterPlanFor(e.type); } catch { r = false; }
      ok(`resolve-dungeonpool-${key}-${e.type}`, r);
    }
  }
}

// (d) her bölgenin entry level'ları REGIONS.level aralığının ±5 içinde
for (const rg of nonTownRegions) {
  const list = REGION_MONSTERS[rg.key];
  if (!list) continue;
  const [lo, hi] = rg.level;
  for (const e of list) {
    ok(`level-range-${rg.key}-${e.type}-${e.level}`, e.level >= lo - 5 && e.level <= hi + 5);
  }
}

console.log('total entry count:', totalEntries);
console.log(`td-mondata: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
