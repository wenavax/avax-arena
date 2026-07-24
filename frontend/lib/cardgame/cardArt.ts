// CAR(D) GAME — ability card artwork (Higgsfield nano_banana_pro, 2026-07-24).
// 10 yetenek kartının (value 1-10 → ABILITIES[value].key) tam-sanat görselleri.
// Magic kartlar (NITRO/NAIL/OIL) görselsiz kalır — emoji cardart'ları korunur.
// basePath TUZAĞI: unoptimized <img> src'sine /avalanche öneki ELLE eklenir
// (Next basePath public asset'lere otomatik eklemiyor — proje geneli kural).
import { ABILITIES } from './abilities';

/** Bu kartın yetenek görseli var mı? (magic değil + geçerli value) */
export function hasCardArt(c: { magic?: string | null; value: number }): boolean {
  return !c.magic && !!ABILITIES[c.value]?.key;
}

/** Tam-sanat <img> etiketi (yoksa boş string — çağrı yeri koşulsuz gömebilir). */
export function cardArtImg(c: { magic?: string | null; value: number }): string {
  if (!hasCardArt(c)) return '';
  const key = ABILITIES[c.value].key.toLowerCase();
  return `<img class="cardimg" src="/avalanche/cardgame/cards/${key}.webp" alt="" loading="lazy" draggable="false">`;
}
