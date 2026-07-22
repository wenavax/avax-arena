// frontend/lib/game/td/sprites/chibi.ts
// ─── Prosedürel chibi sprite fabrikası ───
// Reçete (spec §4): 1px koyu kontur, px-rect çizim, palet parametreli.

// Client-only: document.createElement + 2D canvas kullanır — SSR sırasında ÇAĞIRMA (import güvenli).

export type Px = (x: number, y: number, w: number, h: number, color: string) => void;

/** w×h canvas üret, fn'e 1px-rect çizici ver. */
export function spr(w: number, h: number, fn: (px: Px, g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  fn((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, g);
  return c;
}

/** 1px koyu silüet konturu — "bitmiş pixel-art" hissinin ana kuralı. Çıktı (w+2)×(h+2). */
export function outline(c: HTMLCanvasElement, col = '#243141'): HTMLCanvasElement {
  const o = document.createElement('canvas'); o.width = c.width + 2; o.height = c.height + 2;
  const g = o.getContext('2d')!;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]] as const) g.drawImage(c, dx, dy);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, o.width, o.height);
  g.globalCompositeOperation = 'source-over'; g.drawImage(c, 1, 1);
  return o;
}

export interface ChibiPalette {
  skin: string; hair: string; top: string; topShade: string;
  accent: string;      // Frostbite kimliği: atkı vb. (#e84142 default)
  leg: string; boot: string;
}
export const DEFAULT_PALETTE: ChibiPalette = {
  skin: '#f2c99a', hair: '#5b3a24', top: '#4e6e8e', topShade: '#3d5872',
  accent: '#e84142', leg: '#2c3540', boot: '#1d242c',
};

/**
 * MP presence (Faz 5 Task 2): uzak oyuncular için küçük bir palet çeşitleme havuzu.
 * DEFAULT_PALETTE'in hair/top/topShade alanları hue-rotate edilmiş 6 varyant — herkesin
 * aynı renk olmasını önler, deterministik (id hash'i % N) seçim yapılır.
 */
export const REMOTE_PALETTE_VARIANTS: ChibiPalette[] = [
  DEFAULT_PALETTE,
  { ...DEFAULT_PALETTE, hair: '#8a5a2c', top: '#6e8e4e', topShade: '#54703d' }, // yeşil üst
  { ...DEFAULT_PALETTE, hair: '#2c3a5b', top: '#8e4e6e', topShade: '#703d54' }, // mor/pembe üst
  { ...DEFAULT_PALETTE, hair: '#5b2c3a', top: '#8e7a4e', topShade: '#705f3d' }, // hardal üst
  { ...DEFAULT_PALETTE, hair: '#2c5b4e', top: '#4e6e8e', topShade: '#3d5872', accent: '#42a8e8' }, // mavi atkı
  { ...DEFAULT_PALETTE, hair: '#5b4a2c', top: '#8e6e4e', topShade: '#70573d' }, // kahve üst
];

/** id/soket-id'sinden deterministik küçük hash (32-bit, işaretsiz). */
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** id'ye göre deterministik palet varyantı seç (aynı id her zaman aynı paleti alır). */
export function paletteForId(id: string): ChibiPalette {
  return REMOTE_PALETTE_VARIANTS[hashId(id) % REMOTE_PALETTE_VARIANTS.length];
}

/** chibiHumanoid çıktı boyutu (kontur DAHİL) — yerleşim matematiği bunları kullanmalı. */
export const CHIBI_W = 18;
export const CHIBI_H = 26;

const EYE = '#20242c', BLUSH = '#f0a8a0', MOUTH = '#b06a5a', BELT = '#241d14', GOLD = '#e8b23f';
const PACK = '#6e4e30', PACKD = '#54391f';

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/**
 * Faz 5.9: DETAYLI chibi insansı 16×24 (kontur sonrası 18×26) — kafa ≈ %50.
 * Yeni detaylar: saç perçem çentikleri + parlama, göz parıltısı, ağız, atkı
 * düğüm/kuyruk (yanda kuyruk fazla göre dalgalanır), 2-ton tunik + kemer/toka,
 * kol salınımı (yürüyüşte zıt fazlı), sırt görünüşünde omuz çantası.
 * dir: 0 aşağı, 1 yukarı, 2 yan(sol; sağ = flip). phase: 0 durma, 1 sol adım, 2 sağ adım.
 * Yürüyüş döngüsü sahnede [0,1,0,2] olarak kullanılır.
 */
export function chibiHumanoid(dir: 0 | 1 | 2, phase: 0 | 1 | 2, P: ChibiPalette = DEFAULT_PALETTE): HTMLCanvasElement {
  const hairD = shadeHex(P.hair, 0.75), hairL = shadeHex(P.hair, 1.3);
  const topL = shadeHex(P.top, 1.25), skinD = shadeHex(P.skin, 0.82);
  const accentD = shadeHex(P.accent, 0.72), legD = shadeHex(P.leg, 0.75), bootL = shadeHex(P.boot, 1.5);
  return outline(spr(16, 24, (px) => {
    // ── bacaklar + botlar (tüm yönler): faz 1 sol adım / faz 2 sağ adım ──
    const legs = () => {
      if (phase === 0) {
        px(4, 19, 3, 2, P.leg); px(9, 19, 3, 2, P.leg);
        px(6, 19, 1, 2, legD); px(11, 19, 1, 2, legD);
        px(3, 21, 4, 2, P.boot); px(9, 21, 4, 2, P.boot);
        px(3, 21, 4, 1, bootL); px(9, 21, 4, 1, bootL);
      } else if (phase === 1) {
        px(4, 19, 3, 3, P.leg); px(9, 19, 3, 1, P.leg);
        px(3, 22, 4, 2, P.boot); px(9, 20, 4, 2, P.boot);
        px(3, 22, 4, 1, bootL); px(9, 20, 4, 1, bootL);
      } else {
        px(4, 19, 3, 1, P.leg); px(9, 19, 3, 3, P.leg);
        px(3, 20, 4, 2, P.boot); px(9, 22, 4, 2, P.boot);
        px(3, 20, 4, 1, bootL); px(9, 22, 4, 1, bootL);
      }
    };
    // ── kollar (aşağı/yukarı görünüş): yürüyüşte zıt salınım ──
    const arms = (back: boolean) => {
      const la = phase === 1 ? -1 : phase === 2 ? 1 : 0;
      const ra = -la;
      px(1, 13 + la, 2, 4, back ? P.topShade : P.topShade);
      px(13, 13 + ra, 2, 4, P.topShade);
      px(1, 17 + la, 2, 2, P.skin); px(13, 17 + ra, 2, 2, P.skin);
    };
    if (dir === 0) {
      // saç kapağı + yan lüleler + perçem
      px(5, 0, 6, 1, P.hair); px(3, 1, 10, 1, P.hair); px(2, 2, 12, 2, P.hair);
      px(1, 3, 1, 5, P.hair); px(14, 3, 1, 5, P.hair);
      px(4, 1, 3, 1, hairL);                                     // parlama
      // yüz
      px(2, 4, 12, 7, P.skin);
      px(2, 4, 12, 1, hairD);                                    // saç çizgisi gölgesi
      px(2, 4, 2, 1, P.hair); px(7, 4, 2, 1, P.hair); px(12, 4, 2, 1, P.hair); // perçem çentikleri
      px(4, 6, 2, 2, EYE); px(10, 6, 2, 2, EYE);
      px(4, 6, 1, 1, '#ffffff'); px(10, 6, 1, 1, '#ffffff');     // göz parıltısı
      px(2, 8, 1, 1, BLUSH); px(13, 8, 1, 1, BLUSH);
      px(7, 9, 2, 1, MOUTH);
      px(2, 10, 12, 1, skinD);                                   // çene gölgesi
      // atkı: düğüm + sol kuyruk
      px(3, 11, 10, 2, P.accent); px(3, 12, 10, 1, accentD);
      px(2, 12, 2, 3, P.accent); px(2, 14, 2, 1, accentD);
      // gövde: 2-ton tunik + kemer/toka
      px(3, 13, 10, 5, P.top);
      px(3, 13, 1, 5, topL); px(11, 13, 2, 5, P.topShade);
      px(7, 13, 2, 1, P.topShade);                               // yaka V'si
      px(3, 18, 10, 1, BELT); px(7, 18, 2, 1, GOLD);
      arms(false);
      legs();
    } else if (dir === 1) {
      // arka: dolgun saç + parlama + uç zikzakları
      px(5, 0, 6, 1, P.hair); px(3, 1, 10, 1, P.hair); px(2, 2, 12, 3, P.hair);
      px(1, 3, 14, 6, P.hair);
      px(4, 2, 3, 1, hairL); px(9, 3, 2, 1, hairL);
      px(2, 9, 3, 1, P.hair); px(6, 9, 4, 1, hairD); px(11, 9, 3, 1, P.hair); // uç zikzak
      // atkı arkası + düğüm
      px(3, 11, 10, 1, P.accent); px(7, 12, 2, 2, accentD);
      // gövde
      px(3, 13, 10, 5, P.top);
      px(3, 13, 1, 5, topL); px(11, 13, 2, 5, P.topShade);
      // omuz çantası (Faz 5.4 çantasının görsel yankısı)
      px(4, 13, 2, 1, PACKD); px(10, 13, 2, 1, PACKD);           // askılar
      px(5, 14, 6, 4, PACK); px(5, 14, 6, 1, PACKD); px(5, 15, 6, 1, shadeHex(PACK, 1.2));
      px(3, 18, 10, 1, BELT);
      arms(true);
      legs();
    } else {
      // profil (sola bakar; sağ = flipX)
      px(4, 0, 8, 1, P.hair); px(3, 1, 10, 1, P.hair); px(2, 2, 11, 2, P.hair);
      px(12, 3, 3, 4, P.hair); px(13, 6, 2, 3, hairD);           // arkaya savrulan saç
      px(4, 1, 3, 1, hairL);
      px(2, 4, 10, 7, P.skin);
      px(2, 4, 10, 1, hairD); px(2, 4, 3, 1, P.hair); px(8, 4, 2, 1, P.hair);
      px(1, 7, 1, 2, P.skin);                                    // minik burun
      px(4, 6, 2, 2, EYE); px(4, 6, 1, 1, '#ffffff');
      px(3, 9, 1, 1, MOUTH); px(3, 8, 1, 1, BLUSH);
      px(2, 10, 10, 1, skinD);
      // atkı + arkaya uçuşan kuyruk (fazla dalgalanır)
      px(3, 11, 9, 2, P.accent); px(3, 12, 9, 1, accentD);
      const flut = phase === 2 ? 1 : 0;
      px(12, 11 + flut, 3, 1, P.accent); px(13, 12 + flut, 2, 1, accentD);
      // gövde + tek görünür kol (öne salınır)
      px(4, 13, 8, 5, P.top);
      px(4, 13, 1, 5, topL); px(10, 13, 2, 5, P.topShade);
      const sw = phase === 1 ? -1 : phase === 2 ? 1 : 0;
      px(5 + sw, 14, 2, 3, P.topShade); px(5 + sw, 17, 2, 2, P.skin);
      px(4, 18, 8, 1, BELT); px(6, 18, 2, 1, GOLD);
      legs();
    }
  }));
}
