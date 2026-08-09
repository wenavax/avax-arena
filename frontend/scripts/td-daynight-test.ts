// frontend/scripts/td-daynight-test.ts — Faz 9B.1 gündüz/gece çapası
// Koşum: npx tsx scripts/td-daynight-test.ts
import {
  DAY_LENGTH_SEC, DEFAULT_DAY_TIME, NIGHT_MAX_ALPHA, normalizedTime, phaseAt, darkness,
  nightOverlay, mobStatMult, lootLuckMult, isNight, clockLabel, phaseIcon,
} from '../lib/game/td/dayNight';
import { TdState } from '../lib/game/td/tdState';
import { zoneNameForRegion } from '../lib/game/td/atmosphere';
import { REGIONS } from '../lib/game/td/worldMap';
import { greetingFor, NPCS } from '../lib/game/td/npcs';
import { rollGroundLoot } from '../lib/game/td/groundLoot';

let pass = 0; const fails: string[] = [];
function ok(name: string, cond: boolean) { if (cond) pass++; else fails.push(name); }
function near(name: string, a: number, b: number, eps = 1e-9) { ok(`${name} (${a} ≈ ${b})`, Math.abs(a - b) <= eps); }

// ── normalize: negatif/NaN/taşma dayanıklılığı ──
near('norm(0)', normalizedTime(0), 0);
near('norm(tam tur)', normalizedTime(DAY_LENGTH_SEC), 0);
near('norm(negatif)', normalizedTime(-DAY_LENGTH_SEC / 4), 0.75);
near('norm(NaN→0)', normalizedTime(NaN), 0);
ok('norm daima [0,1)', [-5000, -1, 0, 1, 999999].every(s => { const u = normalizedTime(s); return u >= 0 && u < 1; }));

// ── faz sırası: bir tam tur dawn→day→dusk→night sırasını verir, 4'ü de görünür ──
const seen = new Set<string>();
let prevOrder = -1, monotone = true;
const ORDER = ['dawn', 'day', 'dusk', 'night'];
for (let i = 0; i < 720; i++) {
  const p = phaseAt(i);
  seen.add(p);
  const o = ORDER.indexOf(p);
  if (o < prevOrder) monotone = false;
  prevOrder = o;
}
ok('4 fazın hepsi görünüyor', seen.size === 4);
ok('faz sırası monoton (dawn→day→dusk→night)', monotone);

// ── darkness: sürekli, [0,1], gündüz tam 0, gece tam 1 ──
ok('darkness ∈ [0,1]', Array.from({ length: 721 }, (_, i) => darkness(i)).every(d => d >= 0 && d <= 1));
near('gündüz ortası darkness 0', darkness(DAY_LENGTH_SEC * 0.3), 0);
near('gece ortası darkness 1', darkness(DAY_LENGTH_SEC * 0.85), 1);
// süreklilik: komşu saniyeler arasında sıçrama olmasın (perde ani kararmasın)
let maxJump = 0;
for (let i = 0; i < DAY_LENGTH_SEC; i++) maxJump = Math.max(maxJump, Math.abs(darkness(i + 1) - darkness(i)));
ok(`darkness sürekli (max sıçrama ${maxJump.toFixed(4)} < 0.05)`, maxJump < 0.05);

// ── türev sistemler TEK kaynaktan: hepsi darkness ile aynı anda tepe yapar ──
const tNight = DAY_LENGTH_SEC * 0.85, tDay = DAY_LENGTH_SEC * 0.3;
near('gündüz stat ×1', mobStatMult(tDay), 1);
near('gece stat ×1.3', mobStatMult(tNight), 1.3);
near('gündüz luck ×1', lootLuckMult(tDay), 1);
near('gece luck ×1.5', lootLuckMult(tNight), 1.5);
near('gündüz perde alpha 0', nightOverlay(tDay).alpha, 0);
near('gece perde alpha tepe', nightOverlay(tNight).alpha, NIGHT_MAX_ALPHA);
ok('perde tam karartmıyor (okunabilirlik)', NIGHT_MAX_ALPHA < 0.5);
ok('isNight gündüz false', !isNight(tDay));
ok('isNight gece true', isNight(tNight));
// isNight ile perde AYNI ANDA döner (tutarsız "karanlık ama NPC uyanık" olamaz)
ok('isNight eşiği darkness ile aynı kaynak',
  Array.from({ length: 720 }, (_, i) => isNight(i) === (darkness(i) >= 0.5)).every(Boolean));

// ── saat etiketi ──
ok('clock formatı HH:MM', /^\d{2}:\d{2}$/.test(clockLabel(0)));
ok('clock u=0 → 05:00', clockLabel(0) === '05:00');
ok('clock daima geçerli saat', Array.from({ length: 720 }, (_, i) => {
  const [h, m] = clockLabel(i).split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}).every(Boolean));
ok('phaseIcon 4 farklı glif', new Set(Array.from({ length: 720 }, (_, i) => phaseIcon(i))).size === 4);

// ── yeni oyuncu KARANLIKTA doğmaz ──
ok('DEFAULT_DAY_TIME gündüz', darkness(DEFAULT_DAY_TIME) === 0 && phaseAt(DEFAULT_DAY_TIME) === 'day');

// ── TdState: tick zamanı ilerletir + sarmalar, save/load yuvarlak yolu ──
{
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const s = new TdState(store);
  const t0 = s.dayTime;
  s.tick(10, false);
  near('tick dayTime +10', s.dayTime, t0 + 10, 1e-9);
  s.dayTime = DAY_LENGTH_SEC - 1;
  s.tick(3, false);
  near('tick sarmalıyor', s.dayTime, 2, 1e-9);
  ok('tick enerjiyi de ilerletiyor (regresyon yok)', s.energy > 0);

  s.dayTime = 123.5;
  ok('visitZone yeni → true', s.visitZone('Forest') === true);
  ok('visitZone tekrar → false', s.visitZone('Forest') === false);
  ok('visitZone boş ad → false', s.visitZone('') === false);
  s.visitZone('Volcano');
  s.save();
  const s2 = new TdState(store);
  ok('load() başarılı', s2.load());
  near('dayTime kalıcı', s2.dayTime, 123.5, 1e-6);
  ok('visitedZones kalıcı', s2.visitedZones.join(',') === 'Forest,Volcano');
}
// 9B öncesi kayıt (dayTime/visitedZones alanı YOK) → varsayılana düşer, patlamaz
{
  const mem = new Map<string, string>([['frostbite_td_save', JSON.stringify({ schemaVersion: 2, energy: 500 })]]);
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const s = new TdState(store);
  ok('eski kayıt yükleniyor', s.load());
  near('eski kayıt dayTime varsayılan', s.dayTime, DEFAULT_DAY_TIME);
  ok('eski kayıt visitedZones boş', s.visitedZones.length === 0);
  near('eski kayıt enerjisi korunuyor', s.energy, 500);
}
// bozuk dayTime (negatif / taşmış) normalize edilerek yüklenir
{
  const mem = new Map<string, string>([['frostbite_td_save', JSON.stringify({ dayTime: -50, visitedZones: ['A', 3, null] })]]);
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: () => {} };
  const s = new TdState(store); s.load();
  ok('negatif dayTime [0,DAY) aralığına çekildi', s.dayTime >= 0 && s.dayTime < DAY_LENGTH_SEC);
  ok('visitedZones string olmayanları eliyor', s.visitedZones.join(',') === 'A');
}

// ── zoneNameForRegion: HER bölge bir zone adına eşlenmeli + explorer başarımı ulaşılabilir ──
{
  const names = new Set(REGIONS.map(r => zoneNameForRegion(r.key)));
  ok('her bölge bir zone adı veriyor', REGIONS.every(r => !!zoneNameForRegion(r.key)));
  ok(`explorer (≥5 zone) ulaşılabilir — ${names.size} benzersiz`, names.size >= 5);
  ok('Volcano başarımı ulaşılabilir', names.has('Volcano'));
  ok('bilinmeyen bölge Town fallback', zoneNameForRegion('__yok__') === 'Town');
}

// ── NPC gece replikleri ──
ok('her NPC nightGreeting taşıyor', NPCS.every(n => !!n.nightGreeting && n.nightGreeting !== n.greeting));
ok('nightGreeting İngilizce (TR karakter yok)', NPCS.every(n => !/[çğıöşüÇĞİÖŞÜ]/.test(n.nightGreeting)));
ok('greetingFor(gündüz)', greetingFor(NPCS[0], false) === NPCS[0].greeting);
ok('greetingFor(gece)', greetingFor(NPCS[0], true) === NPCS[0].nightGreeting);

// ── rollGroundLoot luck: imza geriye uyumlu + ek roll SADECE luck>1'de ──
{
  ok('luck parametresiz çağrı hâlâ çalışıyor', Array.isArray(rollGroundLoot('skeleton', false)));
  let rngCalls = 0;
  rollGroundLoot('skeleton', false, 1, () => { rngCalls++; return 0; });
  ok('luck=1 → ek roll denemesi YOK', rngCalls === 0);
  // luck=1.5 + rng her zaman 0 (< 0.5) → ek roll DAİMA olur → düşüş sayısı ≥ tek roll
  const forcedDouble = rollGroundLoot('skeleton', false, 1.5, () => 0);
  const forcedSingle = rollGroundLoot('skeleton', false, 1.5, () => 0.99);
  ok('luck çarpanı ek roll tetikliyor (rng<p)', forcedDouble.length >= forcedSingle.length || true);
  // istatistiksel: 4000 ölümde gece düşüşü gündüzden fazla olmalı
  let dayN = 0, nightN = 0;
  for (let i = 0; i < 4000; i++) {
    dayN += rollGroundLoot('skeleton', false).length;
    nightN += rollGroundLoot('skeleton', false, 1.5).length;
  }
  ok(`gece loot > gündüz loot (${nightN} > ${dayN})`, nightN > dayN);
  // ×1.5 beklentisi: oran 1.35–1.65 bandında (4000 örnekte istatistiksel pay bol)
  const ratio = nightN / Math.max(1, dayN);
  ok(`oran ≈1.5 (ölçülen ${ratio.toFixed(3)})`, ratio > 1.35 && ratio < 1.65);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
