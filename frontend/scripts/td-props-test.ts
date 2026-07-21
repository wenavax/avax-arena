import { propsForChunk, allTownProps, dungeonDoors, TOWN_ORIGIN } from '../lib/game/td/worldProps';
import { getTile } from '../lib/game/td/worldMap';
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
const c44 = propsForChunk(4, 4);
ok('town-buildings-in-chunk', c44.filter(p => p.kind === 'building').length === HUB_GAMES.length);
// bina rect'leri içinde otomatik ağaç yok
const solids = town.filter(p => p.solid).map(p => p.solid!);
const inSolid = (x: number, y: number) => solids.some(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
ok('no-tree-in-buildings', c44.filter(p => p.kind === 'tree').every(p => !inSolid(p.x, p.y)));
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
console.log(`td-props: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
