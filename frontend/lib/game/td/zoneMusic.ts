// frontend/lib/game/td/zoneMusic.ts
// ─── Faz 9A.4: bölge → ambiyans müziği eşlemesi (dünya + zindan) ───
// `musicSystem.ts` prosedürel müziği 8 `ZoneMusic` değeriyle üretiyordu ama YALNIZ
// TdBattleScene onu çağırıyordu (oyun zamanının ~%2'si). Burası eksik halka: 18 dünya
// bölgesinin ve zindanların hangi ambiyansı çaldığının TEK evi.
//
// atmosphere.ts ile aynı deyim (bölge anahtarı → sabit tablo → savunmacı yardımcı) ve
// elemental.ts / groundLoot.ts / abilities.ts ile aynı sözleşme: SAF modül — Phaser yok,
// window yok, `musicSystem`'den yalnız TİP alınır (`import type`) → Node'da koşar, çapa
// testi (`scripts/td-music-test.ts`) buradan geçer. Müziği ÇALMAK sahnenin işi.

import type { ZoneMusic } from '../musicSystem';

/**
 * Eşlenmemiş bölge anahtarı → SESSİZLİK. atmosphere.ts 'Town'a düşer (yanlış renk
 * banyosu göze çarpmaz), müzikte ise yanlış ambiyans yanlış bir yer duygusu verir:
 * kasaba melodisinin cehennem kapısında çalması, sessizlikten daha kötüdür. Eşleme
 * eksilirse kapsama testi (18/18) zaten kırmızı yanar — bu yalnız üretimdeki emniyet
 * supabı.
 */
export const FALLBACK_MUSIC: ZoneMusic = 'none';

/**
 * 18 bölge → 5 ambiyans ailesi. Kural:
 *  · 'town'     — güvenli/uygar/sıcak (kasaba, kasaba altı tarlalar, altın kubbeli sanctum)
 *  · 'forest'   — AÇIK HAVA yaban (rüzgâr + kuş): orman, doğu çayırı, bataklık
 *  · 'ice_cave' — soluk/soğuk: buz çölü, buz mavisi kale
 *  · 'volcano'  — ateş: yanardağ, dövümhane, cehennem kapısı
 *  · 'dungeon'  — karanlık/kapalı/ölüsever/boşluk: maden, harabe, mezar, nekropolis,
 *                 uçurum, boşluk diyarı, ebedi
 * 'battle'/'boss' KASTEN yok: onlar TdBattleScene'in (TdBattleScene:391) — bir bölgeye
 * bağlanırsa dünyada gezinirken savaş müziği çalar ve boss girişinin etkisi ölür.
 * Renk paritesi için biyom tonu atmosphere.ts'teki REGION_TO_ATMO ile hizalı tutuldu.
 */
export const REGION_MUSIC: Record<string, ZoneMusic> = {
  town: 'town', grassS: 'town', sanctum: 'town',
  forest: 'forest', grassE: 'forest', swamp: 'forest',
  frostwastes: 'ice_cave', citadel: 'ice_cave',
  volcano: 'volcano', forge: 'volcano', demongate: 'volcano',
  mines: 'dungeon', ruins: 'dungeon', crypt: 'dungeon', necropolis: 'dungeon',
  abyss: 'dungeon', voidrealm: 'dungeon', eternal: 'dungeon',
};

/**
 * Dünya bölgesinin ambiyansı (`regionAt(...).key` → zone). Bilinmeyen anahtar sessizdir.
 * `hasOwnProperty`: düz `??` araması 'constructor'/'toString' gibi anahtarlarda
 * Object.prototype'tan bir FONKSİYON döndürür ve `music.play()`'e ZoneMusic yerine o gider.
 */
export function musicForRegion(regionKey: string): ZoneMusic {
  return Object.prototype.hasOwnProperty.call(REGION_MUSIC, regionKey)
    ? REGION_MUSIC[regionKey] : FALLBACK_MUSIC;
}

/**
 * Zindan ambiyansı. Zindan kimliği bölge anahtarıyla AYNI (`TdDungeonScene.dungeonId`),
 * ama yerin altı her zaman 'dungeon' çalar: yanardağ zindanında yüzeyin lav gürültüsü
 * değil, damla+drone duyulmalı (mekân duygusu bölgeden değil, kapalılıktan gelir).
 */
export function musicForDungeon(): ZoneMusic {
  return 'dungeon';
}

// ── Autoplay kilidi ────────────────────────────────────────────────────────────
// 🔴 Tarayıcı politikası: `AudioContext` KULLANICI JESTİ olmadan başlamaz — `create()`'te
// `music.play()` çağırmak sessiz (hatta 'suspended' takılı) bir bağlam bırakır. Kilit
// sahne DEĞİL oturum kapsamlıdır: dünyada jest verildikten sonra zindan ilk karesinde
// çalabilsin diye (zindana giren oyuncu zaten yürümüştür) bayrak burada, modül düzeyinde
// tutulur. Saf kalır: yalnız bir boolean, ne window ne Phaser.

let unlocked = false;

/** Ses bağlamı bir kullanıcı jestiyle açıldı mı? Sahne `update()`'i her kare sorar. */
export function isAudioUnlocked(): boolean {
  return unlocked;
}

/** İlk jest (tuş/pointer/joystick) — idempotent. */
export function markAudioUnlocked(): void {
  unlocked = true;
}

/** Yalnız test izolasyonu için: kilidi başlangıç durumuna al (oyun kodu ÇAĞIRMAZ). */
export function resetAudioUnlock(): void {
  unlocked = false;
}
