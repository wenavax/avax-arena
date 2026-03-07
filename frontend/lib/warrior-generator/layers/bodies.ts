/**
 * Body layers — 24x32 grids, 4 types: slim(0), medium(1), muscular(2), heavy(3)
 * Values: 0=transparent, 1=skin, 2=skin_shadow, 3=skin_highlight
 * Only draws exposed skin areas (neck, arms). Torso covers chest.
 */

// Row range: roughly rows 8-24 (neck through waist, arms)
// Grid is 24 wide x 32 tall

type Grid = number[][];

const W = 24, H = 32;

function empty(): Grid {
  return Array.from({ length: H }, () => new Array(W).fill(0));
}

/** Slim body — narrow shoulders, thin arms */
function slim(): Grid {
  const g = empty();
  // Neck (row 8-9)
  g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1;
  g[9][10] = 1; g[9][11] = 1; g[9][12] = 1; g[9][13] = 1;
  // Shoulders (row 10) — narrow
  for (let x = 8; x <= 15; x++) g[10][x] = 1;
  // Upper arms (rows 11-14)
  for (let r = 11; r <= 14; r++) {
    g[r][7] = 1; g[r][8] = 2; // left arm
    g[r][15] = 2; g[r][16] = 1; // right arm
  }
  // Forearms (rows 15-17)
  for (let r = 15; r <= 17; r++) {
    g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1;
  }
  // Hands (row 18)
  g[18][6] = 3; g[18][17] = 3;
  // Torso area (will be covered by armor, but draw base)
  for (let r = 10; r <= 18; r++) {
    for (let x = 9; x <= 14; x++) g[r][x] = 1;
  }
  // Waist (rows 19-20)
  for (let x = 9; x <= 14; x++) { g[19][x] = 2; g[20][x] = 2; }
  return g;
}

/** Medium body — average build */
function medium(): Grid {
  const g = empty();
  // Neck
  g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1;
  g[9][10] = 1; g[9][11] = 1; g[9][12] = 1; g[9][13] = 1;
  // Shoulders — medium width
  for (let x = 7; x <= 16; x++) g[10][x] = 1;
  // Upper arms
  for (let r = 11; r <= 14; r++) {
    g[r][6] = 1; g[r][7] = 1; g[r][8] = 2;
    g[r][15] = 2; g[r][16] = 1; g[r][17] = 1;
  }
  // Forearms
  for (let r = 15; r <= 17; r++) {
    g[r][5] = 1; g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1; g[r][18] = 1;
  }
  // Hands
  g[18][5] = 3; g[18][6] = 3; g[18][17] = 3; g[18][18] = 3;
  // Torso
  for (let r = 10; r <= 18; r++) {
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  }
  for (let x = 9; x <= 14; x++) { g[19][x] = 2; g[20][x] = 2; }
  return g;
}

/** Muscular body — broad shoulders, thick arms */
function muscular(): Grid {
  const g = empty();
  // Neck
  g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1;
  g[9][9] = 1; g[9][10] = 1; g[9][11] = 1; g[9][12] = 1; g[9][13] = 1; g[9][14] = 1;
  // Wide shoulders
  for (let x = 6; x <= 17; x++) g[10][x] = 1;
  // Thick upper arms
  for (let r = 11; r <= 14; r++) {
    g[r][5] = 1; g[r][6] = 1; g[r][7] = 1; g[r][8] = 2;
    g[r][15] = 2; g[r][16] = 1; g[r][17] = 1; g[r][18] = 1;
  }
  // Thick forearms
  for (let r = 15; r <= 17; r++) {
    g[r][4] = 1; g[r][5] = 1; g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1; g[r][18] = 1; g[r][19] = 1;
  }
  // Hands
  g[18][4] = 3; g[18][5] = 3; g[18][18] = 3; g[18][19] = 3;
  // Wide torso
  for (let r = 10; r <= 18; r++) {
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  }
  for (let x = 8; x <= 15; x++) { g[19][x] = 2; g[20][x] = 2; }
  return g;
}

/** Heavy body — widest, tank build */
function heavy(): Grid {
  const g = empty();
  // Thick neck
  g[8][9] = 1; g[8][10] = 1; g[8][11] = 1; g[8][12] = 1; g[8][13] = 1; g[8][14] = 1;
  g[9][9] = 1; g[9][10] = 1; g[9][11] = 1; g[9][12] = 1; g[9][13] = 1; g[9][14] = 1;
  // Very wide shoulders
  for (let x = 5; x <= 18; x++) g[10][x] = 1;
  // Very thick arms
  for (let r = 11; r <= 14; r++) {
    g[r][4] = 1; g[r][5] = 1; g[r][6] = 1; g[r][7] = 1; g[r][8] = 2;
    g[r][15] = 2; g[r][16] = 1; g[r][17] = 1; g[r][18] = 1; g[r][19] = 1;
  }
  for (let r = 15; r <= 17; r++) {
    g[r][3] = 1; g[r][4] = 1; g[r][5] = 1; g[r][6] = 1; g[r][7] = 2;
    g[r][16] = 2; g[r][17] = 1; g[r][18] = 1; g[r][19] = 1; g[r][20] = 1;
  }
  // Big hands
  g[18][3] = 3; g[18][4] = 3; g[18][5] = 3; g[18][19] = 3; g[18][20] = 3;
  // Wide torso
  for (let r = 10; r <= 19; r++) {
    for (let x = 7; x <= 16; x++) g[r][x] = 1;
  }
  for (let x = 7; x <= 16; x++) { g[20][x] = 2; }
  return g;
}

export const BODIES: Grid[] = [slim(), medium(), muscular(), heavy()];
