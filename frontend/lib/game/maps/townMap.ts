import { tileIndex } from '../config';

// ── Ninja-floor tile index helper (22 cols per row, 0 spacing) ──
const NF_COLS = 22;
function nf(col: number, row: number): number {
  return row * NF_COLS + col;
}

// ── Ground tiles (ninja-floor spritesheet) ──
// Grass — row 12 left (#adbc3a lime green)
const GRASS1 = nf(0, 12);
const GRASS2 = nf(1, 12);
const GRASS3 = nf(2, 12);
const GRASS4 = nf(3, 12);
const GRASS5 = nf(4, 12);

// Stone path — row 15 right (#816855 brown stone)
const STONE1 = nf(12, 15);
const STONE2 = nf(13, 15);
const STONE3 = nf(14, 15);
const STONE4 = nf(15, 15);
const COBBLE = [STONE1, STONE2, STONE3, STONE4];

// Plaza stone — row 19 right (#b3957f lighter tan)
const PLAZA1 = nf(11, 19);
const PLAZA2 = nf(12, 19);
const PLAZA3 = nf(13, 19);
const PLAZA_STONES = [PLAZA1, PLAZA2, PLAZA3];

// Dirt tiles — row 8 left (#bd7959 warm brown earth)
const DIRT1 = nf(1, 8);
const DIRT2 = nf(3, 8);
const DIRT_TILES = [DIRT1, DIRT2];

// Sand tiles — row 0 left (#ffcb8d sandy beige, for water edges)
const SAND1 = nf(1, 0);
const SAND2 = nf(3, 0);

// Water tiles — row 22 left (#b8dce5 light blue)
const WATER1 = nf(1, 22);
const WATER2 = nf(4, 22);
const WATER3 = nf(5, 22);
const WATER_TILES = [WATER1, WATER2, WATER3];

// ── Object tiles (Kenney 'tiles' spritesheet) ──
const TREE     = tileIndex(3, 0);
const TREE2    = tileIndex(4, 0);
const PINE     = tileIndex(5, 0);
const BUSH     = tileIndex(6, 0);
const FLOWER   = tileIndex(7, 0);
const ROCK     = tileIndex(8, 0);

// Building parts
const WALL_H    = tileIndex(0, 4);
const WALL_V    = tileIndex(1, 4);
const WALL_C    = tileIndex(2, 4);
const DOOR      = tileIndex(3, 4);
const WINDOW    = tileIndex(4, 4);
const ROOF_L    = tileIndex(0, 5);
const ROOF_M    = tileIndex(1, 5);
const ROOF_R    = tileIndex(2, 5);

// Props
const TORCH  = tileIndex(3, 6);
const CHEST  = tileIndex(4, 6);
const BARREL = tileIndex(5, 6);

// Water / bridge
const BRIDGE = tileIndex(1, 3);

// ── Seeded random ──
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Mask helpers ──
const W = 40;
const H = 30;

function emptyMask(): boolean[][] {
  const m: boolean[][] = [];
  for (let y = 0; y < H; y++) m.push(new Array(W).fill(false));
  return m;
}

function setM(mask: boolean[][], x: number, y: number) {
  if (x >= 0 && x < W && y >= 0 && y < H) mask[y][x] = true;
}

function hLine(mask: boolean[][], y: number, x1: number, x2: number, w = 1) {
  for (let x = x1; x <= x2; x++)
    for (let dy = 0; dy < w; dy++) setM(mask, x, y + dy);
}

function vLine(mask: boolean[][], x: number, y1: number, y2: number, w = 1) {
  for (let y = y1; y <= y2; y++)
    for (let dx = 0; dx < w; dx++) setM(mask, x + dx, y);
}

function rect(mask: boolean[][], x1: number, y1: number, x2: number, y2: number) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++) setM(mask, x, y);
}

// ════════════════════════════════════════════════════════
// ── PATH MASK — stone cobble roads ──
// ════════════════════════════════════════════════════════
function buildPathMask(): boolean[][] {
  const mask = emptyMask();

  // ── Central Plaza — 8x6 area (wider, grander) ──
  rect(mask, 16, 12, 23, 18);
  // Irregular edges for organic feel
  rect(mask, 15, 13, 15, 17);
  rect(mask, 24, 13, 24, 17);
  setM(mask, 15, 14); setM(mask, 15, 16);
  setM(mask, 24, 14); setM(mask, 24, 16);

  // ── Main East Road: plaza -> forest exit (3 tiles wide) ──
  hLine(mask, 14, 24, 37, 3);
  // Gentle curve near x=32
  setM(mask, 32, 13); setM(mask, 33, 13); setM(mask, 34, 13);

  // ── South Road: plaza -> spawn area (3 tiles wide) ──
  vLine(mask, 19, 18, 25, 3);
  // Widen at spawn clearing
  rect(mask, 17, 24, 23, 26);
  // Soften edges
  setM(mask, 18, 23); setM(mask, 22, 23);
  setM(mask, 17, 27); setM(mask, 23, 27);

  // ── Northwest Path: plaza -> Elder's Tower (2 tiles wide) ──
  hLine(mask, 14, 10, 16, 2);
  vLine(mask, 10, 9, 14, 2);
  // Approach to elder door
  hLine(mask, 10, 8, 10, 2);
  setM(mask, 9, 10); setM(mask, 9, 11);

  // ── Northeast Path: plaza -> Merchant Shop (2 tiles wide) ──
  hLine(mask, 14, 24, 28, 2);
  vLine(mask, 28, 10, 14, 2);
  // Approach to shop door
  hLine(mask, 10, 28, 31, 2);
  setM(mask, 30, 10); setM(mask, 30, 11);

  // ── Southwest Path: plaza -> Inn (2 tiles wide) ──
  vLine(mask, 16, 18, 20, 2);
  hLine(mask, 20, 9, 16, 2);
  // Approach to inn door
  vLine(mask, 9, 22, 23, 2);
  setM(mask, 9, 21); setM(mask, 10, 21);
  // Small widening at inn entrance
  setM(mask, 8, 23); setM(mask, 11, 23);

  // ── Southeast Path: plaza -> Training Hall (2 tiles wide) ──
  vLine(mask, 22, 18, 20, 2);
  hLine(mask, 20, 22, 30, 2);
  vLine(mask, 30, 20, 23, 2);
  // Approach to training hall door
  setM(mask, 30, 24); setM(mask, 31, 24);

  // ── Small garden path: winding path from south road to pond area ──
  hLine(mask, 23, 23, 27, 1);
  vLine(mask, 27, 23, 25, 1);

  // ── Organic scatter at path edges ──
  const rng = seededRandom(42);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (mask[y][x]) continue;
      let adj = 0;
      if (mask[y - 1]?.[x]) adj++;
      if (mask[y + 1]?.[x]) adj++;
      if (mask[y]?.[x - 1]) adj++;
      if (mask[y]?.[x + 1]) adj++;
      if (adj >= 2 && rng() < 0.25) setM(mask, x, y);
      else if (adj === 1 && rng() < 0.08) setM(mask, x, y);
    }
  }

  return mask;
}

// ════════════════════════════════════════════════════════
// ── PLAZA MASK — lighter stone for the central square ──
// ════════════════════════════════════════════════════════
function buildPlazaMask(): boolean[][] {
  const mask = emptyMask();
  rect(mask, 16, 12, 23, 18);
  rect(mask, 15, 13, 24, 17);
  return mask;
}

// ════════════════════════════════════════════════════════
// ── DIRT MASK — brown earth under/around buildings ──
// ════════════════════════════════════════════════════════
function buildDirtMask(): boolean[][] {
  const mask = emptyMask();

  // Around Elder's Tower (northwest)
  rect(mask, 5, 4, 14, 12);
  // Around Merchant's Shop (northeast)
  rect(mask, 26, 4, 35, 12);
  // Around Inn (southwest)
  rect(mask, 3, 19, 12, 25);
  // Around Training Hall (southeast)
  rect(mask, 27, 20, 35, 27);
  // Market stall area near merchant
  rect(mask, 25, 10, 27, 12);

  return mask;
}

// ════════════════════════════════════════════════════════
// ── WATER MASK — small pond in southeast ──
// ════════════════════════════════════════════════════════
function buildWaterMask(): boolean[][] {
  const mask = emptyMask();

  // Organic pond shape — roughly centered around (28, 26)
  //         . W W .
  //       W W W W W
  //     W W W W W W W
  //     W W W W W W
  //       W W W W
  //         W W
  setM(mask, 26, 4); setM(mask, 27, 4);
  // Row shape for the pond at bottom-right area
  // Center the pond around (28,26) but shift slightly for the path

  // Actually let's place a nice pond at around x=25-30, y=26-29
  // but y=29 is border trees. Let's do x=33-37, y=24-28 area
  // Wait, training hall is at 27-35 area. Let's place pond more carefully.

  // Place a small scenic pond at southeast corner: x=34-38, y=25-28
  // But x=38-39 are border trees. Let's do a pond in the open area.

  // Best spot: south-center-east, around x=25, y=26
  // Clear of the spawn (17-23, 24-26) and training hall (27-35, 20-27)

  // Let's reset and do a clean organic pond shape
  // Pond at roughly (14, 26) area — south of inn, nice scenic spot
  const pondTiles: [number, number][] = [
    // Row 25
    [14, 25], [15, 25],
    // Row 26
    [13, 26], [14, 26], [15, 26], [16, 26],
    // Row 27
    [13, 27], [14, 27], [15, 27], [16, 27], [17, 27],
    // Row 28 (partial, near border)
    [14, 28], [15, 28], [16, 28],
  ];

  // Clear the mask and set pond tiles
  for (const [px, py] of pondTiles) {
    setM(mask, px, py);
  }

  return mask;
}

// ── Sand mask — transition around water ──
function buildSandMask(waterMask: boolean[][]): boolean[][] {
  const mask = emptyMask();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (waterMask[y][x]) continue;
      // Check if adjacent to water
      const adj =
        (waterMask[y - 1]?.[x] ? 1 : 0) +
        (waterMask[y + 1]?.[x] ? 1 : 0) +
        (waterMask[y]?.[x - 1] ? 1 : 0) +
        (waterMask[y]?.[x + 1] ? 1 : 0) +
        (waterMask[y - 1]?.[x - 1] ? 1 : 0) +
        (waterMask[y - 1]?.[x + 1] ? 1 : 0) +
        (waterMask[y + 1]?.[x - 1] ? 1 : 0) +
        (waterMask[y + 1]?.[x + 1] ? 1 : 0);
      if (adj > 0) mask[y][x] = true;
    }
  }
  return mask;
}

// ── Build all masks ──
const pathMask = buildPathMask();
const plazaMask = buildPlazaMask();
const dirtMask = buildDirtMask();
const waterMask = buildWaterMask();
const sandMask = buildSandMask(waterMask);

// ════════════════════════════════════════════════════════
// ── GROUND GENERATION ──
// ════════════════════════════════════════════════════════
export function generateTownGround(): number[] {
  const rng = seededRandom(123);
  const map: number[] = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Layer priority: water > sand > plaza stone > path stone > dirt > grass
      if (waterMask[y][x]) {
        map.push(WATER_TILES[Math.floor(rng() * WATER_TILES.length)]);
      } else if (sandMask[y][x]) {
        map.push(rng() < 0.5 ? SAND1 : SAND2);
      } else if (plazaMask[y][x] && pathMask[y][x]) {
        // Plaza uses lighter stone
        map.push(PLAZA_STONES[Math.floor(rng() * PLAZA_STONES.length)]);
      } else if (pathMask[y][x]) {
        map.push(COBBLE[Math.floor(rng() * COBBLE.length)]);
      } else if (dirtMask[y][x]) {
        // Dirt with occasional grass patches for variety
        const r = rng();
        if (r < 0.6) {
          map.push(DIRT_TILES[Math.floor(rng() * DIRT_TILES.length)]);
        } else {
          map.push(rng() < 0.5 ? GRASS1 : GRASS4);
        }
      } else {
        // Natural grass with weighted variants
        const r = rng();
        map.push(
          r < 0.30 ? GRASS1 :
          r < 0.50 ? GRASS2 :
          r < 0.65 ? GRASS3 :
          r < 0.80 ? GRASS4 :
          GRASS5
        );
      }
    }
  }
  return map;
}

// ════════════════════════════════════════════════════════
// ── MAP OBJECT INTERFACE ──
// ════════════════════════════════════════════════════════
export interface MapObject {
  x: number;
  y: number;
  tile: number;
  collision: boolean;
  interact?: string;
  data?: any;
  /** Which spritesheet — defaults to 'tiles' (Kenney) */
  sheet?: string;
}

// ════════════════════════════════════════════════════════
// ── OBJECT GENERATION ──
// ════════════════════════════════════════════════════════
export function getTownObjects(): MapObject[] {
  const objs: MapObject[] = [];
  const rng = seededRandom(77);

  // ════════════════════════════════════════════════════
  // ── BORDER TREES — dense forest perimeter ──
  // ════════════════════════════════════════════════════

  // Top border (2 rows deep)
  for (let x = 0; x < W; x++) {
    objs.push({ x, y: 0, tile: PINE, collision: true });
    const t = rng() > 0.5 ? TREE : (rng() > 0.5 ? TREE2 : PINE);
    objs.push({ x, y: 1, tile: t, collision: true });
    // Occasional third row for density
    if (x % 4 !== 2) {
      objs.push({ x, y: 2, tile: rng() > 0.6 ? BUSH : PINE, collision: true });
    }
  }

  // Bottom border (2 rows, accounting for pond area)
  for (let x = 0; x < W; x++) {
    objs.push({ x, y: 29, tile: PINE, collision: true });
    // Skip second row where pond sand/water is
    if (!waterMask[28]?.[x] && !sandMask[28]?.[x]) {
      objs.push({ x, y: 28, tile: rng() > 0.5 ? TREE : PINE, collision: true });
    }
  }

  // Left border
  for (let y = 2; y < 28; y++) {
    objs.push({ x: 0, y, tile: PINE, collision: true });
    if (y % 2 === 0) {
      objs.push({ x: 1, y, tile: rng() > 0.4 ? TREE : TREE2, collision: true });
    } else {
      objs.push({ x: 1, y, tile: BUSH, collision: true });
    }
  }

  // Right border — gap for forest exit at y 13-17
  for (let y = 2; y < 28; y++) {
    if (y >= 13 && y <= 17) continue; // Forest exit opening
    objs.push({ x: 39, y, tile: PINE, collision: true });
    if (y % 2 === 0) {
      objs.push({ x: 38, y, tile: rng() > 0.5 ? TREE : BUSH, collision: true });
    } else if (!(y >= 11 && y <= 19)) {
      objs.push({ x: 38, y, tile: PINE, collision: true });
    }
  }

  // ════════════════════════════════════════════════════
  // ── TREE CLUSTERS — organic forest patches ──
  // ════════════════════════════════════════════════════

  // Northwest forest cluster (above elder, dense)
  const nwTrees: [number, number][] = [
    [3, 3], [4, 3], [5, 3], [3, 4], [5, 4], [2, 5],
    [3, 5], [14, 3], [15, 3], [14, 4], [13, 5],
  ];
  nwTrees.forEach(([x, y]) => {
    objs.push({ x, y, tile: rng() > 0.5 ? TREE : PINE, collision: true });
  });

  // Northeast forest cluster (above merchant)
  const neTrees: [number, number][] = [
    [36, 3], [37, 3], [36, 4], [37, 4], [35, 5],
    [24, 3], [25, 3], [25, 4],
  ];
  neTrees.forEach(([x, y]) => {
    objs.push({ x, y, tile: rng() > 0.4 ? PINE : TREE2, collision: true });
  });

  // Southwest cluster (left of inn)
  const swTrees: [number, number][] = [
    [2, 18], [3, 17], [3, 18], [2, 19], [3, 26], [4, 26],
    [2, 25], [2, 26],
  ];
  swTrees.forEach(([x, y]) => {
    objs.push({ x, y, tile: rng() > 0.5 ? TREE : TREE2, collision: true });
  });

  // Southeast cluster (right of training hall, around pond)
  const seTrees: [number, number][] = [
    [36, 20], [37, 20], [36, 21], [37, 22],
    [36, 25], [37, 25], [37, 26],
  ];
  seTrees.forEach(([x, y]) => {
    objs.push({ x, y, tile: rng() > 0.3 ? PINE : TREE, collision: true });
  });

  // Mid-map lone trees for visual interest
  objs.push({ x: 13, y: 15, tile: TREE, collision: true });
  objs.push({ x: 26, y: 15, tile: TREE2, collision: true });
  objs.push({ x: 8, y: 16, tile: PINE, collision: true });

  // Cluster between paths (south area)
  const midSouthTrees: [number, number][] = [
    [5, 15], [6, 15], [5, 16], [6, 17],
    [34, 15], [35, 16],
  ];
  midSouthTrees.forEach(([x, y]) => {
    objs.push({ x, y, tile: rng() > 0.5 ? TREE : PINE, collision: true });
  });

  // Pond-side trees and bushes
  objs.push({ x: 12, y: 26, tile: TREE, collision: true });
  objs.push({ x: 12, y: 27, tile: BUSH, collision: true });
  objs.push({ x: 18, y: 27, tile: TREE2, collision: true });
  objs.push({ x: 17, y: 28, tile: BUSH, collision: true });
  objs.push({ x: 13, y: 25, tile: BUSH, collision: true });

  // ════════════════════════════════════════════════════
  // ── BUSHES — scattered decoration ──
  // ════════════════════════════════════════════════════
  const bushSpots: [number, number][] = [
    [6, 6], [7, 13], [4, 12], [14, 11],
    [33, 6], [35, 8], [25, 11],
    [4, 22], [3, 21],
    [33, 24], [34, 23],
    [15, 19], [24, 19],
    [8, 8], [32, 8],
  ];
  bushSpots.forEach(([x, y]) => {
    objs.push({ x, y, tile: BUSH, collision: true });
  });

  // ════════════════════════════════════════════════════
  // ── ELDER FROST'S TOWER (northwest) ──
  // ════════════════════════════════════════════════════

  // Roof — 2 rows with L/M/R tiles for proper appearance
  objs.push({ x: 6, y: 5, tile: ROOF_L, collision: true });
  for (let x = 7; x <= 11; x++) {
    objs.push({ x, y: 5, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 12, y: 5, tile: ROOF_R, collision: true });
  objs.push({ x: 6, y: 6, tile: ROOF_L, collision: true });
  for (let x = 7; x <= 11; x++) {
    objs.push({ x, y: 6, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 12, y: 6, tile: ROOF_R, collision: true });

  // Walls — front and sides
  for (let x = 7; x <= 11; x++) {
    objs.push({ x, y: 9, tile: WALL_H, collision: true });
  }
  for (let y = 7; y <= 8; y++) {
    objs.push({ x: 7, y, tile: WALL_V, collision: true });
    objs.push({ x: 11, y, tile: WALL_V, collision: true });
  }
  // Corners
  objs.push({ x: 7, y: 9, tile: WALL_C, collision: true });
  objs.push({ x: 11, y: 9, tile: WALL_C, collision: true });

  // Windows — two on front, one on each side
  objs.push({ x: 8, y: 7, tile: WINDOW, collision: true });
  objs.push({ x: 10, y: 7, tile: WINDOW, collision: true });
  objs.push({ x: 8, y: 8, tile: WINDOW, collision: true });
  objs.push({ x: 10, y: 8, tile: WINDOW, collision: true });

  // Door
  objs.push({ x: 9, y: 9, tile: DOOR, collision: false, interact: 'elder_house' });

  // Torches flanking door
  objs.push({ x: 8, y: 9, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 10, y: 9, tile: TORCH, collision: false, data: { torch: true } });

  // Props around elder's tower
  objs.push({ x: 6, y: 10, tile: BARREL, collision: true });
  objs.push({ x: 7, y: 10, tile: BARREL, collision: true });
  objs.push({ x: 12, y: 7, tile: CHEST, collision: true });
  objs.push({ x: 12, y: 8, tile: BARREL, collision: true });

  // Flower garden beside elder's tower
  objs.push({ x: 6, y: 7, tile: FLOWER, collision: false });
  objs.push({ x: 6, y: 8, tile: FLOWER, collision: false });
  objs.push({ x: 5, y: 7, tile: FLOWER, collision: false });
  objs.push({ x: 13, y: 6, tile: FLOWER, collision: false });
  objs.push({ x: 13, y: 7, tile: FLOWER, collision: false });

  // Fence line near elder (using wall tiles as fence posts)
  objs.push({ x: 5, y: 10, tile: WALL_V, collision: true });
  objs.push({ x: 5, y: 11, tile: WALL_V, collision: true });
  objs.push({ x: 13, y: 10, tile: WALL_V, collision: true });
  objs.push({ x: 13, y: 11, tile: WALL_V, collision: true });

  // Elder NPC
  objs.push({
    x: 9, y: 10, tile: tileIndex(45, 0), collision: true,
    interact: 'npc', data: { id: 'elder', name: 'Elder Frost' },
  });

  // ════════════════════════════════════════════════════
  // ── MERCHANT BJORN'S SHOP (northeast) ──
  // ════════════════════════════════════════════════════

  // Roof — 2 rows with L/M/R
  objs.push({ x: 27, y: 5, tile: ROOF_L, collision: true });
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 5, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 34, y: 5, tile: ROOF_R, collision: true });
  objs.push({ x: 27, y: 6, tile: ROOF_L, collision: true });
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 6, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 34, y: 6, tile: ROOF_R, collision: true });

  // Walls
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 9, tile: WALL_H, collision: true });
  }
  for (let y = 7; y <= 8; y++) {
    objs.push({ x: 28, y, tile: WALL_V, collision: true });
    objs.push({ x: 33, y, tile: WALL_V, collision: true });
  }
  objs.push({ x: 28, y: 9, tile: WALL_C, collision: true });
  objs.push({ x: 33, y: 9, tile: WALL_C, collision: true });

  // Windows — shop display (3 windows)
  objs.push({ x: 29, y: 7, tile: WINDOW, collision: true });
  objs.push({ x: 31, y: 7, tile: WINDOW, collision: true });
  objs.push({ x: 32, y: 7, tile: WINDOW, collision: true });
  objs.push({ x: 29, y: 8, tile: WINDOW, collision: true });
  objs.push({ x: 31, y: 8, tile: WINDOW, collision: true });

  // Door
  objs.push({ x: 30, y: 9, tile: DOOR, collision: false, interact: 'shop' });

  // Torches
  objs.push({ x: 29, y: 9, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 31, y: 9, tile: TORCH, collision: false, data: { torch: true } });

  // Shop goods — market stall arrangement (barrels, chests as display)
  objs.push({ x: 27, y: 10, tile: BARREL, collision: true });
  objs.push({ x: 28, y: 10, tile: BARREL, collision: true });
  objs.push({ x: 33, y: 10, tile: BARREL, collision: true });
  objs.push({ x: 34, y: 10, tile: BARREL, collision: true });
  objs.push({ x: 34, y: 7, tile: CHEST, collision: true });
  objs.push({ x: 34, y: 8, tile: CHEST, collision: true });

  // Market stalls — extended goods area near shop
  objs.push({ x: 26, y: 11, tile: BARREL, collision: true });
  objs.push({ x: 27, y: 11, tile: CHEST, collision: true });
  objs.push({ x: 26, y: 12, tile: BARREL, collision: true });
  objs.push({ x: 27, y: 12, tile: BARREL, collision: true });

  // Flowers near shop entrance
  objs.push({ x: 27, y: 7, tile: FLOWER, collision: false });
  objs.push({ x: 27, y: 8, tile: FLOWER, collision: false });
  objs.push({ x: 35, y: 7, tile: FLOWER, collision: false });

  // Merchant NPC
  objs.push({
    x: 30, y: 10, tile: tileIndex(43, 1), collision: true,
    interact: 'npc', data: { id: 'merchant', name: 'Merchant Bjorn' },
  });

  // ════════════════════════════════════════════════════
  // ── INN (southwest) ──
  // ════════════════════════════════════════════════════

  // Roof — 2 rows with L/M/R
  objs.push({ x: 4, y: 19, tile: ROOF_L, collision: true });
  for (let x = 5; x <= 9; x++) {
    objs.push({ x, y: 19, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 10, y: 19, tile: ROOF_R, collision: true });
  objs.push({ x: 4, y: 20, tile: ROOF_L, collision: true });
  for (let x = 5; x <= 9; x++) {
    objs.push({ x, y: 20, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 10, y: 20, tile: ROOF_R, collision: true });

  // Walls
  for (let x = 5; x <= 9; x++) {
    objs.push({ x, y: 23, tile: WALL_H, collision: true });
  }
  for (let y = 21; y <= 22; y++) {
    objs.push({ x: 5, y, tile: WALL_V, collision: true });
    objs.push({ x: 9, y, tile: WALL_V, collision: true });
  }
  objs.push({ x: 5, y: 23, tile: WALL_C, collision: true });
  objs.push({ x: 9, y: 23, tile: WALL_C, collision: true });

  // Windows
  objs.push({ x: 6, y: 21, tile: WINDOW, collision: true });
  objs.push({ x: 8, y: 21, tile: WINDOW, collision: true });
  objs.push({ x: 6, y: 22, tile: WINDOW, collision: true });
  objs.push({ x: 8, y: 22, tile: WINDOW, collision: true });

  // Door
  objs.push({ x: 7, y: 23, tile: DOOR, collision: false, interact: 'inn' });

  // Torches
  objs.push({ x: 6, y: 23, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 8, y: 23, tile: TORCH, collision: false, data: { torch: true } });

  // Inn props
  objs.push({ x: 4, y: 21, tile: BARREL, collision: true });
  objs.push({ x: 10, y: 21, tile: BARREL, collision: true });
  objs.push({ x: 10, y: 22, tile: BARREL, collision: true });

  // Inn flower garden
  objs.push({ x: 4, y: 23, tile: FLOWER, collision: false });
  objs.push({ x: 4, y: 24, tile: FLOWER, collision: false });
  objs.push({ x: 10, y: 23, tile: FLOWER, collision: false });
  objs.push({ x: 11, y: 22, tile: FLOWER, collision: false });

  // ════════════════════════════════════════════════════
  // ── TRAINING HALL / BARRACKS (southeast) ──
  // ════════════════════════════════════════════════════

  // Roof — 2 rows with L/M/R (larger building: 7 wide)
  objs.push({ x: 27, y: 20, tile: ROOF_L, collision: true });
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 20, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 34, y: 20, tile: ROOF_R, collision: true });
  objs.push({ x: 27, y: 21, tile: ROOF_L, collision: true });
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 21, tile: ROOF_M, collision: true });
  }
  objs.push({ x: 34, y: 21, tile: ROOF_R, collision: true });

  // Walls
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 24, tile: WALL_H, collision: true });
  }
  for (let y = 22; y <= 23; y++) {
    objs.push({ x: 28, y, tile: WALL_V, collision: true });
    objs.push({ x: 33, y, tile: WALL_V, collision: true });
  }
  objs.push({ x: 28, y: 24, tile: WALL_C, collision: true });
  objs.push({ x: 33, y: 24, tile: WALL_C, collision: true });

  // Windows
  objs.push({ x: 29, y: 22, tile: WINDOW, collision: true });
  objs.push({ x: 31, y: 22, tile: WINDOW, collision: true });
  objs.push({ x: 32, y: 22, tile: WINDOW, collision: true });
  objs.push({ x: 29, y: 23, tile: WINDOW, collision: true });
  objs.push({ x: 32, y: 23, tile: WINDOW, collision: true });

  // Door
  objs.push({ x: 30, y: 24, tile: DOOR, collision: false, interact: 'training_hall' });

  // Torches
  objs.push({ x: 29, y: 24, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 31, y: 24, tile: TORCH, collision: false, data: { torch: true } });

  // Training hall props — weapon racks (barrels), practice dummies area
  objs.push({ x: 27, y: 22, tile: BARREL, collision: true });
  objs.push({ x: 27, y: 23, tile: BARREL, collision: true });
  objs.push({ x: 34, y: 22, tile: CHEST, collision: true });
  objs.push({ x: 34, y: 23, tile: BARREL, collision: true });
  objs.push({ x: 35, y: 24, tile: BARREL, collision: true });

  // Training yard rocks
  objs.push({ x: 28, y: 25, tile: ROCK, collision: true });
  objs.push({ x: 33, y: 25, tile: ROCK, collision: true });

  // Fence around training yard
  for (let x = 27; x <= 34; x += 2) {
    objs.push({ x, y: 26, tile: WALL_V, collision: true });
  }

  // ════════════════════════════════════════════════════
  // ── TOWN SQUARE — center plaza with fountain ──
  // ════════════════════════════════════════════════════

  // Fountain/well — nicer pattern with surrounding flowers
  // Center water feature at (19-20, 15-16)
  objs.push({ x: 19, y: 15, tile: ROCK, collision: true });
  objs.push({ x: 20, y: 15, tile: ROCK, collision: true });
  objs.push({ x: 19, y: 16, tile: ROCK, collision: true });
  objs.push({ x: 20, y: 16, tile: ROCK, collision: true });

  // Flower ring around fountain
  objs.push({ x: 18, y: 14, tile: FLOWER, collision: false });
  objs.push({ x: 19, y: 14, tile: FLOWER, collision: false });
  objs.push({ x: 20, y: 14, tile: FLOWER, collision: false });
  objs.push({ x: 21, y: 14, tile: FLOWER, collision: false });
  objs.push({ x: 18, y: 15, tile: FLOWER, collision: false });
  objs.push({ x: 21, y: 15, tile: FLOWER, collision: false });
  objs.push({ x: 18, y: 16, tile: FLOWER, collision: false });
  objs.push({ x: 21, y: 16, tile: FLOWER, collision: false });
  objs.push({ x: 18, y: 17, tile: FLOWER, collision: false });
  objs.push({ x: 19, y: 17, tile: FLOWER, collision: false });
  objs.push({ x: 20, y: 17, tile: FLOWER, collision: false });
  objs.push({ x: 21, y: 17, tile: FLOWER, collision: false });

  // Plaza torches (4 corners)
  objs.push({ x: 16, y: 12, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 23, y: 12, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 16, y: 18, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 23, y: 18, tile: TORCH, collision: false, data: { torch: true } });

  // Extra plaza torches along east road
  objs.push({ x: 27, y: 14, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 32, y: 14, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 36, y: 14, tile: TORCH, collision: false, data: { torch: true } });

  // Benches around the plaza (using barrel tiles)
  objs.push({ x: 15, y: 15, tile: BARREL, collision: true });
  objs.push({ x: 15, y: 16, tile: BARREL, collision: true });
  objs.push({ x: 24, y: 15, tile: BARREL, collision: true });
  objs.push({ x: 24, y: 16, tile: BARREL, collision: true });

  // ════════════════════════════════════════════════════
  // ── DECORATIVE ROCKS ──
  // ════════════════════════════════════════════════════

  const rockSpots: [number, number][] = [
    [14, 22], [25, 22], [8, 18], [32, 18],
    [15, 6], [24, 6], [3, 14], [36, 14],
    [12, 24], [20, 28],
  ];
  rockSpots.forEach(([x, y]) => {
    objs.push({ x, y, tile: ROCK, collision: true });
  });

  // ════════════════════════════════════════════════════
  // ── DECORATIVE FLOWERS — gardens and scattered ──
  // ════════════════════════════════════════════════════

  // Path-side flowers
  const flowerSpots: [number, number][] = [
    // Along south road
    [18, 20], [22, 20], [18, 22], [22, 22],
    // Near spawn clearing
    [17, 25], [23, 25], [17, 26], [23, 26],
    // Between buildings
    [15, 9], [16, 9], [23, 9], [24, 9],
    // Random meadow flowers
    [7, 15], [8, 17], [32, 17], [33, 16],
    [25, 25], [26, 26],
  ];
  flowerSpots.forEach(([x, y]) => {
    objs.push({ x, y, tile: FLOWER, collision: false });
  });

  // ════════════════════════════════════════════════════
  // ── POND DECORATION (southeast of town) ──
  // ════════════════════════════════════════════════════

  // Rocks at pond edges
  objs.push({ x: 13, y: 26, tile: ROCK, collision: true });
  objs.push({ x: 16, y: 25, tile: ROCK, collision: true });
  objs.push({ x: 17, y: 27, tile: ROCK, collision: true });

  // Flowers near pond
  objs.push({ x: 12, y: 25, tile: FLOWER, collision: false });
  objs.push({ x: 17, y: 26, tile: FLOWER, collision: false });
  objs.push({ x: 15, y: 24, tile: FLOWER, collision: false });
  objs.push({ x: 16, y: 28, tile: FLOWER, collision: false });

  // ════════════════════════════════════════════════════
  // ── SIGNPOSTS — near exits and key locations ──
  // ════════════════════════════════════════════════════

  // Signpost near forest exit (east)
  objs.push({ x: 37, y: 13, tile: WALL_V, collision: true, data: { sign: 'Frostwood Forest ->' } });
  // Signpost near spawn/entrance (south)
  objs.push({ x: 20, y: 27, tile: WALL_V, collision: true, data: { sign: 'Town Square ^' } });
  // Signpost at crossroads (plaza edge)
  objs.push({ x: 15, y: 14, tile: WALL_V, collision: true, data: { sign: '<- Elder | Shop ->' } });

  // ════════════════════════════════════════════════════
  // ── PATH TORCHES — lighting along roads ──
  // ════════════════════════════════════════════════════

  // South road torches
  objs.push({ x: 18, y: 21, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 22, y: 21, tile: TORCH, collision: false, data: { torch: true } });

  // Northwest path torches
  objs.push({ x: 12, y: 14, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 12, y: 10, tile: TORCH, collision: false, data: { torch: true } });

  // Southeast path torches
  objs.push({ x: 26, y: 20, tile: TORCH, collision: false, data: { torch: true } });

  // ════════════════════════════════════════════════════
  // ── FOREST EXIT (east edge) ──
  // ════════════════════════════════════════════════════

  objs.push({ x: 38, y: 14, tile: tileIndex(37, 17), collision: false, interact: 'exit_forest' });
  objs.push({ x: 38, y: 15, tile: tileIndex(37, 17), collision: false, interact: 'exit_forest' });
  objs.push({ x: 38, y: 16, tile: tileIndex(37, 17), collision: false, interact: 'exit_forest' });

  // Exit archway trees framing the gap
  objs.push({ x: 37, y: 12, tile: PINE, collision: true });
  objs.push({ x: 38, y: 12, tile: PINE, collision: true });
  objs.push({ x: 37, y: 18, tile: PINE, collision: true });
  objs.push({ x: 38, y: 18, tile: PINE, collision: true });

  // Torches at forest exit
  objs.push({ x: 37, y: 14, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 37, y: 16, tile: TORCH, collision: false, data: { torch: true } });

  return objs;
}

// ════════════════════════════════════════════════════════
// ── SPAWN POINT ──
// ════════════════════════════════════════════════════════
export const TOWN_SPAWN = { x: 20, y: 22 };
