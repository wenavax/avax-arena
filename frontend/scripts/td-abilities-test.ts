// frontend/scripts/td-abilities-test.ts
// Faz 9A.2 — yetenek/MP çapası (Node: `npx tsx scripts/td-abilities-test.ts`).
// Biçim emsali: td-groundloot-test.ts / td-loot-test.ts.
//
// İki katman:
//  (1) SAF MANTIK — abilities.ts Node'da koşar (Phaser yok): tur→ms dönüşümü, CD kapısı,
//      MP kapısı, buff/dot matematiği. Gerçek CLASS_SKILLS verisi kullanılır.
//  (2) YAPISAL ÇAPA — skills.ts'e DOKUNULMADIĞI, CD tablosunun veriyle çift-yönlü
//      örtüştüğü ve dünyanın MP regen'inin TEK yerden aktığı kaynak üstünden pinlenir.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TURN_MS, CAST_GCD_MS, SKILL_CD_MS, MULTIHIT_DELAY_MS, STUN_MS,
  tdSkills, mpRegenPerSec, turnsToMs, canCast, skillCdMs, skillAtk,
  isBuffSkill, dotPlan, dotTickDamage, effectiveDef, dodgeChance, skillBarKey,
  type TdSkillId,
} from '../lib/game/td/abilities';
import { CLASS_SKILLS, CLASS_MP, type Skill } from '../lib/game/skills';
import type { PlayerClass } from '../lib/game/PlayerState';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const CLASSES: PlayerClass[] = ['knight', 'mage', 'archer'];
const ALL_SKILLS: Skill[] = CLASSES.flatMap(c => CLASS_SKILLS[c]);

// ─────────────────────────────────────────────────────────────
// 1. CD tablosu kapsaması — ÇİFT YÖNLÜ
//    Record<TdSkillId,…> yalnız tipe eklenen id'yi derlemede yakalar. Veriye
//    (CLASS_SKILLS) yeni yetenek eklenip CD yazılmazsa derleme SESSİZ kalır → burada kırılır.
// ─────────────────────────────────────────────────────────────
const cdKeys = Object.keys(SKILL_CD_MS).sort();
const dataIds = [...new Set(ALL_SKILLS.map(s => s.id))].sort();
eq('cd tablosu ile CLASS_SKILLS id kümesi birebir', cdKeys, dataIds);
for (const s of ALL_SKILLS) {
  ok(`cd tanımlı: ${s.id}`, SKILL_CD_MS[s.id as TdSkillId] !== undefined);
  ok(`cd negatif değil: ${s.id}`, skillCdMs(s.id) >= 0);
}
ok('bilinmeyen id → 0 CD (oyun kilitlenmez)', skillCdMs('nope_not_a_skill') === 0);

// Temel vuruş (0 MP) CD'siz olmalı — SPACE ritmini bozmasın.
for (const c of CLASSES) {
  const basic = CLASS_SKILLS[c][0];
  eq(`${c}: ilk yetenek temel vuruş (0 MP)`, basic.mpCost, 0);
  eq(`${c}: temel vuruşun CD'si 0`, skillCdMs(basic.id), 0);
}
// MP maliyetli her yeteneğin gerçek bir CD'si olmalı (yoksa spam edilir).
for (const s of ALL_SKILLS) {
  if (s.mpCost > 0) ok(`ücretli yetenek CD'li: ${s.id}`, skillCdMs(s.id) >= 1000);
}

// ─────────────────────────────────────────────────────────────
// 2. Tur → ms dönüşümü
// ─────────────────────────────────────────────────────────────
eq('1 tur = 2000ms', TURN_MS, 2000);
eq('turnsToMs(2)', turnsToMs(2), 4000);
eq('turnsToMs(3)', turnsToMs(3), 6000);
eq('turnsToMs(0)', turnsToMs(0), 0);
eq('turnsToMs negatif → 0', turnsToMs(-5), 0);
eq('stun = 1 tur', STUN_MS, TURN_MS);
ok('GCD temel vuruş ritminden uzun değil', CAST_GCD_MS <= 400 && CAST_GCD_MS > 0);
ok('çok-vuruş gecikmesi GCD içinde biter (2 vuruş)', MULTIHIT_DELAY_MS > 0 && MULTIHIT_DELAY_MS < CAST_GCD_MS);

// ─────────────────────────────────────────────────────────────
// 3. MP regen — tur başına değerin saniyeye çevrimi
// ─────────────────────────────────────────────────────────────
for (const c of CLASSES) {
  eq(`${c} regen/sn = regen/tur ÷ 2`, mpRegenPerSec(c), CLASS_MP[c].regen / 2);
  ok(`${c} regen pozitif`, mpRegenPerSec(c) > 0);
}
// Regen en pahalı yeteneği anında ödeyecek kadar hızlı OLMAMALI (MP anlamlı kalsın).
for (const c of CLASSES) {
  const maxCost = Math.max(...CLASS_SKILLS[c].map(s => s.mpCost));
  ok(`${c}: en pahalı yetenek ≥1sn regen ister`, maxCost / mpRegenPerSec(c) >= 1);
}
ok('bilinmeyen sınıf regen fallback', mpRegenPerSec('bogus' as PlayerClass) === 1.5);

// ─────────────────────────────────────────────────────────────
// 4. canCast kapısı — sıra: gcd → cd → mp
// ─────────────────────────────────────────────────────────────
const fireball = CLASS_SKILLS.mage.find(s => s.id === 'fireball')!;
eq('hazır → ok', canCast(fireball, 50, 10_000, 0, 0), 'ok');
eq('MP yok → mp', canCast(fireball, 1, 10_000, 0, 0), 'mp');
eq('CD dolmadı → cd', canCast(fireball, 50, 10_000, 12_000, 0), 'cd');
eq('GCD önceliği CD üstünde', canCast(fireball, 50, 10_000, 12_000, 11_000), 'gcd');
eq('GCD önceliği MP üstünde', canCast(fireball, 0, 10_000, 0, 11_000), 'gcd');
eq('CD önceliği MP üstünde', canCast(fireball, 0, 10_000, 12_000, 0), 'cd');
eq('tam MP sınırında geçer', canCast(fireball, fireball.mpCost, 10_000, 0, 0), 'ok');
eq('MP sınırının 1 altı geçmez', canCast(fireball, fireball.mpCost - 1, 10_000, 0, 0), 'mp');
eq('CD tam bittiği an geçer', canCast(fireball, 50, 12_000, 12_000, 0), 'ok');
// 0 MP temel vuruş MP'siz de çalışır (kilitlenme yok)
for (const c of CLASSES) {
  eq(`${c}: 0 MP ile temel vuruş`, canCast(CLASS_SKILLS[c][0], 0, 1000, 0, 0), 'ok');
}

// ─────────────────────────────────────────────────────────────
// 5. Hasar / buff matematiği
// ─────────────────────────────────────────────────────────────
const powerStrike = CLASS_SKILLS.knight.find(s => s.id === 'power_strike')!;
eq('power strike 1.5×', skillAtk(20, powerStrike), 30);
eq('skillAtk taban 1 (0 çarpanlı buff yeteneği bile)', skillAtk(20, CLASS_SKILLS.knight[3]), 1);
eq('skillAtk yuvarlar', skillAtk(15, CLASS_SKILLS.mage[0]), 9); // 15*0.6 = 9

const doubleShot = CLASS_SKILLS.archer.find(s => s.id === 'double_shot')!;
eq('double shot 2 vuruş', doubleShot.hits, 2);
ok('double shot buff yeteneği değil', !isBuffSkill(doubleShot));
for (const c of CLASSES) {
  const buffs = CLASS_SKILLS[c].filter(isBuffSkill);
  eq(`${c}: tam 1 buff yeteneği`, buffs.length, 1);
  eq(`${c}: buff yeteneği 0 hasar`, buffs[0].multiplier, 0);
}

eq('DEF +%50', effectiveDef(10, 50), 15);
eq('DEF +%0 = kimlik', effectiveDef(13, 0), 13);
eq('DEF negatif buff yok sayılır', effectiveDef(13, -80), 13);
eq('DEF floor', effectiveDef(7, 40), 9); // 7*1.4 = 9.8 → 9

eq('dodge %40 buff', dodgeChance(40), 0.4 > 0.2 ? 0.2 : 0.4);
eq('dodge tavanı %20', dodgeChance(90), 0.2);
eq('buff yokken dodge 0 (dünyada taban kaçınma yok)', dodgeChance(0), 0);
eq('negatif dodge 0', dodgeChance(-10), 0);

// DoT
const poisonArrow = CLASS_SKILLS.archer.find(s => s.id === 'poison_arrow')!;
const plan = dotPlan(poisonArrow.dot!);
eq('zehir 3 tik', plan.ticks, 3);
eq('zehir tik aralığı 1 tur', plan.everyMs, TURN_MS);
eq('zehir tik yüzdesi veriden', plan.pct, poisonArrow.dot!.pctPerTurn);
eq('DoT tik hasarı maxHp yüzdesi', dotTickDamage(200, 0.05), 10);
eq('DoT tik hasarı taban 1', dotTickDamage(3, 0.05), 1);
// DoT toplam hasarı canavarı tek başına silmemeli (yalnız hasar yeteneği + dot)
for (const s of ALL_SKILLS) {
  if (!s.dot) continue;
  const p = dotPlan(s.dot);
  ok(`${s.id}: dot toplamı maxHp'nin yarısını geçmiyor`, p.ticks * p.pct < 0.5);
}

// ─────────────────────────────────────────────────────────────
// 6. tdSkills — sınıf başına 4 yetenek + fallback
// ─────────────────────────────────────────────────────────────
for (const c of CLASSES) {
  eq(`${c}: 4 yetenek (1-4 tuşları)`, tdSkills(c).length, 4);
  eq(`${c}: tdSkills veriyi aynen döner`, tdSkills(c).map(s => s.id), CLASS_SKILLS[c].map(s => s.id));
}
eq('bilinmeyen sınıf → knight', tdSkills('bogus' as PlayerClass).map(s => s.id), CLASS_SKILLS.knight.map(s => s.id));

// ─────────────────────────────────────────────────────────────
// 7. YAPISAL ÇAPALAR
// ─────────────────────────────────────────────────────────────
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const skillsSrc = read('lib/game/skills.ts');
const abilitiesSrc = read('lib/game/td/abilities.ts');
const worldSrc = read('lib/game/td/TdWorldScene.ts');
const dungeonSrc = read('lib/game/td/TdDungeonScene.ts');
const battleSrc = read('lib/game/td/TdBattleScene.ts');
const gameSrc = read('lib/game/td/TdPhaserGame.tsx');   // mobil yetenek butonları

// (a) skills.ts TdBattleScene ile paylaşılıyor → TD katmanı oraya alan EKLEMEZ.
ok('skills.ts cooldown alanı içermiyor (tur-tabanlı sözleşme korunuyor)',
  !/cooldown|cdMs|cooldownMs/i.test(skillsSrc));
ok('skills.ts Skill arayüzü hâlâ 4 sınıf-yeteneği × 3 sınıf',
  (skillsSrc.match(/\bid: '/g) || []).length === 12);

// (b) abilities.ts SAF kalmalı — Phaser/window sızarsa Node testi çürür.
//     Yorumlar soyulur: bu dosyanın başlığı zaten "Phaser yok, window yok" diyor.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const abilitiesCode = stripComments(abilitiesSrc);
ok('abilities.ts Phaser import etmiyor', !/from 'phaser'|Phaser\./.test(abilitiesCode));
ok('abilities.ts window kullanmıyor', !/\bwindow\b|\blocalStorage\b/.test(abilitiesCode));

// (c) Tur→ms dönüşümünün TEK evi abilities.ts. Sahnelerde çıplak "* 2000" / turns
//     aritmetiği olmamalı — yoksa denge değiştirmek iki yerden düzenleme ister.
for (const [name, src] of [['TdWorldScene', worldSrc], ['TdDungeonScene', dungeonSrc]] as const) {
  const usesSkills = /from '\.\.\/skills'|from '\.\/abilities'/.test(src);
  if (!usesSkills) continue; // henüz bağlanmadıysa çapa uygulanmaz
  ok(`${name}: skills.ts'ten CLASS_SKILLS'i DOĞRUDAN çekmiyor (abilities.tdSkills kullanır)`,
    !/CLASS_SKILLS/.test(src));
  ok(`${name}: turns aritmetiğini kendi yapmıyor`, !/\.turns\s*\*/.test(src));
  ok(`${name}: MP regen'i elle hesaplamıyor`, !/CLASS_MP/.test(src));
}

// (d) TdBattleScene DEĞİŞMEDEN kalmalı — tur-tabanlı akış TD katmanından etkilenmez.
ok('TdBattleScene abilities.ts import etmiyor (tur-tabanlı kalır)',
  !/from '\.\/abilities'/.test(battleSrc));
ok('TdBattleScene hâlâ CLASS_SKILLS/CLASS_MP tüketiyor',
  /CLASS_SKILLS/.test(battleSrc) && /CLASS_MP/.test(battleSrc));

// ─────────────────────────────────────────────────────────────
// 8. HUD yeniden-çizim anahtarı (skillBarKey) — SAF, davranış test edilir
//    Plan: "redrawStats cache-anahtarına mp eklenmeli, yoksa bar donuk kalır."
//    Bu tuzağı kaynak-string'i aramakla değil, anahtarın KENDİSİNİ çalıştırarak kilitliyoruz.
// ─────────────────────────────────────────────────────────────
const kSkills = CLASS_SKILLS.knight;
const zeroCd = [0, 0, 0, 0];
const keyAt = (mp: number, maxMp = 40, cd = zeroCd, now = 100_000) => skillBarKey(mp, maxMp, cd, kSkills, now);
ok('MP değişimi anahtarı değiştirir (bar donmaz)', keyAt(10) !== keyAt(11));
ok('maxMp değişimi anahtarı değiştirir (level up)', keyAt(10, 40) !== keyAt(10, 43));
eq('kesirli regen anahtarı kirletmez (her kare çizim yok)', keyAt(10.1), keyAt(10.4));
ok('tam MP sınırını geçmek anahtarı değiştirir', keyAt(10.4) !== keyAt(10.6));
// CD: 100ms kovaları — kova içinde sabit, kova değişince taze
ok('CD kovası içinde anahtar sabit', keyAt(40, 40, [0, 100_050, 0, 0]) === keyAt(40, 40, [0, 100_099, 0, 0], 100_000));
ok('CD kovası değişince anahtar değişir',
  keyAt(40, 40, [0, 100_050, 0, 0]) !== keyAt(40, 40, [0, 100_150, 0, 0]));
ok('CD bitince anahtar değişir', keyAt(40, 40, [0, 100_500, 0, 0]) !== keyAt(40, 40, zeroCd));
// MP yetmezliği ('x' işareti = soluk ikon) MP eşiğini geçerken görünür/görünmez olmalı
const costly = kSkills.find(s => s.mpCost > 0)!;
ok('MP eşiğinin altında soluk işareti var', keyAt(costly.mpCost - 1).includes('x'));
ok('MP eşiğinin üstünde soluk işareti yok', !keyAt(Math.max(...kSkills.map(s => s.mpCost))).includes('x'));
ok('geçmiş CD negatife düşmez (Math.max tabanı)', keyAt(40, 40, [0, 0, 0, 0], 999_999) === keyAt(40, 40, zeroCd, 0));
eq('eksik CD girdisi 0 sayılır (dizi kısa kalırsa çökmez)', skillBarKey(40, 40, [], kSkills, 0), keyAt(40, 40, zeroCd, 0));

// ─────────────────────────────────────────────────────────────
// 9. ZİNDAN BAĞLANMASI (Faz 9A.2 ikinci yarısı)
//    Phaser Node'da ayağa kalkmaz → sahne sözleşmesi KAYNAK üstünden kilitlenir.
//    ⚠️ Dürüst olmak için gerçek süslü eşleştirmesi ŞART: naif "ilk `\n  }`" kırpması
//    gövdeyi sessizce boşaltır ve "yok" çapaları trivially yeşil yanar (9A.1 review'ı).
//    Aşağıdaki methodBody, td-groundloot-test.ts'teki doğrulanmış tarayıcının eşleniği.
// ─────────────────────────────────────────────────────────────
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
const count = (s: string, needle: string) => s.split(needle).length - 1;
const dungeonCode = stripComments(dungeonSrc);
// çıkarıcının kendisi: sessiz kırpma = sahte yeşil (kopyalanan tarayıcı da denetlenir)
ok('methodBody girintili süslüde kırpmıyor',
  methodBody('  private t(): void {\n    const c = {\n      a: 1,\n  };\n    this.killMobD(m);\n  }\n', '  private t(')
    .includes('this.killMobD(m);'));
ok('methodBody string içindeki süslüyü saymıyor',
  methodBody('  private s(): void {\n    const t = "}";\n    const u = 1;\n  }\n', '  private s(').includes('const u = 1;'));
let dThrew = false;
try { methodBody(dungeonSrc, '  private definitelyNotAMethod('); } catch { dThrew = true; }
ok('methodBody eksik imzada throw eder', dThrew);

// (a) yetenekler GERÇEKTEN bağlı — 1-4 tuşları + mobil olay + HUD
ok('zindan abilities.ts import ediyor', /from '\.\/abilities'/.test(dungeonSrc));
ok('zindan 1-4 tuşlarını yuvalara bağlıyor',
  /\['ONE', 'TWO', 'THREE', 'FOUR'\]/.test(dungeonCode) && /keydown-\$\{k\}`, \(\) => this\.useSkillSlot\(i\)/.test(dungeonCode));
ok("zindan mobil 'td-ui-skill' olayını dinliyor", dungeonCode.includes("window.addEventListener('td-ui-skill', onUiSkill)"));
ok('zindan td-ui-skill dinleyicisini shutdown\'da kaldırıyor (sızıntı yok)',
  dungeonCode.includes("window.removeEventListener('td-ui-skill', onUiSkill)"));
ok('mobil buton yuva numarasını gönderiyor (1-4)',
  /new CustomEvent\('td-ui-skill', \{ detail: \{ slot \} \}\)/.test(gameSrc) && /\[1, 2, 3, 4\]\.map\(slot =>/.test(gameSrc));
ok('zindan MP barını + yetenek çubuğunu kuruyor',
  dungeonCode.includes('this.buildSkillBar();') && dungeonCode.includes('private redrawSkillBar('));
// HUD anahtarı: sahne kendi anahtarını ELLE kurmamalı (skillBarKey tek ev → MP hep içinde)
ok('zindan yeniden-çizim anahtarını skillBarKey\'den alıyor', dungeonCode.includes('skillBarKey(psu.mp, psu.maxMp'));
eq('zindan redrawSkillBar yalnız anahtar değişince çizer',
  count(methodBody(dungeonSrc, '  update(t: number'), 'this.redrawSkillBar('), 1);
ok('zindan çizimi cache ile korunuyor', dungeonCode.includes('if (sbKey !== this.skillBarCache)'));
// HUD zindanın KENDİ deyimine uyuyor: layoutHud konumlandırır + çözünürlük ölçekler
const dLayout = methodBody(dungeonSrc, '  private layoutHud(');
ok('yetenek çubuğu layoutHud\'da konumlanıyor', dLayout.includes('this.skillBar?.setPosition('));
ok('HUD metinleri zoom çözünürlüğünü alıyor', dLayout.includes('for (const t of this.hudTexts)'));

// (b) 🔒 TEK ÖLÜM/ÖDÜL BOĞAZI — DoT ölümü de aynı fonksiyondan geçer
const dKill = methodBody(dungeonSrc, '  private killMobD(');
const dAttack = methodBody(dungeonSrc, '  private heroAttackMob(');
const dTick = methodBody(dungeonSrc, '  private tickAbilities(');
const dDespawn = methodBody(dungeonSrc, '  private despawnMonster(');
eq('killMobD tam bir kez tanımlı', count(dungeonCode, 'private killMobD('), 1);
ok('killMobD XP+altın+loot+despawn veriyor', dKill.includes('killRewards(') && dKill.includes('ps.addXp(')
  && dKill.includes('this.dropGroundLoot(') && dKill.includes('this.despawnMonster(m)'));
ok('temel/yetenek vuruşu ölümde killMobD çağırıyor', dAttack.includes('if (m.hp <= 0) this.killMobD(m);'));
ok('DoT ölümü de killMobD çağırıyor', dTick.includes('this.killMobD(m)'));
eq('killMobD yalnız bu iki yerden çağrılıyor', count(dungeonCode, 'this.killMobD('), 2);
// ödül/loot BAŞKA hiçbir yerde verilmiyor (ikinci boğaz = çift XP/çift loot)
eq('zindanda tek killRewards çağrısı', count(dungeonCode, 'killRewards('), 1);
eq('zindanda tek addXp çağrısı', count(dungeonCode, 'ps.addXp('), 1);
eq('zindanda tek dropGroundLoot çağrısı', count(dungeonCode, 'this.dropGroundLoot('), 1);
eq('zindanda tek rollGroundLoot çağrısı', count(dungeonCode, 'rollGroundLoot('), 1);
// despawnMonster ÇOKLU giriş (trash + TdBattle boss) → orada ödül/loot OLMAMALI
const noLoot = (b: string) => !/rollLoot|rollGroundLoot|dropGroundLoot/.test(b);
ok('despawnMonster loot düşürmüyor (boss çift-loot çapası)', noLoot(dDespawn));
ok('despawnMonster ödül vermiyor', !/killRewards|addXp|\.gold \+=/.test(dDespawn));
ok('killMobD boss yolundan çağrılmıyor', !methodBody(dungeonSrc, '  private startBattle(').includes('killMobD'));
// yetenek hedefi yalnız trash havuzu (boss TdBattle'da dövülür — 9A.1 boğaz mantığı)
const dNearest = methodBody(dungeonSrc, '  private nearestTrash(');
ok('yetenek hedefi this.mons\'u tarıyor', dNearest.includes('for (const m of this.mons)') && !dNearest.includes('this.boss'));
ok('yetenek vuruşu nearestTrash kullanıyor', methodBody(dungeonSrc, '  private useSkillSlot(').includes('this.nearestTrash(ATTACK_RANGE)'));

// (c) 🔒 STUN KISALTMA REGRESYONU — her stun/knockback ataması Math.max'lı olmalı.
//     Çok-vuruşlu yeteneğin 2. vuruşu (knockback 200ms) 2sn'lik stun'u ezmemeli.
//     İSTİSNA: startBattle'daki dondurma/yeniden-saldırı gecikmesi (savaş akışı, stun değil).
const dStartBattle = methodBody(dungeonSrc, '  private startBattle(');
const downAssigns = [...dungeonCode.matchAll(/\w+\.downUntil\s*=\s*[^;]+;/g)].map(m => m[0]);
ok('downUntil ataması bulundu (regex çürümedi)', downAssigns.length >= 3);
for (const a of downAssigns) {
  const inBattleFlow = dStartBattle.includes(a);
  ok(`downUntil ataması Math.max'lı ya da savaş akışında: ${a.trim()}`, a.includes('Math.max(') || inBattleFlow);
}
ok('knockback ataması Math.max kullanıyor', /m\.downUntil = Math\.max\(m\.downUntil, this\.time\.now \+ 200\)/.test(dungeonCode));
ok('stun ataması Math.max kullanıyor', /m\.downUntil = Math\.max\(m\.downUntil, this\.time\.now \+ STUN_MS\)/.test(dungeonCode));
ok('stun süresi abilities.ts sabitinden geliyor', dungeonCode.includes('STUN_MS') && !/downUntil.*\+ 2000/.test(dungeonCode));

// (d) 🔒 SPACE DOKUNULMAZ — temel vuruş/kazı zinciri yetenek yoluna kaymadı
const dSpace = methodBody(dungeonSrc, '  private onSpaceAction(');
ok('SPACE hâlâ onSpaceAction\'a bağlı', dungeonCode.includes("kb.on('keydown-SPACE', () => this.onSpaceAction())"));
ok('dokunmatik SPACE hâlâ onSpaceAction çağırıyor',
  dungeonCode.includes('if (touch.space && !this.touchSpacePrev) this.onSpaceAction();'));
ok('SPACE temel vuruşu tek argümanla çağırıyor (yetenek yolu DEĞİL)',
  dSpace.includes('this.heroAttackMob(best)') && dSpace.includes('this.mineNearestVein();'));
ok('SPACE yolunda yetenek/MP mantığı yok',
  !/useSkillSlot|castDamageSkill|skillCdUntil|castGcdUntil|mpCost/.test(dSpace));
ok('temel vuruş kendi ATTACK_CD kapısını koruyor',
  dAttack.includes('if (!isSkill)') && dAttack.includes('this.atkCdUntil = this.time.now + ATTACK_CD_MS;'));
ok('yetenek vuruşu ATTACK_CD kapısını atlıyor (kendi CD/GCD\'si var)',
  /const isSkill = atkOverride !== undefined;/.test(dAttack));
ok('SPACE hasarı hâlâ ps.atk (override yalnız yetenekten)', dAttack.includes('heroHit(atkOverride ?? ps.atk'));

// (e) yetenek etkileri abilities.ts'ten akıyor (tur→ms çevrimi sahnede tekrar edilmiyor)
const dCast = methodBody(dungeonSrc, '  private castDamageSkill(');
const dMobHit = methodBody(dungeonSrc, '  private mobHitsHero(');
ok('çok-vuruş abilities gecikmesini kullanıyor', dCast.includes('MULTIHIT_DELAY_MS') && dCast.includes('sk.hits'));
ok('DoT planı abilities.dotPlan\'den', dCast.includes('dotPlan(sk.dot)'));
ok('gecikmeli vuruş ölü/despawn hedefi atlıyor', dCast.includes('m.hp <= 0 || !m.img.active'));
ok('DoT tiki abilities.dotTickDamage kullanıyor', dTick.includes('dotTickDamage(m.maxHp, d.pct)'));
ok('MP regen abilities.mpRegenPerSec\'ten', dTick.includes('mpRegenPerSec(ps.playerClass)'));
ok('buff süresi turnsToMs ile', methodBody(dungeonSrc, '  private applySelfBuff(').includes('turnsToMs(b.turns)'));
ok('DEF buff\'ı temas hasarında uygulanıyor', dMobHit.includes('effectiveDef(ps.def, this.defBuffPct)'));
ok('kaçınma buff\'ı temas hasarında uygulanıyor', dMobHit.includes('dodgeChance(this.dodgeBuffPct)'));
ok('DoT listesi geriye geziliyor (killMobD splice eder)', dTick.includes('for (let mi = this.mons.length - 1; mi >= 0; mi--)'));
// yetenek ipucu keyfi metin → süre damgasıyla temizlenmeli (9A.1'in "asılı kalan uyarı" dersi)
ok('yetenek ipucu süre damgası kuruyor', methodBody(dungeonSrc, '  private skillHint(').includes('this.tempHintUntil = t + 1000'));
ok('update ipucu süre damgasını temizliyor', dungeonCode.includes('this.tempHintUntil = 0;'));

console.log(`\ntd-abilities: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
