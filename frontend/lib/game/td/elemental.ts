// frontend/lib/game/td/elemental.ts
// ─── Faz 9A.3: element etkililiği (dünya + zindan gerçek-zamanlı savaşı) ───
// `elements.ts` tabloları TdBattleScene ile PAYLAŞILIYOR → oradaki eşleme mantığının
// gerçek-zamanlı sahnelerdeki TEK evi burasıdır. combat.ts / groundLoot.ts / abilities.ts
// gibi SAF: Phaser yok, window yok, Node'da koşar (çapa testi buradan geçer).
//
// Çarpan `heroHit`/`mobHit`'e PARAMETRE olarak gider — combat.ts elements.ts'i İMPORT ETMEZ
// (Faz 7'nin `rolloverRepeatables(rows, now)` deseni: matematik saf, veri sahneden).

import {
  CLASS_ELEMENTS, MONSTER_ELEMENTS, ELEMENT_COLORS, ELEMENT_ICONS,
  getElementMultiplier, getEffectivenessText, type Element,
} from '../elements';
import type { PlayerClass } from '../PlayerState';

/** Eşlenmemiş tip/sınıf düşer düşmez buraya düşer (TdBattleScene:169-173 ile aynı taban). */
export const FALLBACK_ELEMENT: Element = 'earth';

/** "Etkisiz kaldı" hasarının soluk grisi — TdBattleScene:898'deki '#888888' deyimi. */
export const WEAK_HEX = '#8a8f98';

const ELITE_PREFIX = 'elite_';

/**
 * `elite_<tip>` → `<tip>`. TdBattleScene canavarı `monster.type` ile alır ve o alan
 * ELİT ÖNEKİ TAŞIYABİLİR; görev anahtarları da (`objectiveKey('kill','elite_wolf')`)
 * bu biçimi kullanır. Dünya/zindan sahneleri ise elitliği `m.isElite` booleanıyla taşır,
 * `m.entry.type` HER ZAMAN taban tiptir → oradan önekli tip GELMEZ. Soyma yine de burada
 * duruyor: tek eşleme evi olmanın bedeli bir `startsWith`, karşılığı ise önek biçimi geri
 * gelirse (veya bu yardımcı görev/battle yolundan çağrılırsa) tüm elitlerin sessizce
 * 'earth' fallback'ine düşmemesi.
 */
export function baseMonsterType(type: string): string {
  return type.startsWith(ELITE_PREFIX) ? type.slice(ELITE_PREFIX.length) : type;
}

/** Canavarın elementi (TdBattleScene:173 zinciri birebir: taban tip → ham tip → fallback). */
export function monsterElement(type: string): Element {
  return MONSTER_ELEMENTS[baseMonsterType(type)] || MONSTER_ELEMENTS[type] || FALLBACK_ELEMENT;
}

/** Sınıfın varsayılan elementi (TdBattleScene:169). */
export function classElement(cls: PlayerClass): Element {
  return CLASS_ELEMENTS[cls] || FALLBACK_ELEMENT;
}

/**
 * Vuruşun elementi. TdBattleScene:874 `skill.element || this.playerElement`:
 * yeteneğin kendi elementi (fireball 🔥 / ice_shard ❄️) sınıf elementini EZER;
 * elementsiz yetenek ve SPACE temel vuruşu sınıf elementini kullanır.
 */
export function attackElement(cls: PlayerClass, skillElem?: Element): Element {
  return skillElem || classElement(cls);
}

/** Bir elementin float-text rengi (#rrggbb — Phaser Text `color`'ı string ister). */
export function elementHex(e: Element): string {
  return '#' + ELEMENT_COLORS[e].toString(16).padStart(6, '0');
}

/** Sahnenin bir vuruşta ihtiyaç duyduğu her şey: çarpan + saldıran elementi + görsel dil. */
export interface ElemFx {
  elem: Element;        // saldıranın elementi (hasar sayısını renklendirir)
  mult: number;         // 1.5 / 1.0 / 0.67
  /** 'Super effective!' / 'Not very effective...' — nötrde null (sahne float basmaz). */
  text: string | null;
}

function fx(atk: Element, def: Element): ElemFx {
  const mult = getElementMultiplier(atk, def);
  const t = getEffectivenessText(mult);
  return { elem: atk, mult, text: t ? `${ELEMENT_ICONS[atk]} ${t}` : null };
}

/** Kahraman → canavar. `skillElem` yalnız yetenek yolundan gelir (SPACE'te undefined). */
export function heroElemFx(cls: PlayerClass, monsterType: string, skillElem?: Element): ElemFx {
  return fx(attackElement(cls, skillElem), monsterElement(monsterType));
}

/** Canavar → kahraman: elementler İKİ YÖNLÜ keser (TdBattleScene:1552 temas hasarı). */
export function mobElemFx(monsterType: string, cls: PlayerClass): ElemFx {
  return fx(monsterElement(monsterType), classElement(cls));
}

/**
 * Hasar sayısının rengi: etkiliyse saldırı elementinin rengi, etkisizse soluk gri,
 * nötrde sahnenin kendi rengi (krit sarısı / beyaz / temas kırmızısı) korunur.
 */
export function damageHex(f: ElemFx, neutralHex: string): string {
  if (f.mult > 1) return elementHex(f.elem);
  if (f.mult < 1) return WEAK_HEX;
  return neutralHex;
}

/**
 * Etkililik float'ının kısıtlaması. Gerçek-zamanlıda vuruş 350ms'de bir düşüyor;
 * TdBattleScene'in "her vuruşta bas" deyimi burada ekranı doldururdu → sahne bu
 * pencereyle kapılar (canavar başına değil, sahne başına: okunabilirlik juice'tan önce).
 */
export const ELEM_FLOAT_COOLDOWN_MS = 1500;
