/**
 * Shield layers — 24x32 grids
 * 4 types: buckler(0), kite(1), tower(2), orb(3)
 * Values: 0=transparent, 1=primary, 2=secondary, 3=dark, 4=highlight
 * Positioned on left arm area (x: 1-7, rows ~11-20)
 */

type Grid = number[][];
const W = 24, H = 32;
function empty(): Grid { return Array.from({ length: H }, () => new Array(W).fill(0)); }

/** Buckler — small round shield */
function buckler(): Grid {
  const g = empty();
  g[12][3] = 1; g[12][4] = 1; g[12][5] = 1;
  g[13][2] = 1; g[13][3] = 4; g[13][4] = 4; g[13][5] = 1; g[13][6] = 3;
  g[14][2] = 1; g[14][3] = 4; g[14][4] = 2; g[14][5] = 1; g[14][6] = 3;
  g[15][2] = 1; g[15][3] = 1; g[15][4] = 1; g[15][5] = 1; g[15][6] = 3;
  g[16][3] = 3; g[16][4] = 3; g[16][5] = 3;
  return g;
}

/** Kite — medium shield, tapered bottom */
function kite(): Grid {
  const g = empty();
  g[11][2] = 1; g[11][3] = 1; g[11][4] = 1; g[11][5] = 1; g[11][6] = 1;
  g[12][2] = 3; g[12][3] = 1; g[12][4] = 4; g[12][5] = 1; g[12][6] = 3;
  g[13][2] = 3; g[13][3] = 1; g[13][4] = 4; g[13][5] = 1; g[13][6] = 3;
  g[14][2] = 3; g[14][3] = 1; g[14][4] = 2; g[14][5] = 1; g[14][6] = 3;
  g[15][2] = 3; g[15][3] = 1; g[15][4] = 1; g[15][5] = 1; g[15][6] = 3;
  g[16][3] = 3; g[16][4] = 1; g[16][5] = 3;
  g[17][4] = 3;
  return g;
}

/** Tower — large rectangular shield */
function tower(): Grid {
  const g = empty();
  for (let r = 10; r <= 20; r++) {
    g[r][1] = 3; g[r][2] = 1; g[r][3] = 1; g[r][4] = 1; g[r][5] = 1; g[r][6] = 1; g[r][7] = 3;
  }
  // Rivets
  g[11][2] = 4; g[11][6] = 4;
  g[15][2] = 4; g[15][6] = 4;
  g[19][2] = 4; g[19][6] = 4;
  // Central cross
  for (let r = 12; r <= 18; r++) g[r][4] = 2;
  g[15][2] = 2; g[15][3] = 2; g[15][5] = 2; g[15][6] = 2;
  return g;
}

/** Magic orb — floating energy sphere */
function orb(): Grid {
  const g = empty();
  g[12][3] = 4; g[12][4] = 4; g[12][5] = 4;
  g[13][2] = 4; g[13][3] = 2; g[13][4] = 2; g[13][5] = 2; g[13][6] = 4;
  g[14][2] = 4; g[14][3] = 2; g[14][4] = 4; g[14][5] = 2; g[14][6] = 4;
  g[15][2] = 4; g[15][3] = 2; g[15][4] = 2; g[15][5] = 2; g[15][6] = 4;
  g[16][3] = 4; g[16][4] = 4; g[16][5] = 4;
  // Glow particles
  g[11][2] = 4; g[11][6] = 4;
  g[17][2] = 4; g[17][6] = 4;
  return g;
}

export const SHIELDS: Grid[] = [buckler(), kite(), tower(), orb()];
