/**
 * Torso armor layers — 24x32 grids
 * 5 tiers × 2 variants = 10 torso armors
 * Values: 0=transparent, 1=armor_primary, 2=armor_secondary, 3=armor_dark, 4=armor_highlight
 * Covers rows ~10-19 (chest area)
 */

type Grid = number[][];
const W = 24, H = 32;
function empty(): Grid { return Array.from({ length: H }, () => new Array(W).fill(0)); }

function clothA(): Grid {
  const g = empty();
  // Simple tunic
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Neckline
  g[10][10] = 0; g[10][11] = 0; g[10][12] = 0; g[10][13] = 0;
  // Fold lines
  for (let r = 12; r <= 17; r++) g[r][11] = 2;
  g[18][8] = 3; g[18][15] = 3;
  return g;
}

function clothB(): Grid {
  const g = empty();
  // Robe-style with wider bottom
  for (let r = 10; r <= 16; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  for (let r = 17; r <= 19; r++)
    for (let x = 7; x <= 16; x++) g[r][x] = 1;
  g[10][11] = 0; g[10][12] = 0;
  g[14][9] = 2; g[14][14] = 2; // belt accent
  g[15][9] = 3; g[15][14] = 3;
  return g;
}

function leatherA(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Leather straps
  g[11][9] = 2; g[11][10] = 2; g[12][10] = 2; g[12][11] = 2;
  g[11][14] = 2; g[11][15] = 2; g[12][13] = 2; g[12][14] = 2;
  // Belt
  for (let x = 8; x <= 15; x++) g[16][x] = 3;
  g[16][11] = 4; g[16][12] = 4; // buckle
  // Shoulder pads
  g[10][7] = 2; g[10][8] = 1; g[10][15] = 1; g[10][16] = 2;
  return g;
}

function leatherB(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Cross-straps
  for (let i = 0; i < 5; i++) {
    g[11 + i][9 + i] = 2;
    g[11 + i][14 - i] = 2;
  }
  for (let x = 8; x <= 15; x++) g[17][x] = 3;
  g[10][7] = 1; g[10][16] = 1;
  return g;
}

function chainA(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = (r + 0) % 2 === 0 ? 1 : 2; // alternating chain pattern
  // Shoulders
  g[10][7] = 1; g[10][6] = 2; g[10][16] = 1; g[10][17] = 2;
  g[11][7] = 2; g[11][16] = 2;
  for (let x = 8; x <= 15; x++) g[16][x] = 3; // belt
  return g;
}

function chainB(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = (r + x) % 2 === 0 ? 1 : 2; // checkerboard chain
  g[10][7] = 2; g[10][16] = 2;
  g[11][7] = 1; g[11][16] = 1;
  for (let x = 8; x <= 15; x++) g[17][x] = 4; // metal belt
  return g;
}

function plateA(): Grid {
  const g = empty();
  // Solid plate
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Chest plate highlight
  g[11][10] = 4; g[11][11] = 4; g[12][10] = 4;
  g[11][13] = 4; g[12][13] = 4;
  // Shoulder plates
  for (let x = 6; x <= 8; x++) { g[10][x] = 1; g[11][x] = 3; }
  for (let x = 15; x <= 17; x++) { g[10][x] = 1; g[11][x] = 3; }
  // Plate edges
  for (let r = 10; r <= 18; r++) { g[r][8] = 3; g[r][15] = 3; }
  for (let x = 8; x <= 15; x++) g[17][x] = 3;
  g[17][11] = 4; g[17][12] = 4; // belt buckle
  return g;
}

function plateB(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Ribbed plate
  for (let r = 11; r <= 16; r += 2)
    for (let x = 9; x <= 14; x++) g[r][x] = 2;
  // Big shoulder plates
  for (let x = 5; x <= 8; x++) { g[10][x] = 1; g[11][x] = 2; }
  for (let x = 15; x <= 18; x++) { g[10][x] = 1; g[11][x] = 2; }
  g[10][5] = 4; g[10][18] = 4; // shoulder rivets
  for (let x = 8; x <= 15; x++) g[18][x] = 3;
  return g;
}

function legendaryA(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Ornate design
  g[11][10] = 4; g[11][11] = 4; g[11][12] = 4; g[11][13] = 4;
  g[12][11] = 4; g[12][12] = 4;
  g[13][10] = 4; g[13][11] = 4; g[13][12] = 4; g[13][13] = 4;
  // Grand shoulder plates
  for (let x = 4; x <= 8; x++) { g[10][x] = 1; g[11][x] = 2; }
  for (let x = 15; x <= 19; x++) { g[10][x] = 1; g[11][x] = 2; }
  g[9][5] = 4; g[9][6] = 4; g[9][17] = 4; g[9][18] = 4; // upward spikes
  for (let x = 8; x <= 15; x++) g[17][x] = 4;
  g[17][10] = 3; g[17][13] = 3; // gems
  return g;
}

function legendaryB(): Grid {
  const g = empty();
  for (let r = 10; r <= 18; r++)
    for (let x = 8; x <= 15; x++) g[r][x] = 1;
  // Diamond pattern
  g[11][11] = 4; g[11][12] = 4;
  g[12][10] = 4; g[12][11] = 2; g[12][12] = 2; g[12][13] = 4;
  g[13][11] = 4; g[13][12] = 4;
  // Massive shoulders with spikes
  for (let x = 4; x <= 8; x++) g[10][x] = 1;
  for (let x = 15; x <= 19; x++) g[10][x] = 1;
  g[9][4] = 4; g[8][4] = 4; g[9][19] = 4; g[8][19] = 4; // tall spikes
  g[11][5] = 2; g[11][6] = 2; g[11][17] = 2; g[11][18] = 2;
  for (let x = 8; x <= 15; x++) g[18][x] = 4;
  return g;
}

// Indexed: [tier * 2 + variant]
export const TORSOS: Grid[] = [
  clothA(), clothB(),
  leatherA(), leatherB(),
  chainA(), chainB(),
  plateA(), plateB(),
  legendaryA(), legendaryB(),
];
