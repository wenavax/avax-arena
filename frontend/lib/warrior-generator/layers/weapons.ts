/**
 * Weapon layers — 24x32 grids
 * 8 types: sword(0), axe(1), staff(2), bow(3), scythe(4), hammer(5), daggers(6), trident(7)
 * Values: 0=transparent, 1=primary(blade), 2=secondary(handle), 3=dark(edge), 4=highlight(shine)
 * Positioned in right hand area (x: 17-23, various y)
 */

type Grid = number[][];
const W = 24, H = 32;
function empty(): Grid { return Array.from({ length: H }, () => new Array(W).fill(0)); }

/** Sword — held in right hand, blade pointing up */
function sword(): Grid {
  const g = empty();
  // Blade
  g[4][18] = 4; g[5][18] = 1; g[6][18] = 1; g[7][18] = 1;
  g[8][18] = 1; g[9][18] = 1; g[10][18] = 1; g[11][18] = 1;
  g[12][18] = 1; g[13][18] = 1;
  // Blade edge
  g[5][19] = 3; g[6][19] = 3; g[7][19] = 3; g[8][19] = 3;
  g[9][19] = 3; g[10][19] = 3; g[11][19] = 3;
  // Guard
  g[14][17] = 2; g[14][18] = 4; g[14][19] = 2;
  // Handle
  g[15][18] = 2; g[16][18] = 2; g[17][18] = 2;
  // Pommel
  g[18][18] = 3;
  return g;
}

/** Axe — held in right hand */
function axe(): Grid {
  const g = empty();
  // Axe head
  g[6][19] = 1; g[6][20] = 1;
  g[7][18] = 1; g[7][19] = 4; g[7][20] = 1; g[7][21] = 3;
  g[8][18] = 1; g[8][19] = 4; g[8][20] = 1; g[8][21] = 3;
  g[9][19] = 1; g[9][20] = 1;
  // Handle
  g[10][18] = 2; g[11][18] = 2; g[12][18] = 2; g[13][18] = 2;
  g[14][18] = 2; g[15][18] = 2; g[16][18] = 2; g[17][18] = 2;
  g[18][18] = 3;
  return g;
}

/** Staff — tall, held vertically */
function staff(): Grid {
  const g = empty();
  // Orb top
  g[2][18] = 4; g[2][19] = 4;
  g[3][17] = 4; g[3][18] = 2; g[3][19] = 2; g[3][20] = 4;
  g[4][18] = 4; g[4][19] = 4;
  // Shaft
  for (let r = 5; r <= 28; r++) g[r][18] = 2;
  // Rings
  g[8][17] = 1; g[8][19] = 1;
  g[15][17] = 1; g[15][19] = 1;
  // Bottom
  g[29][17] = 3; g[29][18] = 2; g[29][19] = 3;
  return g;
}

/** Bow — held to the side */
function bow(): Grid {
  const g = empty();
  // Bow curve
  g[5][20] = 2;
  g[6][21] = 2;
  g[7][21] = 2;
  g[8][22] = 1;
  g[9][22] = 1;
  g[10][22] = 1;
  g[11][22] = 1;
  g[12][22] = 1;
  g[13][22] = 1;
  g[14][22] = 1;
  g[15][21] = 2;
  g[16][21] = 2;
  g[17][20] = 2;
  // String
  for (let r = 5; r <= 17; r++) g[r][19] = 3;
  // Arrow
  g[10][17] = 4; g[10][18] = 3; g[10][19] = 3; g[10][20] = 3; g[10][21] = 3;
  g[9][17] = 3; // arrowhead
  return g;
}

/** Scythe — curved blade on long handle */
function scythe(): Grid {
  const g = empty();
  // Blade
  g[3][17] = 3; g[3][18] = 1; g[3][19] = 1; g[3][20] = 4;
  g[4][16] = 3; g[4][17] = 1; g[4][18] = 4;
  g[5][15] = 3; g[5][16] = 1;
  g[6][15] = 3;
  // Handle
  for (let r = 6; r <= 28; r++) g[r][18] = 2;
  g[7][18] = 2; g[29][18] = 3;
  return g;
}

/** Hammer — big head */
function hammer(): Grid {
  const g = empty();
  // Hammer head
  g[5][17] = 3; g[5][18] = 1; g[5][19] = 1; g[5][20] = 3;
  g[6][16] = 3; g[6][17] = 1; g[6][18] = 4; g[6][19] = 4; g[6][20] = 1; g[6][21] = 3;
  g[7][16] = 3; g[7][17] = 1; g[7][18] = 1; g[7][19] = 1; g[7][20] = 1; g[7][21] = 3;
  g[8][17] = 3; g[8][18] = 1; g[8][19] = 1; g[8][20] = 3;
  // Handle
  for (let r = 9; r <= 18; r++) g[r][18] = 2;
  g[18][18] = 3;
  return g;
}

/** Daggers — dual wielded, left and right */
function daggers(): Grid {
  const g = empty();
  // Right dagger (main)
  g[12][18] = 4; g[13][18] = 1; g[14][18] = 1; g[15][18] = 1;
  g[16][18] = 2; g[17][18] = 2;
  g[13][19] = 3; g[14][19] = 3;
  // Left dagger
  g[12][5] = 4; g[13][5] = 1; g[14][5] = 1; g[15][5] = 1;
  g[16][5] = 2; g[17][5] = 2;
  g[13][4] = 3; g[14][4] = 3;
  return g;
}

/** Trident — three-pronged spear */
function trident(): Grid {
  const g = empty();
  // Three prongs
  g[2][17] = 4; g[2][18] = 0; g[2][19] = 4;
  g[3][17] = 1; g[3][18] = 4; g[3][19] = 1;
  g[4][17] = 1; g[4][18] = 1; g[4][19] = 1;
  g[5][17] = 3; g[5][18] = 1; g[5][19] = 3;
  g[6][18] = 1;
  // Cross guard
  g[7][17] = 2; g[7][18] = 1; g[7][19] = 2;
  // Shaft
  for (let r = 8; r <= 28; r++) g[r][18] = 2;
  g[29][18] = 3;
  return g;
}

export const WEAPONS: Grid[] = [sword(), axe(), staff(), bow(), scythe(), hammer(), daggers(), trident()];
