/**
 * Cape layers — 24x32 grids
 * 5 types: short(0), long(1), tattered(2), royal(3), none(4)
 * Values: 0=transparent, 1=primary, 2=secondary, 3=dark, 4=highlight
 * Drawn behind body (rows ~10-28, x around 6-8 left side / back)
 */

type Grid = number[][];
const W = 24, H = 32;
function empty(): Grid { return Array.from({ length: H }, () => new Array(W).fill(0)); }

/** Short cape — just shoulders */
function shortCape(): Grid {
  const g = empty();
  // Shoulder drape
  for (let r = 10; r <= 16; r++) {
    g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1;
  }
  g[17][7] = 3; g[17][16] = 3;
  return g;
}

/** Long cape — flows down to boots */
function longCape(): Grid {
  const g = empty();
  for (let r = 10; r <= 27; r++) {
    g[r][5] = 3; g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1; g[r][18] = 3;
  }
  // Wider at bottom
  g[25][4] = 3; g[25][19] = 3;
  g[26][4] = 3; g[26][19] = 3;
  g[27][3] = 3; g[27][4] = 1; g[27][19] = 1; g[27][20] = 3;
  g[28][3] = 3; g[28][4] = 1; g[28][5] = 1; g[28][18] = 1; g[28][19] = 1; g[28][20] = 3;
  return g;
}

/** Tattered cape — torn edges */
function tatteredCape(): Grid {
  const g = empty();
  for (let r = 10; r <= 22; r++) {
    g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1;
  }
  // Torn ends — irregular
  g[23][6] = 1; g[23][17] = 1;
  g[24][7] = 3;
  g[25][6] = 1;
  g[26][7] = 3; g[26][16] = 3;
  g[24][16] = 1;
  g[25][17] = 3;
  return g;
}

/** Royal cape — wide, ornate, with fur trim */
function royalCape(): Grid {
  const g = empty();
  // Fur collar
  g[9][5] = 4; g[9][6] = 4; g[9][7] = 4; g[9][16] = 4; g[9][17] = 4; g[9][18] = 4;
  // Wide cape body
  for (let r = 10; r <= 28; r++) {
    g[r][4] = 3; g[r][5] = 1; g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1; g[r][18] = 1; g[r][19] = 3;
  }
  // Fur trim at bottom
  g[29][3] = 4; g[29][4] = 4; g[29][5] = 4; g[29][6] = 4; g[29][7] = 4;
  g[29][16] = 4; g[29][17] = 4; g[29][18] = 4; g[29][19] = 4; g[29][20] = 4;
  // Clasp
  g[10][7] = 4; g[10][16] = 4;
  return g;
}

export const CAPES: Grid[] = [shortCape(), longCape(), tatteredCape(), royalCape()];
