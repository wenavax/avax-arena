// frontend/lib/game/td/groundLoot.ts
// ─── Faz 9A.1: yerdeki loot'un SAF mantığı (Phaser YOK, sahne YOK) ───
// Node'da import edilebilir olmak zorunda (çapa: scripts/td-groundloot-test.ts) —
// combat.ts'in saflık kuralıyla aynı: mantık parametre alır, sahneden okumaz.
//
// İki tüketici var: TdWorldScene.killMob() (dünya) ve TdDungeonScene.heroAttackMob()
// (zindan trash). Zindan BOSS'u bilinçli olarak DIŞARIDA: onun loot'unu TdBattleScene
// zaten kendi rollLoot çağrısıyla veriyor; despawnMonster (boss + trash'in ortak çoklu
// giriş noktası) üzerinden ikinci kez düşürseydik ÇİFT LOOT olurdu.
import { rollLoot, RARITY_COLORS, type LootResult, type Rarity } from '../lootTables';
import type { InventoryItem } from '../PlayerState';

/** Sahnede aynı anda durabilecek en fazla yer eşyası — mob farm'ı sahneyi şişirmesin. */
export const GROUND_CAP = 32;
/** Toplama yarıçapı (px): üstüne yürümek yeter — SPACE zincirine dokunulmaz. */
export const PICKUP_RADIUS = 13;
/**
 * "bag is full" ipucunun HEM yeniden-gösterim beklemesi HEM de ekranda kalma süresi (ms).
 * 🔒 İkisi AYNI sayı olmak zorunda: gösterim kilidi daha kısa olursa uyarı kaybolur,
 * bekleme dolunca geri gelir → oyuncu durumu hiç değişmemişken YANIP SÖNER (9A.1 review'ı).
 */
export const BAG_HINT_COOLDOWN_MS = 2500;

/** Çanta dolu uyarısının TEK evi (UI dili İngilizce) — iki sahne de bunu basar. */
export const BAG_FULL_HINT = 'bag is full — make room 🎒';

/**
 * `InventoryItem.sprite` alanının bilinen değerleri. Bu alan 9A.1'e kadar repoda
 * HİÇBİR yerde okunmuyordu; yerdeki eşyayı ona göre çizdiğimiz an her değerin bir
 * görseli olmak zorunda → `Record<GroundSpriteKind, …>` (bkz. sprites/groundItems.ts)
 * yeni bir tip eklenip görseli yazılmazsa DERLEME hatası verir (Faz 8 DECO_SPEC deseni).
 * Tablo tarafı `sprite: string` olduğu için kapsama ayrıca runtime çapasıyla korunur.
 */
export type GroundSpriteKind = 'material' | 'potion' | 'weapon' | 'armor' | 'accessory' | 'ring';

export const GROUND_SPRITE_KINDS: readonly GroundSpriteKind[] =
  ['material', 'potion', 'weapon', 'armor', 'accessory', 'ring'] as const;

const KIND_SET = new Set<string>(GROUND_SPRITE_KINDS);

/** item.sprite → çizilebilir tip. Bilinmeyen değer 'material'e düşer (sessiz kaybolma yok). */
export function groundSpriteKind(sprite: string): GroundSpriteKind {
  return KIND_SET.has(sprite) ? (sprite as GroundSpriteKind) : 'material';
}

/** Rarity ışıması için '#rrggbb' (RARITY_COLORS hex sayı tutuyor). */
export function rarityHex(r: Rarity): string {
  return `#${RARITY_COLORS[r].toString(16).padStart(6, '0')}`;
}

/**
 * Yerdeki eşyanın görsel imzası. Legendary UZAKTAN ayırt edilebilmeli (beam) —
 * "yerde bir şey var" ile "yerde EFSANE bir şey var" aynı görünmesin.
 */
export interface RarityFx {
  glowR: number;      // ışıma yarıçapı (px)
  glowAlpha: number;  // ışıma opaklığı
  bobMs: number;      // hoplama tween süresi
  sparkles: number;   // yörüngedeki kıvılcım sayısı
  beam: boolean;      // dikey ışık huzmesi — YALNIZ legendary
}

export const RARITY_FX: Record<Rarity, RarityFx> = {
  common: { glowR: 5, glowAlpha: 0.20, bobMs: 1150, sparkles: 0, beam: false },
  uncommon: { glowR: 6, glowAlpha: 0.26, bobMs: 1050, sparkles: 0, beam: false },
  rare: { glowR: 7, glowAlpha: 0.34, bobMs: 950, sparkles: 1, beam: false },
  epic: { glowR: 8, glowAlpha: 0.42, bobMs: 850, sparkles: 2, beam: false },
  legendary: { glowR: 11, glowAlpha: 0.55, bobMs: 720, sparkles: 3, beam: true },
};

/**
 * Tek loot boğazı: iki sahne de öldürmeyi buradan geçirir.
 *
 * ⚠️ DÜZELTME (9A.1 review'ı): burada eskiden `elite_<tip>` anahtarı kuruluyordu ve
 * commit mesajı burayı "elite_ öneki kuralının tek evi" diye tanıtıyordu — YANLIŞTI.
 * lootTables.lookupTable ilk iş `monsterType.replace(/^elite_/, '')` yapıp SOYULMUŞ
 * anahtarı tercih ediyor ve LOOT_TABLES'ta HİÇ `elite_*` anahtarı yok → önek tam bir
 * no-op'tu. Elitlerin tabloya etkisi YALNIZ `isElite` boolean'ı üzerinden: rollLoot
 * chance'ı ×2'ler ve rarity'yi +1 tier yükseltir. Ölü önek kaldırıldı.
 * (Elit quest anahtarı `elite_<tip>` AYRI bir sözleşme — o objectiveKey tarafında.)
 */
export function rollGroundLoot(baseType: string, isElite: boolean): LootResult[] {
  return rollLoot(baseType, isElite);
}

/** i. düşüşün ölüm noktasından px sapması — deterministik (test edilebilir), altın-açı serpme. */
export function dropOffset(i: number): { dx: number; dy: number } {
  const ang = i * 2.39996; // ~137.5° — düşüşler üst üste binmesin
  const rad = 3 + (i % 3) * 3;
  return { dx: Math.round(Math.cos(ang) * rad), dy: Math.round(Math.sin(ang) * rad * 0.6) };
}

/** Yarıçap içindeki EN YAKIN yer eşyası (yoksa null) — otomatik toplama taraması. */
export function nearestGround<T extends { x: number; y: number }>(
  list: readonly T[], hx: number, hy: number, radius = PICKUP_RADIUS,
): T | null {
  let best: T | null = null, bd = radius;
  for (const g of list) {
    const d = Math.hypot(hx - g.x, hy - g.y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

/** addItem sözleşmesi kadarı — testte gerçek PlayerState yerine sahte de geçebilsin. */
export interface BagLike { addItem(item: InventoryItem): boolean }

/**
 * 🔒 TUZAK: `addItem` 12 slot limitinde `false` döner. O zaman eşya YERDE KALIR —
 * listeden çıkarılmaz, yok edilmez (Faz 7'nin "ödül kısmi verilmez" ilkesi: oyuncu
 * yer açıp geri gelir). Çağıran false görünce kırmızı ipucu basar, görseli SİLMEZ.
 */
export function takeGround<T extends { item: InventoryItem }>(
  bag: BagLike, g: T, list: T[],
): boolean {
  if (!bag.addItem(g.item)) return false;
  const i = list.indexOf(g);
  if (i >= 0) list.splice(i, 1);
  return true;
}

/**
 * Kapasite aşımında SİLİNECEK eşyalar (en eskiler önce). Yeni düşen loot asla
 * kurban seçilmez — aşımı en eski çöp temizler, oyuncunun az önce hak ettiği
 * düşüş yerinde kalır. Aşım yoksa boş dizi.
 */
export function groundOverflow<T extends { bornAt: number }>(all: readonly T[], cap = GROUND_CAP): T[] {
  if (all.length <= cap) return [];
  return [...all].sort((a, b) => a.bornAt - b.bornAt).slice(0, all.length - cap);
}

/** Toplama juice metni: '+ Iron Sword' (UI dili İngilizce). */
export function pickupLabel(item: InventoryItem): string {
  return `+ ${item.name}`;
}
