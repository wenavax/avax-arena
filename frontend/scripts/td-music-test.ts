// frontend/scripts/td-music-test.ts
// Faz 9A.4 — bölge müziği çapası (Node: `npx tsx scripts/td-music-test.ts`).
// Biçim emsali: td-element-test.ts / td-abilities-test.ts.
//
// İki katman:
//  (1) SAF MANTIK — zoneMusic.ts Node'da koşar (Phaser yok, window yok). Kapsama
//      (18/18 bölge), aile kuralları, savunmacı varsayılan ve ses kilidinin davranışı
//      DOĞRUDAN modül üstünden sınanır — kaynak taraması değil.
//  (2) YAPISAL ÇAPA — sahneler Node'da instantiate edilemez; autoplay kuralı
//      ("create() müzik ÇALMAZ") ve dinleyici temizliği kaynak üstünden pinlenir.
//      Kaynağa bakan iddialar td-element-test.ts'in yorum/string farkında süslü
//      tarayıcısını kullanır — naif kırpma sessizce boş gövde döndürüp sahte yeşil verirdi.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REGION_MUSIC, FALLBACK_MUSIC, musicForRegion, musicForDungeon,
  isAudioUnlocked, markAudioUnlocked, resetAudioUnlock,
} from '../lib/game/td/zoneMusic';
import { REGIONS } from '../lib/game/td/worldMap';
import { DUNGEON_ROSTERS } from '../lib/game/td/monsterData';
import type { ZoneMusic } from '../lib/game/musicSystem';

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
const musicSrc = read('musicSystem.ts');
const zoneSrc = read('td/zoneMusic.ts');

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

// musicSystem'in ZoneMusic birleşimi — tek doğruluk kaynağı ORASI; buradaki liste
// senkron kalsın diye tipin kendisinden değil, kaynaktan çıkarılır (tip Node'da yok).
const ZONE_VALUES: ZoneMusic[] = (() => {
  const m = musicSrc.match(/export type ZoneMusic\s*=\s*([^;]+);/);
  if (!m) throw new Error('ZoneMusic birleşimi musicSystem.ts içinde bulunamadı');
  return m[1].split('|').map(s => s.trim().replace(/'/g, '')) as ZoneMusic[];
})();

// ═════════════════════════════════════════════════════════════════════════════
// (1) SAF MANTIK
// ═════════════════════════════════════════════════════════════════════════════

// ─── (a) 🔴 KAPSAMA: 18/18 bölge — 9A.0'ın loot kapsaması çapasının aynısı ───
// Eşlenmemiş bölge = sessiz dünya. Eksikler BASILIR (sessiz fallback yığılmasın).
eq('çapa kurulumu: 18 bölge', REGIONS.length, 18);
const unmapped = REGIONS.map(r => r.key).filter(k => REGION_MUSIC[k] === undefined).sort();
if (unmapped.length) console.error('EŞLENMEMİŞ BÖLGELER:\n  ' + unmapped.join('\n  '));
eq('her bölge eşlendi (100% kapsama)', unmapped, []);
ok('her bölge GEÇERLİ bir ZoneMusic değerine çözülüyor',
  REGIONS.every(r => ZONE_VALUES.includes(musicForRegion(r.key))));
ok('hiçbir bölge fallback (sessizlik) döndürmüyor',
  REGIONS.every(r => musicForRegion(r.key) !== FALLBACK_MUSIC));
// Tabloda ölü anahtar da olmamalı (bölge silinip eşleme kalırsa fark edilsin).
const regionKeys = new Set(REGIONS.map(r => r.key));
const orphan = Object.keys(REGION_MUSIC).filter(k => !regionKeys.has(k)).sort();
if (orphan.length) console.error('ÖLÜ EŞLEME ANAHTARLARI:\n  ' + orphan.join('\n  '));
eq('tabloda ölü anahtar yok', orphan, []);

// ─── (b) 🔴 'battle'/'boss' AYRILMIŞ — TdBattleScene'in (TdBattleScene:391) ───
// Bir bölgeye bağlanırsa dünyada gezerken savaş müziği çalar, boss girişi etkisini yitirir.
ok('hiçbir bölge battle/boss çalmıyor',
  REGIONS.every(r => musicForRegion(r.key) !== 'battle' && musicForRegion(r.key) !== 'boss'));
ok('çapa kurulumu: battle/boss GERÇEKTEN geçerli değerler (yanlış-negatif değil)',
  ZONE_VALUES.includes('battle') && ZONE_VALUES.includes('boss'));

// ─── (c) AİLE KURALLARI — tanımlayıcı bölgeler doğru ambiyansta ───
eq('kasaba → town', musicForRegion('town'), 'town');
eq('sanctum (sıcak/kutsal) → town', musicForRegion('sanctum'), 'town');
eq('orman → forest', musicForRegion('forest'), 'forest');
eq('doğu çayırı (açık hava) → forest', musicForRegion('grassE'), 'forest');
eq('buz çölü → ice_cave', musicForRegion('frostwastes'), 'ice_cave');
eq('kale (buz mavisi) → ice_cave', musicForRegion('citadel'), 'ice_cave');
eq('yanardağ → volcano', musicForRegion('volcano'), 'volcano');
eq('dövümhane → volcano', musicForRegion('forge'), 'volcano');
eq('cehennem kapısı → volcano', musicForRegion('demongate'), 'volcano');
eq('maden (kapalı) → dungeon', musicForRegion('mines'), 'dungeon');
eq('nekropolis (ölüsever) → dungeon', musicForRegion('necropolis'), 'dungeon');
eq('boşluk diyarı → dungeon', musicForRegion('voidrealm'), 'dungeon');
// Ateş bölgeleri buzdan, buz bölgeleri ateşten AYRI (tablo tek değere çökerse yakala)
ok('buz ≠ ateş', musicForRegion('frostwastes') !== musicForRegion('volcano'));
ok('kasaba ≠ zindan', musicForRegion('town') !== musicForRegion('mines'));
ok('en az 5 farklı ambiyans kullanılıyor',
  new Set(REGIONS.map(r => musicForRegion(r.key))).size >= 5);

// ─── (d) SAVUNMACI VARSAYILAN ───
eq('bilinmeyen bölge → fallback', musicForRegion('atlantis'), FALLBACK_MUSIC);
eq('boş anahtar → fallback', musicForRegion(''), FALLBACK_MUSIC);
eq('fallback sessizliktir', FALLBACK_MUSIC, 'none');
ok('fallback geçerli bir ZoneMusic', ZONE_VALUES.includes(FALLBACK_MUSIC));
// Prototype kirliliğine düşmesin ('constructor' gibi anahtarlar `??` ile geçerdi)
eq('prototype anahtarı sızmıyor', musicForRegion('constructor'), FALLBACK_MUSIC);
eq('toString anahtarı sızmıyor', musicForRegion('toString'), FALLBACK_MUSIC);

// ─── (e) ZİNDAN YARDIMCISI — yer altı her zaman 'dungeon' ───
eq('zindan → dungeon', musicForDungeon(), 'dungeon');
ok('zindan yardımcısı geçerli değer', ZONE_VALUES.includes(musicForDungeon()));
// 13 zindanın hepsi aynı yardımcıdan geçer: yüzeyi 'volcano' olan bölgenin zindanı da
// yer altı ambiyansı çalar (mekân duygusu bölgeden değil, kapalılıktan gelir).
const volcanoDungeons = Object.keys(DUNGEON_ROSTERS).filter(k => musicForRegion(k) === 'volcano');
ok('çapa kurulumu: en az bir yanardağ zindanı var', volcanoDungeons.length > 0);
ok('yanardağ zindanı bile dungeon çalıyor',
  volcanoDungeons.every(() => musicForDungeon() === 'dungeon'));

// ─── (f) SES KİLİDİ (autoplay latch) — DAVRANIŞ üstünden ───
resetAudioUnlock();
ok('kilit başlangıçta KAPALI (create() çalamaz)', isAudioUnlocked() === false);
markAudioUnlocked();
ok('ilk jest kilidi açar', isAudioUnlocked() === true);
markAudioUnlocked();
ok('idempotent (ikinci jest bozmaz)', isAudioUnlocked() === true);
resetAudioUnlock();
ok('reset izolasyonu geri alır', isAudioUnlocked() === false);
markAudioUnlocked(); // kalan iddialar için açık bırak (oyun-içi normal durum)

// ─── (g) SAFLIK — modül Node'da koşuyor olmasının kanıtı + Phaser/window yokluğu ───
ok('zoneMusic Phaser import etmiyor', !/from ['"]phaser['"]/.test(zoneSrc));
ok('zoneMusic window/document/localStorage okumuyor',
  !/\b(window|document|localStorage)\b/.test(stripComments(zoneSrc)));
ok('zoneMusic musicSystem\'i YALNIZ tip olarak alıyor (çalma sahnenin işi)',
  /import type \{ ZoneMusic \} from '\.\.\/musicSystem'/.test(zoneSrc)
  && !/^import \{[^}]*music[^}]*\} from '\.\.\/musicSystem'/m.test(zoneSrc));

// ═════════════════════════════════════════════════════════════════════════════
// (2) YAPISAL ÇAPA (sahneler Node'da instantiate edilemez)
// ═════════════════════════════════════════════════════════════════════════════

// ─── 🔴 AUTOPLAY: create() müzik ÇALMAZ ───
// AudioContext kullanıcı jesti olmadan başlamaz; create()'te play() sessiz bir bağlam
// bırakır ve ilk bölge müziği HİÇ duyulmaz. Bu iddia davranışsal yapılamıyor (sahne
// Node'da kurulamaz) → gövde taraması.
const worldCreate = methodBody(worldSrc, '  create(): void {');
const dungeonCreate = methodBody(dungeonSrc, '  create(): void {');
// stripComments ŞART: gövde ham dilimlenir, "create()'te music.play() YOK" açıklaması
// naif bir taramada iddiayı yanlış-kırmızı yapardı.
ok('dünya: create() music.play çağırmıyor', !/music\.play\(/.test(stripComments(worldCreate)));
ok('zindan: create() music.play çağırmıyor', !/music\.play\(/.test(stripComments(dungeonCreate)));
ok('dünya: create() ilk jest kancasını kuruyor',
  /kb\.once\('keydown', markAudioUnlocked\)/.test(worldCreate)
  && /this\.input\.once\('pointerdown', markAudioUnlocked\)/.test(worldCreate));
ok('zindan: create() ilk jest kancasını kuruyor',
  /kb\.once\('keydown', markAudioUnlocked\)/.test(dungeonCreate)
  && /this\.input\.once\('pointerdown', markAudioUnlocked\)/.test(dungeonCreate));

// ─── play() TEK yoldan: sahne başına bir syncZoneMusic ───
const worldSync = methodBody(worldSrc, '  private syncZoneMusic(');
const dungeonSync = methodBody(dungeonSrc, '  private syncZoneMusic(');
eq('dünya: music.play tek çağrı noktası', count(worldCode, 'music.play('), 1);
eq('zindan: music.play tek çağrı noktası', count(dungeonCode, 'music.play('), 1);
ok('dünya: play kilit + değişim kapısının ARDINDA',
  /!isAudioUnlocked\(\)/.test(worldSync) && /this\.playedZone/.test(worldSync));
ok('zindan: play kilit + değişim kapısının ARDINDA',
  /!isAudioUnlocked\(\)/.test(dungeonSync) && /this\.playedZone/.test(dungeonSync));
ok('dünya: müzik ATMOSFERLE aynı regionAt sonucundan besleniyor (ikinci sorgu yok)',
  /this\.syncZoneMusic\(regionKey\)/.test(worldCode) && count(worldCode, 'regionAt(Math.floor(') === 1);
ok('zindan: update() ambiyansı senkronluyor', /this\.syncZoneMusic\(\)/.test(dungeonCode));

// ─── 🔴 YAŞAM DÖNGÜSÜ: TdWorldScene bir oturum boyunca hiç durmaz ───
ok('dünya: shutdown VE destroy müziği durduruyor',
  count(worldCode, "this.events.once('shutdown', () => music.stop());") === 1
  && count(worldCode, "this.events.once('destroy', () => music.stop());") === 1);
ok('dünya: td-ui-music dinleyicisi shutdown+destroy\'da kaldırılıyor',
  count(worldCode, "window.addEventListener('td-ui-music'") === 1
  && count(worldCode, "window.removeEventListener('td-ui-music'") === 1
  && /this\.events\.once\('shutdown', offUi\);/.test(worldCode)
  && /this\.events\.once\('destroy', offUi\);/.test(worldCode));
ok('zindan: td-ui-music dinleyicisi shutdown+destroy\'da kaldırılıyor',
  count(dungeonCode, "window.addEventListener('td-ui-music'") === 1
  && count(dungeonCode, "window.removeEventListener('td-ui-music'") === 1
  && /this\.events\.once\('shutdown', offMusic\);/.test(dungeonCode)
  && /this\.events\.once\('destroy', offMusic\);/.test(dungeonCode));
// Sonsuz tween / yok edilmemis obje EKLENMEDİ: 🔊 düğmesi düz bir Text (tween'siz).
ok('dünya: mute düğmesi sonsuz tween kurmuyor',
  !/muteBtn[\s\S]{0,400}?repeat: -1/.test(worldCode));
ok('dünya: mute düğmesi INPUT için setScrollFactor(0) taşıyor (Faz 7 hit-test dersi)',
  /this\.muteBtn = this\.add\.text\([\s\S]*?setScrollFactor\(0\)[\s\S]*?setInteractive\(/.test(worldCode));

// ─── ÇİFT TOGGLE TUZAĞI: tek olay, iki dinleyici → net değişim SIFIR ───
ok('dünya: td-ui-music alt sahne aktifken tüketilmiyor',
  /isActive\('TdDungeon'\)[\s\S]{0,120}?toggleMusicMute\(\)/.test(worldCode));
ok('zindan: td-ui-music savaş üstteyken tüketilmiyor',
  /onUiMusic = \(\) => \{ if \(!this\.scene\.isActive\('TdBattle'\)\) music\.toggleMute\(\); \}/.test(dungeonCode));

// ─── SAVAŞ DÖNÜŞÜ: TdBattleScene müziği 'boss'/'battle'a çevirir ve GERİ DÖNDÜRMEZ ───
ok('dünya: resume playedZone\'u sıfırlıyor (bölge müziği geri gelir)',
  /this\.events\.on\('resume', \(\) => \{ this\.playedZone = null; \}\);/.test(worldCode));
ok('zindan: resume playedZone\'u sıfırlıyor',
  /this\.events\.on\('resume', \(\) => \{ this\.playedZone = null; \}\);/.test(dungeonCode));
ok('zindan: init() playedZone\'u sıfırlıyor (sahne örneği yeniden kullanılıyor)',
  /this\.playedZone = null;/.test(methodBody(dungeonSrc, '  init(data: DungeonInitData): void {')));

// ─── ÖLÜM YOLUNA DOKUNULMADI (9A.1 sözleşmesi) ───
ok('dünya: killMob müziğe dokunmuyor', !/music\./.test(methodBody(worldSrc, '  private killMob(')));
ok('zindan: killMobD müziğe dokunmuyor', !/music\./.test(methodBody(dungeonSrc, '  private killMobD(')));

console.log(`\ntd-music: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
