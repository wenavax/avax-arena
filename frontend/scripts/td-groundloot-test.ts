// frontend/scripts/td-groundloot-test.ts
// Faz 9A.1 — yerdeki loot çapası (Node: `npx tsx scripts/td-groundloot-test.ts`).
// Biçim emsali: td-loot-test.ts (9A.0'ın çapası) — elle yazılmış ok/eq, pass/fail, exit(1).
//
// İki katman:
//  (1) SAF MANTIK — groundLoot.ts Node'da koşar (Phaser yok). Gerçek davranış test edilir:
//      çanta doluysa eşya yerde kalıyor mu, kapasite en eskiyi mi atıyor, elit boğazı vs.
//  (2) YAPISAL ÇAPA — loot'un HANGİ fonksiyonda düştüğü kaynak üstünden pinlenir. Çift
//      loot regresyonu (boss yolunda ikinci düşüş) yalnız böyle yakalanabilir: sahneler
//      Node'da instantiate edilemez, ama "despawnMonster loot çağırmıyor + her sahnede
//      TEK çağrı sitesi + TdBattleScene'de TEK rollLoot" üçlüsü sözleşmeyi kilitler.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rollGroundLoot, groundSpriteKind, nearestGround, takeGround, groundOverflow, dropOffset,
  rarityHex, pickupLabel, RARITY_FX, GROUND_SPRITE_KINDS, GROUND_CAP, PICKUP_RADIUS,
  BAG_HINT_COOLDOWN_MS, type GroundSpriteKind,
} from '../lib/game/td/groundLoot';
import { GROUND_ITEM_SPEC } from '../lib/game/td/sprites/groundItems';
import { LOOT_TABLES, RARITY_COLORS, type Rarity } from '../lib/game/lootTables';
import { REGION_MONSTERS, DUNGEON_ROSTERS } from '../lib/game/td/monsterData';
import { PlayerState, type InventoryItem } from '../lib/game/PlayerState';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const LIB = join(__dirname, '..', 'lib', 'game');
const read = (p: string) => readFileSync(join(LIB, p), 'utf8');
const worldSrc = read('td/TdWorldScene.ts');
const dungeonSrc = read('td/TdDungeonScene.ts');
const battleSrc = read('td/TdBattleScene.ts');
const combatSrc = read('td/combat.ts');
const groundSrc = read('td/groundLoot.ts');

/** `  private foo(` başlığından, aynı girintideki kapanış süslüsüne kadar gövde. */
function methodBody(src: string, sig: string): string {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  const end = src.indexOf('\n  }\n', i);
  return src.slice(i, end < 0 ? src.length : end + 4);
}
const count = (src: string, needle: string) => src.split(needle).length - 1;
/** Saflık denetimi KODA bakmalı — yorumlarda 'Phaser' kelimesi geçmesi ihlal değil. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ═════════════════════════════════════════════════════════════════════════════
// (1) SAF MANTIK
// ═════════════════════════════════════════════════════════════════════════════

// ─── (a) DÜNYA öldürmesi loot üretir ───
// rollGroundLoot rastgele → tek çağrı boş dönebilir; N denemede "hiç düşmeme"
// olasılığı pratikte sıfır (en düşük tavan 0.10 → 0.9^600 ≈ 1e-27).
const rolls = (type: string, elite: boolean, n: number) => {
  let drops = 0;
  for (let i = 0; i < n; i++) drops += rollGroundLoot(type, elite).length;
  return drops;
};
const worldTypes = [...new Set(Object.values(REGION_MONSTERS).flat().map(m => m.type))];
console.log('dünya canavar tipi:', worldTypes.length, '· zindan havuz tipi:',
  new Set(Object.values(DUNGEON_ROSTERS).flatMap(r => r.pool.map(m => m.type))).size);
ok('world-kill-drops-loot', rolls('wolf', false, 600) > 0);
ok('world-every-type-can-drop', worldTypes.every(t => rolls(t, false, 400) > 0));
ok('world-elite-drops-more', rolls('wolf', true, 2000) > rolls('wolf', false, 2000));
// elite boğazı TEK yerde: 'elite_' önekini rollGroundLoot koyuyor (sahneler kopyalamıyor)
ok('elite-prefix-in-ground-funnel', /elite_\$\{baseType\}/.test(groundSrc));
ok('elite-unknown-base-still-empty', rollGroundLoot('definitely_not_a_monster_xyz', true).length === 0);

// ─── (b) ZİNDAN trash öldürmesi loot üretir ───
const dungeonTrash = [...new Set(Object.values(DUNGEON_ROSTERS).flatMap(r => r.pool.map(m => m.type)))];
ok('dungeon-trash-drops-loot', dungeonTrash.every(t => rolls(t, false, 400) > 0));
// zindan boss'ları da tabloda var (TdBattleScene onları kendi rollLoot'uyla veriyor)
ok('dungeon-boss-types-have-tables', Object.values(DUNGEON_ROSTERS).every(r => !!LOOT_TABLES[r.boss.type]));

// ─── (c) ÇANTA DOLUYKEN eşya KAYBOLMAZ ───
const mkItem = (id: string): InventoryItem =>
  ({ id, name: id, sprite: 'weapon', type: 'weapon', stackable: false, count: 1 });
const ps = PlayerState.get();
ps.inventory = [];
for (let i = 0; i < 12; i++) ps.addItem(mkItem(`filler_${i}`));
eq('bag-filled-12', ps.inventory.length, 12);
const gi = { item: mkItem('excalibur'), rarity: 'legendary' as Rarity, x: 0, y: 0, bornAt: 0 };
const list = [gi];
ok('bag-full-take-returns-false', takeGround(ps, gi, list) === false);
eq('bag-full-item-stays-on-ground', list.length, 1);
ok('bag-full-same-object-on-ground', list[0] === gi);
ok('bag-full-not-in-inventory', !ps.inventory.some(i => i.id === 'excalibur'));
// yer açınca AYNI eşya alınabilir (yerde beklemiş olması onu bozmadı)
ps.inventory.pop();
ok('after-room-take-succeeds', takeGround(ps, gi, list) === true);
eq('after-room-ground-empty', list.length, 0);
ok('after-room-in-inventory', ps.inventory.some(i => i.id === 'excalibur'));
// stackable eşya 12/12'de bile yığınlanabilir (addItem sözleşmesi) — yerde takılıp kalmasın
ps.inventory = [];
for (let i = 0; i < 11; i++) ps.addItem(mkItem(`filler_${i}`));
ps.addItem({ id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion', stackable: true, count: 1 });
eq('bag-full-with-stack', ps.inventory.length, 12);
const stackDrop = { item: { id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion' as const, stackable: true, count: 1 }, x: 0, y: 0, bornAt: 0 };
const stackList = [stackDrop];
ok('stackable-picked-up-when-full', takeGround(ps, stackDrop, stackList) === true);
eq('stackable-ground-cleared', stackList.length, 0);
eq('stackable-count-merged', ps.inventory.find(i => i.id === 'potion_hp')?.count, 2);
ps.inventory = [];

// ─── Kapasite: en ESKİ gider, yeni düşen asla kurban değil ───
const many = Array.from({ length: GROUND_CAP + 8 }, (_, i) => ({ bornAt: i, id: i }));
const victims = groundOverflow(many, GROUND_CAP);
eq('overflow-count', victims.length, 8);
eq('overflow-oldest-first', victims.map(v => v.id), [0, 1, 2, 3, 4, 5, 6, 7]);
ok('overflow-newest-safe', !victims.some(v => v.bornAt >= GROUND_CAP));
eq('no-overflow-at-cap', groundOverflow(many.slice(0, GROUND_CAP), GROUND_CAP).length, 0);
eq('no-overflow-empty', groundOverflow([], GROUND_CAP).length, 0);
ok('cap-reasonable', GROUND_CAP >= 16 && GROUND_CAP <= 64);

// ─── Yakınlık toplaması ───
const near = [{ x: 100, y: 100 }, { x: 104, y: 100 }, { x: 400, y: 400 }];
eq('nearest-picks-closest', nearestGround(near, 103, 100), { x: 104, y: 100 });
ok('nearest-out-of-range-null', nearestGround(near, 300, 100) === null);
ok('nearest-empty-null', nearestGround([], 0, 0) === null);
ok('pickup-radius-sane', PICKUP_RADIUS >= 8 && PICKUP_RADIUS <= 24);
ok('bag-hint-cooldown-sane', BAG_HINT_COOLDOWN_MS >= 1000);
// serpme deterministik + üst üste binmiyor
eq('drop-offset-deterministic', dropOffset(2), dropOffset(2));
ok('drop-offsets-distinct', new Set([0, 1, 2, 3, 4, 5].map(i => JSON.stringify(dropOffset(i)))).size === 6);
ok('drop-offsets-small', [0, 1, 2, 3, 4, 5, 6, 7].every(i => Math.abs(dropOffset(i).dx) <= 12 && Math.abs(dropOffset(i).dy) <= 12));

// ─── Görsel sözleşme: sprite kapsaması + rarity ayırt edilebilirliği ───
// 🔒 item.sprite alanı 9A.1'e kadar HİÇ okunmuyordu. Artık okuyoruz → tablodaki her
// değerin bir görseli olmak ZORUNDA (Record<GroundSpriteKind> derleme çapasının
// runtime tamamlayıcısı: tablo tarafı `sprite: string` olduğu için derleyici görmez).
const tableSprites = [...new Set(Object.values(LOOT_TABLES).flat().map(e => e.item.sprite))].sort();
console.log('LOOT_TABLES sprite değerleri:', tableSprites.join(', '));
ok('all-table-sprites-have-visual', tableSprites.every(s => s in GROUND_ITEM_SPEC));
eq('sprite-kinds-match-spec', [...GROUND_SPRITE_KINDS].sort(), Object.keys(GROUND_ITEM_SPEC).sort());
ok('spec-sizes-small', Object.values(GROUND_ITEM_SPEC).every(s => s.w > 0 && s.h > 0 && s.w <= 14 && s.h <= 14));
ok('spec-draw-is-fn', Object.values(GROUND_ITEM_SPEC).every(s => typeof s.draw === 'function'));
ok('unknown-sprite-falls-back', groundSpriteKind('totally_unknown') === 'material');
ok('known-sprites-passthrough', GROUND_SPRITE_KINDS.every(k => groundSpriteKind(k) === k));
ok('rarity-fx-complete', RARITIES.every(r => !!RARITY_FX[r]));
ok('rarity-fx-glow-monotonic', RARITIES.every((r, i) => i === 0 || RARITY_FX[r].glowR >= RARITY_FX[RARITIES[i - 1]].glowR));
// legendary UZAKTAN ayırt edilebilmeli: huzme YALNIZ onda
eq('only-legendary-has-beam', RARITIES.filter(r => RARITY_FX[r].beam), ['legendary']);
ok('legendary-most-sparkles', RARITIES.every(r => r === 'legendary' || RARITY_FX[r].sparkles < RARITY_FX.legendary.sparkles));
ok('rarity-hex-format', RARITIES.every(r => /^#[0-9a-f]{6}$/.test(rarityHex(r))));
eq('rarity-hex-matches-colors', rarityHex('legendary'), `#${RARITY_COLORS.legendary.toString(16)}`);
eq('pickup-label-english', pickupLabel(mkItem('Iron Sword')), '+ Iron Sword');

// ═════════════════════════════════════════════════════════════════════════════
// (2) YAPISAL ÇAPA — loot boğazlarının yeri
// ═════════════════════════════════════════════════════════════════════════════

// ─── (a) dünya boğazı: killMob ───
const killMob = methodBody(worldSrc, '  private killMob(');
ok('world-killMob-found', killMob.length > 0);
ok('world-killMob-drops', killMob.includes('this.dropGroundLoot(') && killMob.includes('rollGroundLoot('));
ok('world-killMob-elite-aware', killMob.includes('rollGroundLoot(m.entry.type, m.isElite)'));
ok('world-live-saves', killMob.includes("this.tdMode === 'live'") && killMob.includes('ps.save()'));

// ─── (b) zindan boğazı: heroAttackMob ───
const heroAttackMob = methodBody(dungeonSrc, '  private heroAttackMob(');
ok('dungeon-heroAttackMob-found', heroAttackMob.length > 0);
ok('dungeon-heroAttackMob-drops', heroAttackMob.includes('this.dropGroundLoot(') && heroAttackMob.includes('rollGroundLoot('));

// ─── (d) 🔒 ÇİFT LOOT ÇAPASI ───
// despawnMonster ÇOKLU giriş noktası: haritada dövülen trash + TdBattle'da yenilen BOSS
// ikisi de oraya düşer. Boss loot'u TdBattleScene'de veriliyor → despawnMonster'a bir
// düşürme eklenirse boss ÇİFT loot verir. Üç bağımsız kilit:
const worldDespawn = methodBody(worldSrc, '  private despawnMonster(');
const dungeonDespawn = methodBody(dungeonSrc, '  private despawnMonster(');
ok('world-despawn-found', worldDespawn.length > 0);
ok('dungeon-despawn-found', dungeonDespawn.length > 0);
const noLoot = (body: string) => !/rollLoot|rollGroundLoot|dropGroundLoot/.test(body);
ok('world-despawn-has-no-loot', noLoot(worldDespawn));
ok('dungeon-despawn-has-no-loot', noLoot(dungeonDespawn));
// TEK çağrı sitesi (tanım + 1 çağrı = 2 geçiş): yeni bir düşürme yolu eklenirse kırmızı
eq('world-dropGroundLoot-mentions', count(worldSrc, 'dropGroundLoot'), 2);
eq('dungeon-dropGroundLoot-mentions', count(dungeonSrc, 'dropGroundLoot'), 2);
eq('world-rollGroundLoot-callsites', count(worldSrc, 'rollGroundLoot('), 1);
eq('dungeon-rollGroundLoot-callsites', count(dungeonSrc, 'rollGroundLoot('), 1);
// boss funnel TAM BİR KEZ döner: TdBattleScene'deki tek rollLoot çağrısı
eq('battle-rollLoot-callsites', count(battleSrc, 'rollLoot('), 1);
ok('battle-does-not-use-ground-funnel', !battleSrc.includes('groundLoot') && !battleSrc.includes('rollGroundLoot'));
// sahneler rollLoot'u DOĞRUDAN çağırmıyor (tek boğaz rollGroundLoot)
ok('world-no-direct-rollLoot', !/[^d]rollLoot\(/.test(worldSrc));
ok('dungeon-no-direct-rollLoot', !/[^d]rollLoot\(/.test(dungeonSrc));
// boss yolu: startBattle → battle-end → despawnMonster (düşürme YOK); boss this.mons'a
// hiç girmiyor (isBoss:false ile push edilir), heroAttackMob yalnız onSpaceAction'dan
// çağrılır ve o this.mons'u tarar → boss trash boğazına ASLA ulaşamaz.
const startBattle = methodBody(dungeonSrc, '  private startBattle(');
ok('dungeon-startBattle-no-loot', noLoot(startBattle));
ok('dungeon-startBattle-despawns', startBattle.includes('despawnMonster(m)'));
eq('dungeon-heroAttackMob-callsites', count(dungeonSrc, 'this.heroAttackMob('), 1);
const onSpaceAction = methodBody(dungeonSrc, '  private onSpaceAction(');
ok('dungeon-space-scans-trash-only', onSpaceAction.includes('for (const m of this.mons)')
  && !onSpaceAction.includes('this.boss'));
ok('dungeon-mons-never-boss', dungeonSrc.includes('isBoss: false'));
ok('dungeon-boss-kept-separate', dungeonSrc.includes('this.boss = {'));

// ─── Saflık + save şeması + SPACE dokunulmazlığı ───
ok('combat-still-pure', !/this\.|Phaser|scene/.test(stripComments(combatSrc)));
ok('groundloot-pure-no-phaser', !/phaser|Phaser|document|window/.test(stripComments(groundSrc)));
// save şeması DEĞİŞMEDİ: yer eşyaları RAM'de; ps.save() yalnız envanter/altın yazar
ok('save-version-still-1', read('PlayerState.ts').includes('v: 1'));
ok('playerstate-untouched-by-ground', !/ground/i.test(read('PlayerState.ts')));
ok('tdstate-untouched-by-ground', !/ground/i.test(read('td/tdState.ts')));
ok('ground-is-ram-only', worldSrc.includes('private chunkGround = new Map<string, GroundItem[]>()'));
// chunk cull'ı yer eşyalarını temizliyor (sızıntı çapası)
const evict = methodBody(worldSrc, '  private evictChunk(');
ok('evict-cleans-ground', evict.includes('this.chunkGround.get(key)') && evict.includes('this.chunkGround.delete(key)'));
// SPACE zinciri (savaş > toplama) DEĞİŞMEDİ — otomatik toplama update()'te
const onSpaceGather = methodBody(worldSrc, '  private onSpaceGather(');
ok('space-chain-untouched', !/[Gg]round/.test(onSpaceGather));
ok('pickup-runs-in-update', worldSrc.includes('this.scanGroundPickup();') && dungeonSrc.includes('this.scanGroundPickup();'));
// çanta doluysa kırmızı ipucu (İngilizce, mevcut Faz 7 metniyle birebir)
ok('world-bag-full-hint', worldSrc.includes("this.showRedHint('bag is full — make room 🎒')"));
ok('dungeon-bag-full-hint', dungeonSrc.includes('BAG_FULL_HINT'));
// mobil: td-ui-* CustomEvent deseni bozulmadı
ok('mobile-ui-events-intact', ['td-ui-potion', 'td-ui-bag', 'td-ui-map'].every(e => worldSrc.includes(e)));

console.log(`td-groundloot: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
