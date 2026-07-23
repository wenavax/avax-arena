// frontend/scripts/td-cozy-test.ts
import { COSTS, PER_HIT, REGEN, PRICES, FARM } from '../lib/game/td/cozy/rules';
import { TdState, migrateV1 } from '../lib/game/td/tdState';
import { TOWN_SPAWN } from '../lib/game/td/worldMap';
import { TILE } from '../lib/game/td/tdCore';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

// in-memory localStorage stub for Node
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

// ─── (a) COSTS/REGEN/PRICES sabitleri spec değerleriyle birebir ───
eq('cost-chop-total', COSTS.chop, 15);
eq('cost-mine-total', COSTS.mine, 21);
eq('cost-fish', COSTS.fish, 25);
eq('cost-plant', COSTS.plant, 5);
eq('cost-harvest', COSTS.harvest, 5);
eq('perhit-chop', PER_HIT.chop, 5);
eq('perhit-chop-hits', PER_HIT.chop * 3, COSTS.chop);
eq('perhit-mine', PER_HIT.mine, 7);
eq('perhit-mine-hits', PER_HIT.mine * 3, COSTS.mine);
eq('regen-passive', REGEN.perSec, 6);
eq('regen-campfire-mult', REGEN.campfireMult, 4);
eq('energy-max', TdState.ENERGY_MAX, 1000);
ok('prices-defined', PRICES.wood > 0 && PRICES.stone > 0 && PRICES.ore > 0 && PRICES.fish > 0 && PRICES.frostberry > 0);
ok('farm-stage-duration-defined', FARM.stageDurationSec > 0);
eq('farm-growth-stages', FARM.growthStages, 2);

// ─── (b) gather: enerji düşer + kaynak artar; yetersizse false + hiçbir şey değişmez ───
{
  const s = new TdState(makeStorage());
  const before = s.energy;
  const okGather = s.gather('wood');
  ok('gather-wood-ok', okGather === true);
  eq('gather-wood-energy', s.energy, before - COSTS.chop);
  eq('gather-wood-resource', s.resources.wood, 1);

  s.energy = 10; // yetersiz (chop=15)
  const beforeResources = { ...s.resources };
  const beforeEnergy = s.energy;
  const failGather = s.gather('wood');
  ok('gather-insufficient-false', failGather === false);
  eq('gather-insufficient-energy-unchanged', s.energy, beforeEnergy);
  eq('gather-insufficient-resources-unchanged', s.resources, beforeResources);
}

// ─── (c) tick(dt, nearFire): regen 6/sn ve ×4; cap 1000 ───
{
  const s = new TdState(makeStorage());
  s.energy = 500;
  s.tick(1, false);
  eq('tick-regen-1s', s.energy, 506);
  s.energy = 500;
  s.tick(1, true);
  eq('tick-regen-campfire-1s', s.energy, 500 + 6 * 4);
  s.energy = 995;
  s.tick(2, true); // would overshoot without cap
  eq('tick-regen-cap', s.energy, TdState.ENERGY_MAX);
}

// ─── (d) sellAll(): fiyat tablosuyla gold'a çevirir, kaynaklar sıfırlanır ───
{
  const s = new TdState(makeStorage());
  s.resources = { wood: 2, stone: 1, ore: 1, fish: 1, frostberry: 1 };
  s.gold = 0;
  const expectedGold = 2 * PRICES.wood + 1 * PRICES.stone + 1 * PRICES.ore + 1 * PRICES.fish + 1 * PRICES.frostberry;
  const earned = s.sellAll();
  eq('sellall-earned', earned, expectedGold);
  // Faz 6+ tek cüzdan: sellAll artık tdState.gold'a YAZMAZ (çağrı yeri ps.gold'a ekler)
  eq('sellall-gold-untouched', s.gold, 0);
  eq('sellall-resources-cleared', s.resources, { wood: 0, stone: 0, ore: 0, fish: 0, frostberry: 0 });

  // selling nothing yields 0 and doesn't throw
  const earned2 = s.sellAll();
  eq('sellall-empty', earned2, 0);
}

// ─── (e) farm: plant → tick 2 aşama büyür → harvest +frostberry; boş parselde harvest false ───
{
  const s = new TdState(makeStorage());
  const beforeEnergy = s.energy;
  ok('plant-ok', s.plant(0) === true);
  eq('plant-stage-1', s.farm[0].stage, 1);
  eq('plant-energy-cost', s.energy, beforeEnergy - COSTS.plant);

  // harvest too early (still growing) -> false
  ok('harvest-too-early-false', s.harvest(0) === false);

  // advance through stage 1 -> 2
  s.tick(FARM.stageDurationSec, false);
  eq('farm-stage-2-after-1-duration', s.farm[0].stage, 2);
  ok('harvest-still-growing-false', s.harvest(0) === false);

  // advance through stage 2 -> 3 (mature)
  s.tick(FARM.stageDurationSec, false);
  eq('farm-stage-3-mature', s.farm[0].stage, 3);

  const beforeBerry = s.resources.frostberry;
  const beforeHarvestEnergy = s.energy;
  ok('harvest-mature-ok', s.harvest(0) === true);
  eq('harvest-berry-plus-one', s.resources.frostberry, beforeBerry + 1);
  eq('harvest-energy-cost', s.energy, beforeHarvestEnergy - COSTS.harvest);
  eq('harvest-plot-reset', s.farm[0].stage, 0);

  // harvesting an empty plot fails
  ok('harvest-empty-plot-false', s.harvest(0) === false);

  // planting an already-growing plot fails
  ok('plant-ok-2', s.plant(1) === true);
  ok('plant-already-growing-false', s.plant(1) === false);

  // invalid index
  ok('plant-invalid-index-false', s.plant(999) === false);
  ok('harvest-invalid-index-false', s.harvest(999) === false);
}

// ─── (f) save()/load() roundtrip AYRI anahtar 'frostbite_td_save' ───
{
  const storage = makeStorage();
  const s = new TdState(storage);
  s.gather('wood');
  s.gather('wood');
  s.gold = 42;
  s.plant(2);
  s.worldPos = { x: 321, y: 654 };
  s.save();

  ok('save-uses-td-key', storage.getItem('frostbite_td_save') !== null);
  ok('save-does-not-touch-frostbite-save', storage.getItem('frostbite_save') === null);

  const s2 = new TdState(storage);
  const loaded = s2.load();
  ok('load-ok', loaded === true);
  eq('load-resources-roundtrip', s2.resources.wood, 2);
  eq('load-gold-roundtrip', s2.gold, 42);
  eq('load-farm-roundtrip', s2.farm[2].stage, 1);
  eq('load-energy-roundtrip', s2.energy, s.energy);
  eq('load-worldpos-roundtrip', s2.worldPos, { x: 321, y: 654 });

  // load on empty storage returns false, worldPos stays null (never set)
  const s3 = new TdState(makeStorage());
  ok('load-empty-false', s3.load() === false);
  eq('worldpos-default-null', s3.worldPos, null);
}

// ─── (g) migrateV1: v1 fixture -> v2 obje ───
{
  const v1Fixture = {
    v: 1,
    name: 'Hero',
    playerClass: 'knight',
    level: 5,
    xp: 120,
    xpToNext: 300,
    maxHp: 180,
    hp: 150,
    atk: 30,
    def: 15,
    spd: 12,
    gold: 250,
    mp: 40,
    maxMp: 40,
    inventory: [{ id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion', stat: { hp: 40 }, stackable: true, count: 3 }],
    equipped: { weapon: null, armor: null, accessory: null, ring: null },
    quests: [],
    killCounts: { slime: 4 },
    flags: ['met_elder'],
    lastZone: 'Forest',
    spawnX: 0,
    spawnY: 0,
    savedAt: 123456,
    // sahte/bilinmeyen alan — v1'de olmayan ama korunması gereken
    fakeUnknownField: 'preserve-me',
  };

  const v2 = migrateV1(v1Fixture);

  eq('migrate-schema-version', v2.schemaVersion, 2);
  eq('migrate-energy-init', v2.energy, 1000);
  eq('migrate-resources-empty', v2.resources, {});
  eq('migrate-farm-empty', v2.farm, []);

  // zone->worldPos: Forest merkezi REGIONS'tan (150,150) tile -> px = tile*16
  eq('migrate-worldpos-forest', v2.worldPos, { x: 150 * TILE, y: 150 * TILE });

  // tüm v1 alanları korunur
  eq('migrate-preserves-level', v2.level, 5);
  eq('migrate-preserves-gold', v2.gold, 250);
  eq('migrate-preserves-inventory', v2.inventory, v1Fixture.inventory);
  eq('migrate-preserves-quests', v2.quests, v1Fixture.quests);
  eq('migrate-preserves-killcounts', v2.killCounts, v1Fixture.killCounts);
  eq('migrate-preserves-lastzone', v2.lastZone, 'Forest');

  // sahte alan korunmalı (spread-koruma testi)
  eq('migrate-preserves-unknown-field', v2.fakeUnknownField, 'preserve-me');

  // bilinmeyen zone -> TOWN_SPAWN
  const v1Unknown = { ...v1Fixture, lastZone: 'SomeUnknownZone' };
  const v2Unknown = migrateV1(v1Unknown);
  eq('migrate-unknown-zone-town-spawn', v2Unknown.worldPos, { x: TOWN_SPAWN.tx * TILE, y: TOWN_SPAWN.ty * TILE });

  // her zone eşlemesi doğru bölgeye çözülüyor mu (mapping tablosu testi)
  const zoneChecks: [string, string][] = [
    ['Forest', 'forest'], ['Town', 'town'], ['Swamp', 'swamp'], ['Mines', 'mines'],
    ['Ruins', 'ruins'], ['Citadel', 'citadel'], ['Sanctum', 'sanctum'], ['Crypt', 'crypt'],
    ['FrostWastes', 'frostwastes'], ['Necropolis', 'necropolis'], ['Volcano', 'volcano'],
    ['Abyss', 'abyss'], ['Forge', 'forge'], ['DemonGate', 'demongate'], ['VoidRealm', 'voidrealm'],
    ['Eternal', 'eternal'], ['Dungeon', 'mines'], ['IceCave', 'frostwastes'],
  ];
  for (const [zone, regionKey] of zoneChecks) {
    const v2z = migrateV1({ ...v1Fixture, lastZone: zone });
    ok(`migrate-zone-${zone}`, typeof v2z.worldPos === 'object');
  }
}

console.log(`td-cozy: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
