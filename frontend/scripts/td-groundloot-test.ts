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
  BAG_HINT_COOLDOWN_MS, BAG_FULL_HINT, type GroundSpriteKind,
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

/**
 * `  private foo(` başlığından gövdenin SONUNA kadar — GERÇEK süslü eşleştirmesiyle.
 *
 * ⚠️ Eski sürüm ilk `'\n  }\n'` dizisine kadar kesiyordu (9A.1 review'ı): gövde içindeki
 * 2 boşluk girintili herhangi bir `}` (çok satırlı nesne değişmezi, bir yeniden biçimleme)
 * gövdeyi SESSİZCE kırpardı → `noLoot(kırpılmış gövde)` bomboş string üstünde trivially
 * geçer, çift-loot çapası YALAN SÖYLERDİ. Artık string/şablon/yorum farkında bir tarayıcı
 * dengeyi sayıyor; imza bulunamaz veya süslüler dengelenemezse SESSİZCE '' dönmek yerine
 * throw ediyoruz (test gürültülü kırmızı yansın, sahte yeşil vermesin).
 */
function methodBody(src: string, sig: string): string {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error(`methodBody: imza bulunamadı → ${sig}`);
  let j = src.indexOf('{', i);
  if (j < 0) throw new Error(`methodBody: gövde açılışı yok → ${sig}`);
  let depth = 0;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j + 2); if (j < 0) break; j++; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (j++; j < src.length && src[j] !== q; j++) if (src[j] === '\\') j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error(`methodBody: süslüler dengelenemedi → ${sig}`);
}
const count = (src: string, needle: string) => src.split(needle).length - 1;
/** Saflık denetimi KODA bakmalı — yorumlarda 'Phaser' kelimesi geçmesi ihlal değil. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
/** Sayım çapaları KODU saymalı: 'dropGroundLoot' diyen bir yorum testi kırmasın. */
const worldCode = stripComments(worldSrc), dungeonCode = stripComments(dungeonSrc);

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
// 🔧 9A.1 review'ı: `elite_` ÖNEKİ ÖLÜYDÜ. lootTables.lookupTable ilk iş öneki soyup
// soyulmuş anahtarı tercih ediyor ve LOOT_TABLES'ta hiç `elite_*` anahtarı yok → önek
// no-op'tu. Eski test bunu KAYNAK STRING'İYLE (`/elite_\$\{baseType\}/`) "koruyordu";
// davranışa değil metne bakan bir çapa, davranış ne olursa olsun yeşil kalır. Yerine
// gerçek davranış: (i) tabloda elite_ anahtarı yok, (ii) elitlik SADECE boolean'dan gelir.
ok('no-elite-keys-in-tables', !Object.keys(LOOT_TABLES).some(k => k.startsWith('elite_')));
const idsFrom = (type: string, n: number) => {
  const s = new Set<string>();
  for (let i = 0; i < n; i++) for (const d of rollGroundLoot(type, false)) s.add(d.item.id);
  return [...s].sort();
};
eq('elite-prefix-would-be-noop', idsFrom('elite_wolf', 3000), idsFrom('wolf', 3000));
// elitliğin TEK taşıyıcısı boolean: aynı taban tip, farklı bayrak → ölçülebilir fark
ok('elite-flag-is-the-only-lever', rolls('wolf', true, 2000) > rolls('wolf', false, 2000) * 1.3);
// elit rarity yükseltmesi de boolean'dan: 2000 elit rulosunda common ORANI düşer
const rarityMix = (elite: boolean, n: number) => {
  let common = 0, total = 0;
  for (let i = 0; i < n; i++) for (const d of rollGroundLoot('wolf', elite)) { total++; if (d.rarity === 'common') common++; }
  return total ? common / total : 1;
};
ok('elite-upgrades-rarity', rarityMix(true, 2000) < rarityMix(false, 2000));
ok('elite-unknown-base-still-empty', rollGroundLoot('definitely_not_a_monster_xyz', true).length === 0);
// ölü önek koda geri sızmasın (kural artık lootTables'ta, groundLoot'ta değil)
ok('ground-funnel-has-no-dead-prefix', !/elite_/.test(stripComments(groundSrc)));

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
// `s in GROUND_ITEM_SPEC` KULLANMA: prototip zincirini de tarar → sprite:'constructor'
// kapsama testini geçer, sonra ekranda fallback olarak çizilirdi (9A.1 review'ı).
const SPEC_KEYS = new Set(Object.keys(GROUND_ITEM_SPEC));
ok('all-table-sprites-have-visual', tableSprites.every(s => SPEC_KEYS.has(s)));
ok('inherited-keys-are-not-coverage', !SPEC_KEYS.has('constructor') && !SPEC_KEYS.has('toString'));
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
// beklenen değer de padStart'lı olmalı: 0x100000 altı bir renk rarityHex DOĞRUYKEN
// testi kırardı (ör. 0x0fabcd → '0fabcd' vs 'fabcd') — 9A.1 review'ı.
ok('rarity-hex-matches-colors', RARITIES.every(
  r => rarityHex(r) === `#${RARITY_COLORS[r].toString(16).padStart(6, '0')}`));
eq('pickup-label-english', pickupLabel(mkItem('Iron Sword')), '+ Iron Sword');

// ═════════════════════════════════════════════════════════════════════════════
// (2) YAPISAL ÇAPA — loot boğazlarının yeri
// ═════════════════════════════════════════════════════════════════════════════

// ─── (a) dünya boğazı: killMob ───
const killMob = methodBody(worldSrc, '  private killMob(');
ok('world-killMob-found', killMob.length > 0);
ok('world-killMob-drops', killMob.includes('this.dropGroundLoot(') && killMob.includes('rollGroundLoot('));
// Faz 9B.1: 3. argüman gece şansı (lootLuckMult) — ilk iki argüman AYNEN korunmalı.
ok('world-killMob-elite-aware', killMob.includes('rollGroundLoot(m.entry.type, m.isElite'));
ok('world-killMob-night-luck', /rollGroundLoot\(m\.entry\.type, m\.isElite,\s*lootLuckMult\(this\.tdState\.dayTime\)\)/.test(killMob));
ok('world-live-saves', killMob.includes("this.tdMode === 'live'") && killMob.includes('ps.save()'));

// ─── (b) zindan boğazı: killMobD ───
// 9A.2'de ölüm bloğu heroAttackMob'un içinden `killMobD`'ye çıkarıldı: DoT hasarı da
// öldürebiliyor, ikinci bir ödül yolu açmak bu çapayı anlamsızlaştırırdı. Boğaz hâlâ TEK.
const heroAttackMob = methodBody(dungeonSrc, '  private heroAttackMob(');
ok('dungeon-heroAttackMob-found', heroAttackMob.length > 0);
ok('dungeon-killMobD-drops', methodBody(dungeonSrc, '  private killMobD(').includes('this.dropGroundLoot(')
  && methodBody(dungeonSrc, '  private killMobD(').includes('rollGroundLoot('));

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
// TEK çağrı sitesi: yeni bir düşürme yolu eklenirse kırmızı. Sayım YORUMSUZ kaynakta —
// eskiden ham metin sayılıyordu, `dropGroundLoot` diyen bir doc yorumu testi kırardı.
eq('world-dropGroundLoot-defs', count(worldCode, 'private dropGroundLoot('), 1);
eq('dungeon-dropGroundLoot-defs', count(dungeonCode, 'private dropGroundLoot('), 1);
eq('world-dropGroundLoot-callsites', count(worldCode, 'this.dropGroundLoot('), 1);
eq('dungeon-dropGroundLoot-callsites', count(dungeonCode, 'this.dropGroundLoot('), 1);
eq('world-rollGroundLoot-callsites', count(worldCode, 'rollGroundLoot('), 1);
eq('dungeon-rollGroundLoot-callsites', count(dungeonCode, 'rollGroundLoot('), 1);
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
// 9A.2: iki çağıran var — onSpaceAction (SPACE) ve castDamageSkill (yetenek). İKİSİ DE
// yalnız this.mons'u tarar (nearestTrash), boss'a asla ulaşmaz; sayı 3'e çıkarsa yeni
// çağıranın havuzu td-abilities-test'te ayrıca denetleniyor.
eq('dungeon-heroAttackMob-callsites', count(dungeonCode, 'this.heroAttackMob('), 2);
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
// ⚠️ `/ground/i` KULLANMA: "back|ground" alt dizesi eşleşir → bir `backgroundColor`
// eklemek bu çapaları sebepsiz kırmızıya çevirirdi (9A.1 review'ı). `\bground` sözcük
// sınırı ister; "background"da 'ground' öncesi sınır YOK, dolayısıyla eşleşmez.
const mentionsGround = (s: string) => /(?<!back)ground/i.test(s);
ok('ground-regex-ignores-background', !mentionsGround('const backgroundColor = 1;')
  && mentionsGround('this.chunkGround') && mentionsGround('ground item')
  && !mentionsGround("backgroundColor: '#141c24cc'"));
ok('playerstate-untouched-by-ground', !mentionsGround(read('PlayerState.ts')));
ok('tdstate-untouched-by-ground', !mentionsGround(read('td/tdState.ts')));
ok('ground-is-ram-only', worldSrc.includes('private chunkGround = new Map<string, GroundItem[]>()'));
// SPACE zinciri (savaş > toplama) DEĞİŞMEDİ — otomatik toplama update()'te
const onSpaceGather = methodBody(worldSrc, '  private onSpaceGather(');
ok('space-chain-untouched', !mentionsGround(onSpaceGather));
ok('pickup-runs-in-update', worldSrc.includes('this.scanGroundPickup();') && dungeonSrc.includes('this.scanGroundPickup();'));
// çanta doluysa kırmızı ipucu — metin artık groundLoot.ts'te TEK evde (iki sahne aynı)
eq('bag-full-hint-english', BAG_FULL_HINT, 'bag is full — make room 🎒');
ok('world-bag-full-hint', worldCode.includes('this.showRedHint(BAG_FULL_HINT'));
ok('dungeon-bag-full-hint', dungeonCode.includes('setText(BAG_FULL_HINT)'));
ok('bag-hint-text-not-duplicated', count(worldCode, 'bag is full') === 0 && count(dungeonCode, 'bag is full') === 0);

// ═════════════════════════════════════════════════════════════════════════════
// (3) PHASER KAYNAK YAŞAM DÖNGÜSÜ — 9A.1 review'ında AÇIK olan kapsama
// ═════════════════════════════════════════════════════════════════════════════
// ❗ DÜRÜSTLÜK NOTU: bu blok YALNIZCA YAPISAL doğrulayabilir. Phaser sahnesi Node'da
// ayağa kalkmadığı için "tween gerçekten öldü mü" çalıştırılarak ölçülemez; onun yerine
// silme yollarının tekilliği ve killTweensOf eşlemesi kaynak üstünden kilitlenir.

// ─── #1 SIZINTI: destroy() tween'i öldürmez → her silme yolu destroyGround'dan geçmeli ───
// (Phaser'ın GameObject.destroy'unda killTweensOf YOK; TweenManager yalnız sahne DESTROY
// olunca temizler, TdWorldScene ise oturum boyunca yalnızca pause edilir.)
for (const [name, src, code, paths] of [
  // her sahnedeki TÜM yer-eşyası silme yolları — üçü de destroyGround'dan geçmeli
  ['world', worldSrc, worldCode,
    ['  private evictChunk(', '  private trimGround(', '  private scanGroundPickup(']],
  ['dungeon', dungeonSrc, dungeonCode,
    ['  private dropGroundLoot(', '  private scanGroundPickup(']],
] as const) {
  const dg = methodBody(src, '  private destroyGround(');
  ok(`${name}-destroyGround-exists`, dg.length > 0);
  ok(`${name}-destroyGround-kills-tweens`, dg.includes('this.tweens.killTweensOf(o)') && dg.includes('o.destroy()'));
  eq(`${name}-destroyGround-callsites`, count(code, 'this.destroyGround('), paths.length);
  for (const sig of paths) {
    const body = stripComments(methodBody(src, sig));
    ok(`${name}-${sig.trim()}-uses-destroyGround`, body.includes('this.destroyGround('));
    // YER EŞYASI üstünde çıplak destroy KALMAMALI (tween'i ölü objeye çakılı bırakırdı).
    // NOT: evictChunk'taki `cp.objs.forEach(o => o.destroy())` chunk PROP'larıdır — onların
    // sonsuz tween'i yok ve kapsam dışı; bu yüzden yalnız yer-eşyası değişkenleri denetlenir.
    ok(`${name}-${sig.trim()}-no-bare-objs-destroy`,
      !/\b(g|ground|victim|drop|gi)\.objs\.forEach\(\s*o\s*=>\s*o\.destroy\(\)\s*\)/.test(body));
  }
}
// tween'ler gerçekten sonsuz (bu yüzden sızıntı MONOTON) — düşürücüde repeat:-1 var
ok('ground-tweens-are-infinite', count(methodBody(worldSrc, '  private dropGroundLoot('), 'repeat: -1') >= 3);

// ─── #4 SIZINTI: anahtar ÖLÜM noktasından gelmeli, serpilmiş konumdan değil ───
// dropOffset 9px'e kadar kaydırır; ±1 halkasının kenarında ölen mob ±2 chunk'a düşerse
// o anahtar this.chunks'ta hiç oluşmaz → evictChunk oraya uğramaz → kalıcı sızıntı.
const wDrop = methodBody(worldSrc, '  private dropGroundLoot(');
ok('drop-key-from-kill-pos', /const key = `\$\{Math\.floor\(x \/ \(CHUNK \* TILE\)\)\},\$\{Math\.floor\(y \/ \(CHUNK \* TILE\)\)\}`/.test(wDrop));
ok('drop-key-not-from-scatter', !/Math\.floor\(g[xy] \//.test(wDrop));
eq('drop-key-computed-once', count(stripComments(wDrop), 'const key ='), 1);
ok('drop-still-scatters-visually', wDrop.includes('dropOffset(i)') && wDrop.includes('x + dx') && wDrop.includes('y + dy'));
// chunk cull'ı yer eşyalarını temizliyor (sızıntı çapası)
const evict = methodBody(worldSrc, '  private evictChunk(');
ok('evict-cleans-ground', evict.includes('this.chunkGround.get(key)') && evict.includes('this.chunkGround.delete(key)'));
ok('evict-uses-destroyGround', evict.includes('this.destroyGround('));

// ─── #5 sıcak yol: yerde eşya yokken per-frame anahtar kurulmasın ───
ok('world-scan-early-returns', methodBody(worldSrc, '  private scanGroundPickup(').includes('if (!this.chunkGround.size) return;'));
ok('dungeon-scan-early-returns', methodBody(dungeonSrc, '  private scanGroundPickup(').includes('if (!this.ground.length) return;'));

// ─── #3 ipucu yanıp sönmesi + zindan mesaj ezmesi ───
const wScan = methodBody(worldSrc, '  private scanGroundPickup(');
const dScan = methodBody(dungeonSrc, '  private scanGroundPickup(');
// gösterim kilidi = yeniden-gösterim beklemesi (aksi halde 1.2sn'de kaybolur, 2.5sn'de döner)
ok('world-hint-hold-equals-cooldown', wScan.includes('this.showRedHint(BAG_FULL_HINT, BAG_HINT_COOLDOWN_MS)'));
ok('world-showRedHint-takes-hold', worldSrc.includes('private showRedHint(msg: string, holdMs = 1200)'));
ok('dungeon-hint-hold-equals-cooldown', count(dScan, 'BAG_HINT_COOLDOWN_MS') === 2 && !/hintLockUntil = t \+ 1200/.test(dScan));
// zindan: '👑 Dungeon cleared!' 2.5sn kilidini toplama ipucu EZMEMELİ
ok('dungeon-scan-respects-hint-lock', /t > this\.hintLockUntil/.test(dScan));
ok('dungeon-clear-msg-sets-lock', methodBody(dungeonSrc, '  private despawnMonster(').includes('this.hintLockUntil = this.time.now + 2500'));
// dünya: kilitli başka bir kırmızı uyarı varsa onu da ezme
ok('world-scan-respects-red-hint-lock', /t > this\.redHintUntil/.test(wScan));

// ─── methodBody çıkarıcısının KENDİSİ: sessiz kırpma = sahte yeşil ───
// (eski sürüm ilk '\n  }\n' dizisinde keserdi; içinde 2-boşluk girintili `}` olan bir
//  gövde bomboş dönerdi ve noLoot() trivially geçerdi.)
const trapSrc = [
  '  private trap(): void {',
  '    const cfg = {',
  '      a: 1,',
  '  };', // 2 boşluk girintili kapanış — eski çıkarıcının tuzağı
  '    this.dropGroundLoot(0, 0, []);',
  '  }',
  '', ].join('\n');
const trapBody = methodBody(trapSrc, '  private trap(');
ok('methodBody-survives-indented-brace', trapBody.includes('this.dropGroundLoot(0, 0, []);'));
ok('methodBody-ignores-braces-in-strings', methodBody('  private s(): void {\n    const t = "}";\n    const u = 1;\n  }\n', '  private s(').includes('const u = 1;'));
let threw = false;
try { methodBody(worldSrc, '  private definitelyNotAMethod('); } catch { threw = true; }
ok('methodBody-throws-on-missing', threw);
// mobil: td-ui-* CustomEvent deseni bozulmadı
ok('mobile-ui-events-intact', ['td-ui-potion', 'td-ui-bag', 'td-ui-map'].every(e => worldSrc.includes(e)));

console.log(`td-groundloot: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
