// Kasaba: 9 hub kapısı doğru interact'la var, spawn'dan BFS ile erişilebilir,
// ve mevcut kritik interact'lar (shop/npc/inn/elder/exit) korunmuş.
import { buildTownTiles } from '../lib/game/maps/townTiles';
import { HUB_GAMES } from '../lib/game/hub/hubGames';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? `  ✓ ${m}` : `  ✗ ${m}`); if (!c) fails++; };

const tiles = buildTownTiles();
const ROWS = tiles.length, COLS = tiles[0].length;

const seen = new Set<string>(['16,22']);
const q: [number, number][] = [[16, 22]];
while (q.length) {
  const [tx, ty] = q.shift()!;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
    const k = `${nx},${ny}`;
    if (seen.has(k) || tiles[ny][nx].collision) continue;
    seen.add(k); q.push([nx, ny]);
  }
}

for (const g of HUB_GAMES) {
  const t = tiles[g.door.ty][g.door.tx];
  ok(t.interact === `hub_${g.id}`, `${g.id} kapısı (${g.door.tx},${g.door.ty}) interact=${t.interact}`);
  const reachable = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) =>
    seen.has(`${g.door.tx + dx},${g.door.ty + dy}`));
  ok(reachable, `${g.id} kapısına spawn'dan ulaşılabiliyor`);
}

const allInteracts = tiles.flat().map(t => t.interact).filter(Boolean);
for (const must of ['shop', 'inn', 'elder_house']) {
  ok(allInteracts.includes(must), `mevcut '${must}' interact'i duruyor`);
}
ok(allInteracts.filter(i => i === 'npc').length >= 2, 'en az 2 NPC duruyor');
ok(allInteracts.some(i => i!.startsWith('exit_')), 'zone çıkışı duruyor');

console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
