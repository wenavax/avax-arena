// frontend/lib/game/td/sprites/groundItems.ts
// ─── Faz 9A.1: yerdeki loot sprite'ları (client-only; SSR'da ÇAĞIRMA) ───
// props.ts/decoProps.ts ile AYNI dil: küçük düz renk blokları, 1px `outline()` konturu.
// Boyutlar bilinçli minik (≤12px): eşya kahramanın ayağının dibinde durur, prop'ları
// gölgelemesin. Rarity ışıması sprite'ta DEĞİL — sahnede Graphics/Ellipse ile basılır
// (aynı sprite her rarity'de kullanılır, texture sayısı 6'da kalır).
import { spr, outline, type Px } from './chibi';
import type { GroundSpriteKind } from '../groundLoot';

const STEEL = '#c3ccd6', STEEL_L = '#e8eef4', STEEL_D = '#8b95a0';
const WOOD = '#7a5a3e', WOOD_D = '#5f4430';
const GOLD = '#e8b23f', GOLD_L = '#ffd884';
const CLOTH = '#8a6a42', CLOTH_D = '#6e4e30';
const GEM = '#57e8e0', GEM_L = '#d8fffb', GEM_R = '#e84142';

interface GroundItemSpec {
  w: number;   // kontur öncesi genişlik (final = w+2)
  h: number;   // kontur öncesi yükseklik (final = h+2)
  draw: (px: Px) => void;
}

/**
 * TÜM yer-eşyası tiplerinin tek kaynağı. `Record<GroundSpriteKind, …>` bilinçli:
 * `InventoryItem.sprite` için yeni bir tip tanımlanıp burada karşılığı yazılmazsa
 * DERLEME hatası (Faz 8 DECO_SPEC deseninin birebir eşi).
 */
export const GROUND_ITEM_SPEC: Record<GroundSpriteKind, GroundItemSpec> = {
  /** Bağlı kese — materyaller (bone_shard, void_shard, magma_core…). */
  material: {
    w: 10, h: 9,
    draw: (px) => {
      px(1, 3, 8, 6, CLOTH); px(1, 7, 8, 2, CLOTH_D); px(2, 4, 3, 2, '#a5835a');
      px(3, 1, 4, 2, CLOTH_D); px(3, 2, 4, 1, GOLD);         // boyun + bağ
      px(4, 5, 2, 2, GOLD_L);                                 // içeriden sızan parıltı
    },
  },

  /** Mantar tıkaçlı yuvarlak şişe — iksirler. */
  potion: {
    w: 8, h: 11,
    draw: (px) => {
      px(3, 0, 2, 2, WOOD_D);                                 // mantar
      px(3, 2, 2, 2, STEEL_D);                                // boyun
      px(1, 4, 6, 6, '#e84142'); px(1, 8, 6, 2, '#a82b2c');   // gövde sıvısı
      px(2, 5, 2, 2, '#ff9d9d');                              // parlama
      px(1, 4, 6, 1, STEEL_D);                                // cam ağzı
    },
  },

  /** Çapraz duran kılıç — silahlar. */
  weapon: {
    w: 12, h: 12,
    draw: (px) => {
      for (let i = 0; i < 7; i++) px(3 + i, 8 - i, 2, 2, STEEL);   // bıçak
      for (let i = 0; i < 6; i++) px(4 + i, 8 - i, 1, 1, STEEL_L); // keskin kenar
      px(2, 9, 4, 1, GOLD); px(3, 8, 1, 3, GOLD);                  // balçak (çapraz)
      px(1, 10, 3, 2, WOOD); px(1, 11, 3, 1, WOOD_D);              // kabza
    },
  },

  /** Göğüs zırhı plakası — zırhlar. */
  armor: {
    w: 11, h: 11,
    draw: (px) => {
      px(2, 1, 7, 3, STEEL_D);                                // omuz hattı
      px(1, 3, 9, 6, STEEL); px(1, 8, 9, 2, STEEL_D);
      px(2, 4, 3, 3, STEEL_L);                                // ışık vurgusu
      px(5, 3, 1, 6, STEEL_D);                                // orta dikiş
      px(4, 5, 3, 2, GOLD); px(5, 5, 1, 1, GOLD_L);           // altın göğüs süsü
    },
  },

  /** Zincirli madalyon — aksesuarlar (pelerin/amulet/pendant hepsi burada). */
  accessory: {
    w: 11, h: 11,
    draw: (px) => {
      px(2, 0, 2, 3, GOLD); px(7, 0, 2, 3, GOLD);             // zincir kolları
      px(4, 2, 3, 1, GOLD);
      px(3, 3, 5, 5, GOLD); px(3, 7, 5, 2, '#b8821f');        // madalyon gövdesi
      px(4, 4, 3, 3, GEM); px(4, 4, 2, 1, GEM_L);             // taş
    },
  },

  /** Taşlı yüzük — ring slotu. */
  ring: {
    w: 9, h: 9,
    draw: (px) => {
      px(1, 3, 7, 5, GOLD); px(3, 5, 3, 3, '#8a6a42');        // halka + iç boşluk
      px(1, 6, 7, 2, '#b8821f');
      px(3, 0, 3, 3, GEM_R); px(4, 0, 1, 1, '#ffd0c8');       // taş + parıltı
    },
  },
};

/** Tek bir yer-eşyası texture'ı üretir; origin ayak hizası (oy = alt kenar). */
export function mkGroundItem(kind: GroundSpriteKind): { img: HTMLCanvasElement; ox: number; oy: number } {
  const s = GROUND_ITEM_SPEC[kind];
  const img = outline(spr(s.w, s.h, (px) => s.draw(px)));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}
