// frontend/scripts/td-dungeon-test.ts
import { genDungeon } from '../lib/game/td/dungeonGen';
import { DUNGEON_ROSTERS } from '../lib/game/td/monsterData';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

/** BFS erişilebilirlik: entry'den floor (1) tile'ları üzerinden 4-yön yürüyerek hedefe ulaşılabilir mi? */
function reachable(tiles: Uint8Array, w: number, h: number, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const seen = new Uint8Array(w * h);
  const idx = (x: number, y: number) => y * w + x;
  const q: [number, number][] = [[from.x, from.y]];
  seen[idx(from.x, from.y)] = 1;
  let qi = 0;
  while (qi < q.length) {
    const [x, y] = q[qi++];
    if (x === to.x && y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seen[idx(nx, ny)]) continue;
      if (tiles[idx(nx, ny)] !== 1) continue;
      seen[idx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  return false;
}

// (a) determinizm: 3 id iki kez üretilir, deep-equal
const testIds = ['swamp', 'mines', 'volcano'];
for (const id of testIds) {
  const g1 = genDungeon(id);
  const g2 = genDungeon(id);
  ok(`deterministic-${id}-dims`, g1.w === g2.w && g1.h === g2.h);
  ok(`deterministic-${id}-entry`, g1.entry.x === g2.entry.x && g1.entry.y === g2.entry.y);
  ok(`deterministic-${id}-boss`, g1.boss.x === g2.boss.x && g1.boss.y === g2.boss.y);
  ok(`deterministic-${id}-spawns`, g1.spawns.length === g2.spawns.length &&
    g1.spawns.every((s, i) => s.x === g2.spawns[i].x && s.y === g2.spawns[i].y));
  let tilesEq = g1.tiles.length === g2.tiles.length;
  if (tilesEq) for (let i = 0; i < g1.tiles.length; i++) if (g1.tiles[i] !== g2.tiles[i]) { tilesEq = false; break; }
  ok(`deterministic-${id}-tiles`, tilesEq);
}

// (b)+(d) tüm 14 DUNGEON_ROSTERS anahtarı hatasız üretilir; entry/boss/spawn floor üzerinde; BFS erişilebilir
const dungeonKeys = Object.keys(DUNGEON_ROSTERS);
ok('dungeon-keys-14', dungeonKeys.length === 14);
for (const id of dungeonKeys) {
  let g: ReturnType<typeof genDungeon> | null = null;
  try { g = genDungeon(id); } catch (e) { console.error(id, e); }
  ok(`gen-no-throw-${id}`, !!g);
  if (!g) continue;
  ok(`size-48x40-${id}`, g.w === 48 && g.h === 40);
  const at = (p: { x: number; y: number }) => g!.tiles[p.y * g!.w + p.x];
  ok(`entry-on-floor-${id}`, at(g.entry) === 1);
  ok(`boss-on-floor-${id}`, at(g.boss) === 1);
  ok(`spawns-nonempty-${id}`, g.spawns.length > 0);
  ok(`spawns-on-floor-${id}`, g.spawns.every(s => at(s) === 1));
  ok(`bfs-entry-to-boss-${id}`, reachable(g.tiles, g.w, g.h, g.entry, g.boss));
  ok(`bfs-entry-to-all-spawns-${id}`, g.spawns.every(s => reachable(g.tiles, g.w, g.h, g.entry, s)));
  // (e) duvar sınırı bütün: kenar tile'ların hepsi 0 (duvar)
  let borderOk = true;
  for (let x = 0; x < g.w; x++) { if (at({ x, y: 0 }) !== 0 || at({ x, y: g.h - 1 }) !== 0) { borderOk = false; break; } }
  if (borderOk) for (let y = 0; y < g.h; y++) { if (at({ x: 0, y }) !== 0 || at({ x: g.w - 1, y }) !== 0) { borderOk = false; break; } }
  ok(`border-intact-${id}`, borderOk);
}

console.log(`td-dungeon: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
