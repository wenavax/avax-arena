// frontend/lib/game/td/sprites/decoProps.ts
// ─── Dekoratif süs (deco) sprite fabrikaları (client-only; SSR'da ÇAĞIRMA) ───
// props.ts ile AYNI dil: 16px tile ölçeği, düz renk blokları, 1px `outline()` konturu,
// üst yüzeylerde SNOW vurgusu. Kar tutmayan tipler (obsidian/lav/void) bilinçli olarak karsız.
// Yerleşim/yoğunluk mantığı BURADA DEĞİL — bu dosya yalnızca piksel üretir.
import { spr, outline, type Px } from './chibi';
import type { DecoKind } from '../worldProps';

// ── Ortak palet (props.ts ile uyumlu) ──
const SNOW = '#eef6f8', SNOW_D = '#cfe0e6';
const WOOD = '#7a5a3e', WOOD_L = '#8f6c4a', WOOD_H = '#a5805c', WOOD_D = '#5f4430';
const BEAM = '#6e4e30', BEAM_D = '#54391f', BEAM_L = '#8a6a42';
const STONE = '#8b95a0', STONE_L = '#a5aeb8', STONE_D = '#6c7681', STONE_XD = '#59636e';
const IRON = '#5a6470', IRON_D = '#3e4650', IRON_L = '#7a828c';
const BONE = '#dfe4e2', BONE_D = '#a9b2b4', SOCKET = '#4a5258';
const ICE = '#7fd8f0', ICE_L = '#d8fffb', ICE_D = '#3f9fc0';
const LEAF = '#4a7a3a', LEAF_L = '#5aa06a';
const EMBER = '#ff6a1f', EMBER_L = '#ffd23f', EMBER_M = '#ff9d3f';
const RED = '#e84142', GOLD = '#e8b23f', CYAN = '#57e8e0';

/** Tek bir deco tipinin tam tanımı: kontur ÖNCESİ boyut + çizim reçetesi. */
interface DecoSpec {
  w: number;                                          // kontur öncesi genişlik (final = w+2)
  h: number;                                          // kontur öncesi yükseklik (final = h+2)
  draw: (px: Px, g: CanvasRenderingContext2D) => void;
}

/**
 * TÜM deco tiplerinin tek kaynağı. `Record<DecoKind, …>` bilinçli: yeni bir DecoKind
 * eklenip burada karşılığı yazılmazsa derleme HATA verir (unutma riski sıfır).
 */
export const DECO_SPEC: Record<DecoKind, DecoSpec> = {
  // ─────────────── Biyom süsleri ───────────────

  /** Kırmızı şapkalı beyaz benekli mantar kümesi (orman/bataklık). */
  mushroom: {
    w: 11, h: 9,
    draw: (px) => {
      px(5, 4, 3, 5, '#f0ead8'); px(7, 4, 1, 5, '#cfc7b2');        // büyük sap
      px(1, 6, 2, 3, '#f0ead8'); px(2, 6, 1, 3, '#cfc7b2');        // küçük sap
      px(3, 1, 7, 3, RED); px(4, 0, 5, 1, RED); px(3, 3, 7, 1, '#b32b2c'); // büyük şapka
      px(4, 1, 1, 1, '#ffd0c8'); px(7, 0, 1, 1, '#ffd0c8'); px(8, 2, 1, 1, '#ffd0c8'); px(5, 2, 1, 1, '#ffd0c8');
      px(0, 4, 5, 2, RED); px(1, 3, 3, 1, RED); px(0, 5, 5, 1, '#b32b2c'); // küçük şapka
      px(2, 4, 1, 1, '#ffd0c8');
    },
  },

  /** Yanda yatan devrik kütük — üstü karlı, sağ uçta halka kesiti görünür. */
  fallen_log: {
    w: 22, h: 10,
    draw: (px) => {
      px(1, 2, 20, 7, '#5f4430'); px(1, 7, 20, 2, '#4a3420');      // gövde + alt gölge
      px(2, 3, 15, 1, WOOD);                                        // üst kabuk vurgusu
      px(4, 5, 5, 1, '#4a3420'); px(11, 6, 4, 1, '#4a3420');        // kabuk çatlakları
      px(17, 2, 5, 7, WOOD_L); px(18, 3, 3, 5, WOOD); px(19, 4, 1, 3, WOOD_H); // halka kesiti
      px(2, 0, 15, 2, SNOW); px(3, 2, 11, 1, SNOW);                 // kar
    },
  },

  /** Karda birkaç minik mavi/beyaz çiçek — çok alçak profil. */
  flowers: {
    w: 12, h: 6,
    draw: (px) => {
      px(2, 2, 1, 4, LEAF); px(6, 2, 1, 4, LEAF); px(10, 3, 1, 3, LEAF); // saplar
      px(1, 1, 3, 2, '#9fd8f5'); px(2, 1, 1, 1, '#ffffff');             // mavi çiçek
      px(5, 0, 3, 2, SNOW); px(6, 1, 1, 1, GOLD);                       // beyaz çiçek + göbek
      px(9, 2, 3, 2, '#b8a8f0'); px(10, 2, 1, 1, '#ffffff');            // leylak çiçek
    },
  },

  /** Uzun ot demetleri, uçları karlı. */
  tall_grass: {
    w: 12, h: 11,
    draw: (px) => {
      px(1, 4, 1, 7, LEAF); px(2, 3, 1, 3, LEAF_L);
      px(3, 2, 1, 9, LEAF); px(4, 6, 1, 5, LEAF_L);
      px(6, 1, 1, 10, LEAF); px(5, 3, 1, 4, LEAF_L);
      px(8, 3, 1, 8, LEAF); px(9, 5, 1, 6, LEAF_L);
      px(10, 5, 1, 6, LEAF);
      px(1, 3, 1, 1, SNOW); px(3, 1, 1, 1, SNOW); px(6, 0, 1, 1, SNOW); // uç karları
      px(8, 2, 1, 1, SNOW); px(10, 4, 1, 1, SNOW);
    },
  },

  /** Bataklık sazlığı — ince dikey saplar + kahverengi başaklar. */
  reeds: {
    w: 12, h: 14,
    draw: (px) => {
      px(2, 4, 1, 10, '#5a7a4a'); px(5, 3, 1, 11, '#5a7a4a');      // saplar
      px(8, 5, 1, 9, '#6a8a58'); px(10, 7, 1, 7, '#5a7a4a');
      px(1, 0, 2, 4, WOOD); px(1, 0, 2, 1, WOOD_H);                 // başak 1
      px(4, 1, 2, 4, WOOD); px(4, 1, 2, 1, WOOD_H);                 // başak 2
      px(8, 2, 1, 3, '#5f4430');                                    // başak 3 (ince)
      px(0, 12, 12, 2, '#c8dce2'); px(0, 12, 12, 1, '#dfeef2');     // donmuş su/kar tabanı
    },
  },

  /** Açık camgöbeği buz kristali kümesi — parlak üst kenarlar. */
  ice_crystal: {
    w: 13, h: 14,
    draw: (px) => {
      px(0, 12, 13, 2, SNOW);                                       // kar tabanı
      px(6, 0, 1, 2, ICE_L); px(5, 2, 3, 11, ICE);                  // orta büyük kristal
      px(5, 2, 1, 11, '#a8e8f8'); px(7, 4, 1, 9, ICE_D);
      px(2, 5, 1, 2, ICE_L); px(1, 7, 3, 6, ICE);                   // sol kristal
      px(1, 7, 1, 6, '#a8e8f8'); px(3, 9, 1, 4, ICE_D);
      px(10, 4, 1, 3, ICE_L); px(9, 7, 3, 6, ICE);                  // sağ kristal
      px(9, 7, 1, 6, '#a8e8f8'); px(11, 9, 1, 4, ICE_D);
      px(6, 3, 1, 1, ICE_L); px(2, 8, 1, 1, ICE_L);                 // parıltı
    },
  },

  /** Buzda yarı gömülü kaburga + kafatası — soluk tonlar. */
  frozen_bones: {
    w: 14, h: 8,
    draw: (px) => {
      px(0, 5, 14, 3, '#c8e4ee'); px(0, 5, 14, 1, '#e2f2f8');       // buz yatağı
      px(7, 5, 6, 1, BONE_D);                                       // omurga
      px(8, 2, 1, 3, BONE); px(10, 1, 1, 4, BONE); px(12, 2, 1, 3, BONE); // kaburgalar
      px(1, 2, 5, 4, BONE); px(1, 5, 5, 1, BONE_D);                 // kafatası
      px(2, 3, 1, 2, SOCKET); px(4, 3, 1, 2, SOCKET);               // göz çukurları
      px(2, 1, 3, 1, SNOW);
    },
  },

  /** Yuvarlak tepeli mezar taşı — üstü karlı, çatlaklı. */
  gravestone: {
    w: 11, h: 14,
    draw: (px) => {
      px(1, 12, 9, 2, '#5a4028'); px(1, 12, 9, 1, SNOW);            // toprak höyük + kar
      px(2, 2, 7, 11, STONE); px(3, 1, 5, 1, STONE); px(4, 0, 3, 1, STONE);
      px(2, 2, 2, 11, STONE_L); px(7, 3, 2, 10, STONE_D);           // ışık/gölge yüzleri
      px(5, 4, 1, 5, STONE_D); px(4, 5, 3, 1, STONE_D);             // kazınmış haç
      px(3, 8, 1, 3, STONE_XD); px(4, 10, 2, 1, STONE_XD);          // çatlak
      px(4, 0, 3, 1, SNOW); px(3, 1, 5, 1, SNOW);                   // kar
    },
  },

  /** Kemik yığını + tepede kafatası. */
  bone_pile: {
    w: 14, h: 10,
    draw: (px) => {
      px(1, 6, 12, 3, BONE_D); px(1, 6, 12, 1, BONE);               // taban yığını
      px(2, 5, 7, 2, BONE); px(2, 6, 7, 1, BONE_D);
      px(9, 4, 4, 2, BONE); px(8, 3, 1, 2, BONE); px(12, 3, 1, 2, BONE); // uzun kemik + uçları
      px(3, 0, 5, 4, BONE); px(3, 4, 5, 1, BONE_D);                 // kafatası
      px(4, 1, 1, 2, SOCKET); px(6, 1, 1, 2, SOCKET);
      px(4, 5, 4, 1, BONE); px(5, 5, 1, 1, SOCKET);                 // çene
      px(3, 0, 3, 1, SNOW);
    },
  },

  /** Kırık taş sütun — yıkık üst, karlı. */
  broken_pillar: {
    w: 12, h: 20,
    draw: (px) => {
      px(0, 16, 12, 4, STONE_D); px(1, 15, 10, 2, STONE);           // kaide
      px(2, 3, 8, 13, STONE); px(2, 3, 2, 13, STONE_L); px(8, 3, 2, 13, STONE_D);
      px(5, 4, 1, 12, STONE_D); px(7, 5, 1, 11, STONE_D);           // yivler
      px(2, 3, 3, 1, STONE_D); px(6, 1, 4, 2, STONE); px(6, 1, 4, 1, STONE_L); // kırık üst
      px(4, 9, 1, 4, STONE_XD); px(5, 12, 2, 1, STONE_XD);          // çatlak
      px(6, 0, 4, 1, SNOW); px(2, 2, 3, 1, SNOW); px(1, 15, 4, 1, SNOW);
    },
  },

  /** Alçak moloz/taş kırıntısı yığını. */
  rubble: {
    w: 14, h: 7,
    draw: (px) => {
      px(1, 4, 12, 3, STONE_D); px(1, 4, 12, 1, STONE);
      px(2, 2, 4, 3, STONE); px(2, 2, 2, 1, STONE_L);
      px(7, 1, 3, 3, STONE); px(7, 1, 2, 1, STONE_L);
      px(10, 3, 3, 2, STONE_D);
      px(3, 1, 2, 1, SNOW); px(8, 0, 2, 1, SNOW);
    },
  },

  /** Raylı maden arabası — ahşap gövde, demir bantlar, içi cevherli. */
  mine_cart: {
    w: 20, h: 16,
    draw: (px) => {
      px(0, 14, 20, 2, '#5f4430'); px(0, 13, 20, 1, STONE);          // travers + ray
      px(3, 10, 5, 5, '#2c333b'); px(4, 11, 3, 3, IRON); px(5, 12, 1, 1, STONE); // sol teker
      px(12, 10, 5, 5, '#2c333b'); px(13, 11, 3, 3, IRON); px(14, 12, 1, 1, STONE); // sağ teker
      px(1, 3, 18, 8, BEAM); px(1, 3, 18, 1, BEAM_L); px(1, 9, 18, 2, BEAM_D); // gövde
      px(4, 3, 1, 8, IRON_D); px(14, 3, 1, 8, IRON_D);               // demir bantlar
      px(3, 1, 13, 3, '#454e58'); px(4, 0, 5, 2, '#59636e');         // cevher yığını
      px(5, 1, 2, 2, GOLD); px(11, 1, 2, 2, GOLD); px(8, 0, 2, 1, '#ffd884');
    },
  },

  /** Maden ahşap tahkimatı — iki dikey direk + üst kiriş. */
  timber_support: {
    w: 16, h: 20,
    draw: (px) => {
      px(0, 1, 16, 4, BEAM); px(0, 1, 16, 1, BEAM_L); px(0, 4, 16, 1, BEAM_D); // üst kiriş
      px(1, 5, 3, 15, BEAM); px(1, 5, 1, 15, BEAM_L); px(3, 5, 1, 15, BEAM_D); // sol direk
      px(12, 5, 3, 15, BEAM); px(12, 5, 1, 15, BEAM_L); px(14, 5, 1, 15, BEAM_D); // sağ direk
      px(4, 5, 2, 2, BEAM_D); px(10, 5, 2, 2, BEAM_D);               // köşe takozları
      px(5, 2, 5, 1, BEAM_D);                                        // tahta damarı
      px(2, 9, 1, 1, IRON_D); px(13, 13, 1, 1, IRON_D);              // çiviler
      px(1, 0, 5, 1, SNOW); px(9, 0, 4, 1, SNOW);                    // kar
    },
  },

  /** Siyah-mor keskin obsidyen parçaları — KAR YOK (sıcak/volkanik zemin). */
  obsidian_shard: {
    w: 12, h: 13,
    draw: (px) => {
      px(5, 0, 2, 4, '#4a3566'); px(4, 3, 4, 10, '#241a33');         // büyük şard
      px(4, 3, 1, 10, '#4a3566'); px(7, 5, 1, 8, '#150e1f');
      px(5, 4, 1, 4, '#6a4a9a');                                     // iç yansıma
      px(2, 5, 1, 2, '#4a3566'); px(1, 6, 3, 7, '#241a33'); px(1, 6, 1, 7, '#3a2a52'); // sol
      px(10, 6, 1, 2, '#4a3566'); px(9, 7, 3, 6, '#241a33'); px(11, 9, 1, 4, '#150e1f'); // sağ
    },
  },

  /** Yere yatık lav çatlağı — koyu kabuk + akkor damar. KAR YOK, alçak profil. */
  lava_crack: {
    w: 18, h: 7,
    draw: (px) => {
      px(0, 3, 18, 4, '#2a1e1c'); px(2, 2, 14, 2, '#2a1e1c'); px(1, 6, 16, 1, '#1a1210');
      px(2, 3, 14, 1, '#5a2418');                                    // kızıl kenar
      px(3, 4, 4, 1, EMBER); px(7, 3, 3, 1, EMBER); px(10, 4, 5, 1, EMBER); // akkor damar
      px(4, 4, 2, 1, EMBER_L); px(8, 3, 1, 1, EMBER_L); px(11, 4, 2, 1, EMBER_L);
      px(6, 2, 1, 1, EMBER_M); px(13, 2, 1, 1, EMBER_M);             // kıvılcım
    },
  },

  /** Koyu mor/siyah boşluk dikeni + magenta parıltı. KAR YOK. */
  void_spike: {
    w: 11, h: 16,
    draw: (px) => {
      px(0, 14, 11, 2, '#2a1a44');                                   // taban sisi
      px(5, 0, 1, 3, '#3a1f5e'); px(4, 2, 3, 14, '#1b1030');         // ana diken
      px(4, 2, 1, 14, '#3a1f5e'); px(6, 5, 1, 11, '#0d0718');
      px(5, 4, 1, 3, '#d24bff'); px(5, 9, 1, 2, '#8a2ec0');          // magenta damar
      px(1, 6, 1, 2, '#3a1f5e'); px(1, 7, 2, 9, '#1b1030'); px(2, 10, 1, 6, '#0d0718');
      px(8, 8, 1, 2, '#3a1f5e'); px(8, 9, 2, 7, '#1b1030'); px(8, 11, 1, 2, '#d24bff');
    },
  },

  /** Ayakta rün taşı — yüzeyinde ışıyan camgöbeği kazımalar. */
  rune_stone: {
    w: 12, h: 17,
    draw: (px) => {
      px(1, 3, 10, 14, STONE_D); px(2, 1, 8, 3, STONE_D); px(3, 0, 6, 1, STONE_D);
      px(1, 3, 2, 14, STONE); px(3, 2, 5, 2, STONE); px(9, 3, 2, 14, STONE_XD);
      px(4, 5, 4, 1, CYAN); px(5, 6, 1, 3, CYAN); px(4, 9, 3, 1, CYAN); // rünler
      px(6, 11, 1, 3, CYAN); px(4, 12, 3, 1, CYAN);
      px(5, 5, 1, 1, ICE_L); px(6, 12, 1, 1, ICE_L);                 // parıltı
      px(3, 0, 5, 1, SNOW); px(2, 1, 3, 1, SNOW);                    // kar
    },
  },

  /** Üç ayaklı demir mangal + turuncu kor (statik tek kare). */
  brazier: {
    w: 12, h: 16,
    draw: (px) => {
      px(1, 11, 2, 5, IRON_D); px(9, 11, 2, 5, IRON_D); px(5, 12, 2, 4, IRON); // ayaklar
      px(2, 12, 8, 1, IRON_D);                                       // çapraz bağ
      px(1, 6, 10, 5, IRON); px(1, 6, 10, 1, IRON_L); px(1, 9, 10, 2, IRON_D); // kase
      px(2, 4, 8, 3, '#7a2a10');                                     // kömür yatağı
      px(3, 3, 6, 2, EMBER); px(4, 2, 4, 2, EMBER_M); px(5, 1, 2, 2, EMBER_L); // kor
      px(3, 5, 1, 1, EMBER_L); px(8, 5, 1, 1, EMBER_L);
    },
  },

  // ─────────────── Kasaba sokak mobilyası ───────────────

  /** Fener direği — ahşap gövde, demir başlık, sıcak sarı cam. */
  lamp_post: {
    w: 10, h: 22,
    draw: (px) => {
      px(2, 19, 6, 3, IRON); px(2, 19, 6, 1, IRON_L); px(3, 19, 3, 1, SNOW); // taban
      px(4, 7, 2, 13, '#4a3a2c'); px(4, 7, 1, 13, BEAM);              // direk
      px(2, 3, 6, 5, IRON_D); px(2, 2, 6, 1, IRON); px(3, 1, 4, 1, IRON_D); // fener gövdesi
      px(3, 4, 4, 3, '#ffd98a'); px(4, 4, 2, 2, '#fff3c8');           // cam + alev
      px(4, 0, 2, 1, IRON); px(2, 1, 3, 1, SNOW);                     // tepe + kar
    },
  },

  /** Taş kuyu — ahşap çatı, makara/kova, üstü karlı. */
  well: {
    w: 20, h: 20,
    draw: (px) => {
      px(3, 4, 2, 9, BEAM); px(15, 4, 2, 9, BEAM);                    // direkler
      px(1, 12, 18, 7, STONE); px(1, 12, 18, 1, STONE_L); px(1, 17, 18, 2, STONE_D); // bilezik
      px(5, 13, 1, 6, STONE_D); px(10, 13, 1, 6, STONE_D); px(15, 13, 1, 6, STONE_D); // derz
      px(4, 11, 12, 3, '#1a2530'); px(5, 12, 10, 1, '#2b4a5e');       // kuyu ağzı + su
      px(8, 5, 4, 1, BEAM_D); px(9, 6, 1, 4, '#cfc7b2');              // makara + ip
      px(7, 9, 5, 3, BEAM); px(7, 9, 5, 1, BEAM_L);                   // kova
      px(1, 3, 18, 2, WOOD); px(3, 1, 14, 2, WOOD); px(6, 0, 8, 1, WOOD); // çatı
      px(6, 0, 8, 1, SNOW); px(3, 1, 14, 1, SNOW); px(1, 3, 4, 1, SNOW); px(14, 3, 5, 1, SNOW);
    },
  },

  /** Ahşap fıçı — demir çemberli, üstü karlı. */
  barrel: {
    w: 11, h: 13,
    draw: (px) => {
      px(1, 1, 9, 11, WOOD); px(0, 3, 11, 7, WOOD);                   // gövde (şişkin)
      px(0, 3, 2, 7, WOOD_L); px(1, 1, 2, 3, WOOD_L);
      px(9, 3, 2, 7, WOOD_D); px(8, 1, 2, 3, WOOD_D);
      px(4, 2, 1, 9, WOOD_D); px(7, 2, 1, 9, WOOD_D);                 // tahta ayrımları
      px(0, 4, 11, 1, IRON_D); px(0, 8, 11, 1, IRON_D); px(1, 1, 9, 1, IRON_D); // çemberler
      px(2, 0, 7, 2, WOOD_L); px(3, 0, 5, 1, SNOW);                   // kapak + kar
    },
  },

  /** Ahşap sandık — çapraz tahtalı. */
  crate: {
    w: 12, h: 12,
    draw: (px) => {
      px(0, 1, 12, 11, WOOD); px(0, 1, 12, 1, WOOD_H); px(0, 10, 12, 2, WOOD_D);
      px(0, 1, 2, 11, WOOD_L); px(10, 1, 2, 11, WOOD_D);              // dikey çerçeve
      for (let i = 0; i < 9; i++) { px(2 + i, 2 + i, 1, 1, WOOD_H); px(10 - i, 2 + i, 1, 1, WOOD_H); }
      px(2, 0, 8, 1, SNOW);
    },
  },

  /** İki bacaklı ahşap bank — oturak ve arkalık üstü karlı. */
  bench: {
    w: 18, h: 11,
    draw: (px) => {
      px(2, 6, 2, 5, WOOD_D); px(14, 6, 2, 5, WOOD_D);                // bacaklar
      px(3, 2, 1, 3, WOOD_D); px(14, 2, 1, 3, WOOD_D);                // arkalık dikmeleri
      px(1, 0, 16, 2, WOOD); px(1, 0, 16, 1, WOOD_L);                 // arkalık
      px(0, 4, 18, 3, WOOD); px(0, 4, 18, 1, WOOD_L); px(0, 6, 18, 1, WOOD_D); // oturak
      px(1, 0, 7, 1, SNOW); px(10, 0, 6, 1, SNOW);
      px(1, 4, 6, 1, SNOW); px(9, 4, 7, 1, SNOW);
    },
  },

  /**
   * Kısa ahşap çit parçası: 2 direk + 2 yatay lata.
   * NOT: kontur SONRASI genişlik tam 16px olsun diye çizim alanı 14px —
   * böylece 16px tile pitch'inde yan yana dizilince latalar birleşir.
   */
  fence: {
    w: 14, h: 12,
    draw: (px) => {
      px(0, 4, 14, 2, WOOD); px(0, 4, 14, 1, WOOD_L);                 // üst lata
      px(0, 8, 14, 2, WOOD); px(0, 8, 14, 1, WOOD_L);                 // alt lata
      px(1, 2, 2, 10, BEAM); px(1, 2, 1, 10, BEAM_L);                 // sol direk
      px(11, 2, 2, 10, BEAM); px(11, 2, 1, 10, BEAM_L);               // sağ direk
      px(1, 1, 2, 1, SNOW); px(11, 1, 2, 1, SNOW);                    // direk başı karı
      px(4, 3, 4, 1, SNOW); px(5, 7, 4, 1, SNOW);                     // lata karı
    },
  },

  /** Kardan adam — iki kar topu, kömür göz/düğme, havuç burun, dal kollar. */
  snowman: {
    w: 14, h: 18,
    draw: (px) => {
      px(0, 10, 3, 1, '#5f4430'); px(0, 9, 1, 1, '#5f4430');          // sol dal kol
      px(11, 11, 3, 1, '#5f4430'); px(13, 10, 1, 1, '#5f4430');       // sağ dal kol
      px(2, 8, 10, 10, SNOW); px(2, 14, 10, 3, SNOW_D); px(3, 9, 3, 3, '#ffffff'); // alt top
      px(4, 1, 7, 8, SNOW); px(4, 6, 7, 2, SNOW_D); px(5, 2, 3, 2, '#ffffff');     // üst top
      px(5, 3, 1, 2, '#20242c'); px(8, 3, 1, 2, '#20242c');           // gözler
      px(6, 5, 3, 1, EMBER_M); px(9, 5, 1, 1, '#e8721f');             // havuç burun
      px(5, 7, 1, 1, '#20242c'); px(7, 7, 1, 1, '#20242c'); px(9, 7, 1, 1, '#20242c'); // ağız
      px(6, 11, 1, 1, '#20242c'); px(6, 14, 1, 1, '#20242c');         // düğmeler
    },
  },

  /** Pazar tezgâhı — çizgili tente + ahşap tezgâh + üstünde birkaç mal. */
  stall: {
    w: 26, h: 22,
    draw: (px) => {
      px(2, 6, 2, 14, BEAM); px(22, 6, 2, 14, BEAM);                  // direkler
      px(0, 2, 26, 4, '#f0ead8');                                     // tente zemini
      for (let i = 0; i < 26; i += 4) px(i, 2, 2, 4, RED);            // tente çizgileri
      px(0, 1, 26, 1, '#c8c0ae'); px(0, 6, 26, 1, '#c8c0ae');         // tente kenarları
      for (let i = 1; i < 26; i += 4) px(i, 6, 2, 1, RED);            // saçak dilimleri
      px(2, 0, 10, 1, SNOW); px(14, 0, 8, 1, SNOW);                   // tente karı
      px(3, 10, 5, 3, WOOD_L); px(3, 10, 5, 1, WOOD_H);               // mal: küçük sandık
      px(10, 9, 4, 4, RED); px(10, 9, 4, 1, '#ff7a6a');               // mal: kumaş denk
      px(16, 10, 3, 3, '#4e6e8e'); px(16, 10, 3, 1, '#6e8eae');       // mal: mavi çuval
      px(20, 11, 3, 2, GOLD);                                         // mal: tahıl
      px(0, 13, 26, 4, WOOD); px(0, 13, 26, 1, WOOD_L); px(0, 16, 26, 1, WOOD_D); // tezgâh
      px(2, 17, 22, 5, BEAM); px(2, 17, 22, 1, BEAM_D);               // ön panel
      px(7, 17, 1, 5, BEAM_D); px(13, 17, 1, 5, BEAM_D); px(19, 17, 1, 5, BEAM_D);
    },
  },

  // ─────────────── Faz 11.5: Bina çevresi süsleri ───────────────

  /** İstiflenmiş kütük yığını — halka kesitleri öne bakar, üstü karlı. */
  firewood: {
    w: 15, h: 10,
    draw: (px) => {
      const log = (x: number, y: number) => {
        px(x, y, 5, 5, WOOD_D); px(x + 1, y + 1, 3, 3, WOOD); px(x + 2, y + 2, 1, 1, WOOD_H);
      };
      log(0, 5); log(5, 5); log(10, 5);                             // alt sıra 3 kütük
      log(3, 1); log(8, 1);                                          // üst sıra 2 kütük
      px(3, 0, 10, 1, SNOW); px(4, 1, 3, 1, SNOW);                   // kar
    },
  },

  /** Sancak direği — taş kaide + ahşap direk + altın topuz, kızıl kırlangıç-kuyruk sancak. */
  banner_pole: {
    w: 13, h: 24,
    draw: (px) => {
      px(1, 22, 5, 2, STONE_D); px(1, 22, 5, 1, STONE);              // taban taşı
      px(3, 2, 2, 20, '#4a3a2c'); px(3, 2, 1, 20, BEAM);             // direk
      px(2, 0, 4, 2, GOLD); px(3, 0, 2, 1, '#ffd884');               // tepe topuzu
      px(5, 3, 7, 1, BEAM_D); px(5, 2, 7, 1, SNOW);                  // çapraz kol + kar
      px(6, 4, 6, 10, RED); px(6, 4, 1, 10, '#ff7a6a');              // sancak + ışık kenarı
      px(11, 4, 1, 10, '#b32b2c');                                    // gölge kenarı
      px(6, 14, 2, 3, RED); px(10, 14, 2, 3, RED);                    // kırlangıç kuyruk
      px(6, 16, 2, 1, '#b32b2c'); px(10, 16, 2, 1, '#b32b2c');
      px(8, 6, 2, 2, GOLD);                                           // arma noktası
    },
  },

  /** İlan panosu — iki direk + ahşap pano, iğnelenmiş kâğıtlar (biri kızıl mühürlü). */
  noticeboard: {
    w: 16, h: 15,
    draw: (px) => {
      px(2, 3, 2, 12, BEAM); px(12, 3, 2, 12, BEAM);                 // direkler
      px(2, 3, 1, 12, BEAM_L); px(12, 3, 1, 12, BEAM_L);
      px(0, 2, 16, 9, WOOD); px(0, 2, 16, 1, WOOD_H); px(0, 10, 16, 1, WOOD_D); // pano
      px(0, 2, 1, 9, WOOD_L); px(15, 2, 1, 9, WOOD_D);
      px(2, 4, 4, 5, '#f0ead8'); px(3, 5, 2, 1, '#8a7a5c'); px(3, 7, 2, 1, '#8a7a5c'); // kâğıt 1
      px(7, 4, 3, 4, '#e8dcc0'); px(8, 6, 1, 1, RED);                // kâğıt 2 (mühürlü)
      px(11, 5, 3, 4, '#f0ead8'); px(12, 6, 1, 1, '#8a7a5c');        // kâğıt 3
      px(3, 4, 1, 1, IRON_D); px(8, 4, 1, 1, IRON_D); px(12, 5, 1, 1, IRON_D); // iğneler
      px(0, 1, 7, 1, SNOW); px(9, 1, 6, 1, SNOW);                    // üst kar
    },
  },
};

/** Kontur ÖNCESİ boyut tablosu (final sprite = [w+2, h+2]) — yerleşim matematiği için. */
export const DECO_SIZE = Object.fromEntries(
  (Object.keys(DECO_SPEC) as DecoKind[]).map((k) => [k, [DECO_SPEC[k].w, DECO_SPEC[k].h]] as const),
) as Record<DecoKind, [number, number]>;

/** Yalnızca çizim reçeteleri (props.ts fabrikalarıyla aynı imza). */
export const DECO_DRAW = Object.fromEntries(
  (Object.keys(DECO_SPEC) as DecoKind[]).map((k) => [k, DECO_SPEC[k].draw] as const),
) as Record<DecoKind, DecoSpec['draw']>;

/**
 * Deco sprite üretici — props.ts konvansiyonu: ox = yatay merkez, oy = taban (ayak noktası).
 * Client-only (canvas). Sonuç kontur DAHİL (w+2)×(h+2).
 */
export function mkDeco(kind: DecoKind): { img: HTMLCanvasElement; ox: number; oy: number } {
  const s = DECO_SPEC[kind];
  const img = outline(spr(s.w, s.h, s.draw));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}
