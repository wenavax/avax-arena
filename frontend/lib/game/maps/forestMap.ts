import { tileIndex } from '../config';

// ── Ninja-floor tile index helper (22 cols per row, 0 spacing) ──
const NF_COLS = 22;
function nf(col: number, row: number): number {
  return row * NF_COLS + col;
}

// ── Ground tiles (ninja-floor spritesheet) ──
// Light grass — row 12 left (#adbc3a lime green)
const GRASS_L1 = nf(0, 12);
const GRASS_L2 = nf(1, 12);
const GRASS_L3 = nf(2, 12);
const GRASS_L4 = nf(3, 12);
const GRASS_L5 = nf(4, 12);
const LIGHT_GRASS = [GRASS_L1, GRASS_L2, GRASS_L3, GRASS_L4, GRASS_L5];

// Dark grass — row 12 right (#74a334 darker green, forest canopy)
const GRASS_D1 = nf(11, 12);
const GRASS_D2 = nf(12, 12);
const GRASS_D3 = nf(13, 12);
const GRASS_D4 = nf(14, 12);
const DARK_GRASS = [GRASS_D1, GRASS_D2, GRASS_D3, GRASS_D4];

// Dirt — row 8 left (#bd7959 warm brown earth)
const DIRT1 = nf(1, 8);
const DIRT2 = nf(3, 8);
const DIRT3 = nf(4, 8);
const DIRT = [DIRT1, DIRT2, DIRT3];

// Stone — row 15 right (#816855 brown stone)
const STONE1 = nf(12, 15);
const STONE2 = nf(13, 15);
const STONE3 = nf(14, 15);
const STONE4 = nf(15, 15);
const COBBLE = [STONE1, STONE2, STONE3, STONE4];

// Water ground tiles — row 22 left (#b8dce5 light blue)
const WATER1 = nf(1, 22);
const WATER2 = nf(4, 22);
const WATER3 = nf(5, 22);
const WATER = [WATER1, WATER2, WATER3];

// ── Object tiles (Kenney 'tiles' spritesheet) ──
const TREE    = tileIndex(3, 0);
const TREE2   = tileIndex(4, 0);
const PINE    = tileIndex(5, 0);
const BUSH    = tileIndex(6, 0);
const FLOWER  = tileIndex(7, 0);
const ROCK    = tileIndex(8, 0);
const WATER_OBJ = tileIndex(0, 3);
const BRIDGE  = tileIndex(1, 3);

const W = 40;
const H = 40;

// ── Seeded RNG for deterministic generation ──
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ── Utility: distance from a point ──
function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// ── Stream definition (north-south, eastern side) ──
// Returns stream center X at given Y, or -1 if no stream at that Y
function streamCenterX(y: number): number {
  // Stream enters from top-right, curves slightly west, exits bottom-right
  if (y < 2 || y > 38) return -1;
  // Gentle S-curve
  const base = 31;
  const offset = Math.sin((y - 2) * 0.18) * 2.0 + Math.cos((y - 2) * 0.09) * 1.0;
  return base + offset;
}

function isStream(x: number, y: number): boolean {
  const cx = streamCenterX(y);
  if (cx < 0) return false;
  return Math.abs(x - cx) <= 1.2;
}

// ── Main path mask (dirt/cobble trails) ──
// Returns: 0 = not path, 1 = main path (dirt), 2 = cobble (intersection/bridge)
function buildPathMap(): number[][] {
  const pm: number[][] = [];
  for (let y = 0; y < H; y++) pm.push(new Array(W).fill(0));

  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      pm[y][x] = Math.max(pm[y][x], v);
    }
  };

  // Main east-west trail — winding with variable width
  // Enters from left (y~15), winds across, narrows near stream, crosses via bridge
  const trailCenterY = [
    15, 15, 15, 15, 14, 14, 14, 15, 15, 16,
    16, 16, 15, 15, 15, 14, 14, 15, 15, 15,
    16, 16, 16, 15, 15, 15, 14, 14, 15, 15,  // x=28-29 approach stream
    15, 15, 15, 15, 15, 16, 16, 16, 15, 15,
  ];

  for (let x = 0; x < W; x++) {
    const cy = trailCenterY[x];
    // Width varies: wider at intersections, narrow in forest
    const wide = (x < 3 || (x >= 17 && x <= 22) || (x >= 35));
    set(x, cy, 1);
    set(x, cy + 1, 1);
    if (wide) {
      set(x, cy - 1, 1);
      set(x, cy + 2, 1);
    }
  }

  // Bridge crossing over stream (cobble tiles)
  for (let x = 29; x <= 33; x++) {
    const cy = trailCenterY[x];
    if (isStream(x, cy) || isStream(x, cy + 1)) {
      set(x, cy, 2);
      set(x, cy + 1, 2);
    }
  }

  // North trail to dungeon — narrow, overgrown feel
  // Starts at intersection (~x=19, y=14), winds up to top edge (y=1, x=19)
  const northTrailX = [
    19, 19, 19, 20, 20, 19, 19, 18, 18, 19, 19, 19, 20, 19, 19
  ];
  for (let i = 0; i < northTrailX.length; i++) {
    const y = 13 - i;
    if (y < 0) break;
    const nx = northTrailX[i];
    set(nx, y, 1);
    // Only 1 tile wide most of the time — narrow overgrown path
    if (i % 3 === 0) set(nx + 1, y, 1);
  }

  // Intersection area — wider cobble
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      set(19 + dx, 14 + dy, 2);
    }
  }

  // Small widening near town exit
  for (let dy = -1; dy <= 2; dy++) {
    set(0, 14 + dy, 1);
    set(1, 14 + dy, 1);
  }

  return pm;
}

// ── Clearing definitions (open areas in spawn zones) ──
interface Clearing {
  cx: number; cy: number; r: number;
}
const CLEARINGS: Clearing[] = [
  // Spawn zone 1 (NW quadrant) — two small clearings
  { cx: 8,  cy: 7,  r: 3 },
  { cx: 14, cy: 9,  r: 2 },
  // Spawn zone 2 (NE quadrant) — one clearing
  { cx: 27, cy: 7,  r: 3 },
  // Spawn zone 3 (southern area) — three clearings
  { cx: 10, cy: 26, r: 3 },
  { cx: 22, cy: 30, r: 4 },
  { cx: 35, cy: 28, r: 2 },
];

function isInClearing(x: number, y: number): Clearing | null {
  for (const c of CLEARINGS) {
    if (dist(x, y, c.cx, c.cy) <= c.r) return c;
  }
  return null;
}

// ── Dense tree coverage mask ──
// true = tree can be placed here
function buildTreeMask(pathMap: number[][]): boolean[][] {
  const mask: boolean[][] = [];
  for (let y = 0; y < H; y++) mask.push(new Array(W).fill(true));

  // No trees on paths
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pathMap[y][x] > 0) {
        mask[y][x] = false;
        // Also clear 1 tile buffer around paths for walkability
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W) {
              mask[ny][nx] = false;
            }
          }
        }
      }
    }
  }

  // No trees in clearings
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isInClearing(x, y)) mask[y][x] = false;
    }
  }

  // No trees on stream
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isStream(x, y)) mask[y][x] = false;
    }
  }

  // Exit gaps: town exit left edge y=13-17
  for (let y = 12; y <= 18; y++) {
    mask[y][0] = false;
    mask[y][1] = false;
  }
  // Dungeon exit top edge x=17-21
  for (let x = 16; x <= 22; x++) {
    if (0 < H) mask[0][x] = false;
    if (1 < H) mask[1][x] = false;
  }

  return mask;
}

const pathMap = buildPathMap();
const treeMask = buildTreeMask(pathMap);

// ── Mud patches near stream ──
function isMudPatch(x: number, y: number, rng: () => number): boolean {
  const cx = streamCenterX(y);
  if (cx < 0) return false;
  const d = Math.abs(x - cx);
  return d > 1.2 && d < 3.5;
}

// ── Ground generation ──
export function generateForestGround(): number[] {
  const rng = seededRandom(456);
  const map: number[] = [];

  // Pre-compute stream proximity for mud
  const mudRng = seededRandom(789);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pv = pathMap[y][x];
      const clearing = isInClearing(x, y);
      const onStream = isStream(x, y);
      const nearStream = isMudPatch(x, y, mudRng);

      if (onStream) {
        // Water tiles for stream
        map.push(WATER[Math.floor(rng() * WATER.length)]);
      } else if (pv === 2) {
        // Cobblestone at intersections and bridges
        map.push(COBBLE[Math.floor(rng() * COBBLE.length)]);
      } else if (pv === 1) {
        // Dirt trail
        map.push(DIRT[Math.floor(rng() * DIRT.length)]);
      } else if (clearing) {
        // Clearing — lighter grass, occasional flower-grass
        const r = rng();
        if (dist(x, y, clearing.cx, clearing.cy) <= 1.5) {
          // Center of clearing: lightest grass
          map.push(r < 0.5 ? GRASS_L1 : GRASS_L2);
        } else {
          map.push(LIGHT_GRASS[Math.floor(r * LIGHT_GRASS.length)]);
        }
      } else if (nearStream) {
        // Muddy bank near stream
        const r = rng();
        map.push(r < 0.5 ? DIRT[Math.floor(r * 2 * DIRT.length)] : DARK_GRASS[Math.floor(rng() * DARK_GRASS.length)]);
      } else if (
        // Border area (3-4 tiles deep) — dark forest floor
        x < 4 || x >= W - 4 || y < 4 || y >= H - 4
      ) {
        map.push(DARK_GRASS[Math.floor(rng() * DARK_GRASS.length)]);
      } else if (treeMask[y][x]) {
        // Under tree canopy — dark grass
        const r = rng();
        // Mix: mostly dark, sometimes dirt patches
        if (r < 0.08) {
          map.push(DIRT[Math.floor(rng() * DIRT.length)]);
        } else if (r < 0.75) {
          map.push(DARK_GRASS[Math.floor(rng() * DARK_GRASS.length)]);
        } else {
          // Transitional lighter patches
          map.push(LIGHT_GRASS[Math.floor(rng() * LIGHT_GRASS.length)]);
        }
      } else {
        // Open ground between paths and clearings — mixed grass
        const r = rng();
        if (r < 0.55) {
          map.push(DARK_GRASS[Math.floor(rng() * DARK_GRASS.length)]);
        } else {
          map.push(LIGHT_GRASS[Math.floor(rng() * LIGHT_GRASS.length)]);
        }
      }
    }
  }
  return map;
}

// ── Object types ──
export interface ForestObject {
  x: number; y: number; tile: number;
  collision: boolean; interact?: string; data?: any;
  /** Which spritesheet — defaults to 'tiles' (Kenney) */
  sheet?: string;
}

export function getForestObjects(): ForestObject[] {
  const objs: ForestObject[] = [];
  const rng = seededRandom(1337);

  // ── Helper to add tree with collision ──
  const addTree = (x: number, y: number) => {
    const r = rng();
    const tile = r < 0.40 ? TREE : r < 0.70 ? TREE2 : PINE;
    objs.push({ x, y, tile, collision: true });
  };

  const addBush = (x: number, y: number) => {
    objs.push({ x, y, tile: BUSH, collision: true });
  };

  const addRock = (x: number, y: number) => {
    objs.push({ x, y, tile: ROCK, collision: true });
  };

  const addFlower = (x: number, y: number) => {
    objs.push({ x, y, tile: FLOWER, collision: false });
  };

  // ══════════════════════════════════════════
  // 1. BORDER WALL — 3-4 tiles deep impenetrable tree wall
  // ══════════════════════════════════════════

  // Top border (skip dungeon exit x=17-21 at y<=1)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < 4; y++) {
      if (x >= 16 && x <= 22 && y >= 0) {
        // Dungeon entrance gap — only fill y=0 sides
        if (y < 2 && (x < 17 || x > 21)) addTree(x, y);
        continue;
      }
      addTree(x, y);
    }
  }

  // Bottom border
  for (let x = 0; x < W; x++) {
    for (let y = H - 3; y < H; y++) {
      addTree(x, y);
    }
  }

  // Left border (skip town exit y=13-17)
  for (let y = 4; y < H - 3; y++) {
    for (let x = 0; x < 4; x++) {
      if (y >= 12 && y <= 18 && x < 2) continue; // town exit gap
      addTree(x, y);
    }
  }

  // Right border
  for (let y = 4; y < H - 3; y++) {
    for (let x = W - 3; x < W; x++) {
      // Stream overlaps right side — skip stream tiles
      if (isStream(x, y)) continue;
      addTree(x, y);
    }
  }

  // ══════════════════════════════════════════
  // 2. DENSE INTERIOR FOREST
  // Fill ~65% of remaining treeMask cells with trees
  // Arranged in organic clusters, not grid
  // ══════════════════════════════════════════

  // Pass 1: Place tree clusters using Poisson-like distribution
  const placed = new Set<string>();
  const isPlaced = (x: number, y: number) => placed.has(`${x},${y}`);
  const markPlaced = (x: number, y: number) => placed.add(`${x},${y}`);

  // Mark all border trees as placed
  for (const obj of objs) markPlaced(obj.x, obj.y);

  // Cluster seeds — scattered across the map
  const clusterSeeds: [number, number, number][] = []; // x, y, size
  for (let y = 4; y < H - 3; y += 3) {
    for (let x = 4; x < W - 3; x += 3) {
      if (!treeMask[y][x]) continue;
      if (rng() < 0.55) {
        const size = 1 + Math.floor(rng() * 3); // 1-3 radius cluster
        clusterSeeds.push([x, y, size]);
      }
    }
  }

  // Expand clusters
  for (const [cx, cy, size] of clusterSeeds) {
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (!treeMask[ny][nx]) continue;
        if (isPlaced(nx, ny)) continue;
        // Organic shape: skip corners randomly
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > size + 1) continue;
        if (d === size + 1 && rng() < 0.6) continue;
        if (rng() < 0.15) continue; // Random gaps within cluster for organic feel

        // Mix of trees and occasional bush
        const r = rng();
        if (r < 0.85) {
          addTree(nx, ny);
        } else {
          addBush(nx, ny);
        }
        markPlaced(nx, ny);
      }
    }
  }

  // Pass 2: Fill remaining treeMask spots with scattered individual trees
  for (let y = 4; y < H - 3; y++) {
    for (let x = 4; x < W - 3; x++) {
      if (!treeMask[y][x]) continue;
      if (isPlaced(x, y)) continue;
      if (rng() < 0.35) {
        addTree(x, y);
        markPlaced(x, y);
      }
    }
  }

  // ══════════════════════════════════════════
  // 3. STREAM DECORATIONS — rocks along banks
  // ══════════════════════════════════════════

  for (let y = 3; y < H - 3; y++) {
    const cx = streamCenterX(y);
    if (cx < 0) continue;

    // Rocks on stream banks
    for (const side of [-2, -3, 2, 3]) {
      const rx = Math.round(cx + side);
      if (rx < 0 || rx >= W) continue;
      if (pathMap[y]?.[rx] > 0) continue; // dont block path
      if (isPlaced(rx, y)) continue;
      if (rng() < 0.25) {
        addRock(rx, y);
        markPlaced(rx, y);
      }
    }
  }

  // Bridge objects on stream crossing (decorative markers)
  const bridgeY = 15; // main trail Y at stream
  for (let x = 29; x <= 33; x++) {
    if (isStream(x, bridgeY) || isStream(x, bridgeY + 1)) {
      objs.push({ x, y: bridgeY, tile: BRIDGE, collision: false });
      objs.push({ x, y: bridgeY + 1, tile: BRIDGE, collision: false });
    }
  }

  // ══════════════════════════════════════════
  // 4. CLEARING DECORATIONS — flowers, mushrooms, light bushes
  // ══════════════════════════════════════════

  for (const c of CLEARINGS) {
    // Ring of flowers around clearing edge
    for (let y = c.cy - c.r - 1; y <= c.cy + c.r + 1; y++) {
      for (let x = c.cx - c.r - 1; x <= c.cx + c.r + 1; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        if (isPlaced(x, y)) continue;
        const d = dist(x, y, c.cx, c.cy);
        if (d >= c.r - 0.5 && d <= c.r + 0.5 && rng() < 0.4) {
          addFlower(x, y);
          markPlaced(x, y);
        }
        // Scattered flowers inside clearing
        if (d < c.r - 0.5 && rng() < 0.15) {
          addFlower(x, y);
          markPlaced(x, y);
        }
      }
    }

    // Occasional mushroom spot (flower tile) at clearing center
    if (rng() < 0.7) {
      const mx = c.cx + (rng() > 0.5 ? 1 : -1);
      const my = c.cy + (rng() > 0.5 ? 1 : -1);
      if (!isPlaced(mx, my)) {
        addFlower(mx, my);
        markPlaced(mx, my);
      }
    }
  }

  // ══════════════════════════════════════════
  // 5. ATMOSPHERE — scattered rocks, fallen logs, lone bushes
  // ══════════════════════════════════════════

  // Rocks scattered throughout (especially near paths)
  for (let y = 4; y < H - 3; y++) {
    for (let x = 4; x < W - 3; x++) {
      if (isPlaced(x, y)) continue;
      if (pathMap[y][x] > 0) continue;

      // Check if near path
      let nearPath = false;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < H && nx >= 0 && nx < W && pathMap[ny][nx] > 0) {
            nearPath = true;
          }
        }
      }

      if (nearPath && rng() < 0.06) {
        addRock(x, y);
        markPlaced(x, y);
      } else if (!nearPath && rng() < 0.01) {
        // Fallen log (use rock tile) in deep forest
        addRock(x, y);
        markPlaced(x, y);
      }
    }
  }

  // Lone bushes along path edges
  for (let y = 4; y < H - 3; y++) {
    for (let x = 4; x < W - 3; x++) {
      if (isPlaced(x, y)) continue;
      if (pathMap[y][x] > 0) continue;
      if (!treeMask[y][x]) {
        // In open areas near path, occasional bush
        let adjPath = false;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < H && nx >= 0 && nx < W && pathMap[ny][nx] > 0) {
            adjPath = true;
          }
        }
        if (adjPath && rng() < 0.08) {
          addBush(x, y);
          markPlaced(x, y);
        }
      }
    }
  }

  // North path overgrowth — bushes encroaching on the narrow dungeon trail
  for (let y = 2; y < 13; y++) {
    for (let x = 16; x <= 23; x++) {
      if (isPlaced(x, y)) continue;
      if (pathMap[y][x] > 0) continue;
      // Adjacent to north path
      let adjPath = false;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const ny = y + dy, nx = x + dx;
        if (ny >= 0 && ny < H && nx >= 0 && nx < W && pathMap[ny][nx] > 0) {
          adjPath = true;
        }
      }
      if (adjPath && rng() < 0.25) {
        addBush(x, y);
        markPlaced(x, y);
      }
    }
  }

  // ══════════════════════════════════════════
  // 6. EXIT MARKERS
  // ══════════════════════════════════════════

  // Exit to town (left edge) — arrow markers
  objs.push({ x: 0, y: 14, tile: tileIndex(35, 17), collision: false, interact: 'exit_town' });
  objs.push({ x: 0, y: 15, tile: tileIndex(35, 17), collision: false, interact: 'exit_town' });
  objs.push({ x: 0, y: 16, tile: tileIndex(35, 17), collision: false, interact: 'exit_town' });

  // Exit to dungeon (top) — arrow marker
  objs.push({ x: 19, y: 1, tile: tileIndex(36, 16), collision: false, interact: 'exit_dungeon' });
  objs.push({ x: 20, y: 1, tile: tileIndex(36, 16), collision: false, interact: 'exit_dungeon' });

  return objs;
}

// ══════════════════════════════════════════
// SPAWN ZONES
// ══════════════════════════════════════════

export interface SpawnZone {
  x: number; y: number; w: number; h: number;
  monsters: { type: string; tile: number; weight: number }[];
  maxActive: number;
  level: [number, number];
}

export const FOREST_SPAWNS: SpawnZone[] = [
  {
    // Zone 1: NW forest — lighter enemies around clearing at (8,7)
    x: 3, y: 5, w: 15, h: 8,
    monsters: [
      { type: 'skeleton', tile: tileIndex(42, 2), weight: 50 },
      { type: 'slime',    tile: tileIndex(42, 3), weight: 30 },
      { type: 'bat',      tile: tileIndex(46, 2), weight: 20 },
    ],
    maxActive: 4, level: [1, 5],
  },
  {
    // Zone 2: NE forest — mid-tier enemies around clearing at (27,7)
    x: 22, y: 5, w: 15, h: 8,
    monsters: [
      { type: 'skeleton', tile: tileIndex(42, 2), weight: 40 },
      { type: 'spider',   tile: tileIndex(45, 2), weight: 30 },
      { type: 'ghost',    tile: tileIndex(43, 2), weight: 30 },
    ],
    maxActive: 4, level: [3, 8],
  },
  {
    // Zone 3: Southern deep forest — tougher enemies, larger area
    x: 3, y: 20, w: 34, h: 15,
    monsters: [
      { type: 'skeleton', tile: tileIndex(42, 2), weight: 30 },
      { type: 'spider',   tile: tileIndex(45, 2), weight: 25 },
      { type: 'ogre',     tile: tileIndex(44, 3), weight: 20 },
      { type: 'ghost',    tile: tileIndex(43, 2), weight: 25 },
    ],
    maxActive: 6, level: [5, 12],
  },
];

export const FOREST_SPAWN = { x: 1, y: 15 };
