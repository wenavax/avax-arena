import { HUB_GAMES } from '../lib/game/hub/hubGames';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? `  ✓ ${m}` : `  ✗ ${m}`); if (!c) fails++; };

ok(HUB_GAMES.length === 9, `9 oyun kayıtlı (${HUB_GAMES.length})`);
ok(new Set(HUB_GAMES.map(g => g.id)).size === 9, 'id benzersiz');
ok(new Set(HUB_GAMES.map(g => `${g.door.tx},${g.door.ty}`)).size === 9, 'kapı koordinatı benzersiz');
ok(HUB_GAMES.every(g => g.url.startsWith('/') && !g.url.startsWith('/avalanche')), 'url / ile başlar, basePath İÇERMEZ');
ok(HUB_GAMES.every(g => g.door.tx >= 1 && g.door.tx <= 30 && g.door.ty >= 1 && g.door.ty <= 24), 'kapılar 32x26 harita içinde');
ok(HUB_GAMES.every(g => g.size.w >= 3 && g.size.h >= 3), 'binalar en az 3x3');

console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
