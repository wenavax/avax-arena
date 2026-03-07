/**
 * Face layers — 24x32 grids
 * 4 variants: standard(0), scarred(1), glow_eyes(2), masked(3)
 * Values: 0=transparent, 1=skin, 2=feature(mouth/scar), 3=shadow, 4=eye
 * Covers rows ~4-8 (face area, between helmet and neck)
 */

type Grid = number[][];
const W = 24, H = 32;
function empty(): Grid { return Array.from({ length: H }, () => new Array(W).fill(0)); }

/** Standard face — normal features */
function standard(): Grid {
  const g = empty();
  // Face shape
  g[4][9] = 1; g[4][10] = 1; g[4][11] = 1; g[4][12] = 1; g[4][13] = 1; g[4][14] = 1;
  g[5][9] = 1; g[5][10] = 4; g[5][11] = 1; g[5][12] = 1; g[5][13] = 4; g[5][14] = 1;
  g[6][9] = 1; g[6][10] = 1; g[6][11] = 1; g[6][12] = 1; g[6][13] = 1; g[6][14] = 1;
  g[7][10] = 1; g[7][11] = 2; g[7][12] = 2; g[7][13] = 1;
  // Chin
  g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1;
  return g;
}

/** Scarred face — scar across one eye */
function scarred(): Grid {
  const g = empty();
  g[4][9] = 1; g[4][10] = 1; g[4][11] = 1; g[4][12] = 1; g[4][13] = 1; g[4][14] = 1;
  g[5][9] = 1; g[5][10] = 4; g[5][11] = 1; g[5][12] = 1; g[5][13] = 4; g[5][14] = 1;
  g[6][9] = 1; g[6][10] = 1; g[6][11] = 1; g[6][12] = 1; g[6][13] = 1; g[6][14] = 1;
  g[7][10] = 1; g[7][11] = 2; g[7][12] = 2; g[7][13] = 1;
  g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1;
  // Scar — diagonal across left eye
  g[3][9] = 2; g[4][10] = 2; g[5][11] = 2; g[6][12] = 2;
  return g;
}

/** Glow eyes — element-colored glowing eyes */
function glowEyes(): Grid {
  const g = empty();
  g[4][9] = 1; g[4][10] = 1; g[4][11] = 1; g[4][12] = 1; g[4][13] = 1; g[4][14] = 1;
  // Glowing eyes (larger)
  g[5][9] = 1; g[5][10] = 4; g[5][11] = 4; g[5][12] = 4; g[5][13] = 4; g[5][14] = 1;
  g[6][9] = 1; g[6][10] = 1; g[6][11] = 1; g[6][12] = 1; g[6][13] = 1; g[6][14] = 1;
  g[7][10] = 1; g[7][11] = 3; g[7][12] = 3; g[7][13] = 1;
  g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1;
  return g;
}

/** Masked face — lower face covered */
function masked(): Grid {
  const g = empty();
  g[4][9] = 1; g[4][10] = 1; g[4][11] = 1; g[4][12] = 1; g[4][13] = 1; g[4][14] = 1;
  g[5][9] = 1; g[5][10] = 4; g[5][11] = 1; g[5][12] = 1; g[5][13] = 4; g[5][14] = 1;
  g[6][9] = 1; g[6][10] = 1; g[6][11] = 1; g[6][12] = 1; g[6][13] = 1; g[6][14] = 1;
  // Mask covering lower face (value 3 = mask color, will be rendered as dark)
  g[7][9] = 3; g[7][10] = 3; g[7][11] = 3; g[7][12] = 3; g[7][13] = 3; g[7][14] = 3;
  g[8][9] = 3; g[8][10] = 3; g[8][11] = 3; g[8][12] = 3; g[8][13] = 3; g[8][14] = 3;
  return g;
}

export const FACES: Grid[] = [standard(), scarred(), glowEyes(), masked()];
