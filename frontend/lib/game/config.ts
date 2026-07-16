// Kenney 1-bit spritesheet constants
export const TILE_SIZE = 16;
export const TILE_GAP = 1;
export const TILE_STEP = TILE_SIZE + TILE_GAP; // 17
export const SHEET_COLS = 49;
export const SHEET_ROWS = 22;
export const SPRITE_SHEET_PATH = '/avalanche/sprites/kenney-1bit.png';

// Map dimensions (in tiles)
export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 30;

// Scaled tile size for rendering
export const SCALE = 3;
export const DISPLAY_TILE = TILE_SIZE * SCALE; // 48px

// Game canvas
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Convert (col, row) in spritesheet to tile index
export function tileIndex(col: number, row: number): number {
  return row * SHEET_COLS + col;
}
