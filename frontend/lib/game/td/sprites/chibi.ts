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

/** chibiHumanoid çıktı boyutu (kontur DAHİL) — yerleşim matematiği bunları kullanmalı. */
export const CHIBI_W = 14;
export const CHIBI_H = 20;

const EYE = '#20242c', BLUSH = '#f0a8a0';

/**
 * Chibi insansı 12×18 (kontur sonrası 14×20) — kafa ≈ %55 (Larvy oranı).
 * dir: 0 aşağı, 1 yukarı, 2 yan(sol; sağ = flip). phase: 0 durma, 1 sol adım, 2 sağ adım.
 * Yürüyüş döngüsü sahnede [0,1,0,2] olarak kullanılır.
 */
export function chibiHumanoid(dir: 0 | 1 | 2, phase: 0 | 1 | 2, P: ChibiPalette = DEFAULT_PALETTE): HTMLCanvasElement {
  return outline(spr(12, 18, (px) => {
    const legs = () => {
      if (phase === 0) { px(4, 14, 2, 2, P.leg); px(6, 14, 2, 2, P.leg); px(4, 16, 2, 2, P.boot); px(6, 16, 2, 2, P.boot); }
      else if (phase === 1) { px(4, 14, 2, 3, P.leg); px(6, 14, 2, 1, P.leg); px(4, 17, 2, 1, P.boot); px(6, 15, 2, 2, P.boot); }
      else { px(4, 14, 2, 1, P.leg); px(6, 14, 2, 3, P.leg); px(4, 15, 2, 2, P.boot); px(6, 17, 2, 1, P.boot); }
    };
    if (dir === 0) {
      px(3, 0, 6, 1, P.hair); px(2, 1, 8, 2, P.hair); px(1, 2, 10, 2, P.hair);
      px(2, 4, 8, 5, P.skin); px(1, 4, 1, 3, P.hair); px(10, 4, 1, 3, P.hair); px(2, 4, 8, 1, P.hair);
      px(3, 5, 2, 2, EYE); px(7, 5, 2, 2, EYE);
      px(2, 7, 1, 1, BLUSH); px(9, 7, 1, 1, BLUSH);
      px(3, 9, 6, 1, P.accent); px(8, 10, 2, 1, P.accent);
      px(3, 10, 6, 4, P.top); px(2, 10, 1, 3, P.topShade); px(9, 10, 1, 3, P.topShade);
      legs();
    } else if (dir === 1) {
      px(3, 0, 6, 1, P.hair); px(2, 1, 8, 3, P.hair); px(1, 2, 10, 5, P.hair); px(2, 7, 8, 2, P.hair);
      px(3, 9, 6, 1, P.accent);
      px(3, 10, 6, 4, P.top); px(2, 10, 1, 3, P.topShade); px(9, 10, 1, 3, P.topShade);
      legs();
    } else {
      px(3, 0, 6, 1, P.hair); px(2, 1, 8, 2, P.hair); px(2, 2, 9, 2, P.hair);
      px(2, 4, 7, 5, P.skin); px(8, 4, 3, 5, P.hair); px(2, 4, 7, 1, P.hair);
      px(3, 5, 2, 2, EYE); px(2, 7, 1, 1, BLUSH);
      px(3, 9, 6, 1, P.accent); px(8, 9, 2, 1, P.accent); px(9, 10, 1, 2, P.accent);
      px(3, 10, 6, 4, P.top); px(3, 11, 1, 2, P.topShade);
      legs();
    }
  }));
}
