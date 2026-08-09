// frontend/scripts/td-bark-test.ts
// Faz 9A.5 (achievement sayımı) + 9A.6 (canavar replikleri) çapası
// (Node: `npx tsx scripts/td-bark-test.ts`). Biçim emsali: td-element-test.ts / td-music-test.ts.
//
// Üç katman:
//  (1) SAF MANTIK — killStats.ts + barks.ts Node'da koşar (Phaser yok, window yok).
//      🔴 SANDBOX ÇAPASI DAVRANIŞSAL: `recordKillStats` sahte bir `inc` ile çağrılır;
//      'preview'da o fonksiyon HİÇ çağrılmamalı. Kaynak taraması değil — kapıyı kaldıran
//      bir düzenleme testi gerçekten kırmızıya çevirir.
//  (2) YAŞAM DÖNGÜSÜ — `BarkStack` sahte bir `kill` geri çağrısıyla sürülür: kapasite,
//      çift-sökme ve `clear()` doğrudan sayılır (sahne Node'da instantiate edilemez).
//  (3) YAPISAL ÇAPA — sahnelerdeki tek boğaz, `destroy` ↔ `killTweensOf` eşlemesi ve
//      shutdown+destroy temizliği kaynak üstünden pinlenir. Kaynağa bakan iddialar
//      td-element-test.ts'in yorum/string farkında süslü tarayıcısını kullanır — naif
//      kırpma sessizce boş gövde döndürüp sahte yeşil verirdi.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  shouldCountStat, killStatBumps, recordKillStats, isBossType, isDragonType,
  type KillStatBump,
} from '../lib/game/td/killStats';
import {
  rollBark, BarkStack, BARK_HOLD_MS, BARK_FADE_MS, MAX_BARKS, type BarkLock,
} from '../lib/game/td/barks';
import { MOB_LINES, getRandomMobLine } from '../lib/game/lore';
import { REGION_MONSTERS, DUNGEON_ROSTERS } from '../lib/game/td/monsterData';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const LIB = join(__dirname, '..', 'lib', 'game');
const read = (p: string) => readFileSync(join(LIB, p), 'utf8');
const worldSrc = read('td/TdWorldScene.ts');
const dungeonSrc = read('td/TdDungeonScene.ts');
const battleSrc = read('td/TdBattleScene.ts');
const barksSrc = read('td/barks.ts');
const killStatsSrc = read('td/killStats.ts');

/** td-element-test.ts'ten birebir: yorum/string farkında GERÇEK süslü eşleştirmesi. */
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

// ═══════════════════════════════════════════════════════════════════════════
// 9A.5 — SANDBOX KAPISI (DAVRANIŞSAL)
// ═══════════════════════════════════════════════════════════════════════════
ok('shouldCountStat: yalnız live sayar', shouldCountStat('live'));
for (const m of ['preview', 'Live', 'LIVE', '', 'testnet', undefined, null]) {
  ok(`shouldCountStat: '${String(m)}' YAZMAZ`, !shouldCountStat(m as string | undefined | null));
}

/** Sahte achievements yazma ucu — gerçek `incrementStat` yerine geçer. */
function spyDeps() {
  const inc: KillStatBump[] = [];
  const toasts: string[] = [];
  let unlockCalls = 0;
  return {
    inc, toasts,
    calls: () => unlockCalls,
    deps: {
      inc: (stat: string, amount: number) => { inc.push({ stat, amount }); },
      unlock: () => { unlockCalls++; return ['Test Badge']; },
      toast: (title: string) => { toasts.push(title); },
    },
  };
}

// 🔴 ÇAPA: önizleme oynanışı canlı `frostbite_achievements`'e DOKUNMAZ.
{
  const s = spyDeps();
  const applied = recordKillStats('preview', { type: 'wolf', gold: 12 }, s.deps);
  eq('preview: inc HİÇ çağrılmadı', s.inc.length, 0);
  eq('preview: unlock (diske yazan denetim) HİÇ çağrılmadı', s.calls(), 0);
  eq('preview: toast basılmadı', s.toasts.length, 0);
  eq('preview: uygulanan artış yok', applied.length, 0);
}
for (const m of [undefined, null, '', 'Live']) {
  const s = spyDeps();
  recordKillStats(m as string | undefined | null, { type: 'wolf', gold: 12 }, s.deps);
  eq(`kip '${String(m)}': inc HİÇ çağrılmadı`, s.inc.length, 0);
}
{
  const s = spyDeps();
  const applied = recordKillStats('live', { type: 'wolf', gold: 12 }, s.deps);
  ok('live: inc çağrıldı', s.inc.length > 0);
  eq('live: totalKills +1', s.inc.filter(b => b.stat === 'totalKills'), [{ stat: 'totalKills', amount: 1 }]);
  eq('live: totalGoldEarned kazanılan altın kadar', s.inc.filter(b => b.stat === 'totalGoldEarned'),
    [{ stat: 'totalGoldEarned', amount: 12 }]);
  eq('live: unlock bir kez koştu', s.calls(), 1);
  eq('live: açılan başarım ekrana basıldı', s.toasts, ['Test Badge']);
  eq('live: dönüş uygulanan artışlarla aynı', applied, s.inc);
}
// unlock/toast opsiyonel: sahnelerden biri onları geçmezse çökmemeli
{
  const inc: KillStatBump[] = [];
  const applied = recordKillStats('live', { type: 'wolf', gold: 0 },
    { inc: (stat, amount) => { inc.push({ stat, amount }); } });
  eq('live: unlock/toast\'suz deps çalışır', applied.length, inc.length);
}

// ─── artış listesi (saf) ───
eq('altın 0 → totalGoldEarned satırı YOK', killStatBumps({ type: 'wolf', gold: 0 }), [{ stat: 'totalKills', amount: 1 }]);
eq('skeleton → tipe özel sayaç', killStatBumps({ type: 'skeleton', gold: 0 }),
  [{ stat: 'totalKills', amount: 1 }, { stat: 'skeletonKills', amount: 1 }]);
eq('elite_ öneki soyulur (elit iskelet de iskelettir)',
  killStatBumps({ type: 'elite_skeleton', gold: 0 }), killStatBumps({ type: 'skeleton', gold: 0 }));
ok('spider/ghost sayaçları bağlı',
  killStatBumps({ type: 'spider', gold: 0 }).some(b => b.stat === 'spiderKills')
  && killStatBumps({ type: 'ghost', gold: 0 }).some(b => b.stat === 'ghostKills'));
ok('dragon → hem boss hem ejderha sayılır',
  killStatBumps({ type: 'dragon', gold: 0 }).some(b => b.stat === 'bossKills')
  && killStatBumps({ type: 'dragon', gold: 0 }).some(b => b.stat === 'dragonKills'));
ok('krit/kaçınma/hasarsız sayaçları gerçek-zamanlıda basılmaz (savaş defteri yok)',
  !killStatBumps({ type: 'dragon', gold: 9 }).some(b =>
    b.stat === 'critCount' || b.stat === 'dodgeCount' || b.stat === 'perfectWins'));
ok('her artış pozitif tam sayı', killStatBumps({ type: 'crystal_wyrm', gold: 7 })
  .every(b => Number.isInteger(b.amount) && b.amount > 0));

// ─── TdBattleScene PARİTESİ: aynı canavar iki yolda da aynı sayılmalı ───
const victory = methodBody(battleSrc, '  private victory(): void {');
ok('TdBattleScene sandbox kapısı duruyor (dokunulmadı)', victory.includes('if (!this.sandbox) {'));
const bossExpr = /const isBoss = ([^;]+);/.exec(victory);
ok('TdBattleScene boss kuralı okunabildi', !!bossExpr);
const bossLits = new Set([...(bossExpr?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
const battleIsBoss = (t: string) => t.includes('boss') || bossLits.has(t);
const dragonExpr = /if \((mType === 'dragon'[^)]*)\)/.exec(victory);
ok('TdBattleScene ejderha kuralı okunabildi', !!dragonExpr);
const dragonLits = new Set([...(dragonExpr?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
ok('boss/ejderha kural listeleri boş çıkmadı', bossLits.size >= 4 && dragonLits.size >= 4);

const allTypes = new Set<string>();
for (const k of Object.keys(REGION_MONSTERS)) for (const m of REGION_MONSTERS[k]) allTypes.add(m.type);
for (const k of Object.keys(DUNGEON_ROSTERS)) {
  const r = DUNGEON_ROSTERS[k];
  for (const m of r.pool) allTypes.add(m.type);
  if (r.boss) allTypes.add(r.boss.type);
}
ok('tip sayımı çürümedi (≥100 tip tarandı)', allTypes.size >= 100);
const bossMismatch = [...allTypes].filter(t => isBossType(t) !== battleIsBoss(t)).sort();
eq('boss sınıflandırması TdBattleScene ile birebir', bossMismatch, []);
const dragonMismatch = [...allTypes].filter(t => isDragonType(t) !== dragonLits.has(t)).sort();
eq('ejderha sınıflandırması TdBattleScene ile birebir', dragonMismatch, []);
for (const [type, stat] of [['skeleton', 'skeletonKills'], ['spider', 'spiderKills'], ['ghost', 'ghostKills']]) {
  ok(`tipe özel sayaç paritesi: ${type} → ${stat}`,
    victory.includes(`mType === '${type}') incrementStat('${stat}')`));
}
ok('gerçekten boss olan tipler var (kural ölü değil)', [...allTypes].some(t => isBossType(t)));

// ═══════════════════════════════════════════════════════════════════════════
// 9A.6 — REPLİK KİLİDİ (DAVRANIŞSAL)
// ═══════════════════════════════════════════════════════════════════════════
{
  const mob: BarkLock = {};
  let calls = 0;
  const line = (t: string) => { calls++; return `line:${t}`; };
  eq('ilk aggro: replik döner', rollBark(mob, 'wolf', line), 'line:wolf');
  eq('aynı mob ikinci kez: null (spam kilidi)', rollBark(mob, 'wolf', line), null);
  eq('aynı mob üçüncü kez: null', rollBark(mob, 'wolf', line), null);
  eq('zar yalnız BİR kez atıldı', calls, 1);
  ok('kilit mob nesnesinde tutuluyor (despawn ile ölür)', mob.barked === true);
}
{
  // Kilit BAŞARIYA değil DENEMEYE konur: sessiz mob her karede yeniden zar atmamalı
  const mob: BarkLock = {};
  let calls = 0;
  const silent = () => { calls++; return null; };
  eq('sessiz mob: null', rollBark(mob, 'wolf', silent), null);
  eq('sessiz mob tekrar: hâlâ null', rollBark(mob, 'wolf', silent), null);
  eq('sessiz mob için de tek deneme', calls, 1);
}
{
  const a: BarkLock = {}, b: BarkLock = {};
  ok('farklı moblar birbirinin kilidini paylaşmaz',
    rollBark(a, 'wolf', t => t) === 'wolf' && rollBark(b, 'wolf', t => t) === 'wolf');
}
{
  let seen = '';
  rollBark({}, 'elite_frost_giant', (t) => { seen = t; return null; });
  eq('elit öneki soyulur (MOB_LINES taban tiple anahtarlı)', seen, 'frost_giant');
}
// gerçek lore yolu: zar sabitlenerek
{
  const real = Math.random;
  try {
    Math.random = () => 0;               // 0 ≤ 0.3 → konuşur, ilk satır
    const line = rollBark({}, 'skeleton');
    ok('gerçek getRandomMobLine bağlı (skeleton konuştu)', !!line && MOB_LINES.skeleton.includes(line));
    Math.random = () => 0.9;             // 0.9 > 0.3 → susar
    eq('konuşma şansı kapısı duruyor', rollBark({}, 'skeleton'), null);
    Math.random = () => 0;
    eq('tablosuz tip sessiz (çökmez)', rollBark({}, 'no_such_monster_type'), null);
  } finally { Math.random = real; }
}
ok('MOB_LINES satırları boş değil',
  Object.values(MOB_LINES).every(v => Array.isArray(v) && v.length > 0 && v.every(s => s.trim().length > 0)));
{
  const covered = [...allTypes].filter(t => MOB_LINES[t]?.length);
  ok(`replik kapsaması anlamlı (${covered.length} tip konuşuyor)`, covered.length >= 40);
  ok('getRandomMobLine dışa açık', typeof getRandomMobLine === 'function');
}
ok('süreler sonlu ve pozitif (repeat:-1 sızıntısı yok)',
  BARK_HOLD_MS > 0 && Number.isFinite(BARK_HOLD_MS) && BARK_FADE_MS > 0 && Number.isFinite(BARK_FADE_MS));
ok('MAX_BARKS makul', Number.isInteger(MAX_BARKS) && MAX_BARKS >= 1 && MAX_BARKS <= 6);

// ═══════════════════════════════════════════════════════════════════════════
// 9A.6 — YAŞAM DÖNGÜSÜ (DAVRANIŞSAL: BarkStack sahte `kill` ile sürülür)
// ═══════════════════════════════════════════════════════════════════════════
{
  const killed: string[] = [];
  const st = new BarkStack<string>(t => killed.push(t), 3);
  st.add('a'); st.add('b'); st.add('c');
  eq('kapasiteye kadar kimse sökülmez', killed, []);
  eq('defter boyu', st.size, 3);
  st.add('d');
  eq('kapasite aşımında EN ESKİ sökülür', killed, ['a']);
  eq('defter kapasiteyi aşmaz', st.size, 3);
  st.clear();
  eq('clear() kalan HEPSİNİ söker', killed, ['a', 'b', 'c', 'd']);
  eq('clear sonrası defter boş', st.size, 0);
  st.clear();
  eq('ikinci clear (shutdown + destroy) çift sökmez', killed.length, 4);
}
{
  // shutdown ↔ tween onComplete yarışı: clear'dan sonra gelen remove no-op olmalı
  const killed: string[] = [];
  const st = new BarkStack<string>(t => killed.push(t), 3);
  st.add('a');
  st.clear();
  st.remove('a');
  eq('clear sonrası geç gelen onComplete çift destroy atmaz', killed, ['a']);
  st.remove('hiç-eklenmedi');
  eq('bilinmeyen hedef sökülmez', killed, ['a']);
}
{
  const killed: string[] = [];
  const st = new BarkStack<string>(t => killed.push(t)); // varsayılan cap = MAX_BARKS
  for (let i = 0; i < MAX_BARKS + 2; i++) st.add(`b${i}`);
  eq('varsayılan kapasite MAX_BARKS', st.size, MAX_BARKS);
  eq('taşan baloncuklar sökülmüş', killed, ['b0', 'b1']);
}

// ═══════════════════════════════════════════════════════════════════════════
// YAPISAL ÇAPALAR — sahneler Node'da instantiate edilemez
// ═══════════════════════════════════════════════════════════════════════════
const scenes: Array<[string, string, string, string]> = [
  ['dünya', worldSrc, worldCode, '  private killMob(m: MonRef): void {'],
  ['zindan', dungeonSrc, dungeonCode, '  private killMobD(m: DMonRef): void {'],
];
for (const [name, src, code, killSig] of scenes) {
  const kill = methodBody(src, killSig);
  // 🔒 TEK BOĞAZ (9A.1 sözleşmesi): sayım ölüm boğazında, başka hiçbir yerde değil
  ok(`${name}: sayım ölüm boğazında`, kill.includes('recordKillStats('));
  eq(`${name}: tek recordKillStats çağrısı`, count(code, 'recordKillStats('), 1);
  ok(`${name}: despawnMonster sayım yapmıyor (çift-sayım çapası)`,
    !/recordKillStats|incrementStat|checkAndUnlock/.test(methodBody(src, '  private despawnMonster(')));
  // Kapı atlanamaz: sahnede ÇIPLAK incrementStat(...) çağrısı yok — yalnız deps referansı
  eq(`${name}: çıplak incrementStat( çağrısı yok (kapı atlanamaz)`, count(code, 'incrementStat('), 0);
  ok(`${name}: incrementStat yalnız enjekte ediliyor`, code.includes('inc: incrementStat'));
  // checkAndUnlock (diske YAZAR) yalnız unlockAchievements içinde ve o da yalnız deps'ten
  eq(`${name}: tek checkAndUnlock çağrısı`, count(code, 'checkAndUnlock('), 1);
  ok(`${name}: checkAndUnlock unlockAchievements içinde`,
    methodBody(src, '  private unlockAchievements(): string[] {').includes('checkAndUnlock('));
  eq(`${name}: unlockAchievements yalnız deps'ten çağrılıyor`, count(code, 'this.unlockAchievements()'), 1);

  // ── 9A.6: baloncuk yaşam döngüsü ──
  eq(`${name}: tek tryBark çağrı sitesi (aggro dalı)`, count(code, 'this.tryBark('), 1);
  const showBark = methodBody(src, '  private showBark(x: number, y: number, msg: string): void {');
  ok(`${name}: baloncuk tween'i SONLU (repeat yok)`, !/repeat/.test(showBark));
  ok(`${name}: tween onComplete defterin remove'una düşüyor`, showBark.includes('this.barks.remove(t)'));
  ok(`${name}: baloncuk deftere ekleniyor`, showBark.includes('this.barks.add(t)'));
  ok(`${name}: showBark kendi destroy'unu yapmıyor (sökme tek yerde)`, !/destroy\(/.test(showBark));
  // destroy ↔ killTweensOf EŞLEMESİ: tek sökme ucu, ikisi birlikte
  const killCb = /private barks = new BarkStack<[^>]+>\(\(t\) => \{([\s\S]*?)\}\);/.exec(code);
  ok(`${name}: BarkStack sökme ucu okunabildi`, !!killCb);
  ok(`${name}: her destroy killTweensOf ile eşli`,
    !!killCb && /this\.tweens\.killTweensOf\(t\);/.test(killCb[1]) && /t\.destroy\(\);/.test(killCb[1]));
  // shutdown VE destroy: ikisi de defteri boşaltır
  ok(`${name}: shutdown baloncukları temizliyor`,
    code.includes("this.events.once('shutdown', () => this.barks.clear());"));
  ok(`${name}: destroy baloncukları temizliyor`,
    code.includes("this.events.once('destroy', () => this.barks.clear());"));
  eq(`${name}: barks.clear yalnız bu iki kancada`, count(code, 'this.barks.clear()'), 2);
  // mob kilidi alanı gerçekten tipte
  ok(`${name}: mob referansı barked bayrağını taşıyor`, /barked\?: boolean;/.test(code));

  // 9A.1/9A.2 sözleşmeleri bozulmadı
  eq(`${name}: hâlâ tek rollGroundLoot çağrısı`, count(code, 'rollGroundLoot('), 1);
  ok(`${name}: ölüm boğazı loot + ödül veriyor`,
    kill.includes('killRewards(') && kill.includes('this.dropGroundLoot(') && kill.includes('this.despawnMonster(m)'));
}

// Aggro dalı: replik KOVALAMA'da atılıyor (gezinen mob konuşmaz)
for (const [name, code] of [['dünya', worldCode], ['zindan', dungeonCode]] as const) {
  const i = code.indexOf('this.tryBark(');
  const before = code.slice(Math.max(0, i - 700), i);
  ok(`${name}: replik aggro/kovalama dalında`, before.includes('CHASE_SPEED'));
}

// Saf modüller SAF kaldı: achievements.ts (localStorage) killStats.ts'e girmiyor
ok('killStats.ts achievements.ts\'i import ETMİYOR (yazma enjekte)',
  !/from '\.\.\/achievements'/.test(killStatsSrc));
ok('killStats.ts Phaser/window görmüyor', !/phaser|window\./i.test(stripComments(killStatsSrc)));
ok('barks.ts Phaser/window görmüyor', !/phaser|window\./i.test(stripComments(barksSrc)));
ok('barks.ts lore.ts\'i gerçekten bağlıyor', /from '\.\.\/lore'/.test(barksSrc));

console.log(`\ntd-bark: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
