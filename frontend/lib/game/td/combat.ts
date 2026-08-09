// frontend/lib/game/td/combat.ts
// ─── Faz 5.7: haritada gerçek-zamanlı savaş — ortak hasar/ödül matematiği ───
// Ayrı TdBattle ekranı yerine dünya/zindan sahnelerinde SPACE-saldırı + temas hasarı.
// Formüller TdBattleScene ile hizalı (init default ödülleri, atk-def/2 hasar tabanı);
// TdBattle artık YALNIZ zindan boss'larında açılır (dramatik dövüş korunur).

/**
 * Kahraman vuruşu: taban atk - def/2, ±%15 varyans, %10 krit ×1.6.
 *
 * Faz 9A.3: `elemMult` element çarpanı (1.5 / 1 / 0.67) PARAMETRE olarak gelir —
 * bu dosya SAF kalsın diye elements.ts BURAYA import edilmez, eşlemeyi sahne
 * `td/elemental.ts` üstünden yapar. Varsayılan 1: çarpansız çağrı eski davranış.
 */
export function heroHit(atk: number, def: number, elemMult = 1): { dmg: number; crit: boolean } {
  const base = Math.max(1, atk - def * 0.5);
  const crit = Math.random() < 0.1;
  const dmg = Math.max(1, Math.round(base * (0.85 + Math.random() * 0.3) * (crit ? 1.6 : 1) * elemMult));
  return { dmg, crit };
}

/** Canavar temas vuruşu (krit yok, aynı taban + varyans + element çarpanı — ters yön). */
export function mobHit(matk: number, pdef: number, elemMult = 1): number {
  return Math.max(1, Math.round(Math.max(1, matk - pdef * 0.5) * (0.85 + Math.random() * 0.3) * elemMult));
}

/** Kill ödülü — TdBattleScene.init'in default xp/gold formülleriyle birebir. */
export function killRewards(level: number, isElite: boolean): { xp: number; gold: number } {
  const lvl = Math.max(1, level || 1);
  return {
    xp: 10 + lvl * 5 + (isElite ? lvl * 3 : 0),
    gold: 2 + Math.floor(Math.random() * lvl * 3) + (isElite ? lvl : 0),
  };
}

export const ATTACK_RANGE = 24;     // px — SPACE saldırı menzili
export const ATTACK_CD_MS = 350;    // saldırı bekleme süresi
export const AGGRO_RANGE = 70;      // canavar kovalamaya başlar
export const CHASE_SPEED = 30;      // px/s (gezinmeden hızlı, kahramandan (88) yavaş)
export const CONTACT_RANGE = 12;    // temas hasarı mesafesi
export const HERO_IFRAME_MS = 800;  // vuruş sonrası kahraman dokunulmazlığı
