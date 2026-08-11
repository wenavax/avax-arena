// frontend/lib/game/td/tiles.ts
// ─── Chunk pre-render: 48×48 tile'lık canvas'lar ───
// Reçete (spec §4): dama + benek yamalar, su 3-kare parıltı + kıyı yumuşatma.
// Client-only: document.createElement kullanır — SSR sırasında ÇAĞIRMA (import güvenli).
import { TILE, CHUNK, hash2d } from './tdCore';
import { getTile, type Biome } from './worldMap';

// Faz 2 palet seti — her biome: [açık dama, koyu dama, benek, detay(motif)].
// "Koyu + detaylı harita" geçişi: paletler ~%20-30 koyultuldu + doygunluk artırıldı
// (kar biyomları soğuk gri-mavi, orman/çayır derin yeşil, volkan/forge/demongate
// sıcak koyu kahve-kızıl, voidrealm/necropolis/crypt/abyss koyu mor-gri taş).
const BIOME_PAL: Record<Biome, [string, string, string, string]> = {
  town:        ['#a6bcc7', '#93aab6', '#b3c8d1', '#6f8996'],
  grass:       ['#7fae74', '#6f9f63', '#8dbb82', '#4c7a44'],
  forest:      ['#5f9468', '#4f8459', '#6aa373', '#356048'],
  water:       ['#2f7a9c', '#276c8c', '#3f8cac', '#1d5a76'],
  swamp:       ['#7a8a5a', '#6c7c4c', '#84934f', '#4a5732'],
  mines:       ['#8a8177', '#7a7167', '#948b81', '#54493e'],
  ruins:       ['#a89a7c', '#988a6c', '#b0a284', '#6b5c40'],
  frostwastes: ['#c3d3dc', '#b3c5cf', '#cddbe3', '#7c94a1'],
  volcano:     ['#8a5a42', '#7a4c36', '#96654c', '#4a2416'],
  necropolis:  ['#7a748a', '#6c667c', '#847e94', '#443f56'],
  citadel:     ['#a89a80', '#988a70', '#b0a288', '#6b5c42'],
  demongate:   ['#8a4a52', '#7a3c46', '#96555e', '#4a1e26'],
  voidrealm:   ['#5c5474', '#4e4666', '#66607e', '#2e2840'],
  sanctum:     ['#7ea888', '#6e987a', '#8ab694', '#3f6a4c'],
  crypt:       ['#6c7268', '#5e645a', '#767c72', '#3a4038'],
  abyss:       ['#4a5866', '#3c4a58', '#546270', '#222e3a'],
  forge:       ['#8a6650', '#7a5842', '#96705a', '#4a2e1c'],
  eternal:     ['#b0a4c8', '#a094ba', '#b8aed2', '#6c5e88'],
  path:        ['#8a6a42', '#7c5e38', '#6a4e2c', '#4a3418'],
};

const FLOE = '#cfe6ec', GLINT = '#6cc0d8', SHALLOW = '#4a9ab8';
const ROCK_HI = '#c2bcb0', EMBER = '#ff8a3f';

// Biome → doku grubu (tile motifi bu gruba göre seçilir).
type TileGroup = 'verdant' | 'snow' | 'rock' | 'hot' | 'path';
const BIOME_GROUP: Record<Biome, TileGroup | null> = {
  town: 'snow', frostwastes: 'snow', eternal: 'snow',
  grass: 'verdant', forest: 'verdant', swamp: 'verdant', sanctum: 'verdant',
  mines: 'rock', ruins: 'rock', citadel: 'rock', crypt: 'rock', abyss: 'rock', necropolis: 'rock', voidrealm: 'rock',
  volcano: 'hot', forge: 'hot', demongate: 'hot',
  path: 'path',
  water: null,
};

/** Minimap için biyomun "açık dama" rengi (BIOME_PAL[0]). */
export function biomeTopColor(b: Biome): string { return BIOME_PAL[b][0]; }

/** Chunk'ın herhangi bir tile'ında su var mı? (su animasyon tazelemesi bunu kullanır) */
export function chunkHasWater(cx: number, cy: number): boolean {
  const baseX = cx * CHUNK, baseY = cy * CHUNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    if (getTile(baseX + x, baseY + y).biome === 'water') return true;
  }
  return false;
}

/**
 * Grup bazlı mikro-motif (~%30 tile yoğunluğu). KRİTİK: hiçbir çizim tile sınırının
 * (0..16px) DIŞINA taşmayacak şekilde kıskaçlanmıştır — chunk kenarı artefaktını önler.
 */
function drawTileMotif(g: CanvasRenderingContext2D, group: TileGroup, px: number, py: number, h2: number, pal: [string, string, string, string]) {
  const d = pal[3];
  if (group === 'verdant') {
    // ot tutamları: 1×3/1×2 dikey çizgiler
    const bx = px + 2 + (h2 % 11);       // 2..12 (+1 genişlik ≤ 13)
    const by = py + 5 + ((h2 >> 4) % 6); // 5..10
    const tall = (h2 >> 7) % 2 === 1;
    g.fillStyle = d;
    g.fillRect(bx, by, 1, tall ? 3 : 2);
    g.fillRect(bx + 2, by + (tall ? 1 : 0), 1, tall ? 2 : 1);
    g.fillStyle = '#ffffff33';
    g.fillRect(bx, by, 1, 1);
  } else if (group === 'snow') {
    // rüzgâr sürüklenme çizgisi (yatay 5×1) + minik buz çatlağı
    const lx = px + 1 + (h2 % 9);        // 1..9 (+5 ≤ 14)
    const ly = py + 3 + ((h2 >> 4) % 9); // 3..11
    g.fillStyle = d;
    g.fillRect(lx, ly, 5, 1);
    g.fillStyle = '#ffffff55';
    g.fillRect(lx + 1, ly, 3, 1);
    const cx = px + 2 + ((h2 >> 8) % 10);  // 2..11 (+2 ≤ 13)
    const cy = py + 2 + ((h2 >> 11) % 10); // 2..11 (+2 ≤ 13)
    g.fillStyle = 'rgba(20,30,40,0.22)';
    g.fillRect(cx, cy, 2, 1); g.fillRect(cx + 1, cy + 1, 1, 1);
  } else if (group === 'rock') {
    // çakıl taşları (3×2 koyu + 2×1 açık vurgu) + kılcal çatlak
    const rx = px + 1 + (h2 % 10);       // 1..10 (+3 ≤ 13)
    const ry = py + 3 + ((h2 >> 4) % 9); // 3..11 (+2 ≤ 13)
    g.fillStyle = d;
    g.fillRect(rx, ry, 3, 2);
    g.fillStyle = ROCK_HI;
    g.fillRect(rx, ry, 2, 1);
    const cx = px + 2 + ((h2 >> 8) % 10);  // 2..11 (+1 ≤ 12)
    const cy = py + 2 + ((h2 >> 11) % 10); // 2..11 (+3 ≤ 14)
    g.fillStyle = 'rgba(10,10,10,0.25)';
    g.fillRect(cx, cy, 1, 3);
  } else if (group === 'hot') {
    // çatlaklar + seyrek turuncu köz noktası
    const cx = px + 3 + (h2 % 9);        // 3..11 (crack, ±1 ≤ 12)
    const cy = py + 2 + ((h2 >> 4) % 10); // 2..11 (+3 ≤ 14)
    g.fillStyle = d;
    g.fillRect(cx, cy, 1, 3);
    g.fillRect(cx - 1, Math.min(cy + 2, py + 13), 3, 1);
    if ((h2 >> 8) % 5 === 0) {
      g.fillStyle = EMBER;
      g.fillRect(px + 3 + ((h2 >> 10) % 9), py + 3 + ((h2 >> 13) % 9), 1, 1);
    }
  } else if (group === 'path') {
    // çakıl serpintisi
    for (let i = 0; i < 3; i++) {
      const gx = px + 1 + ((h2 >> (i * 4)) % 13);      // 1..13 (+1 ≤ 14)
      const gy = py + 1 + ((h2 >> (i * 4 + 2)) % 13);  // 1..13 (+1 ≤ 14)
      g.fillStyle = i % 2 ? d : 'rgba(0,0,0,0.28)';
      g.fillRect(gx, gy, 1, 1);
    }
  }
}

/** Bir chunk'ı canvas'a çiz. frame: 0..2 (su parıltı animasyonu). */
export function renderChunk(cx: number, cy: number, frame: 0 | 1 | 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CHUNK * TILE; c.height = CHUNK * TILE;
  const g = c.getContext('2d')!;
  const baseX = cx * CHUNK, baseY = cy * CHUNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const tx = baseX + x, ty = baseY + y;
    const t = getTile(tx, ty), h = hash2d(tx, ty, 2);
    const pal = BIOME_PAL[t.biome];
    const px = x * TILE, py = y * TILE;
    g.fillStyle = ((tx + ty) & 1) ? pal[0] : pal[1];
    g.fillRect(px, py, TILE, TILE);
    if (t.biome === 'water') {
      const land = (dx: number, dy: number) => getTile(tx + dx, ty + dy).biome !== 'water';
      g.fillStyle = SHALLOW;
      if (land(0, -1)) g.fillRect(px, py, TILE, 4);
      if (land(0, 1)) g.fillRect(px, py + TILE - 4, TILE, 4);
      if (land(-1, 0)) g.fillRect(px, py, 4, TILE);
      if (land(1, 0)) g.fillRect(px + TILE - 4, py, 4, TILE);
      if ((h + frame * 7) % 9 === 0) { g.fillStyle = GLINT; g.fillRect(px + ((h >> 3) % 10) + 2, py + ((h >> 6) % 10) + 3, 5, 1); }
      g.fillStyle = FLOE;
      if (land(0, -1)) g.fillRect(px, py, TILE, 2);
      if (land(0, 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (land(-1, 0)) g.fillRect(px, py, 2, TILE);
      if (land(1, 0)) g.fillRect(px + TILE - 2, py, 2, TILE);
      // köşe yumuşatma (merdiven kırıcı) — komşu KARA biyomunun koyu dama tonuyla kapat
      const landPal = (dx: number, dy: number) => BIOME_PAL[getTile(tx + dx, ty + dy).biome][1];
      if (land(0, -1) && land(-1, 0)) { g.fillStyle = landPal(0, -1); g.fillRect(px, py, 6, 3); g.fillRect(px, py, 3, 6); }
      if (land(0, -1) && land(1, 0)) { g.fillStyle = landPal(0, -1); g.fillRect(px + TILE - 6, py, 6, 3); g.fillRect(px + TILE - 3, py, 3, 6); }
      if (land(0, 1) && land(-1, 0)) { g.fillStyle = landPal(0, 1); g.fillRect(px, py + TILE - 3, 6, 3); g.fillRect(px, py + TILE - 6, 3, 6); }
      if (land(0, 1) && land(1, 0)) { g.fillStyle = landPal(0, 1); g.fillRect(px + TILE - 6, py + TILE - 3, 6, 3); g.fillRect(px + TILE - 3, py + TILE - 6, 3, 6); }
    } else {
      // benekli yama — dama sertliğini kırar
      if (h % 7 < 2) { g.fillStyle = pal[2]; g.fillRect(px + (h % 7) + 1, py + ((h >> 4) % 7) + 2, 8, 5); }
      if (h % 23 === 0) { g.fillStyle = '#ffffff30'; g.fillRect(px + (h % 12) + 2, py + ((h >> 4) % 12) + 2, 2, 2); }
      // Faz "koyu+detaylı harita": grup bazlı mikro-motif (salt 14, ~%30) + yarı saydam
      // koyu blok (~%20) — 16px dama sertliğini daha da kırar. Tamamen tile sınırı içinde.
      const group = BIOME_GROUP[t.biome];
      const h2 = hash2d(tx, ty, 14);
      if (group && h2 % 10 < 3) drawTileMotif(g, group, px, py, h2, pal);
      if ((h2 >> 16) % 5 === 0) {
        g.fillStyle = '#00000014';
        g.fillRect(px + (h2 % 9), py + ((h2 >> 4) % 9), 8, 8);
      }
    }
  }
  return c;
}
