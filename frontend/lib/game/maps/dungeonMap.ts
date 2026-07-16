import { tileIndex } from '../config';

// ── Ninja-interior tile index helper (22 cols per row, 0 spacing) ──
const NI_COLS = 22;
function ni(col: number, row: number): number {
  return row * NI_COLS + col;
}

// ── Ground tiles (ninja-interior) ──
// Row 7-9 right = gray-green dungeon stone (#778570, #5f7160)
const DFLOOR1 = ni(12, 7); // gray-green stone
const DFLOOR2 = ni(13, 7); // stone variant
const DFLOOR3 = ni(14, 7); // stone variant 2
const DFLOOR_CRACK = ni(19, 7); // darker variant (#5f7160)
const DFLOOR_DARK = ni(11, 7); // darkest stone — near walls
const DFLOORS = [DFLOOR1, DFLOOR2, DFLOOR3];

// ── Kenney 'tiles' spritesheet props ──
const DWALL  = tileIndex(0, 6);
const TORCH  = tileIndex(3, 6);
const CHEST  = tileIndex(4, 6);
const BARREL = tileIndex(5, 6);
const SKULL  = tileIndex(44, 1); // skull decoration
const ROCK   = tileIndex(8, 0);  // rubble / bone pile

const DW = 20;
const DH = 20;

// ── Seeded RNG for deterministic map ──
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ── Room layout definition ──
// 1 = wall, 0 = open floor
// Room 1 (south, y=13-19): L-shaped entry room with alcoves
// Corridor 1 (y=11-12): narrow 3-wide offset corridor
// Room 2 (middle, y=6-10): wide pillar hall
// Corridor 2 (y=4-5): narrow 2-wide corridor, offset left
// Room 3 (north, y=0-3): circular boss arena with skull border

function isWall(x: number, y: number): boolean {
  // Outer border
  if (x === 0 || x === DW - 1 || y === 0 || y === DH - 1) {
    // Exit gap at bottom
    if (y === DH - 1 && x >= 8 && x <= 11) return false;
    return true;
  }

  // ═══════════════════════════════════════
  // ROOM 1 — L-shaped entry (y=13..19)
  // ═══════════════════════════════════════
  // South wall with exit gap is handled by border above.
  // Room 1 north wall at y=13, with alcoves
  if (y === 13) {
    // Main wall at y=13 with a passage at x=12..14 (offset right corridor)
    if (x >= 12 && x <= 14) return false; // corridor opening
    return true;
  }
  // Western alcove wall — creates a small nook at (1-3, 14-16)
  if (y >= 14 && y <= 16 && x === 4) return true; // alcove east wall
  if (y === 16 && x >= 1 && x <= 3) return true;  // alcove south wall (partial)
  // Eastern alcove — hidden chest nook
  if (y >= 14 && y <= 16 && x === 16) return true; // alcove west wall
  if (y === 16 && x >= 17 && x <= 18) return true; // alcove south wall

  // ═══════════════════════════════════════
  // CORRIDOR 1 — offset right (y=11..12, x=12..14)
  // ═══════════════════════════════════════
  if (y === 11 || y === 12) {
    if (x >= 12 && x <= 14) return false; // corridor open
    return true; // everything else is wall
  }

  // ═══════════════════════════════════════
  // ROOM 2 — pillar hall (y=6..10)
  // ═══════════════════════════════════════
  // Room 2 south wall at y=10, opening at x=12..14 (from corridor)
  if (y === 10) {
    if (x >= 12 && x <= 14) return false;
    return true;
  }
  // Room 2 north wall at y=6, opening at x=5..7 (offset left corridor to boss)
  if (y === 6) {
    if (x >= 5 && x <= 7) return false;
    return true;
  }
  // Pillars inside room 2 (1x1 wall tiles) — symmetrical pattern
  if (y === 8 && (x === 4 || x === 8 || x === 11 || x === 15)) return true;
  if (y === 9 && (x === 4 || x === 8 || x === 11 || x === 15)) return true;

  // ═══════════════════════════════════════
  // CORRIDOR 2 — offset left (y=4..5, x=5..7)
  // ═══════════════════════════════════════
  if (y === 4 || y === 5) {
    if (x >= 5 && x <= 7) return false; // corridor open
    return true;
  }

  // ═══════════════════════════════════════
  // ROOM 3 — boss arena (y=1..3)
  // ═══════════════════════════════════════
  // Circular-ish arena — carve out more space by removing corners
  if (y >= 1 && y <= 3) {
    // Cut corners to make it feel rounded
    if (y === 1 && (x === 1 || x === 18)) return true; // top corners
    if (y === 3 && (x === 1 || x === 18)) return true; // bottom corners
    // Opening from corridor at x=5..7, y=3
    // Rest is open
    return false;
  }

  return false;
}

// ── Ground generation with variety ──
export function generateDungeonGround(): number[] {
  const rng = seededRandom(789);
  const map: number[] = [];

  for (let y = 0; y < DH; y++) {
    for (let x = 0; x < DW; x++) {
      if (isWall(x, y)) {
        // Walls get dark stone underneath
        map.push(DFLOOR_DARK);
        continue;
      }

      // Boss room (y=1..3): alternating checkerboard pattern
      if (y >= 1 && y <= 3) {
        if ((x + y) % 2 === 0) {
          map.push(DFLOOR_DARK);
        } else {
          map.push(DFLOOR1);
        }
        continue;
      }

      // Corridor tiles — darker feel
      if ((y === 4 || y === 5) || (y === 11 || y === 12)) {
        map.push(rng() < 0.4 ? DFLOOR_DARK : DFLOOR_CRACK);
        continue;
      }

      // Near walls: use darker tiles (within 1 tile of any wall)
      const nearWall =
        isWall(x - 1, y) || isWall(x + 1, y) ||
        isWall(x, y - 1) || isWall(x, y + 1);
      if (nearWall && rng() < 0.5) {
        map.push(DFLOOR_DARK);
        continue;
      }

      // Water/hazard puddle in room 1 SW corner (x=5..7, y=17..18)
      if (x >= 5 && x <= 7 && y >= 17 && y <= 18) {
        map.push(DFLOOR_DARK);
        continue;
      }

      // Cracked floor scattered randomly
      const r = rng();
      if (r < 0.08) {
        map.push(DFLOOR_CRACK);
      } else {
        map.push(DFLOORS[Math.floor(rng() * DFLOORS.length)]);
      }
    }
  }
  return map;
}

export interface DungeonObject {
  x: number; y: number; tile: number;
  collision: boolean; interact?: string; data?: any;
  /** Which spritesheet — defaults to 'tiles' (Kenney) */
  sheet?: string;
}

export function getDungeonObjects(): DungeonObject[] {
  const objs: DungeonObject[] = [];

  // ════════════════════════════════════════
  // WALLS — place wall tiles on every isWall cell
  // ════════════════════════════════════════
  for (let y = 0; y < DH; y++) {
    for (let x = 0; x < DW; x++) {
      if (isWall(x, y)) {
        objs.push({ x, y, tile: DWALL, collision: true });
      }
    }
  }

  // ════════════════════════════════════════
  // ROOM 1 — Entry room (y=14..18)
  // ════════════════════════════════════════

  // Torches along room 1 walls
  const r1Torches: [number, number][] = [
    [1, 14], [5, 14], [10, 14], [15, 14], [18, 14], // north wall inner side
    [1, 18], [5, 18], [14, 18], [18, 18],            // south sides
  ];
  r1Torches.forEach(([x, y]) =>
    objs.push({ x, y, tile: TORCH, collision: false, data: { torch: true } })
  );

  // Barrels in room 1 — scattered storage
  objs.push({ x: 7, y: 14, tile: BARREL, collision: true });
  objs.push({ x: 8, y: 14, tile: BARREL, collision: true });
  objs.push({ x: 9, y: 17, tile: BARREL, collision: true });
  objs.push({ x: 10, y: 17, tile: BARREL, collision: true });
  objs.push({ x: 11, y: 17, tile: BARREL, collision: true });

  // Western alcove (x=1..3, y=14..15) — rubble + skull
  objs.push({ x: 2, y: 14, tile: ROCK, collision: true });
  objs.push({ x: 3, y: 15, tile: SKULL, collision: false });
  objs.push({ x: 1, y: 15, tile: ROCK, collision: true });

  // Eastern alcove (x=17..18, y=14..15) — hidden chest!
  objs.push({ x: 17, y: 14, tile: BARREL, collision: true });
  objs.push({ x: 18, y: 15, tile: SKULL, collision: false });
  objs.push({
    x: 17, y: 15, tile: CHEST, collision: true,
    interact: 'chest', data: { id: 'dungeon_chest2', hidden: true },
  });

  // Water hazard skulls (x=5..7, y=17..18) — bone piles in the puddle
  objs.push({ x: 5, y: 17, tile: SKULL, collision: false });
  objs.push({ x: 7, y: 18, tile: ROCK, collision: true });
  objs.push({ x: 6, y: 17, tile: ROCK, collision: true });

  // ════════════════════════════════════════
  // CORRIDOR 1 (y=11..12, x=12..14) — torch-lined
  // ════════════════════════════════════════
  objs.push({ x: 12, y: 11, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 14, y: 11, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 12, y: 12, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 14, y: 12, tile: TORCH, collision: false, data: { torch: true } });

  // ════════════════════════════════════════
  // ROOM 2 — Pillar hall (y=7..9)
  // ════════════════════════════════════════

  // Torches on walls and near pillars
  const r2Torches: [number, number][] = [
    [1, 7], [6, 7], [9, 7], [13, 7], [18, 7],   // along north wall inner
    [1, 9], [6, 9], [9, 9], [13, 9], [18, 9],   // along south wall inner
    [3, 8], [16, 8],                               // flanking outer pillars
  ];
  r2Torches.forEach(([x, y]) =>
    objs.push({ x, y, tile: TORCH, collision: false, data: { torch: true } })
  );

  // Barrels — "storage area" in SE corner of room 2
  objs.push({ x: 17, y: 7, tile: BARREL, collision: true });
  objs.push({ x: 18, y: 7, tile: BARREL, collision: true });
  objs.push({ x: 17, y: 8, tile: BARREL, collision: true });
  objs.push({ x: 18, y: 8, tile: BARREL, collision: true });

  // Skulls on walls of room 2 — danger warnings
  objs.push({ x: 2, y: 7, tile: SKULL, collision: false });
  objs.push({ x: 14, y: 7, tile: SKULL, collision: false });
  objs.push({ x: 2, y: 9, tile: SKULL, collision: false });
  objs.push({ x: 14, y: 9, tile: SKULL, collision: false });

  // Rubble near pillars
  objs.push({ x: 5, y: 8, tile: ROCK, collision: true });
  objs.push({ x: 12, y: 8, tile: ROCK, collision: true });

  // Main chest — in room 2 center
  objs.push({
    x: 10, y: 8, tile: CHEST, collision: true,
    interact: 'chest', data: { id: 'dungeon_chest1' },
  });

  // ════════════════════════════════════════
  // CORRIDOR 2 (y=4..5, x=5..7) — torch-lined
  // ════════════════════════════════════════
  objs.push({ x: 5, y: 4, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 7, y: 4, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 5, y: 5, tile: TORCH, collision: false, data: { torch: true } });
  objs.push({ x: 7, y: 5, tile: TORCH, collision: false, data: { torch: true } });
  // Skull at corridor entrance as a warning
  objs.push({ x: 6, y: 5, tile: SKULL, collision: false });

  // ════════════════════════════════════════
  // ROOM 3 — Boss arena (y=1..3)
  // ════════════════════════════════════════

  // Ring of torches around the arena perimeter
  const r3Torches: [number, number][] = [
    [3, 1], [6, 1], [9, 1], [12, 1], [15, 1],   // top row
    [2, 2], [17, 2],                                // sides
    [3, 3], [9, 3], [15, 3],                       // bottom row (skip corridor opening)
  ];
  r3Torches.forEach(([x, y]) =>
    objs.push({ x, y, tile: TORCH, collision: false, data: { torch: true } })
  );

  // Skull decorations ringing the boss arena
  const r3Skulls: [number, number][] = [
    [2, 1], [5, 1], [8, 1], [11, 1], [14, 1], [17, 1], // top skull line
    [2, 3], [4, 3], [8, 3], [10, 3], [14, 3], [16, 3], // bottom skull line
    [1, 2], [18, 2],                                      // side skulls (inside corners)
  ];
  r3Skulls.forEach(([x, y]) =>
    objs.push({ x, y, tile: SKULL, collision: false })
  );

  // Rubble / bone piles in boss room corners
  objs.push({ x: 3, y: 2, tile: ROCK, collision: true });
  objs.push({ x: 16, y: 2, tile: ROCK, collision: true });
  objs.push({ x: 4, y: 1, tile: ROCK, collision: true });
  objs.push({ x: 13, y: 1, tile: ROCK, collision: true });

  // Boss — Frost Dragon
  objs.push({
    x: 10, y: 2, tile: tileIndex(43, 3), collision: true,
    interact: 'boss', data: { id: 'frost_dragon', name: 'Frost Dragon', type: 'dragon' },
  });

  // ════════════════════════════════════════
  // EXIT — forest exit at bottom
  // ════════════════════════════════════════
  objs.push({ x: 8, y: 19, tile: tileIndex(36, 18), collision: false, interact: 'exit_forest' });
  objs.push({ x: 9, y: 19, tile: tileIndex(36, 18), collision: false, interact: 'exit_forest' });
  objs.push({ x: 10, y: 19, tile: tileIndex(36, 18), collision: false, interact: 'exit_forest' });
  objs.push({ x: 11, y: 19, tile: tileIndex(36, 18), collision: false, interact: 'exit_forest' });

  return objs;
}

// ── Monsters — repositioned for new room layout ──
export const DUNGEON_MONSTERS = [
  // Room 1 monsters (y=14..18)
  { x: 12, y: 17, type: 'skeleton', tile: tileIndex(42, 2), level: 8 },
  { x: 15, y: 18, type: 'ghost',    tile: tileIndex(43, 2), level: 9 },
  { x: 8,  y: 15, type: 'skeleton', tile: tileIndex(42, 2), level: 10 },
  // Room 2 monsters (y=7..9)
  { x: 6,  y: 8,  type: 'demon',    tile: tileIndex(44, 2), level: 12 },
  { x: 14, y: 8,  type: 'spider',   tile: tileIndex(45, 2), level: 11 },
  { x: 10, y: 9,  type: 'ghost',    tile: tileIndex(43, 2), level: 13 },
];

export const DUNGEON_SIZE = DW;
export const DUNGEON_SPAWN = { x: 10, y: 18 };

export const BOSS_DATA = {
  type: 'frost_dragon',
  tile: tileIndex(43, 3),
  level: 20,
  maxHp: 300,
  hp: 300,
  atk: 35,
  def: 15,
  spd: 12,
  xpReward: 300,
  goldReward: 100,
};
