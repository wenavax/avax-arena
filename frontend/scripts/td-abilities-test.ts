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
  isBuffSkill, dotPlan, dotTickDamage, effectiveDef, dodgeChance,
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

console.log(`\ntd-abilities: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
