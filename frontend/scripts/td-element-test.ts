// frontend/scripts/td-element-test.ts
// Faz 9A.3 — element etkililiği çapası (Node: `npx tsx scripts/td-element-test.ts`).
// Biçim emsali: td-abilities-test.ts / td-groundloot-test.ts.
//
// İki katman:
//  (1) SAF MANTIK — elemental.ts + combat.ts Node'da koşar (Phaser yok). Çarpan GERÇEKTEN
//      hasarı değiştiriyor mu, elit öneki soyuluyor mu, her canavar tipi bir elemente
//      çözülüyor mu: davranış üstünden. Rastgelelik `Math.random` sabitlenerek kapatılır.
//  (2) YAPISAL ÇAPA — çarpanın İKİ YÖNDE de bağlı olduğu ve combat.ts'in SAF kaldığı
//      kaynak üstünden pinlenir (sahneler Node'da instantiate edilemez). Kaynağa bakan
//      her iddia td-groundloot-test.ts'in yorum/string farkında süslü tarayıcısını
//      kullanır — naif kırpma sessizce boş gövde döndürüp sahte yeşil verirdi.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  baseMonsterType, monsterElement, classElement, attackElement, elementHex,
  heroElemFx, mobElemFx, damageHex, FALLBACK_ELEMENT, WEAK_HEX, ELEM_FLOAT_COOLDOWN_MS,
} from '../lib/game/td/elemental';
import { heroHit, mobHit } from '../lib/game/td/combat';
import {
  MONSTER_ELEMENTS, CLASS_ELEMENTS, ELEMENT_COLORS, ELEMENT_ICONS,
  getElementMultiplier, type Element,
} from '../lib/game/elements';
import { CLASS_SKILLS } from '../lib/game/skills';
import { REGION_MONSTERS, DUNGEON_ROSTERS } from '../lib/game/td/monsterData';
import type { PlayerClass } from '../lib/game/PlayerState';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const CLASSES: PlayerClass[] = ['knight', 'mage', 'archer'];
const LIB = join(__dirname, '..', 'lib', 'game');
const read = (p: string) => readFileSync(join(LIB, p), 'utf8');
const worldSrc = read('td/TdWorldScene.ts');
const dungeonSrc = read('td/TdDungeonScene.ts');
const combatSrc = read('td/combat.ts');
const elementalSrc = read('td/elemental.ts');

/** td-groundloot-test.ts'ten birebir: yorum/string farkında GERÇEK süslü eşleştirmesi. */
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
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const worldCode = stripComments(worldSrc), dungeonCode = stripComments(dungeonSrc);

/** Rastgeleliği sabitle: 0.5 → krit YOK, varyans tam 1.0 → hasar deterministik. */
function withRandom<T>(v: number, fn: () => T): T {
  const real = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = real; }
}

// ═════════════════════════════════════════════════════════════════════════════
// (1) SAF MANTIK
// ═════════════════════════════════════════════════════════════════════════════

// ─── (a) 🔴 ELİT ÖNEKİ SOYMA — soyma OLMAZSA elit 'earth' fallback'ine düşer ───
// Çapa tipi: 'skeleton' → 'shadow', ama 'elite_skeleton' tabloda YOK.
ok('çapa kurulumu: elite_skeleton tabloda yok', MONSTER_ELEMENTS['elite_skeleton'] === undefined);
ok('çapa kurulumu: skeleton fallback DEĞİL', MONSTER_ELEMENTS['skeleton'] !== FALLBACK_ELEMENT);
eq('elite_ soyulur', baseMonsterType('elite_skeleton'), 'skeleton');
eq('önek yoksa tip aynen kalır', baseMonsterType('skeleton'), 'skeleton');
eq('soyulmuş arama shadow verir', monsterElement('elite_skeleton'), 'shadow');
ok('soyma sonucu ham aramanın fallback\'inden FARKLI',
  monsterElement('elite_skeleton') !== (MONSTER_ELEMENTS['elite_skeleton'] || FALLBACK_ELEMENT));
// Aynı iddia bir avuç gerçek tip üzerinde (tek tipe bel bağlamayalım — tablo değişebilir).
let stripProven = 0;
for (const t of Object.keys(MONSTER_ELEMENTS)) {
  if (MONSTER_ELEMENTS[t] === FALLBACK_ELEMENT) continue;
  eq(`elit soyma: elite_${t}`, monsterElement('elite_' + t), MONSTER_ELEMENTS[t]);
  stripProven++;
}
ok('soyma en az 20 tipte kanıtlandı', stripProven >= 20);
// Soyma çarpanı da DEĞİŞTİRİR: mage (fire) vs elite_frost_giant (ice) → üstün.
eq('elit soyma çarpanı değiştirir (mage → elite_frost_giant)',
  heroElemFx('mage', 'elite_frost_giant').mult, 1.5);
// Soyma OLMASA çarpan fallback'ten hesaplanırdı (fire vs earth = 0.67) → yön bile ters.
eq('soyulmayan tip fallback çarpanı verirdi', getElementMultiplier('fire', FALLBACK_ELEMENT), 0.67);
ok('soyma çarpanı GERÇEKTEN değiştiriyor',
  heroElemFx('mage', 'elite_frost_giant').mult !== getElementMultiplier('fire', FALLBACK_ELEMENT));
// Sadece ÖNEK soyulur — ortada/sonda geçen 'elite_' bozulmamalı.
eq('önek yalnız baştan soyulur', baseMonsterType('void_elite_stalker'), 'void_elite_stalker');

// ─── (b) KAPSAMA: monsterData'daki HER tip bir elemente çözülmeli ───
// Fallback'e düşen tip = tasarım kararı; açıkça listelenmezse test kırılır ve
// listeyi BASAR (sessiz 'earth' yığılması 9A.0'ın loot dersiydi).
const FALLBACK_ALLOWLIST: string[] = [];   // bilinçli olarak 'earth' fallback'ine bırakılanlar
const allTypes = new Set<string>();
const bossTypes = new Set<string>();
for (const k of Object.keys(REGION_MONSTERS)) for (const m of REGION_MONSTERS[k]) allTypes.add(m.type);
for (const k of Object.keys(DUNGEON_ROSTERS)) {
  const r = DUNGEON_ROSTERS[k];
  for (const m of r.pool) allTypes.add(m.type);
  if (r.boss) { allTypes.add(r.boss.type); bossTypes.add(r.boss.type); }
}
const unmapped = [...allTypes].filter(t => MONSTER_ELEMENTS[t] === undefined).sort();
const unexpected = unmapped.filter(t => !FALLBACK_ALLOWLIST.includes(t));
if (unexpected.length) console.error('EŞLENMEMİŞ TİPLER (fallback → earth):\n  ' + unexpected.join('\n  '));
if (FALLBACK_ALLOWLIST.length) console.log('Bilinçli fallback listesi: ' + FALLBACK_ALLOWLIST.join(', '));
eq('monsterData\'daki her tip eşlenmiş (izin listesi dışında)', unexpected, []);
ok('tip sayımı çürümedi (≥100 tip tarandı)', allTypes.size >= 100);
for (const t of allTypes) {
  ok(`element çözülüyor: ${t}`, (['fire', 'water', 'wind', 'ice', 'earth', 'thunder', 'shadow', 'light'] as Element[])
    .includes(monsterElement(t)));
}
// Boss'lar da kapsamda (TdBattle'da 13/14 boss 'earth'e düşüyordu — 9A.3 bunu kapattı).
ok('boss sayımı çürümedi', bossTypes.size >= 10);
for (const t of bossTypes) ok(`boss eşlenmiş: ${t}`, MONSTER_ELEMENTS[t] !== undefined);
// Ekleme YALNIZ EKLEME: 9A.3 öncesi girişler aynen duruyor mu (anlık görüntü çapası).
const PRE_9A3: Record<string, Element> = {
  skeleton: 'shadow', ghost: 'shadow', demon: 'fire', spider: 'earth', bat: 'wind',
  slime: 'water', wolf: 'earth', treant: 'earth', dragon: 'ice', frost_dragon: 'ice',
  boss_frost: 'ice', boss_frost_v2: 'ice', ogre: 'earth', ice_golem: 'ice',
  frost_sprite: 'ice', yeti: 'ice', crystal_wyrm: 'ice', fire_elemental: 'fire',
  lava_slime: 'fire', magma_golem: 'fire', infernal_dragon: 'fire', necromancer: 'shadow',
  mimic: 'earth', phoenix: 'fire', crystal_golem: 'ice', venomous_hydra: 'water',
  storm_hawk: 'thunder', shadow_assassin: 'shadow', lava_worm: 'fire',
};
for (const [t, e] of Object.entries(PRE_9A3)) eq(`9A.3 öncesi giriş korundu: ${t}`, MONSTER_ELEMENTS[t], e);

// ─── (c) SINIF ELEMENTİ + YETENEK EZMESİ ───
for (const c of CLASSES) eq(`sınıf elementi: ${c}`, classElement(c), CLASS_ELEMENTS[c]);
eq('bilinmeyen sınıf → fallback', classElement('bogus' as PlayerClass), FALLBACK_ELEMENT);
eq('elementsiz yetenek → sınıf elementi', attackElement('mage'), 'fire');
eq('elementsiz yetenek (knight) → earth', attackElement('knight', undefined), 'earth');
// 🔴 skill.element sınıf elementini EZER (TdBattleScene:874 `skill.element || playerElement`)
const iceShard = CLASS_SKILLS.mage.find(s => s.id === 'ice_shard')!;
const fireball = CLASS_SKILLS.mage.find(s => s.id === 'fireball')!;
const powerStrike = CLASS_SKILLS.knight.find(s => s.id === 'power_strike')!;
eq('çapa kurulumu: ice_shard ice elementli', iceShard.element, 'ice');
eq('yetenek elementi sınıfı ezer (mage/fire → ice_shard/ice)',
  attackElement('mage', iceShard.element), 'ice');
ok('ezme gerçekten farklı bir element', attackElement('mage', iceShard.element) !== classElement('mage'));
eq('aynı elementli yetenek sınıfı bozmaz', attackElement('mage', fireball.element), 'fire');
eq('elementsiz yetenek (power_strike) sınıfı korur',
  attackElement('knight', powerStrike.element), 'earth');
// Ezme ÇARPANI da değiştirir: fire mage buz golemine üstün, ice_shard ile ise zayıf.
eq('mage/fire → ice_golem: üstün', heroElemFx('mage', 'ice_golem').mult, 1.5);
eq('mage + ice_shard → ice_golem: nötr', heroElemFx('mage', 'ice_golem', iceShard.element).mult, 1);
eq('mage + ice_shard → storm_hawk(thunder): üstün',
  heroElemFx('mage', 'storm_hawk', iceShard.element).mult, 1.5);

// ─── (d) 🔴 ÇARPAN İKİ YÖNDE DE UYGULANIR ───
// Yön 1 — kahraman → canavar
eq('knight(earth) → storm_titan(thunder): 1.5', heroElemFx('knight', 'storm_titan').mult, 1.5);
eq('knight(earth) → water_elemental(water): 0.67', heroElemFx('knight', 'water_elemental').mult, 0.67);
eq('archer(wind) → deep_slime(water): 1.5', heroElemFx('archer', 'deep_slime').mult, 1.5);
eq('mage(fire) → magma_hound(fire): nötr', heroElemFx('mage', 'magma_hound').mult, 1);
// Yön 2 — canavar → kahraman (TERS sıra: saldıran canavar)
eq('storm_titan(thunder) → knight(earth): 0.67', mobElemFx('storm_titan', 'knight').mult, 0.67);
eq('water_elemental(water) → knight(earth): 1.5', mobElemFx('water_elemental', 'knight').mult, 1.5);
eq('deep_slime(water) → archer(wind): 0.67', mobElemFx('deep_slime', 'archer').mult, 0.67);
// Yönler simetrik-ters olmalı (biri üstünse diğeri zayıf) — tek yönlü bağlama regresyonu.
for (const c of CLASSES) for (const t of ['storm_titan', 'water_elemental', 'deep_slime', 'frost_giant', 'magma_hound']) {
  const h = heroElemFx(c, t).mult, m = mobElemFx(t, c).mult;
  ok(`yön simetrisi ${c}↔${t}`, (h > 1 && m < 1) || (h < 1 && m > 1) || (h === 1 && m === 1));
}
// ÇARPAN GERÇEKTEN HASARA GİRİYOR MU (combat.ts, rastgelelik sabit) —
// random 0.5 → krit yok, varyans ×1.0 → heroHit(20,10,x) = round(15·x)
withRandom(0.5, () => {
  eq('heroHit nötr çarpan', heroHit(20, 10, 1).dmg, 15);
  eq('heroHit üstün çarpan (×1.5)', heroHit(20, 10, 1.5).dmg, 23);   // round(22.5)
  eq('heroHit zayıf çarpan (×0.67)', heroHit(20, 10, 0.67).dmg, 10); // round(10.05)
  eq('heroHit çarpansız = nötr (geri uyum)', heroHit(20, 10).dmg, heroHit(20, 10, 1).dmg);
  eq('heroHit krit bayrağı çarpandan etkilenmez', heroHit(20, 10, 1.5).crit, false);
  eq('mobHit nötr çarpan', mobHit(20, 10, 1), 15);
  eq('mobHit üstün çarpan (×1.5)', mobHit(20, 10, 1.5), 23);
  eq('mobHit zayıf çarpan (×0.67)', mobHit(20, 10, 0.67), 10);
  eq('mobHit çarpansız = nötr (geri uyum)', mobHit(20, 10), mobHit(20, 10, 1));
  // Zayıf çarpan bile hasarı 0'a düşürmez (taban 1 korunuyor).
  ok('zayıf çarpanda taban 1 korunur', heroHit(1, 100, 0.67).dmg >= 1 && mobHit(1, 100, 0.67) >= 1);
});
withRandom(0.05, () => {   // krit dalı: 0.05 < 0.1
  eq('krit + üstün çarpan birlikte çarpılır', heroHit(20, 10, 1.5).dmg,
    Math.round(15 * (0.85 + 0.05 * 0.3) * 1.6 * 1.5));
  eq('krit bayrağı hâlâ true', heroHit(20, 10, 0.67).crit, true);
});
// Sıralama her rastgele değerde korunmalı (monotonluk).
for (const r of [0, 0.05, 0.3, 0.5, 0.9, 0.999]) withRandom(r, () => {
  ok(`monotonluk heroHit @${r}`, heroHit(40, 10, 1.5).dmg > heroHit(40, 10, 0.67).dmg);
  ok(`monotonluk mobHit @${r}`, mobHit(40, 10, 1.5) > mobHit(40, 10, 0.67));
});

// ─── (e) GÖRSEL DİL: renk + etkililik metni ───
eq('elementHex 6 hane', elementHex('fire'), '#ff4422');
for (const e of Object.keys(ELEMENT_COLORS) as Element[]) {
  ok(`elementHex biçimi: ${e}`, /^#[0-9a-f]{6}$/.test(elementHex(e)));
  eq(`elementHex değeri: ${e}`, parseInt(elementHex(e).slice(1), 16), ELEMENT_COLORS[e]);
}
const strong = heroElemFx('mage', 'ice_golem');       // fire → ice
const weak = heroElemFx('mage', 'water_elemental');   // fire → water
const neutral = heroElemFx('mage', 'magma_hound');    // fire → fire
ok('üstün vuruşta etkililik metni var', !!strong.text && strong.text.includes('Super effective'));
ok('üstün metin element ikonuyla başlıyor', strong.text!.startsWith(ELEMENT_ICONS.fire));
ok('zayıf vuruşta metin var', !!weak.text && weak.text.includes('Not very effective'));
eq('nötr vuruşta metin YOK (float basılmaz)', neutral.text, null);
eq('üstün hasar rengi saldırı elementinin rengi', damageHex(strong, '#ffffff'), elementHex('fire'));
eq('zayıf hasar rengi soluk gri', damageHex(weak, '#ffffff'), WEAK_HEX);
eq('nötr hasar rengi sahnenin kendi rengi (krit)', damageHex(neutral, '#ffd23f'), '#ffd23f');
eq('nötr temas rengi kırmızı kalır', damageHex(neutral, '#ff5c5c'), '#ff5c5c');
ok('float kapısı makul (0.5-3sn)', ELEM_FLOAT_COOLDOWN_MS >= 500 && ELEM_FLOAT_COOLDOWN_MS <= 3000);

// ═════════════════════════════════════════════════════════════════════════════
// (2) YAPISAL ÇAPA
// ═════════════════════════════════════════════════════════════════════════════

// Çıkarıcının kendisi denetlenir (sessiz kırpma = sahte yeşil).
ok('methodBody girintili süslüde kırpmıyor',
  methodBody('  private t(): void {\n    const c = {\n      a: 1,\n  };\n    this.elemFloat(m);\n  }\n', '  private t(')
    .includes('this.elemFloat(m);'));
ok('methodBody string içindeki süslüyü saymıyor',
  methodBody('  private s(): void {\n    const t = "}";\n    const u = 1;\n  }\n', '  private s(').includes('const u = 1;'));
let threw = false;
try { methodBody(worldSrc, '  private definitelyNotAMethod('); } catch { threw = true; }
ok('methodBody eksik imzada throw eder', threw);

// ─── (f) 🔒 SAFLIK: combat.ts elements.ts'i İMPORT ETMEZ (çarpan parametre olarak gelir) ───
const combatCode = stripComments(combatSrc);
ok('combat.ts elements import etmiyor', !/from '\.\.\/elements'/.test(combatCode) && !/elements/.test(combatCode));
ok('combat.ts hiç import etmiyor (tam saf)', !/\bimport\b/.test(combatCode));
ok('combat.ts element tablolarına bakmıyor',
  !/MONSTER_ELEMENTS|CLASS_ELEMENTS|getElementMultiplier/.test(combatCode));
ok('combat.ts sahneye bağlanmıyor', !/this\.|Phaser|scene/.test(combatCode));
ok('heroHit çarpanı parametre alıyor', /export function heroHit\(atk: number, def: number, elemMult = 1\)/.test(combatCode));
ok('mobHit çarpanı parametre alıyor', /export function mobHit\(matk: number, pdef: number, elemMult = 1\)/.test(combatCode));
// ⚠️ Burada methodBody KULLANILMAZ: heroHit'in imzası nesne dönüş tipi taşıyor
// (`): { dmg: number; crit: boolean } {`) → tarayıcı gövde yerine dönüş tipini yakalar
// ve `includes('* elemMult')` SESSİZCE false döner. Formül satırı doğrudan pinlenir.
ok('heroHit çarpanı formüle giriyor',
  /Math\.round\(base \* \(0\.85 \+ Math\.random\(\) \* 0\.3\) \* \(crit \? 1\.6 : 1\) \* elemMult\)/.test(combatCode));
ok('mobHit çarpanı formüle giriyor',
  /Math\.max\(1, matk - pdef \* 0\.5\) \* \(0\.85 \+ Math\.random\(\) \* 0\.3\) \* elemMult\)/.test(combatCode));
// elemental.ts de saf (Node'da koşuyor — bu testin kendisi kanıt, yine de deyimi pinle)
const elementalCode = stripComments(elementalSrc);
ok('elemental.ts Phaser/window kullanmıyor', !/Phaser|document|window/.test(elementalCode));
ok('elemental.ts elit önekini soyuyor', elementalCode.includes("startsWith(ELITE_PREFIX)"));

// ─── (g) 🔴 ÇARPAN HER İKİ SAHNEDE, HER İKİ YÖNDE BAĞLI ───
const scenes: Array<[string, string, string, string, string]> = [
  // [ad, kaynak, kodu, kahraman vuruşu imzası, temas imzası]
  ['dünya', worldSrc, worldCode, '  private heroAttack(', '  private mobHitsHero('],
  ['zindan', dungeonSrc, dungeonCode, '  private heroAttackMob(', '  private mobHitsHero('],
];
for (const [name, src, code, atkSig, hitSig] of scenes) {
  ok(`${name}: elemental.ts import ediyor`, /from '\.\/elemental'/.test(src));
  const atk = methodBody(src, atkSig);
  const hit = methodBody(src, hitSig);
  // yön 1: kahraman → canavar
  ok(`${name}: kahraman vuruşu heroElemFx hesaplıyor`, atk.includes('heroElemFx(ps.playerClass, m.entry.type, skillElem)'));
  ok(`${name}: çarpan heroHit'e geçiyor`, /heroHit\(atkOverride \?\? ps\.atk, m\.entry\.def \?\? 0, fx\.mult\)/.test(atk));
  // yön 2: canavar → kahraman
  ok(`${name}: temas vuruşu mobElemFx hesaplıyor`, hit.includes('mobElemFx(m.entry.type, ps.playerClass)'));
  ok(`${name}: çarpan mobHit'e geçiyor`, /mobHit\(m\.entry\.atk \?\? 5, effectiveDef\(ps\.def, this\.defBuffPct\), fx\.mult\)/.test(hit));
  // çarpansız (eski) çağrı KALMAMALI — tek yönü unutmak sessiz regresyon olurdu
  eq(`${name}: heroHit tek çağrı ve çarpanlı`, count(code, 'heroHit('), 1);
  eq(`${name}: mobHit tek çağrı ve çarpanlı`, count(code, 'mobHit('), 1);
  ok(`${name}: çarpansız heroHit yok`, !/heroHit\([^)]*def \?\? 0\)/.test(code));
  ok(`${name}: çarpansız mobHit yok`, !/mobHit\([^)]*this\.defBuffPct\)\)/.test(code));
  // görsel: hasar sayısı renklendirilir + etkililik float'ı kapılı
  ok(`${name}: hasar sayısı damageHex ile renkleniyor`, atk.includes("damageHex(fx, crit ? '#ffd23f' : '#ffffff')"));
  ok(`${name}: temas hasarı damageHex ile renkleniyor`, hit.includes("damageHex(fx, '#ff5c5c')"));
  ok(`${name}: her iki yönde de etkililik float'ı var`, atk.includes('this.elemFloat(') && hit.includes('this.elemFloat('));
  const ef = methodBody(src, '  private elemFloat(');
  ok(`${name}: nötr vuruşta float basılmıyor`, ef.includes('if (!fx.text'));
  ok(`${name}: float kapısı elemental sabitinden`, ef.includes('ELEM_FLOAT_COOLDOWN_MS'));
  ok(`${name}: float rengi element renginden`, ef.includes('elementHex(fx.elem)'));
  // yetenek elementi ezmesi sahneye BAĞLI (sk.element cast yolundan geçiyor)
  const cast = methodBody(src, '  private castDamageSkill(');
  ok(`${name}: yetenek elementi vuruşa geçiyor`, /sk\.icon, sk\.element\)/.test(cast));
  ok(`${name}: vuruş imzası skillElem alıyor`, /skillElem\?: Element/.test(atk));
  // eşleme TEK EVDEN: sahne kendi element tablosunu satır içi okumamalı
  ok(`${name}: element tabloları sahnede satır içi okunmuyor`,
    !/MONSTER_ELEMENTS|CLASS_ELEMENTS|getElementMultiplier/.test(code));
  ok(`${name}: elit soyma sahnede tekrarlanmıyor`, !/startsWith\('elite_'\)/.test(code));
}

// ─── (h) 🔒 9A.1/9A.2 ÇAPALARI KIRILMADI (tek ölüm/loot boğazı) ───
eq('zindan: killMobD tam bir kez tanımlı', count(dungeonCode, 'private killMobD('), 1);
eq('zindan: killMobD yalnız iki yerden çağrılıyor (vuruş + DoT)', count(dungeonCode, 'this.killMobD('), 2);
eq('zindan: tek dropGroundLoot çağrısı', count(dungeonCode, 'this.dropGroundLoot('), 1);
eq('zindan: tek rollGroundLoot çağrısı', count(dungeonCode, 'rollGroundLoot('), 1);
eq('zindan: tek killRewards çağrısı', count(dungeonCode, 'killRewards('), 1);
const dKill = methodBody(dungeonSrc, '  private killMobD(');
ok('zindan: killMobD hâlâ XP+altın+loot+despawn veriyor',
  dKill.includes('killRewards(') && dKill.includes('ps.addXp(')
  && dKill.includes('this.dropGroundLoot(') && dKill.includes('this.despawnMonster(m)'));
const dDespawn = methodBody(dungeonSrc, '  private despawnMonster(');
ok('zindan: despawnMonster loot/ödül vermiyor (boss çift-loot çapası)',
  !/rollLoot|rollGroundLoot|dropGroundLoot|killRewards|addXp/.test(dDespawn));
eq('dünya: tek killMob çağrısı yolu (rollGroundLoot)', count(worldCode, 'rollGroundLoot('), 1);
ok('dünya: despawnMonster loot düşürmüyor',
  !/rollGroundLoot|dropGroundLoot/.test(methodBody(worldSrc, '  private despawnMonster(')));
// 9A.2: SPACE yolu ve CD kapısı element eklemesiyle bozulmadı
for (const [name, src, code, atkSig] of scenes) {
  const atk = methodBody(src, atkSig);
  ok(`${name}: temel vuruş kendi ATTACK_CD kapısını koruyor`,
    atk.includes('if (!isSkill)') && atk.includes('this.atkCdUntil = this.time.now + ATTACK_CD_MS;'));
  ok(`${name}: SPACE hasarı hâlâ ps.atk`, atk.includes('heroHit(atkOverride ?? ps.atk'));
  ok(`${name}: buff DEF'i temas hasarında duruyor`, code.includes('effectiveDef(ps.def, this.defBuffPct)'));
  ok(`${name}: kaçınma buff'ı duruyor`, code.includes('dodgeChance(this.dodgeBuffPct)'));
}

console.log(`\ntd-element: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
