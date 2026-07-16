import * as Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Isometric tile dimensions
// ---------------------------------------------------------------------------
export const ISO_TILE_W = 64;
export const ISO_TILE_H = 32;
export const ISO_BLOCK_H = 12;

// ---------------------------------------------------------------------------
// Coordinate conversions
// ---------------------------------------------------------------------------

/** Convert tile coords to screen (pixel) coords. */
export function toScreen(tx: number, ty: number, height: number = 0): { x: number; y: number } {
  return {
    x: (tx - ty) * ISO_TILE_W / 2,
    y: (tx + ty) * ISO_TILE_H / 2 - height * ISO_BLOCK_H,
  };
}

/** Convert screen coords back to tile coords (for clicking). */
export function toTile(sx: number, sy: number, height: number = 0): { tx: number; ty: number } {
  const adjustedY = sy + height * ISO_BLOCK_H;
  const tx = (sx / (ISO_TILE_W / 2) + adjustedY / (ISO_TILE_H / 2)) / 2;
  const ty = (adjustedY / (ISO_TILE_H / 2) - sx / (ISO_TILE_W / 2)) / 2;
  return { tx: Math.floor(tx), ty: Math.floor(ty) };
}

/** Depth value for sorting (higher = drawn later = closer to camera). */
export function isoDepth(tx: number, ty: number): number {
  return (tx + ty) * 10 + ty;
}

// ---------------------------------------------------------------------------
// Color utility functions
// ---------------------------------------------------------------------------

/** Lighten a hex color by amount (0-1). */
function lighten(color: number, amount: number): number {
  let r = (color >> 16) & 0xff;
  let g = (color >> 8) & 0xff;
  let b = color & 0xff;
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return (r << 16) | (g << 8) | b;
}

/** Darken a hex color by amount (0-1). */
function darken(color: number, amount: number): number {
  let r = (color >> 16) & 0xff;
  let g = (color >> 8) & 0xff;
  let b = color & 0xff;
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return (r << 16) | (g << 8) | b;
}

/** Simple hash for tile position — deterministic variation. */
function tileHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

/** Get a slightly varied color for a tile position (+/-5% brightness). */
function varyColor(color: number, tx: number, ty: number): number {
  const h = tileHash(tx, ty);
  const variation = ((h % 100) / 100) * 0.10 - 0.05; // -0.05 to +0.05
  if (variation > 0) return lighten(color, variation);
  return darken(color, -variation);
}

// ---------------------------------------------------------------------------
// Biome colours (top / left wall / right wall) — richer, more saturated
// ---------------------------------------------------------------------------

export interface BiomeColors {
  top: number;
  left: number;
  right: number;
}

export const ZONE_BIOME_COLORS: Record<string, BiomeColors> = {
  grass:      { top: 0x5cb847, left: 0x3d8a2e, right: 0x4ca03a },
  dark_grass: { top: 0x3a7a2d, left: 0x2a5e1f, right: 0x326c26 },
  stone:      { top: 0xa0a0a8, left: 0x787880, right: 0x8c8c94 },
  stone_dark: { top: 0x5a5a68, left: 0x42424e, right: 0x4e4e5a },
  wood:       { top: 0xc49a6c, left: 0x9a7548, right: 0xb28a5a },
  sand:       { top: 0xe8d878, left: 0xc4b454, right: 0xd6c666 },
  water:      { top: 0x3399cc, left: 0x2277aa, right: 0x2b88bb },
  snow:       { top: 0xe8f0ff, left: 0xc8d8ee, right: 0xd8e4f8 },
  lava:       { top: 0xdd5533, left: 0xbb3318, right: 0xcc4428 },
  cobble:     { top: 0x949494, left: 0x6e6e6e, right: 0x818181 },
  dirt:       { top: 0xb08050, left: 0x8c6438, right: 0x9e7244 },
  roof_red:   { top: 0xcc4433, left: 0xa82828, right: 0xba362e },
  roof_blue:  { top: 0x4870b0, left: 0x365a90, right: 0x3f65a0 },
  wall:       { top: 0xd4c4a8, left: 0xb0a080, right: 0xc2b294 },
  ice:           { top: 0xb8e4ff, left: 0x94c8e8, right: 0xa6d6f4 },
  ice_wall:      { top: 0x6688aa, left: 0x4a6688, right: 0x5a7799 },
  ice_dark:      { top: 0x8ab8d8, left: 0x6a98b8, right: 0x7aa8c8 },
  ice_crystal:   { top: 0xcceeff, left: 0xaaddff, right: 0xbbddff },
  frozen_water:  { top: 0x88ccee, left: 0x66aacc, right: 0x77bbdd },
  volcanic:      { top: 0x8a5a3a, left: 0x6a4228, right: 0x7a4e32 },
  volcanic_rock: { top: 0x4a3020, left: 0x3a2418, right: 0x422a1e },
  magma:         { top: 0x6a3a2a, left: 0x4a2818, right: 0x5a3020 },
  obsidian:      { top: 0x2a2a3a, left: 0x1a1a28, right: 0x222232 },
};

// ---------------------------------------------------------------------------
// Tile data interface
// ---------------------------------------------------------------------------

export interface ZoneTile {
  height: number;       // 0-5
  biome: string;        // key into ZONE_BIOME_COLORS
  collision: boolean;
  interact?: string;    // 'npc', 'shop', 'inn', 'exit_forest', etc.
  data?: any;           // NPC name, exit target, etc.
}

// ---------------------------------------------------------------------------
// Isometric face drawing helpers
// ---------------------------------------------------------------------------

/** Draw the top diamond face with per-tile color variation and edge highlights. */
export function drawTopFace(
  gfx: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  color: number,
  alpha: number = 1,
  tx: number = 0,
  ty: number = 0,
): void {
  const hw = ISO_TILE_W / 2;
  const hh = ISO_TILE_H / 2;

  // 1. Fill diamond with per-tile varied color
  const varied = varyColor(color, tx, ty);
  gfx.fillStyle(varied, alpha);
  gfx.beginPath();
  gfx.moveTo(sx, sy - hh);
  gfx.lineTo(sx + hw, sy);
  gfx.lineTo(sx, sy + hh);
  gfx.lineTo(sx - hw, sy);
  gfx.closePath();
  gfx.fillPath();

  // 2. Highlight edges (top-left and top-right — light hits from above-left)
  gfx.lineStyle(1, lighten(color, 0.2), 0.4);
  gfx.beginPath();
  gfx.moveTo(sx - hw, sy);
  gfx.lineTo(sx, sy - hh);
  gfx.lineTo(sx + hw, sy);
  gfx.strokePath();

  // 3. Shadow edges (bottom-left and bottom-right)
  gfx.lineStyle(1, darken(color, 0.15), 0.3);
  gfx.beginPath();
  gfx.moveTo(sx - hw, sy);
  gfx.lineTo(sx, sy + hh);
  gfx.lineTo(sx + hw, sy);
  gfx.strokePath();

  // 4. Grass tufts for grass/dark_grass biomes (~30% of tiles)
  const h = tileHash(tx, ty);
  if (h % 100 < 30) {
    const isGrass =
      color === ZONE_BIOME_COLORS.grass?.top ||
      color === ZONE_BIOME_COLORS.dark_grass?.top;
    if (isGrass) {
      const tuftColor = lighten(color, 0.15);
      gfx.lineStyle(1, tuftColor, 0.5);
      const count = 2 + (h % 2);
      for (let i = 0; i < count; i++) {
        const seed = tileHash(tx + i * 7, ty + i * 13);
        // Map seed to position within diamond: parametric offsets in [-0.3, 0.3]
        const t = ((seed % 60) - 30) / 100;
        const u = (((seed >> 8) % 60) - 30) / 100;
        const px = sx + t * ISO_TILE_W;
        const py = sy + u * ISO_TILE_H;
        gfx.beginPath();
        gfx.moveTo(px, py);
        gfx.lineTo(px - 1, py - 3);
        gfx.strokePath();
        gfx.beginPath();
        gfx.moveTo(px + 1, py);
        gfx.lineTo(px + 2, py - 2);
        gfx.strokePath();
      }
    }
  }
}

/** Draw the left wall face with ambient occlusion gradient. */
export function drawLeftWall(
  gfx: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  wallH: number,
  color: number,
): void {
  const hw = ISO_TILE_W / 2;
  const hh = ISO_TILE_H / 2;

  // Split the wall into 3 horizontal strips for gradient simulation
  const strips = 3;
  const stripH = wallH / strips;

  for (let i = 0; i < strips; i++) {
    // Top strip lighter, bottom strip darker — ambient occlusion
    const t = i / (strips - 1); // 0 = top, 1 = bottom
    const shadeAmount = t * 0.12;
    const stripColor = darken(color, shadeAmount);
    gfx.fillStyle(stripColor, 1);

    const yOff = i * stripH;
    const yOffNext = (i + 1) * stripH;

    gfx.beginPath();
    gfx.moveTo(sx - hw, sy + yOff);
    gfx.lineTo(sx, sy + hh + yOff);
    gfx.lineTo(sx, sy + hh + yOffNext);
    gfx.lineTo(sx - hw, sy + yOffNext);
    gfx.closePath();
    gfx.fillPath();
  }

  // Bottom edge line for definition
  gfx.lineStyle(1, darken(color, 0.2), 0.3);
  gfx.beginPath();
  gfx.moveTo(sx - hw, sy + wallH);
  gfx.lineTo(sx, sy + hh + wallH);
  gfx.strokePath();
}

/** Draw the right wall face with ambient occlusion gradient. */
export function drawRightWall(
  gfx: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  wallH: number,
  color: number,
): void {
  const hw = ISO_TILE_W / 2;
  const hh = ISO_TILE_H / 2;

  // Split the wall into 3 horizontal strips for gradient simulation
  const strips = 3;
  const stripH = wallH / strips;

  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const shadeAmount = t * 0.12;
    const stripColor = darken(color, shadeAmount);
    gfx.fillStyle(stripColor, 1);

    const yOff = i * stripH;
    const yOffNext = (i + 1) * stripH;

    gfx.beginPath();
    gfx.moveTo(sx + hw, sy + yOff);
    gfx.lineTo(sx, sy + hh + yOff);
    gfx.lineTo(sx, sy + hh + yOffNext);
    gfx.lineTo(sx + hw, sy + yOffNext);
    gfx.closePath();
    gfx.fillPath();
  }

  // Bottom edge line for definition
  gfx.lineStyle(1, darken(color, 0.2), 0.3);
  gfx.beginPath();
  gfx.moveTo(sx + hw, sy + wallH);
  gfx.lineTo(sx, sy + hh + wallH);
  gfx.strokePath();
}

/** Draw a complete isometric column (walls + top face) with optional ground shadow. */
export function drawColumn(
  gfx: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  colors: BiomeColors,
  height: number,
  neighborLeft: number,   // height of tile at (x, y+1)
  neighborRight: number,  // height of tile at (x+1, y)
  tx: number = 0,
  ty: number = 0,
): void {
  const blockPx = height * ISO_BLOCK_H;
  const adjSy = sy - blockPx;

  // Ground shadow for tall columns
  if (height >= 3) {
    gfx.fillStyle(0x000000, 0.08);
    gfx.fillEllipse(sx + 8, sy + 4, 20, 8);
  }

  // Left wall
  const leftDiff = (height - neighborLeft) * ISO_BLOCK_H;
  if (leftDiff > 0) {
    drawLeftWall(gfx, sx, adjSy, leftDiff, colors.left);
  }
  // Right wall
  const rightDiff = (height - neighborRight) * ISO_BLOCK_H;
  if (rightDiff > 0) {
    drawRightWall(gfx, sx, adjSy, rightDiff, colors.right);
  }
  // Top face (always drawn)
  drawTopFace(gfx, sx, adjSy, colors.top, 1, tx, ty);
}
