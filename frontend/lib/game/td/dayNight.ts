// frontend/lib/game/td/dayNight.ts
// ─── Faz 9B.1: gündüz/gece döngüsü (SAF mantık — Phaser YOK, sahne YOK) ───
// Node'da doğrudan import edilir (çapa: scripts/td-daynight-test.ts), combat.ts /
// groundLoot.ts ile aynı saflık kuralı: her şey parametreden gelir, global okunmaz.
//
// Zaman `TdState.dayTime` alanında (saniye, `frostbite_td_save` — CANLI `frostbite_save`
// şemasına DOKUNULMAZ). Sahne yalnız `atmoForRegion` lerp'inin ÜSTÜNE bir gece katmanı
// bindirir; `atmosphere.ts` saf ve değişmemiş kalır (planın "tintCur/fogCur lerp'i
// bozulmayacak" kısıtı).

/** Tam döngü (saniye): 12 dakika. Gündüz ~7,2 dk · gece ~4,2 dk · alacakaranlık 2×1,2 dk. */
export const DAY_LENGTH_SEC = 720;

/** u = 0 anının saat karşılığı — şafağın başı 05:00 olsun diye. */
const HOUR_OFFSET = 5;

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** Faz sınırları, normalize zaman u ∈ [0,1). Karanlık rampaları dawn/dusk pencereleridir. */
const DAWN_END = 0.10;
const DAY_END = 0.55;
const DUSK_END = 0.65;

/** Gecenin en koyu anındaki siyahlık — tam karartma DEĞİL, oyun okunur kalmalı. */
export const NIGHT_MAX_ALPHA = 0.38;
/** Gece perdesinin rengi (soğuk lacivert; Frostbite paletiyle uyumlu). */
export const NIGHT_COLOR = 0x0a1030;

/** Gecenin canavar statlarına çarpanı (tepe) — risk. */
export const NIGHT_STAT_BONUS = 0.30;
/** Gecenin loot şansına çarpanı (tepe) — ödül. */
export const NIGHT_LUCK_BONUS = 0.50;

/** Saniye → döngü içinde normalize konum [0,1). Negatif/NaN girdiye karşı dayanıklı. */
export function normalizedTime(sec: number): number {
  if (!Number.isFinite(sec)) return 0;
  const u = (sec % DAY_LENGTH_SEC) / DAY_LENGTH_SEC;
  return u < 0 ? u + 1 : u;
}

/** 0→1 yumuşak geçiş (ani hue-snap yerine; atmosfer lerp'iyle aynı his). */
function smoothstep(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

export function phaseAt(sec: number): DayPhase {
  const u = normalizedTime(sec);
  if (u < DAWN_END) return 'dawn';
  if (u < DAY_END) return 'day';
  if (u < DUSK_END) return 'dusk';
  return 'night';
}

/**
 * Karanlık katsayısı 0..1 — TEK doğruluk kaynağı. Perde alpha'sı, canavar statları,
 * loot şansı ve NPC rutinlerinin hepsi bunun türevidir; böylece "ekran karardı ama
 * canavarlar hâlâ gündüz statında" gibi bir tutarsızlık YAPISAL olarak imkânsız.
 */
export function darkness(sec: number): number {
  const u = normalizedTime(sec);
  if (u < DAWN_END) return 1 - smoothstep(u / DAWN_END);              // gece → gündüz
  if (u < DAY_END) return 0;
  if (u < DUSK_END) return smoothstep((u - DAY_END) / (DUSK_END - DAY_END)); // gündüz → gece
  return 1;
}

/** Sahnenin bindireceği tam-ekran perde (scrollFactor 0). */
export function nightOverlay(sec: number): { color: number; alpha: number } {
  return { color: NIGHT_COLOR, alpha: darkness(sec) * NIGHT_MAX_ALPHA };
}

/** Canavar atk/def çarpanı: gündüz 1.0 → gece 1.3. */
export function mobStatMult(sec: number): number {
  return 1 + NIGHT_STAT_BONUS * darkness(sec);
}

/** Loot şans çarpanı: gündüz 1.0 → gece 1.5. */
export function lootLuckMult(sec: number): number {
  return 1 + NIGHT_LUCK_BONUS * darkness(sec);
}

/**
 * "Gece mi?" — NPC rutinleri ve diyalog için TEK eşik. Yarı karanlıkta (alacakaranlığın
 * ortası) döner; oyuncu ekranın kararmasıyla NPC'lerin uykuya çekilmesini aynı anda görür.
 */
export function isNight(sec: number): boolean {
  return darkness(sec) >= 0.5;
}

/** HUD saati: "06:00" (24 saat). u=0 → 05:00. */
export function clockLabel(sec: number): string {
  const total = (normalizedTime(sec) * 24 + HOUR_OFFSET) % 24;
  const h = Math.floor(total);
  const m = Math.floor((total - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** HUD ikonu — faz başına bir glif. */
export function phaseIcon(sec: number): string {
  const p = phaseAt(sec);
  return p === 'day' ? '☀' : p === 'night' ? '🌙' : p === 'dawn' ? '🌅' : '🌇';
}

/**
 * Yeni kayıtların başlangıç anı: sabahın ortası. Oyuncu ilk açılışta ZİFİRİ KARANLIKTA
 * doğmasın (ilk 10 saniyenin ilk izlenimi) — bilinçli seçim, rastgele değil.
 */
export const DEFAULT_DAY_TIME = DAY_LENGTH_SEC * 0.22;
