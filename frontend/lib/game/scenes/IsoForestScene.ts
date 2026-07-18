import * as Phaser from 'phaser';
import { IsoBaseScene } from '../iso/IsoBaseScene';
import { ZoneTile, toScreen } from '../iso/core';
import { PlayerState } from '../PlayerState';
import { updateDailyProgress, trackZoneVisit } from '../dailyQuests';

// ---------------------------------------------------------------------------
// Monster definitions for forest clearings
// ---------------------------------------------------------------------------
interface ForestMonster {
  tx: number;
  ty: number;
  type: string;
  name: string;
  level: number;
  color: number;
  hp: number;
  atk: number;
  def: number;
}

const MONSTER_DEFS: ForestMonster[] = [
  // NW clearing (center 10, 10)
  { tx: 8,  ty: 9,  type: 'skeleton', name: 'Skeleton',    level: 2, color: 0xcccccc, hp: 35, atk: 8,  def: 3 },
  { tx: 11, ty: 8,  type: 'skeleton', name: 'Skeleton',    level: 2, color: 0xcccccc, hp: 35, atk: 8,  def: 3 },
  { tx: 10, ty: 12, type: 'skeleton', name: 'Skeleton',    level: 3, color: 0xcccccc, hp: 45, atk: 10, def: 4 },
  { tx: 12, ty: 10, type: 'wolf',     name: 'Shadow Wolf', level: 3, color: 0x666688, hp: 40, atk: 12, def: 3 },
  // NE clearing (center 32, 10)
  { tx: 31, ty: 9,  type: 'skeleton', name: 'Skeleton',    level: 3, color: 0xcccccc, hp: 45, atk: 10, def: 4 },
  { tx: 33, ty: 11, type: 'wolf',     name: 'Shadow Wolf', level: 3, color: 0x666688, hp: 40, atk: 12, def: 3 },
  { tx: 32, ty: 12, type: 'skeleton', name: 'Skeleton',    level: 4, color: 0xcccccc, hp: 55, atk: 12, def: 5 },
  { tx: 30, ty: 10, type: 'wolf',     name: 'Shadow Wolf', level: 4, color: 0x666688, hp: 50, atk: 14, def: 4 },
  // SW clearing (center 10, 30)
  { tx: 9,  ty: 29, type: 'treant',   name: 'Dark Treant', level: 5, color: 0x446633, hp: 70, atk: 14, def: 8 },
  { tx: 11, ty: 31, type: 'skeleton', name: 'Skeleton',    level: 4, color: 0xcccccc, hp: 55, atk: 12, def: 5 },
  { tx: 10, ty: 28, type: 'wolf',     name: 'Shadow Wolf', level: 4, color: 0x666688, hp: 50, atk: 14, def: 4 },
  { tx: 12, ty: 30, type: 'skeleton', name: 'Skeleton',    level: 3, color: 0xcccccc, hp: 45, atk: 10, def: 4 },
  // SE clearing (center 32, 30)
  { tx: 31, ty: 29, type: 'treant',   name: 'Dark Treant', level: 5, color: 0x446633, hp: 70, atk: 14, def: 8 },
  { tx: 33, ty: 31, type: 'wolf',     name: 'Shadow Wolf', level: 5, color: 0x666688, hp: 55, atk: 16, def: 5 },
  { tx: 32, ty: 28, type: 'skeleton', name: 'Skeleton',    level: 4, color: 0xcccccc, hp: 55, atk: 12, def: 5 },
  { tx: 30, ty: 30, type: 'wolf',     name: 'Shadow Wolf', level: 4, color: 0x666688, hp: 50, atk: 14, def: 4 },
  // Spiders — scattered across clearings (for spider_infestation quest)
  { tx: 9,  ty: 11, type: 'spider',   name: 'Forest Spider', level: 3, color: 0x55aa66, hp: 38, atk: 11, def: 3 },
  { tx: 13, ty: 10, type: 'spider',   name: 'Forest Spider', level: 3, color: 0x55aa66, hp: 38, atk: 11, def: 3 },
  { tx: 30, ty: 9,  type: 'spider',   name: 'Forest Spider', level: 4, color: 0x55aa66, hp: 48, atk: 13, def: 4 },
  { tx: 34, ty: 10, type: 'spider',   name: 'Forest Spider', level: 4, color: 0x55aa66, hp: 48, atk: 13, def: 4 },
  { tx: 8,  ty: 30, type: 'spider',   name: 'Venom Spider',  level: 4, color: 0x44bb55, hp: 50, atk: 14, def: 4 },
  { tx: 13, ty: 29, type: 'spider',   name: 'Venom Spider',  level: 5, color: 0x44bb55, hp: 58, atk: 15, def: 5 },
  { tx: 29, ty: 31, type: 'spider',   name: 'Venom Spider',  level: 5, color: 0x44bb55, hp: 58, atk: 15, def: 5 },
  { tx: 34, ty: 29, type: 'spider',   name: 'Venom Spider',  level: 5, color: 0x44bb55, hp: 58, atk: 15, def: 5 },
  // Special monsters
  { tx: 30, ty: 25, type: 'mimic',            name: 'Mimic Chest',    level: 6, color: 0xaa8844, hp: 80, atk: 18, def: 12 },
  { tx: 15, ty: 10, type: 'storm_hawk',       name: 'Storm Hawk',     level: 5, color: 0xddcc22, hp: 55, atk: 16, def: 4 },
  { tx: 35, ty: 30, type: 'shadow_assassin',  name: 'Shadow Lurker',  level: 7, color: 0x443366, hp: 65, atk: 22, def: 5 },
];

// ---------------------------------------------------------------------------
// Map builder — 40 cols x 40 rows
// ---------------------------------------------------------------------------
function buildForestTiles(): ZoneTile[][] {
  const SIZE = 40;

  // Seeded random helper (seed 777) for deterministic scatter
  const seededRand = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53 + 777) * 2654435761) >>> 0) % 1000;
  };

  // Distance helper for circular clearings
  const dist = (r: number, c: number, cr: number, cc: number): number => {
    return Math.sqrt((r - cr) ** 2 + (c - cc) ** 2);
  };

  // Clearing definitions
  const clearings = [
    { cx: 10, cy: 10, radius: 5 },  // NW
    { cx: 32, cy: 10, radius: 4 },  // NE
    { cx: 10, cy: 30, radius: 5 },  // SW
    { cx: 32, cy: 30, radius: 4 },  // SE
  ];

  // Check if a tile is inside any clearing
  const inClearing = (c: number, r: number): boolean => {
    for (const cl of clearings) {
      if (dist(r, c, cl.cy, cl.cx) <= cl.radius) return true;
    }
    return false;
  };

  // --- Step 1: Fill with dark_grass base (dark forest floor) ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      row.push({ height: 2, biome: 'dark_grass', collision: false });
    }
    tiles.push(row);
  }

  // --- Step 2: 4-tile deep impenetrable tree border ---
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const distTop = r;
      const distBot = SIZE - 1 - r;
      const distLeft = c;
      const distRight = SIZE - 1 - c;
      const minDist = Math.min(distTop, distBot, distLeft, distRight);

      if (minDist < 4) {
        const h = seededRand(r, c, 99) % 2 === 0 ? 3 : 4;
        tiles[r][c] = { height: h, biome: 'dark_grass', collision: true, data: { deco: 'tree' } };
      }
    }
  }

  // --- Step 3: Exit gaps ---
  // Town exit: col 0, rows 17-21 (left edge gap)
  for (let r = 17; r <= 21; r++) {
    for (let c = 0; c <= 4; c++) {
      tiles[r][c] = { height: 2, biome: 'dirt', collision: false };
    }
  }
  // Actual exit_town interact tiles: col 0, rows 18-20
  for (let r = 18; r <= 20; r++) {
    tiles[r][0] = { height: 2, biome: 'dirt', collision: false, interact: 'exit_town' };
  }

  // Dungeon exit: row 0, cols 18-21 (top edge gap)
  for (let r = 0; r <= 4; r++) {
    for (let c = 18; c <= 21; c++) {
      tiles[r][c] = { height: 2, biome: 'dirt', collision: false };
    }
  }
  // Actual exit_dungeon interact tiles: row 0, cols 19-20
  for (let c = 19; c <= 20; c++) {
    tiles[0][c] = { height: 2, biome: 'dirt', collision: false, interact: 'exit_dungeon' };
  }

  // Volcano exit: row 39, cols 19-20 (south edge)
  for (let c = 19; c <= 20; c++) {
    tiles[39][c] = { height: 2, biome: 'lava', collision: false, interact: 'exit_volcano' };
  }

  // ── Crypt of Shadows gate: right edge, rows 28-33 ──
  for (let r = 28; r <= 33; r++) {
    for (let c = 36; c <= 39; c++) {
      tiles[r][c] = { height: 2, biome: 'stone', collision: false };
    }
  }
  // Gate pillars
  tiles[28][37] = { height: 5, biome: 'stone_dark', collision: true };
  tiles[28][38] = { height: 5, biome: 'stone_dark', collision: true };
  tiles[33][37] = { height: 5, biome: 'stone_dark', collision: true };
  tiles[33][38] = { height: 5, biome: 'stone_dark', collision: true };
  // Gate floor (walkable)
  tiles[30][39] = { height: 2, biome: 'cobble', collision: false, interact: 'exit_crypt' };
  tiles[31][39] = { height: 2, biome: 'cobble', collision: false, interact: 'exit_crypt' };

  // ── Abyssal Depths gate: right edge, rows 6-11 ──
  for (let r = 6; r <= 11; r++) {
    for (let c = 36; c <= 39; c++) {
      tiles[r][c] = { height: 1, biome: 'sand', collision: false };
    }
  }
  // Gate pillars (ice)
  tiles[6][37] = { height: 5, biome: 'ice', collision: true };
  tiles[6][38] = { height: 5, biome: 'ice', collision: true };
  tiles[11][37] = { height: 5, biome: 'ice', collision: true };
  tiles[11][38] = { height: 5, biome: 'ice', collision: true };
  // Water pool before gate
  tiles[8][37] = { height: 0, biome: 'water', collision: true };
  tiles[9][37] = { height: 0, biome: 'water', collision: true };
  // Gate floor
  tiles[8][39] = { height: 1, biome: 'sand', collision: false, interact: 'exit_abyss' };
  tiles[9][39] = { height: 1, biome: 'sand', collision: false, interact: 'exit_abyss' };

  // ── Dragon's Sanctum gate: left edge, rows 24-29 (away from Town exit at 17-21) ──
  for (let r = 24; r <= 29; r++) {
    for (let c = 0; c <= 4; c++) {
      tiles[r][c] = { height: 2, biome: 'volcanic', collision: false };
    }
  }
  // Gate pillars (volcanic)
  tiles[24][1] = { height: 5, biome: 'obsidian', collision: true };
  tiles[24][2] = { height: 5, biome: 'obsidian', collision: true };
  tiles[29][1] = { height: 5, biome: 'obsidian', collision: true };
  tiles[29][2] = { height: 5, biome: 'obsidian', collision: true };
  // Lava pools flanking gate
  tiles[25][1] = { height: 0, biome: 'lava', collision: true };
  tiles[28][1] = { height: 0, biome: 'lava', collision: true };
  // Gate floor
  tiles[26][0] = { height: 2, biome: 'volcanic', collision: false, interact: 'exit_sanctum' };
  tiles[27][0] = { height: 2, biome: 'volcanic', collision: false, interact: 'exit_sanctum' };

  // ── Helper: create a gate at an edge ──
  // edge: 'top'|'bottom'|'left'|'right' — which map edge
  // pos: the col (for top/bottom) or row (for left/right) of the gate center
  const makeEdgeGate = (edge: string, pos: number, biome: string, pillarBiome: string, interact: string) => {
    const S = SIZE;
    if (edge === 'top') {
      // Clear approach path from border inward (3 rows deep, 4 cols wide)
      for (let r = 0; r < 4; r++) for (let c = pos - 1; c <= pos + 2; c++) {
        if (c >= 0 && c < S) tiles[r][c] = { height: 2, biome, collision: false };
      }
      // Exit tiles at row 0
      tiles[0][pos] = { height: 2, biome, collision: false, interact };
      tiles[0][pos + 1] = { height: 2, biome, collision: false, interact };
      // Pillars flanking the gate
      if (pos - 1 >= 0) tiles[0][pos - 1] = { height: 5, biome: pillarBiome, collision: true };
      if (pos + 2 < S) tiles[0][pos + 2] = { height: 5, biome: pillarBiome, collision: true };
    } else if (edge === 'bottom') {
      for (let r = S - 4; r < S; r++) for (let c = pos - 1; c <= pos + 2; c++) {
        if (c >= 0 && c < S) tiles[r][c] = { height: 2, biome, collision: false };
      }
      tiles[S - 1][pos] = { height: 2, biome, collision: false, interact };
      tiles[S - 1][pos + 1] = { height: 2, biome, collision: false, interact };
      if (pos - 1 >= 0) tiles[S - 1][pos - 1] = { height: 5, biome: pillarBiome, collision: true };
      if (pos + 2 < S) tiles[S - 1][pos + 2] = { height: 5, biome: pillarBiome, collision: true };
    } else if (edge === 'left') {
      for (let c = 0; c < 4; c++) for (let r = pos - 1; r <= pos + 2; r++) {
        if (r >= 0 && r < S) tiles[r][c] = { height: 2, biome, collision: false };
      }
      tiles[pos][0] = { height: 2, biome, collision: false, interact };
      tiles[pos + 1][0] = { height: 2, biome, collision: false, interact };
      if (pos - 1 >= 0) tiles[pos - 1][0] = { height: 5, biome: pillarBiome, collision: true };
      if (pos + 2 < S) tiles[pos + 2][0] = { height: 5, biome: pillarBiome, collision: true };
    } else if (edge === 'right') {
      for (let c = S - 4; c < S; c++) for (let r = pos - 1; r <= pos + 2; r++) {
        if (r >= 0 && r < S) tiles[r][c] = { height: 2, biome, collision: false };
      }
      tiles[pos][S - 1] = { height: 2, biome, collision: false, interact };
      tiles[pos + 1][S - 1] = { height: 2, biome, collision: false, interact };
      if (pos - 1 >= 0) tiles[pos - 1][S - 1] = { height: 5, biome: pillarBiome, collision: true };
      if (pos + 2 < S) tiles[pos + 2][S - 1] = { height: 5, biome: pillarBiome, collision: true };
    }
  };

  // ── 10 New Dungeon Gates ──
  // Top edge (row 0)
  makeEdgeGate('top', 8,  'dark_grass', 'stone_dark', 'exit_swamp');
  makeEdgeGate('top', 28, 'stone',      'stone_dark', 'exit_mines');
  makeEdgeGate('top', 13, 'snow',       'ice',        'exit_citadel');

  // Bottom edge (row 39)
  makeEdgeGate('bottom', 8,  'stone_dark', 'stone_dark', 'exit_necropolis');
  makeEdgeGate('bottom', 28, 'ice',        'ice',        'exit_frostwastes');
  makeEdgeGate('bottom', 13, 'volcanic',   'obsidian',   'exit_demongate');

  // Right edge (col 39)
  makeEdgeGate('right', 16, 'stone',      'stone_dark', 'exit_ruins');
  makeEdgeGate('right', 22, 'stone_dark', 'obsidian',   'exit_voidrealm');

  // Left edge (col 0)
  makeEdgeGate('left', 8,  'volcanic',   'obsidian', 'exit_forge');
  makeEdgeGate('left', 33, 'stone_dark', 'obsidian', 'exit_eternal');

  // --- Step 4: Stream (north-south, cols 28-30, with wobble, 2 tiles wide) ---
  for (let r = 4; r < 36; r++) {
    // Winding wobble
    const wobble = (r % 7 < 3) ? 0 : ((r % 11 < 5) ? -1 : ((r % 13 < 4) ? 1 : 0));
    const sc1 = 28 + wobble;
    const sc2 = 29 + wobble;
    if (sc1 >= 0 && sc1 < SIZE) {
      tiles[r][sc1] = { height: 1, biome: 'water', collision: true };
    }
    if (sc2 >= 0 && sc2 < SIZE) {
      tiles[r][sc2] = { height: 1, biome: 'water', collision: true };
    }
    // Mud/dirt banks
    for (const bankCol of [sc1 - 1, sc2 + 1]) {
      if (bankCol >= 4 && bankCol < 36 && tiles[r][bankCol].biome !== 'water') {
        if (seededRand(r, bankCol, 77) % 100 < 60) {
          tiles[r][bankCol] = { height: 1, biome: 'dirt', collision: false };
        }
      }
    }
    // Sand patches near stream
    for (const sandCol of [sc1 - 2, sc2 + 2]) {
      if (sandCol >= 4 && sandCol < 36 && tiles[r][sandCol].biome === 'dark_grass' && !tiles[r][sandCol].collision) {
        if (seededRand(r, sandCol, 111) % 100 < 25) {
          tiles[r][sandCol] = { height: 1, biome: 'dirt', collision: false };
        }
      }
    }
  }

  // Cobble bridge where path crosses stream (3 tiles wide)
  for (let r = 18; r <= 20; r++) {
    for (let c = 26; c <= 31; c++) {
      tiles[r][c] = { height: 2, biome: 'cobble', collision: false };
    }
  }

  // --- Step 5: Dirt paths ---
  // Main horizontal path from town exit east (rows 18-20, cols 5 to 26)
  for (let c = 5; c <= 26; c++) {
    tiles[19][c] = { height: 2, biome: 'dirt', collision: false };
    tiles[20][c] = { height: 2, biome: 'dirt', collision: false };
    // Widening at intervals
    if (c % 6 === 0 && c < 25) {
      tiles[18][c] = { height: 2, biome: 'dirt', collision: false };
    }
  }

  // Path continues east past bridge (cols 31-34)
  for (let c = 31; c <= 34; c++) {
    tiles[19][c] = { height: 2, biome: 'dirt', collision: false };
    tiles[20][c] = { height: 2, biome: 'dirt', collision: false };
  }

  // Branch north to dungeon exit: cols 19-20, rows 4-18
  for (let r = 4; r <= 18; r++) {
    tiles[r][19] = { height: 2, biome: 'dirt', collision: false };
    tiles[r][20] = { height: 2, biome: 'dirt', collision: false };
    // Widen at some points
    if (r % 5 === 0) {
      tiles[r][21] = { height: 2, biome: 'dirt', collision: false };
    }
  }

  // --- Step 6: Four clearings (monster spawn areas) ---
  for (const cl of clearings) {
    const scanMin = Math.max(4, Math.min(cl.cy, cl.cx) - cl.radius - 2);
    const scanMax = Math.min(SIZE - 5, Math.max(cl.cy, cl.cx) + cl.radius + 2);
    for (let r = scanMin; r <= scanMax; r++) {
      for (let c = scanMin; c <= scanMax; c++) {
        if (r < 4 || r >= 36 || c < 4 || c >= 36) continue;
        const d = dist(r, c, cl.cy, cl.cx);
        if (d <= cl.radius) {
          tiles[r][c] = { height: 2, biome: 'grass', collision: false };
        } else if (d <= cl.radius + 1.2 && seededRand(r, c, 10) % 100 < 40) {
          // Flowers at clearing edges
          tiles[r][c] = { height: 2, biome: 'grass', collision: false, data: { deco: 'flower' } };
        }
      }
    }
  }

  // Mushroom spots inside clearings (10 total)
  const mushroomSpots: [number, number][] = [
    [10, 9], [9, 11], [11, 10],         // NW
    [32, 9], [31, 11],                   // NE
    [10, 29], [9, 31],                   // SW
    [32, 29], [33, 31], [31, 30],        // SE
  ];
  for (const [mc, mr] of mushroomSpots) {
    if (mr >= 4 && mr < 36 && mc >= 4 && mc < 36 && !tiles[mr][mc].collision) {
      tiles[mr][mc] = { height: 2, biome: 'grass', collision: false, data: { deco: 'mushroom' } };
    }
  }

  // --- Step 7: Rock formations (15 scattered) ---
  const rockPositions: [number, number][] = [
    [8, 16], [14, 6], [22, 14], [6, 24], [16, 32], [24, 8],
    [18, 26], [34, 16], [26, 34], [12, 22], [30, 24], [20, 8],
    [8, 34], [36, 12], [14, 36],
  ];
  for (const [rc, rr] of rockPositions) {
    if (rr >= 4 && rr < 36 && rc >= 4 && rc < 36 &&
        tiles[rr][rc].biome !== 'water' && !tiles[rr][rc].interact && !inClearing(rc, rr)) {
      tiles[rr][rc] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
    }
  }

  // Large fallen tree (3 stone tiles in a line)
  for (let i = 0; i < 3; i++) {
    const fr = 24;
    const fc = 14 + i;
    if (!tiles[fr][fc].interact && !inClearing(fc, fr)) {
      tiles[fr][fc] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
    }
  }

  // Additional flower patches at clearing edges (20+)
  const flowerEdgeSpots: [number, number][] = [
    [6, 10], [10, 6], [14, 10], [10, 14], [7, 8], [13, 12],  // NW edges
    [28, 10], [32, 6], [35, 10], [32, 14],                     // NE edges
    [6, 30], [10, 26], [14, 30], [10, 34],                     // SW edges
    [28, 30], [32, 26], [35, 30], [32, 34], [29, 28], [34, 33], // SE edges
  ];
  for (const [fc, fr] of flowerEdgeSpots) {
    if (fr >= 4 && fr < 36 && fc >= 4 && fc < 36 &&
        !tiles[fr][fc].collision && !tiles[fr][fc].interact && !tiles[fr][fc].data) {
      tiles[fr][fc] = { height: 2, biome: 'grass', collision: false, data: { deco: 'flower' } };
    }
  }

  // --- Step 8: Interior trees (~50% of eligible dark_grass tiles) ---
  for (let r = 4; r < 36; r++) {
    for (let c = 4; c < 36; c++) {
      const t = tiles[r][c];
      if (t.biome === 'dark_grass' && !t.collision && !t.interact && !t.data) {
        // Skip tiles near clearings (radius check)
        if (inClearing(c, r)) continue;

        const chance = seededRand(r, c, 42) % 100;
        if (chance < 50) {
          // 70% pine, 30% oak
          const deco = seededRand(r, c, 88) % 100 < 70 ? 'tree' : 'tree_oak';
          const h = seededRand(r, c, 66) % 3 === 0 ? 4 : 3;
          tiles[r][c] = { height: h, biome: 'dark_grass', collision: true, data: { deco } };
        }
      }
    }
  }

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoForestScene extends IsoBaseScene {
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: ForestMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Forest');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Forest';

    // Track zone visit for daily explorer quest
    trackZoneVisit('Forest');

    // Track market_research quest progress
    const mrQuest = state.quests.find(q => q.id === 'market_research' && !q.completed);
    if (mrQuest) {
      if (!state.flags.has('mr_visited_forest')) {
        state.flags.add('mr_visited_forest');
        mrQuest.progress = Math.min(mrQuest.target, mrQuest.progress + 1);
        if (mrQuest.progress >= mrQuest.target) mrQuest.completed = true;
        state.save();
      }
    }

    this.initZone(buildForestTiles(), 2, 19);

    // Spawn monster indicators
    this.monsterSprites = [];
    for (const m of MONSTER_DEFS) {
      this.spawnMonsterAt(m);
    }

    // ── Draw gate labels (tx, ty, name, color, levelRange) ──
    // Original gates
    this.drawGateLabel(19, 1, 'Frost Dungeon', 0x8888aa, 'Lv 4-8');
    this.drawGateLabel(19, 38, 'Ember Peak', 0xff4422, 'Lv 18-28');
    this.drawGateLabel(1, 19, 'Hearthvale', 0xffcc33);
    // First expansion
    this.drawGateLabel(38, 30, 'Crypt of Shadows', 0x665588, 'Lv 5-12');
    this.drawGateLabel(38, 8, 'Abyssal Depths', 0x2266aa, 'Lv 15-25');
    this.drawGateLabel(1, 26, "Dragon's Sanctum", 0xff6600, 'Lv 30-50');
    // 10 new gates — positions match makeEdgeGate calls
    this.drawGateLabel(8, 1, 'Haunted Swamp', 0x448833, 'Lv 8-15');
    this.drawGateLabel(28, 1, 'Crystal Mines', 0x66aacc, 'Lv 10-18');
    this.drawGateLabel(13, 1, 'Sky Citadel', 0x88bbff, 'Lv 12-20');
    this.drawGateLabel(8, 38, 'Necropolis', 0x554466, 'Lv 20-30');
    this.drawGateLabel(28, 38, 'Frost Wastes', 0xaaddff, 'Lv 22-32');
    this.drawGateLabel(13, 38, "Demon's Gate", 0xcc2200, 'Lv 25-35');
    this.drawGateLabel(38, 16, 'Ancient Ruins', 0x998866, 'Lv 28-38');
    this.drawGateLabel(38, 22, 'Void Realm', 0x442266, 'Lv 35-45');
    this.drawGateLabel(1, 8, "Titan's Forge", 0xdd6600, 'Lv 40-50');
    this.drawGateLabel(1, 33, 'Eternal Abyss', 0x440066, 'Lv 45-60');

    this.events.emit('zone-change', 'Whispering Forest');
  }

  private drawGateLabel(tx: number, ty: number, name: string, color: number, levelRange?: string): void {
    const h = this.tiles[ty]?.[tx]?.height ?? 2;
    const pos = toScreen(tx, ty, h);

    // Gate structure (larger, more visible)
    const gfx = this.add.graphics();
    gfx.setDepth(50);

    const px = pos.x;
    const py = pos.y;

    // Portal glow (pulsing background)
    const portalGfx = this.add.graphics().setDepth(49);
    portalGfx.fillStyle(color, 0.15);
    portalGfx.fillEllipse(px, py - 20, 50, 40);
    portalGfx.fillStyle(color, 0.08);
    portalGfx.fillEllipse(px, py - 20, 64, 50);

    // Animate portal pulse
    this.tweens.add({
      targets: portalGfx,
      alpha: { from: 0.6, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Pillars (taller, wider)
    const darkPillar = Phaser.Display.Color.ValueToColor(color).darken(40).color;
    const lightPillar = Phaser.Display.Color.ValueToColor(color).lighten(20).color;
    // Left pillar
    gfx.fillStyle(darkPillar, 0.9);
    gfx.fillRoundedRect(px - 28, py - 56, 7, 48, 2);
    gfx.fillStyle(lightPillar, 0.2);
    gfx.fillRoundedRect(px - 27, py - 54, 3, 44, 1);
    // Right pillar
    gfx.fillStyle(darkPillar, 0.9);
    gfx.fillRoundedRect(px + 21, py - 56, 7, 48, 2);
    gfx.fillStyle(lightPillar, 0.2);
    gfx.fillRoundedRect(px + 22, py - 54, 3, 44, 1);

    // Arch top (curved look)
    gfx.fillStyle(color, 0.85);
    gfx.fillRoundedRect(px - 30, py - 60, 60, 8, 4);
    // Arch ornament (center gem)
    gfx.fillStyle(0xffffff, 0.6);
    gfx.fillCircle(px, py - 60, 3);
    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(px, py - 60, 2);

    // Torch flames (animated)
    const torchGfx = this.add.graphics().setDepth(51);
    const drawTorches = (phase: number) => {
      torchGfx.clear();
      const flicker = Math.sin(phase * 0.3) * 1.5;
      // Left torch
      torchGfx.fillStyle(0xff6600, 0.8);
      torchGfx.fillCircle(px - 25, py - 60 + flicker, 4);
      torchGfx.fillStyle(0xffaa00, 0.6);
      torchGfx.fillCircle(px - 25, py - 61 + flicker, 2.5);
      torchGfx.fillStyle(0xffdd44, 0.4);
      torchGfx.fillCircle(px - 25, py - 62 + flicker, 1.5);
      // Right torch
      torchGfx.fillStyle(0xff6600, 0.8);
      torchGfx.fillCircle(px + 25, py - 60 - flicker, 4);
      torchGfx.fillStyle(0xffaa00, 0.6);
      torchGfx.fillCircle(px + 25, py - 61 - flicker, 2.5);
      torchGfx.fillStyle(0xffdd44, 0.4);
      torchGfx.fillCircle(px + 25, py - 62 - flicker, 1.5);
    };
    let torchPhase = 0;
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => { torchPhase++; drawTorches(torchPhase); },
    });
    drawTorches(0);

    // Floor path indicator (arrow pointing into gate)
    gfx.fillStyle(color, 0.3);
    gfx.fillTriangle(px, py + 8, px - 8, py + 16, px + 8, py + 16);

    // Name label
    const label = this.add.text(px, py - 68, name, {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setDepth(52);

    // Background behind name
    const bgGfx = this.add.graphics().setDepth(51);
    const pad = 10;
    bgGfx.fillStyle(0x0a0e1a, 0.92);
    bgGfx.fillRoundedRect(
      px - label.width / 2 - pad,
      py - 68 - label.height / 2 - pad / 2,
      label.width + pad * 2,
      label.height + pad,
      6
    );
    bgGfx.lineStyle(1.5, color, 0.7);
    bgGfx.strokeRoundedRect(
      px - label.width / 2 - pad,
      py - 68 - label.height / 2 - pad / 2,
      label.width + pad * 2,
      label.height + pad,
      6
    );

    // Level range subtitle
    if (levelRange) {
      this.add.text(px, py - 53, levelRange, {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5).setDepth(52);
    }
  }

  protected onInteract(tile: ZoneTile, _tx: number, _ty: number): void {
    if (!tile.interact) return;

    switch (tile.interact) {
      case 'exit_town':
        this.exitToScene('Town');
        break;
      case 'exit_dungeon':
        this.exitToScene('Dungeon');
        break;
      case 'exit_volcano': {
        const s = PlayerState.get();
        if (s.flags.has('dragon_revenge_done') || s.quests.some(q => q.id === 'dragon_revenge' && q.turnedIn)) {
          this.exitToScene('Volcano', { from: 'forest' });
        } else {
          this.showDialog('???', ['A scorching path leads south... Complete the Dragon\'s Revenge quest first.']);
        }
        break;
      }
      case 'exit_crypt':
        this.exitToScene('Crypt', { from: 'forest' });
        break;
      case 'exit_abyss': {
        const ps = PlayerState.get();
        if (ps.level >= 15) {
          this.exitToScene('Abyss', { from: 'forest' });
        } else {
          this.showDialog('???', ['The waters are too dangerous... You need to be at least Level 15.']);
        }
        break;
      }
      case 'exit_sanctum': {
        const ps2 = PlayerState.get();
        if (ps2.level >= 30) {
          this.exitToScene('Sanctum', { from: 'forest' });
        } else {
          this.showDialog('???', ['An ancient power blocks your path... You need to be at least Level 30.']);
        }
        break;
      }
      case 'exit_swamp':
        this.exitToScene('Swamp', { from: 'forest' });
        break;
      case 'exit_mines':
        this.exitToScene('Mines', { from: 'forest' });
        break;
      case 'exit_citadel': {
        const ps3 = PlayerState.get();
        if (ps3.level >= 12) {
          this.exitToScene('Citadel', { from: 'forest' });
        } else {
          this.showDialog('???', ['The winds are too fierce... You need to be at least Level 12.']);
        }
        break;
      }
      case 'exit_necropolis': {
        const ps4 = PlayerState.get();
        if (ps4.level >= 20) {
          this.exitToScene('Necropolis', { from: 'forest' });
        } else {
          this.showDialog('???', ['Death itself bars your entry... You need to be at least Level 20.']);
        }
        break;
      }
      case 'exit_frostwastes': {
        const ps5 = PlayerState.get();
        if (ps5.level >= 22) {
          this.exitToScene('FrostWastes', { from: 'forest' });
        } else {
          this.showDialog('???', ['The blizzard is impassable... You need to be at least Level 22.']);
        }
        break;
      }
      case 'exit_demongate': {
        const ps6 = PlayerState.get();
        if (ps6.level >= 25) {
          this.exitToScene('DemonGate', { from: 'forest' });
        } else {
          this.showDialog('???', ['Hellfire blocks your path... You need to be at least Level 25.']);
        }
        break;
      }
      case 'exit_ruins': {
        const ps7 = PlayerState.get();
        if (ps7.level >= 28) {
          this.exitToScene('Ruins', { from: 'forest' });
        } else {
          this.showDialog('???', ['Ancient wards repel you... You need to be at least Level 28.']);
        }
        break;
      }
      case 'exit_voidrealm': {
        const ps8 = PlayerState.get();
        if (ps8.level >= 35) {
          this.exitToScene('VoidRealm', { from: 'forest' });
        } else {
          this.showDialog('???', ['The void rejects the weak... You need to be at least Level 35.']);
        }
        break;
      }
      case 'exit_forge': {
        const ps9 = PlayerState.get();
        if (ps9.level >= 40) {
          this.exitToScene('Forge', { from: 'forest' });
        } else {
          this.showDialog('???', ['The forge burns too hot... You need to be at least Level 40.']);
        }
        break;
      }
      case 'exit_eternal': {
        const ps10 = PlayerState.get();
        if (ps10.level >= 45) {
          this.exitToScene('Eternal', { from: 'forest' });
        } else {
          this.showDialog('???', ['The abyss consumes all who enter unprepared... You need to be at least Level 45.']);
        }
        break;
      }
    }
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.checkMonsterOverlap();
  }

  // -----------------------------------------------------------------------
  // Monster spawning
  // -----------------------------------------------------------------------
  private spawnMonsterAt(m: ForestMonster): void {
    const pos = toScreen(m.tx, m.ty, 2);
    const container = this.add.container(pos.x, pos.y);

    // Gövde: sprite eşlemesi varsa sprite, yoksa eski renkli daire
    const spr = this.createMonsterVisual(container, m.type);
    if (!spr) {
      const body = this.add.circle(0, -8, 6, m.color, 1);
      container.add(body);
    }

    // Level label
    const label = this.add.text(0, -22, `Lv${m.level}`, {
      fontSize: '8px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(label);

    // Name
    const name = this.add.text(0, 2, m.name, {
      fontSize: '7px', fontFamily: 'monospace', color: '#ffcccc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(name);

    container.setDepth((m.tx + m.ty) * 10 + m.ty + 5);

    // Idle bob
    if (!spr) {
      this.tweens.add({
        targets: container, y: pos.y - 3,
        duration: 1200 + Math.random() * 400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    this.monsterSprites.push({ sprite: container, data: m, alive: true });
  }

  private checkMonsterOverlap(): void {
    if (this.frozen) return; // no battles under dialogs or mid-transition
    const ptx = this.playerTx;
    const pty = this.playerTy;

    for (const entry of this.monsterSprites) {
      if (!entry.alive) continue;
      const dx = Math.abs(ptx - entry.data.tx);
      const dy = Math.abs(pty - entry.data.ty);
      if (dx <= 1 && dy <= 1) {
        this.startBattle(entry);
        break;
      }
    }
  }

  private startBattle(entry: { sprite: Phaser.GameObjects.Container; data: ForestMonster; alive: boolean }): void {
    if (!entry.alive) return;
    entry.alive = false;
    entry.sprite.setVisible(false);

    this.freeze();
    const m = entry.data;

    // Elite system: 15% chance to become elite variant
    const isElite = Math.random() < 0.15;
    const eliteMultHp = isElite ? 2.0 : 1.0;
    const eliteMultAtk = isElite ? 1.5 : 1.0;
    const eliteMultDef = isElite ? 1.3 : 1.0;

    this.scene.launch('Battle', {
      monster: {
        type: isElite ? `elite_${m.type}` : m.type,
        name: isElite ? `Elite ${m.name}` : m.name,
        level: m.level,
        hp: Math.round(m.hp * eliteMultHp),
        maxHp: Math.round(m.hp * eliteMultHp),
        atk: Math.round(m.atk * eliteMultAtk),
        def: Math.round(m.def * eliteMultDef),
        isElite,
      },
      returnScene: 'Forest',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        entry.sprite.destroy();
        const state = PlayerState.get();
        state.addKill(isElite ? `elite_${m.type}` : m.type);

        // Daily quest tracking
        updateDailyProgress('daily_slayer');

        // Drop quest materials from specific monster types
        if (m.type === 'skeleton' && !state.hasItem('bone_shard')) {
          if (Math.random() < 0.4) {
            state.addItem({
              id: 'bone_shard', name: 'Bone Shard', sprite: 'key',
              type: 'quest', stackable: false, count: 1,
            });
          }
        }
        if (m.type === 'spider' && !state.hasItem('spider_silk_mat')) {
          if (Math.random() < 0.35) {
            state.addItem({
              id: 'spider_silk_mat', name: 'Spider Silk', sprite: 'key',
              type: 'quest', stackable: false, count: 1,
            });
          }
        }

        // Update supply_run quest progress
        const srQuest = state.quests.find(q => q.id === 'supply_run' && !q.completed);
        if (srQuest) {
          let prog = 0;
          if (state.hasItem('bone_shard')) prog++;
          if (state.hasItem('spider_silk_mat')) prog++;
          if (state.hasItem('bat_wing')) prog++;
          srQuest.progress = prog;
          if (prog >= 3) srQuest.completed = true;
        }

        this.events.emit('quest-update');
        this.events.emit('hp-change');

        // Respawn after 15 seconds
        const timer = this.time.delayedCall(15000, () => {
          this.spawnMonsterAt(m);
        });
        this.respawnTimers.push(timer);
      } else {
        // Lost — monster reappears
        entry.alive = true;
        entry.sprite.setVisible(true);
      }
    });
  }
}
