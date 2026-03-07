/**
 * Leg armor layers — 24x32 grids
 * 5 tiers × 2 variants = 10 leg armors
 * Values: 0=transparent, 1=armor_primary, 2=armor_secondary, 3=armor_dark, 4=armor_highlight
 * Covers rows ~20-30 (legs + boots)
 */

type Grid = number[][];
const W = 24, H = 32;
function empty(): Grid { return Array.from({ length: H }, () => new Array(W).fill(0)); }

function drawBasicLegs(g: Grid) {
  // Left leg
  for (let r = 21; r <= 27; r++) { g[r][9] = 1; g[r][10] = 1; g[r][11] = 1; }
  // Right leg
  for (let r = 21; r <= 27; r++) { g[r][12] = 1; g[r][13] = 1; g[r][14] = 1; }
  // Gap
  for (let r = 21; r <= 27; r++) g[r][11] = 0;
  // Left leg
  for (let r = 21; r <= 27; r++) { g[r][9] = 1; g[r][10] = 1; }
  // Right leg
  for (let r = 21; r <= 27; r++) { g[r][13] = 1; g[r][14] = 1; }
  // Boots
  g[28][8] = 3; g[28][9] = 1; g[28][10] = 1;
  g[28][13] = 1; g[28][14] = 1; g[28][15] = 3;
  g[29][8] = 3; g[29][9] = 3; g[29][10] = 3;
  g[29][13] = 3; g[29][14] = 3; g[29][15] = 3;
}

function clothLegA(): Grid {
  const g = empty();
  // Simple pants
  for (let r = 20; r <= 27; r++) { g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; }
  // Simple boots
  g[28][8] = 3; g[28][9] = 1; g[28][10] = 1; g[28][13] = 1; g[28][14] = 1; g[28][15] = 3;
  g[29][8] = 3; g[29][9] = 3; g[29][10] = 3; g[29][13] = 3; g[29][14] = 3; g[29][15] = 3;
  return g;
}

function clothLegB(): Grid {
  const g = empty();
  // Robe-like bottom
  for (let r = 20; r <= 25; r++) for (let x = 8; x <= 15; x++) g[r][x] = 1;
  for (let r = 26; r <= 27; r++) { g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; }
  g[23][9] = 2; g[23][14] = 2; // fold lines
  g[28][9] = 3; g[28][10] = 3; g[28][13] = 3; g[28][14] = 3;
  g[29][9] = 3; g[29][10] = 3; g[29][13] = 3; g[29][14] = 3;
  return g;
}

function leatherLegA(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) { g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; }
  // Knee pads
  g[24][8] = 2; g[24][9] = 2; g[24][10] = 2; g[24][13] = 2; g[24][14] = 2; g[24][15] = 2;
  // Leather boots
  for (let r = 27; r <= 29; r++) {
    g[r][8] = 3; g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; g[r][15] = 3;
  }
  g[29][8] = 3; g[29][9] = 3; g[29][10] = 3; g[29][13] = 3; g[29][14] = 3; g[29][15] = 3;
  return g;
}

function leatherLegB(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) { g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; }
  // Strapped design
  g[22][9] = 2; g[22][14] = 2;
  g[25][9] = 2; g[25][14] = 2;
  // Tall boots
  for (let r = 26; r <= 29; r++) {
    g[r][8] = 1; g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; g[r][15] = 1;
  }
  g[29][8] = 3; g[29][9] = 3; g[29][10] = 3; g[29][13] = 3; g[29][14] = 3; g[29][15] = 3;
  return g;
}

function chainLegA(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) {
    g[r][9] = r % 2 === 0 ? 1 : 2;
    g[r][10] = r % 2 === 0 ? 2 : 1;
    g[r][13] = r % 2 === 0 ? 1 : 2;
    g[r][14] = r % 2 === 0 ? 2 : 1;
  }
  // Metal boots
  for (let r = 27; r <= 29; r++) {
    g[r][8] = 3; g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; g[r][15] = 3;
  }
  g[29][7] = 3; g[29][8] = 3; g[29][9] = 3; g[29][10] = 3;
  g[29][13] = 3; g[29][14] = 3; g[29][15] = 3; g[29][16] = 3;
  return g;
}

function chainLegB(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) {
    g[r][9] = (r + 9) % 2 === 0 ? 1 : 2;
    g[r][10] = (r + 10) % 2 === 0 ? 1 : 2;
    g[r][13] = (r + 13) % 2 === 0 ? 1 : 2;
    g[r][14] = (r + 14) % 2 === 0 ? 1 : 2;
  }
  // Shin guards
  g[25][8] = 4; g[25][9] = 4; g[25][14] = 4; g[25][15] = 4;
  g[26][8] = 4; g[26][9] = 4; g[26][14] = 4; g[26][15] = 4;
  for (let r = 28; r <= 29; r++) {
    g[r][8] = 3; g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; g[r][15] = 3;
  }
  return g;
}

function plateLegA(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) {
    g[r][8] = 3; g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; g[r][15] = 3;
  }
  // Knee plates
  g[23][7] = 4; g[23][8] = 1; g[23][9] = 4; g[23][14] = 4; g[23][15] = 1; g[23][16] = 4;
  g[24][7] = 3; g[24][8] = 1; g[24][9] = 3; g[24][14] = 3; g[24][15] = 1; g[24][16] = 3;
  // Heavy boots
  for (let r = 27; r <= 29; r++) {
    g[r][7] = 3; g[r][8] = 1; g[r][9] = 1; g[r][10] = 1;
    g[r][13] = 1; g[r][14] = 1; g[r][15] = 1; g[r][16] = 3;
  }
  g[29][7] = 3; g[29][10] = 3; g[29][13] = 3; g[29][16] = 3;
  return g;
}

function plateLegB(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) {
    g[r][8] = 3; g[r][9] = 1; g[r][10] = 2; g[r][13] = 2; g[r][14] = 1; g[r][15] = 3;
  }
  // Vertical plate lines
  for (let r = 20; r <= 27; r++) { g[r][9] = 4; g[r][14] = 4; }
  // Armored boots
  for (let r = 27; r <= 29; r++) {
    g[r][7] = 3; g[r][8] = 1; g[r][9] = 4; g[r][10] = 1;
    g[r][13] = 1; g[r][14] = 4; g[r][15] = 1; g[r][16] = 3;
  }
  return g;
}

function legendaryLegA(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) {
    g[r][8] = 3; g[r][9] = 1; g[r][10] = 1; g[r][13] = 1; g[r][14] = 1; g[r][15] = 3;
  }
  // Ornate knee gems
  g[23][9] = 4; g[23][14] = 4;
  g[24][8] = 4; g[24][9] = 2; g[24][14] = 2; g[24][15] = 4;
  // Glowing rune lines
  for (let r = 21; r <= 26; r += 2) { g[r][10] = 4; g[r][13] = 4; }
  // Grand boots
  for (let r = 27; r <= 29; r++) {
    g[r][7] = 4; g[r][8] = 1; g[r][9] = 1; g[r][10] = 1;
    g[r][13] = 1; g[r][14] = 1; g[r][15] = 1; g[r][16] = 4;
  }
  g[29][6] = 4; g[29][17] = 4; // spiked toes
  return g;
}

function legendaryLegB(): Grid {
  const g = empty();
  for (let r = 20; r <= 27; r++) {
    g[r][7] = 3; g[r][8] = 1; g[r][9] = 1; g[r][10] = 1;
    g[r][13] = 1; g[r][14] = 1; g[r][15] = 1; g[r][16] = 3;
  }
  // Diamond pattern
  g[22][9] = 4; g[22][14] = 4;
  g[23][8] = 4; g[23][10] = 4; g[23][13] = 4; g[23][15] = 4;
  g[24][9] = 4; g[24][14] = 4;
  // Massive boots
  for (let r = 27; r <= 29; r++) {
    g[r][6] = 4; g[r][7] = 1; g[r][8] = 1; g[r][9] = 1; g[r][10] = 1;
    g[r][13] = 1; g[r][14] = 1; g[r][15] = 1; g[r][16] = 1; g[r][17] = 4;
  }
  return g;
}

export const LEGS: Grid[] = [
  clothLegA(), clothLegB(),
  leatherLegA(), leatherLegB(),
  chainLegA(), chainLegB(),
  plateLegA(), plateLegB(),
  legendaryLegA(), legendaryLegB(),
];
