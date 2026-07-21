// frontend/lib/game/td/tiles.ts
// ─── Chunk pre-render: 48×48 tile'lık canvas'lar ───
// Reçete (spec §4): dama + benek yamalar, su 3-kare parıltı + kıyı yumuşatma.
// Client-only: document.createElement kullanır — SSR sırasında ÇAĞIRMA (import güvenli).
import { TILE, CHUNK, hash2d } from './tdCore';
import { getTile, type Biome } from './worldMap';

// Faz 1 palet seti — her biome: [açık dama, koyu dama, benek]. Faz 2 atmosferle zenginleşir.
const BIOME_PAL: Record<Biome, [string, string, string]> = {
  town:        ['#e3ebee', '#dce5e9', '#d5e0e5'],
  grass:       ['#cfe3cd', '#c5dbc3', '#bcd3ba'],
  forest:      ['#c2dcc4', '#b8d3ba', '#aecab0'],
  water:       ['#479fc4', '#3f93b8', '#66bad6'],
  swamp:       ['#b9c7a8', '#aebe9d', '#a3b492'],
  mines:       ['#cfcbc4', '#c5c1ba', '#bab6af'],
  ruins:       ['#d6d2c6', '#ccc8bc', '#c2beb2'],
  frostwastes: ['#e8eff3', '#e1e9ee', '#d8e2e8'],
  volcano:     ['#d8b8a8', '#cdad9d', '#c2a292'],
  necropolis:  ['#c8c4ce', '#bebac4', '#b4b0ba'],
  citadel:     ['#d8d4c8', '#cecabe', '#c4c0b4'],
  demongate:   ['#c8aeb2', '#bea4a8', '#b49a9e'],
  voidrealm:   ['#b4b0c8', '#aaa6be', '#a09cb4'],
  sanctum:     ['#dce8dc', '#d2ded2', '#c8d4c8'],
  crypt:       ['#c4c8c4', '#babeba', '#b0b4b0'],
  abyss:       ['#aab4be', '#a0aab4', '#96a0aa'],
  forge:       ['#d4c4b4', '#cabaa0', '#c0b0a0'],
  eternal:     ['#e4e0ee', '#dad6e4', '#d0ccda'],
  path:        ['#bc9a6d', '#b2905f', '#9a7c52'],
};

const FLOE = '#e8f3f6', GLINT = '#8ed2e8', SHALLOW = '#66bad6';

/** Chunk'ın herhangi bir tile'ında su var mı? (su animasyon tazelemesi bunu kullanır) */
export function chunkHasWater(cx: number, cy: number): boolean {
  const baseX = cx * CHUNK, baseY = cy * CHUNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    if (getTile(baseX + x, baseY + y).biome === 'water') return true;
  }
  return false;
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
    }
  }
  return c;
}
