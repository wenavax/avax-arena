// frontend/lib/game/td/sprites/props.ts
// ─── Prop sprite fabrikaları (client-only; SSR'da ÇAĞIRMA) ───
import { spr, outline } from './chibi';

const SNOW = '#eef6f8', TRUNK = '#5f4430';

/** Karlı çam — v: 0/1 küçük iki ton, 2/3 büyük iki ton. Çıktı meta: {img,ox,oy}. */
export function mkTree(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const big = v >= 2, tone = v % 2;
  const w = big ? 20 : 16, h = big ? 30 : 24, c0 = w >> 1;
  const G = tone ? ['#2b6e59', '#225746', '#3a8a70'] : ['#2f7a4c', '#265f3c', '#3f9660'];
  const layers: [number, number][] = big ? [[1, 6], [7, 8], [14, 10]] : [[1, 5], [6, 6], [11, 8]];
  const img = outline(spr(w, h, (px) => {
    px(c0 - 1, h - 6, 2, 6, TRUNK);
    for (const [cy, half] of layers) {
      for (let r = 0; r < half; r++) px(c0 - (r + 1), cy + r, (r + 1) * 2, 1, G[0]);
      px(c0 - half, cy + half - 1, half * 2, 1, G[1]);
      px(c0 - 2, cy + 2, 2, 1, G[2]);
      px(c0 - 1, cy, 2, 1, SNOW);
      px(c0 - half + 1, cy + half - 1, 3, 1, SNOW);
      px(c0 + half - 4, cy + half - 1, 3, 1, SNOW);
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

export function mkRock(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const ore = v === 1;
  const img = outline(spr(14, 11, (px) => {
    px(2, 4, 10, 6, '#8b95a0'); px(4, 2, 7, 3, '#8b95a0'); px(3, 3, 3, 2, '#a5aeb8');
    px(2, 8, 10, 2, '#6c7681'); px(10, 3, 2, 2, '#6c7681'); px(4, 1, 5, 1, SNOW);
    if (ore) { px(6, 5, 2, 1, '#e8b23f'); px(9, 7, 1, 1, '#e8b23f'); px(4, 7, 1, 1, '#e8b23f'); }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

export function mkBush(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const berry = v === 1;
  const img = outline(spr(26, 16, (px) => {
    px(6, 2, 14, 4, '#3f8a56'); px(4, 4, 18, 8, '#3f8a56'); px(2, 7, 22, 6, '#3f8a56');
    px(2, 11, 22, 3, '#2f6a44'); px(6, 3, 8, 2, '#5aa06a'); px(4, 6, 4, 2, '#5aa06a');
    px(8, 1, 6, 1, SNOW); px(16, 4, 4, 1, SNOW); px(3, 8, 3, 1, SNOW);
    if (berry) for (const [bx, by] of [[6, 6], [12, 8], [18, 5], [9, 11], [16, 10]] as const) {
      px(bx, by, 3, 3, '#e84142'); px(bx, by, 1, 1, '#ffd0c8');
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

/** 4-karelik kamp ateşi. */
export function mkFireFrames(): HTMLCanvasElement[] {
  return [0, 1, 2, 3].map(f => outline(spr(14, 12, (px) => {
    px(2, 9, 10, 2, '#5a4028'); px(3, 8, 3, 2, '#6b4c31'); px(8, 8, 3, 2, '#6b4c31');
    const F1 = '#ff9d3f', F2 = '#ffd23f';
    if (f === 0) { px(5, 3, 4, 6, F1); px(6, 1, 2, 4, F2); px(4, 6, 6, 3, F1); }
    else if (f === 1) { px(4, 4, 6, 5, F1); px(5, 2, 3, 4, F2); px(8, 3, 2, 3, F2); }
    else if (f === 2) { px(5, 2, 4, 7, F1); px(6, 0, 2, 4, F2); px(4, 5, 2, 4, F1); }
    else { px(4, 3, 6, 6, F1); px(6, 2, 2, 3, F2); px(9, 4, 1, 4, F1); px(3, 6, 2, 3, F1); }
  })));
}

/** Hub binası — wTiles×hTiles, accent çatı, emoji tabela. Taban = alt kenar. */
export function mkBuilding(wTiles: number, hTiles: number, accent: string, icon: string): { img: HTMLCanvasElement; ox: number; oy: number } {
  const W = wTiles * 16, H = hTiles * 16 + 14; // +14 çatı taşması
  const base = spr(W, H, (px, g) => {
    const wallH = hTiles * 16 - 8;
    px(2, H - wallH, W - 4, wallH, '#8a6845');                       // duvar
    px(2, H - wallH, W - 4, 3, '#75563a');
    for (let i = 1; i < hTiles; i++) px(2, H - wallH + i * 14, W - 4, 1, 'rgba(0,0,0,.14)');
    const roofH = 16;                                                 // accent çatı
    for (let r = 0; r < roofH; r++) {
      const inset = Math.max(0, Math.floor((roofH - r) * 0.45));
      px(inset, H - wallH - roofH + r, W - inset * 2, 1, r < 3 ? SNOW : accent);
    }
    px(0, H - wallH - 2, W, 3, '#3d3126');
    const dw = 10, dx0 = (W - dw) >> 1;                               // kapı
    px(dx0, H - 14, dw, 14, '#5a4028'); px(dx0 + 1, H - 13, dw - 2, 13, '#4a3420');
    px(dx0 + dw - 3, H - 8, 2, 2, '#e8b23f');
    px(4, H - wallH + 4, 8, 7, '#ffd98a'); px(W - 12, H - wallH + 4, 8, 7, '#ffd98a'); // pencereler
    // tabela: emoji
    g.font = '9px serif'; g.textAlign = 'center';
    g.fillStyle = '#caa06a'; g.fillRect((W >> 1) - 7, H - wallH - 12, 14, 11);
    g.fillText(icon, W >> 1, H - wallH - 3);
  });
  const img = outline(base);
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

/** Zindan kapısı — taş kemer + bölge-accent parıltı noktası. */
export function mkDungeonDoor(): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(28, 22, (px) => {
    px(2, 6, 24, 16, '#6c7681'); px(4, 2, 20, 6, '#6c7681'); px(6, 0, 16, 3, '#8b95a0');
    px(9, 8, 10, 14, '#1a2028'); px(10, 6, 8, 3, '#1a2028');
    px(4, 4, 4, 2, SNOW); px(20, 3, 4, 2, SNOW);
    px(13, 12, 2, 2, '#9fe8ff');
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}
