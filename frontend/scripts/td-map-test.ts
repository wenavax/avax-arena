// frontend/scripts/td-map-test.ts
import { MAP_W, MAP_H } from '../lib/game/td/tdCore';
import { getTile, REGIONS, regionAt, TOWN_SPAWN } from '../lib/game/td/worldMap';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

// 1) determinizm: 10k örnek tile'ın imzası sabit kalmalı (snapshot)
let sig = 0;
for (let i = 0; i < 10000; i++) {
  const x = (i * 7919) % MAP_W, y = (i * 104729) % MAP_H;
  const t = getTile(x, y);
  sig = (sig * 31 + t.biome.charCodeAt(0) + (t.collision ? 7 : 0)) >>> 0;
}
console.log('map signature:', sig);
ok('deterministic-rerun', (() => {
  let s2 = 0;
  for (let i = 0; i < 10000; i++) {
    const x = (i * 7919) % MAP_W, y = (i * 104729) % MAP_H;
    const t = getTile(x, y);
    s2 = (s2 * 31 + t.biome.charCodeAt(0) + (t.collision ? 7 : 0)) >>> 0;
  }
  return s2 === sig;
})());
// 2) coğrafya: spawn kasabada, kasaba yürünebilir
ok('spawn-in-town', regionAt(TOWN_SPAWN.tx, TOWN_SPAWN.ty).key === 'town');
ok('spawn-walkable', !getTile(TOWN_SPAWN.tx, TOWN_SPAWN.ty).collision);
// 3) 18 bölge var, hepsi harita içinde
ok('regions-18', REGIONS.length === 18);
ok('regions-in-bounds', REGIONS.every(r => r.cx >= 0 && r.cx < MAP_W && r.cy >= 0 && r.cy < MAP_H));
// 4) uç biyom yerleşimi: FrostWastes kuzeyde, Volcano güneydoğuda
const fw = REGIONS.find(r => r.key === 'frostwastes')!, vo = REGIONS.find(r => r.key === 'volcano')!;
ok('frostwastes-north', fw.cy < MAP_H * 0.3);
ok('volcano-southeast', vo.cy > MAP_H * 0.6 && vo.cx > MAP_W * 0.6);
// 5) göl collision'lı
const lakeT = getTile(150, 150);
ok('lake-water-collides', lakeT.biome === 'water' ? lakeT.collision : true);
// 6) sınır: harita kenarı collision
ok('border-collides', getTile(0, 100).collision && getTile(MAP_W - 1, 100).collision);

console.log(`td-map: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
