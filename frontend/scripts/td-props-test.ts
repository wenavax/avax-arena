import { propsForChunk, allTownProps, dungeonDoors, npcProps, TOWN_ORIGIN, DECO_KINDS, DECO_BY_BIOME as DECO_BY_BIOME_TEST, TD_HOUSES, type TdProp } from '../lib/game/td/worldProps';
import { INTERIORS } from '../lib/game/td/interiors';
import { NPCS, NPC_BY_ID } from '../lib/game/td/npcs';
import { getTile, TOWN_SPAWN, ROAD_Y } from '../lib/game/td/worldMap';
import { HUB_GAMES } from '../lib/game/hub/hubGames';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };

// determinizm: forest merkez chunk'ı (150/48≈3) iki üretimde birebir
const a = propsForChunk(3, 3), b = propsForChunk(3, 3);
ok('deterministic', JSON.stringify(a) === JSON.stringify(b));
// yoğunluk: forest chunk'ında makul ağaç sayısı
const trees = a.filter(p => p.kind === 'tree').length;
console.log('forest chunk trees:', trees);
ok('forest-density', trees > 80 && trees < 400);
// hiçbir otomatik prop collision tile üstünde değil
ok('no-props-on-collision', a.every(p => !getTile(Math.floor(p.x / 16), Math.floor(p.y / 16)).collision));
// kasaba: bina sayısı = HUB_GAMES, hepsi kasaba chunk'ında (192/48=4)
const town = allTownProps();
ok('buildings-count', town.filter(p => p.kind === 'building').length === HUB_GAMES.length);
// Faz 5.8 köy düzeni: TOWN_ORIGIN (192,192) chunk sınırında — kuzey sıra chunk (3,3)/(4,3)'e,
// batı kanat (3,4)'e taşar; 4 komşu chunk'ın TOPLAMI tüm binaları içermeli (çift sayım yok:
// inChunk filtresi her binayı tek chunk'a atar).
const c44 = propsForChunk(4, 4);
const townChunks = [c44, propsForChunk(3, 4), propsForChunk(4, 3), propsForChunk(3, 3)];
ok('town-buildings-in-chunk', townChunks.reduce((n, c) => n + c.filter(p => p.kind === 'building').length, 0) === HUB_GAMES.length);
// bina rect'leri içinde otomatik ağaç yok
// Faz 5.8: plaza süs ağaçlarının KENDİ gövde solid'leri listeye girmesin (ağaç
// anchor'ı kendi solid'inin içinde — sahte çakışma); amaç bina/ateş içi ağaç yakalamak.
// Faz 8: 'deco' de ağaçlarla aynı nedenle dışarıda — kuyu/tezgâh anchor'ı KENDİ dar
// solid'inin içinde (sahte çakışma); amaç bina/kamp ateşi içi prop yakalamak.
const solids = town.filter(p => p.solid && p.kind !== 'tree' && p.kind !== 'deco').map(p => p.solid!);
const inSolid = (x: number, y: number) => solids.some(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
ok('no-tree-in-buildings', townChunks.flat().filter(p => p.kind === 'tree').every(p => !inSolid(p.x, p.y)));
// zindan kapıları: 14 adet (town/forest/grassE/grassS hariç), koordinatlar bölge merkezinde
const doors = dungeonDoors();
ok('doors-14', doors.length === 14);
ok('doors-have-data', doors.every(d => !!d.data?.id && !!d.solid));
console.log('TOWN_ORIGIN', TOWN_ORIGIN);
// çapraz-chunk determinizm (cache ısındıktan sonra)
const m1 = propsForChunk(5, 4), m2 = propsForChunk(5, 4);
ok('deterministic-second-chunk', JSON.stringify(m1) === JSON.stringify(m2));
// kaya/çalı üretimi gerçekten var (yoğunluk tabloları canlı)
const rocks = m1.filter(p => p.kind === 'rock').length, bushes = m1.filter(p => p.kind === 'bush').length;
console.log('chunk(5,4) rocks:', rocks, 'bushes:', bushes);
ok('rocks-exist', rocks > 0);
ok('bushes-exist', bushes > 0);
ok('doors-cached-ref', dungeonDoors() === dungeonDoors());
// tarla: 12 parsel, hepsi kasaba chunk'ında (4,4)
const farms = c44.filter(p => p.kind === 'farm_plot');
ok('farm-plot-count', farms.length === 12);
ok('farm-plots-in-town-chunk', farms.every(p => {
  const cx = Math.floor(p.x / 16 / 48), cy = Math.floor(p.y / 16 / 48);
  return cx === 4 && cy === 4;
}));
// Faz 7: NPC prop'ları — elle yerleştirilmiş 8 kişi, hepsi kasaba chunk'larında,
// solid + çözülebilir data.id ile; anchor'ları bina/kamp ateşi solid'lerinin dışında.
const npcs = townChunks.flat().filter(p => p.kind === 'npc');
ok('npc-count-in-town-chunks', npcs.length === NPCS.length);
ok('npc-data-resolves', npcs.every(p => !!p.data?.id && !!NPC_BY_ID[p.data.id] && p.data.name === NPC_BY_ID[p.data.id].name));
ok('npc-has-solid', npcs.every(p => !!p.solid));
ok('npc-anchor-tile-matches-def', npcs.every(p => {
  const d = NPC_BY_ID[p.data!.id!];
  return Math.floor(p.x / 16) === d.tx && Math.floor(p.y / 16) === d.ty;
}));
ok('npc-not-in-buildings', npcs.every(p => !inSolid(p.x, p.y)));
ok('npc-cached-ref', npcProps() === npcProps());
// ─────────────────────────────────────────────────────────────────────────────
// Faz 8: SÜS PROP'LARI (deco)
// ─────────────────────────────────────────────────────────────────────────────
// 1) Mevcut yerleşimler BOZULMADI: süs zincirin sonunda durduğu için ağaç/kaya/çalı
//    koordinatları birebir aynı kalmalı (regresyon çapası — süs eklemek eskiyi kaydırmaz).
const treeKeys = (l: TdProp[]) => l.filter(p => p.kind === 'tree').map(p => `${p.x},${p.y},${p.v}`).join('|');
ok('forest-trees-count-stable', trees > 80 && trees < 400);
ok('deco-does-not-shift-trees', treeKeys(a) === treeKeys(propsForChunk(3, 3)));

// 2) Süs gerçekten üretiliyor ve deterministik
const decoA = a.filter(p => p.kind === 'deco');
console.log('forest chunk deco:', decoA.length, '· tipler:', [...new Set(decoA.map(p => p.data!.deco))].join(','));
ok('deco-exists-forest', decoA.length > 10);
ok('deco-deterministic', JSON.stringify(decoA) === JSON.stringify(propsForChunk(3, 3).filter(p => p.kind === 'deco')));

// 3) Her süsün data.deco'su geçerli bir DecoKind
const allDeco = [...decoA, ...m1.filter(p => p.kind === 'deco'), ...c44.filter(p => p.kind === 'deco')];
ok('deco-kind-valid', allDeco.every(p => !!p.data?.deco && (DECO_KINDS as readonly string[]).includes(p.data.deco)));

// 4) Süs, biyomunun havuzundan seçilmiş olmalı (volkanda mantar bitmez)
ok('deco-matches-biome-pool', [propsForChunk(6, 6), propsForChunk(1, 3), propsForChunk(5, 6)].flat()
  .filter(p => p.kind === 'deco' && p.data?.region !== undefined)
  .every(p => {
    const biome = getTile(Math.floor(p.x / 16), Math.floor(p.y / 16)).biome;
    const pool = DECO_BY_BIOME_TEST[biome];
    return !pool || pool.includes(p.data!.deco!);
  }));

// 5) Süs collision/su tile'ına düşmez ve toplanabilir prop'la aynı tile'ı paylaşmaz
ok('deco-not-on-collision', allDeco.every(p => !getTile(Math.floor(p.x / 16), Math.floor(p.y / 16)).collision));
const tileKey = (p: TdProp) => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`;
const scatterTiles = new Set(a.filter(p => p.kind === 'tree' || p.kind === 'rock' || p.kind === 'bush').map(tileKey));
ok('deco-no-tile-overlap-with-scatter', decoA.every(p => !scatterTiles.has(tileKey(p))));

// 6) Kasaba sokak mobilyası — elle yerleşim, çakışma yok
const street = town.filter(p => p.kind === 'deco');
console.log('kasaba mobilyası:', street.length, 'parça');
ok('street-furniture-exists', street.length >= 20);
ok('street-not-in-buildings', street.every(p => !inSolid(p.x, p.y)));
const npcTiles = new Set(NPCS.map(n => `${n.tx},${n.ty}`));
ok('street-not-on-npc', street.every(p => !npcTiles.has(tileKey(p))));
const fixedTiles = new Set(town.filter(p => p.kind !== 'deco').map(tileKey));  // bina kapısı/ateş/ağaç/parsel
ok('street-not-on-fixed-props', street.every(p => !fixedTiles.has(tileKey(p))));
ok('street-not-on-spawn', street.every(p => tileKey(p) !== `${TOWN_SPAWN.tx},${TOWN_SPAWN.ty}`));
ok('street-not-on-road', street.every(p => { const ty = Math.floor(p.y / 16); return ty !== ROAD_Y && ty !== ROAD_Y - 1; }));
ok('street-tiles-unique', new Set(street.map(tileKey)).size === street.length);

// 7) 🔒 MÜHÜRLEME ÇAPASI — spawn'dan flood-fill: yeni mobilya hiçbir yeri kapatmamalı.
//    Yürünebilir = collision yok + su değil + hiçbir town solid'i o tile'ı kaplamıyor.
//    Hedefler: her bina kapısı, her NPC'nin durduğu tile, her tarla parseli.
const townSolids = town.filter(p => p.solid).map(p => p.solid!);
const blocked = (tx: number, ty: number) => {
  const g = getTile(tx, ty);
  if (g.collision || g.biome === 'water') return true;
  const cx = tx * 16 + 8, cy = ty * 16 + 8;
  return townSolids.some(s => cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h);
};
const seen = new Set<string>([`${TOWN_SPAWN.tx},${TOWN_SPAWN.ty}`]);
const queue = [[TOWN_SPAWN.tx, TOWN_SPAWN.ty] as [number, number]];
while (queue.length) {
  const [tx, ty] = queue.pop()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = tx + dx, ny = ty + dy, k = `${nx},${ny}`;
    if (seen.has(k) || nx < 170 || nx > 215 || ny < 180 || ny > 225) continue;  // kasaba kutusu
    if (blocked(nx, ny)) continue;
    seen.add(k); queue.push([nx, ny]);
  }
}
const doorTiles = town.filter(p => p.kind === 'building').map(p => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16) + 1}`);
ok('reachable-all-building-doors', doorTiles.every(k => seen.has(k)));
ok('reachable-all-npcs', NPCS.every(n => seen.has(`${n.tx},${n.ty + 1}`) || seen.has(`${n.tx + 1},${n.ty}`) || seen.has(`${n.tx - 1},${n.ty}`)));
ok('reachable-all-farm-plots', town.filter(p => p.kind === 'farm_plot').every(p => seen.has(tileKey(p))));
ok('reachable-campfire-plaza', seen.has('192,196') && seen.has('187,197') && seen.has('197,197'));

// ─────────────────────────────────────────────────────────────────────────────
// Faz 11.1: İÇ MEKÂNLI EVLER (kind 'house' — buildings-count çapası bilerek AYRI)
// ─────────────────────────────────────────────────────────────────────────────
const houses = town.filter(p => p.kind === 'house');
console.log('evler:', houses.map(p => `${p.data!.id}@${tileKey(p)}`).join(' · '));
ok('house-count', houses.length === TD_HOUSES.length);
ok('house-data', houses.every(p => !!p.data?.id && !!p.data?.interiorId && !!p.data?.name && !!p.solid));
ok('house-interior-resolves', houses.every(p => !!INTERIORS[p.data!.interiorId!]));
// evler kasaba chunk'larında ve building sözleşmesiyle aynı geometri (anchor = kapı tile'ı)
ok('houses-in-town-chunks', townChunks.reduce((n, c) => n + c.filter(p => p.kind === 'house').length, 0) === TD_HOUSES.length);
ok('house-door-on-north-row-band', houses.every(p => Math.floor(p.y / 16) === TOWN_ORIGIN.ty - 2));
// ev solid'i başka hiçbir solid'le (bina/ateş/ağaç/NPC/kuyu…) kesişmez
const rectsOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const nonHouseSolids = town.filter(p => p.solid && p.kind !== 'house').map(p => p.solid!);
ok('house-no-solid-overlap', houses.every(hp => nonHouseSolids.every(s => !rectsOverlap(hp.solid!, s))));
// ev rect'inin içine NPC/sokak mobilyası/tarla/kapı düşmez (anchor kontrolü)
const inHouse = (x: number, y: number) => houses.some(hp => {
  const s = hp.solid!;
  return x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
});
ok('house-not-on-npc', NPCS.every(n => !inHouse(n.tx * 16 + 8, n.ty * 16 + 8)));
ok('house-not-on-street/farm', town.filter(p => p.kind === 'deco' || p.kind === 'farm_plot').every(p => !inHouse(p.x, p.y)));
// ev tabanı collision/su terrain'ine oturmaz (kapı önü dahil)
ok('house-ground-clear', houses.every(p => {
  const s = p.solid!;
  for (let ty = Math.floor(s.y / 16); ty <= Math.floor((s.y + s.h - 1) / 16) + 1; ty++)
    for (let tx = Math.floor(s.x / 16); tx <= Math.floor((s.x + s.w - 1) / 16); tx++) {
      const g = getTile(tx, ty);
      if (g.collision || g.biome === 'water') return false;
    }
  return true;
}));
// 🔒 spawn flood-fill'i ev kapılarına da ulaşır (kapı önü tile'ı — building'lerle aynı kural)
const houseDoorTiles = houses.map(p => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16) + 1}`);
ok('reachable-all-house-doors', houseDoorTiles.every(k => seen.has(k)));

console.log(`td-props: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
