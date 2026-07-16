import * as Phaser from 'phaser';
import { IsoBaseScene } from '../iso/IsoBaseScene';
import { ZoneTile, toScreen } from '../iso/core';
import { PlayerState } from '../PlayerState';
import { updateDailyProgress, trackZoneVisit } from '../dailyQuests';
import { BOSS_DIALOGUES, LORE_ENTRIES, CHAPTER_SUMMARIES, getChapterProgress } from '../lore';

// ---------------------------------------------------------------------------
// Boss data
// ---------------------------------------------------------------------------
const BOSS_DATA = {
  type: 'ancient_guardian',
  name: 'Ancient Guardian',
  level: 38,
  hp: 1100,
  maxHp: 1100,
  atk: 58,
  def: 32,
};

// ---------------------------------------------------------------------------
// Monster definitions
// ---------------------------------------------------------------------------
interface RuinsMonster {
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

const RUINS_MONSTERS: RuinsMonster[] = [
  // Room 1 — Ruin Gateway (stone sentinels Lv28, vine crawlers Lv28)
  { tx: 5,  ty: 22, type: 'stone_sentinel', name: 'Stone Sentinel',   level: 28, color: 0x887766, hp: 350, atk: 38, def: 24 },
  { tx: 5,  ty: 26, type: 'stone_sentinel', name: 'Stone Sentinel',   level: 28, color: 0x887766, hp: 350, atk: 38, def: 24 },
  { tx: 5,  ty: 24, type: 'vine_crawler',   name: 'Vine Crawler',     level: 28, color: 0x448833, hp: 310, atk: 36, def: 18 },

  // Room 2 — Overgrown Hall (vine crawlers Lv29, ruin ghosts Lv30)
  { tx: 14, ty: 37, type: 'vine_crawler',   name: 'Vine Crawler',     level: 29, color: 0x559944, hp: 330, atk: 38, def: 19 },
  { tx: 20, ty: 39, type: 'vine_crawler',   name: 'Vine Crawler',     level: 29, color: 0x559944, hp: 330, atk: 38, def: 19 },
  { tx: 17, ty: 36, type: 'ruin_ghost',     name: 'Ruin Ghost',       level: 30, color: 0x99bbaa, hp: 320, atk: 42, def: 18 },
  { tx: 21, ty: 38, type: 'ruin_ghost',     name: 'Ruin Ghost',       level: 30, color: 0x99bbaa, hp: 320, atk: 42, def: 18 },

  // Room 3 — Statue Gallery (stone sentinels Lv30, enchanted armors Lv31)
  { tx: 33, ty: 37, type: 'stone_sentinel', name: 'Stone Sentinel',   level: 30, color: 0x998877, hp: 380, atk: 40, def: 26 },
  { tx: 39, ty: 39, type: 'enchanted_armor', name: 'Enchanted Armor', level: 31, color: 0x6688aa, hp: 420, atk: 42, def: 28 },
  { tx: 36, ty: 36, type: 'enchanted_armor', name: 'Enchanted Armor', level: 31, color: 0x6688aa, hp: 420, atk: 42, def: 28 },

  // Room 4 — Puzzle Chamber (arcane constructs Lv32, time wraiths Lv32)
  { tx: 33, ty: 24, type: 'arcane_construct', name: 'Arcane Construct', level: 32, color: 0x8866cc, hp: 400, atk: 44, def: 24 },
  { tx: 39, ty: 26, type: 'arcane_construct', name: 'Arcane Construct', level: 32, color: 0x8866cc, hp: 400, atk: 44, def: 24 },
  { tx: 36, ty: 23, type: 'time_wraith',    name: 'Time Wraith',      level: 32, color: 0xaabb99, hp: 370, atk: 46, def: 20 },

  // Room 5 — Library of Ages (ruin ghosts Lv33, time wraiths Lv34)
  { tx: 14, ty: 24, type: 'ruin_ghost',     name: 'Ruin Ghost',       level: 33, color: 0xaaccbb, hp: 380, atk: 46, def: 21 },
  { tx: 20, ty: 26, type: 'ruin_ghost',     name: 'Ruin Ghost',       level: 33, color: 0xaaccbb, hp: 380, atk: 46, def: 21 },
  { tx: 17, ty: 23, type: 'time_wraith',    name: 'Time Wraith',      level: 34, color: 0xbbcc88, hp: 400, atk: 48, def: 22 },

  // Room 6 — Celestial Observatory (arcane constructs Lv34, enchanted armors Lv35)
  { tx: 33, ty: 12, type: 'arcane_construct', name: 'Arcane Construct', level: 34, color: 0x9977dd, hp: 440, atk: 48, def: 26 },
  { tx: 39, ty: 14, type: 'enchanted_armor', name: 'Enchanted Armor',  level: 35, color: 0x7799bb, hp: 470, atk: 50, def: 30 },
  { tx: 36, ty: 11, type: 'time_wraith',    name: 'Time Wraith',      level: 35, color: 0xccdd99, hp: 420, atk: 50, def: 23 },

  // Room 7 — Guardian Vault (enchanted armors Lv36, stone sentinels Lv36)
  { tx: 14, ty: 12, type: 'enchanted_armor', name: 'Enchanted Armor',  level: 36, color: 0x88aacc, hp: 490, atk: 52, def: 30 },
  { tx: 20, ty: 14, type: 'stone_sentinel', name: 'Stone Sentinel',   level: 36, color: 0xaa9988, hp: 460, atk: 50, def: 30 },
  { tx: 17, ty: 11, type: 'enchanted_armor', name: 'Enchanted Armor',  level: 36, color: 0x88aacc, hp: 490, atk: 52, def: 30 },

  // Corridor monsters
  { tx: 8,  ty: 30, type: 'vine_crawler',   name: 'Vine Crawler',     level: 29, color: 0x559944, hp: 330, atk: 38, def: 19 },
  { tx: 26, ty: 38, type: 'ruin_ghost',     name: 'Ruin Ghost',       level: 30, color: 0x99bbaa, hp: 320, atk: 42, def: 18 },
  { tx: 26, ty: 25, type: 'arcane_construct', name: 'Arcane Construct', level: 33, color: 0x8866cc, hp: 430, atk: 46, def: 25 },
  { tx: 26, ty: 13, type: 'time_wraith',    name: 'Time Wraith',      level: 35, color: 0xccdd99, hp: 420, atk: 50, def: 23 },
];

// ---------------------------------------------------------------------------
// Map builder — 48 cols x 48 rows
// ---------------------------------------------------------------------------
function buildRuinsTiles(): ZoneTile[][] {
  const SIZE = 48;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'stone_dark', collision: true });
    }
    tiles.push(row);
  }

  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'stone', h = 1) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        tiles[r][c] = { height: h, biome, collision: false };
      }
    }
    for (let r = r1 - 1; r <= r2 + 1; r++) {
      for (let c = c1 - 1; c <= c2 + 1; c++) {
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) continue;
        if (tiles[r][c].collision && tiles[r][c].biome === 'stone_dark') {
          tiles[r][c] = { height: 4, biome: 'wall', collision: true };
        }
      }
    }
  };

  // =======================================================================
  // Room 1 — Ruin Gateway (cols 2-8, rows 20-28) — left edge entrance
  // =======================================================================
  carveRoom(2, 20, 8, 28);
  for (let r = 20; r <= 28; r++) {
    for (let c = 2; c <= 8; c++) {
      if (hash(r, c, 13) < 35) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
      if (hash(r, c, 7) < 15) {
        tiles[r][c] = { height: 1, biome: 'dark_grass', collision: false };
      }
    }
  }
  // Torches
  tiles[19][2]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][1]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][1]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at left edge — carve a corridor out to it first: Room 1 starts at col 2
  // and its border pass walls off col 1, which left these exit tiles unreachable
  carveRoom(0, 24, 2, 25, 'stone', 1);
  tiles[24][0] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[25][0] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Gateway to Overgrown Hall (cols 8-12, rows 33-35)
  // =======================================================================
  carveRoom(5, 28, 8, 33, 'stone_dark', 1);
  // Vertical corridor from gateway down
  carveRoom(5, 33, 12, 35, 'stone_dark', 1);

  // =======================================================================
  // Room 2 — Overgrown Hall (cols 10-24, rows 34-42)
  // =======================================================================
  carveRoom(10, 34, 24, 42);
  for (let r = 34; r <= 42; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 9) < 30) {
        tiles[r][c] = { height: 1, biome: 'dark_grass', collision: false };
      }
      if (hash(r, c, 11) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }
  // Pillars
  tiles[35][12] = { height: 4, biome: 'stone', collision: true };
  tiles[35][22] = { height: 4, biome: 'stone', collision: true };
  tiles[41][12] = { height: 4, biome: 'stone', collision: true };
  tiles[41][22] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[33][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[38][17] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'ruins_chest1' },
  };

  // =======================================================================
  // Corridor 2 — Overgrown Hall to Statue Gallery (cols 24-30, rows 37-39)
  // =======================================================================
  carveRoom(24, 37, 30, 39, 'stone_dark', 1);
  tiles[37][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Statue Gallery (cols 30-42, rows 34-42)
  // =======================================================================
  carveRoom(30, 34, 42, 42);
  for (let r = 34; r <= 42; r++) {
    for (let c = 30; c <= 42; c++) {
      if (hash(r, c, 17) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }
  // Statue pillars
  tiles[36][32] = { height: 4, biome: 'stone', collision: true };
  tiles[36][40] = { height: 4, biome: 'stone', collision: true };
  tiles[40][32] = { height: 4, biome: 'stone', collision: true };
  tiles[40][40] = { height: 4, biome: 'stone', collision: true };
  // Rock decorations (broken statues)
  tiles[37][35] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[39][38] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  // Torches
  tiles[33][30] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][36] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Statue Gallery to Puzzle Chamber (cols 34-38, rows 30-34)
  // =======================================================================
  carveRoom(34, 30, 38, 33, 'stone_dark', 1);
  tiles[30][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Puzzle Chamber (cols 30-42, rows 21-29)
  // =======================================================================
  carveRoom(30, 21, 42, 29);
  for (let r = 21; r <= 29; r++) {
    for (let c = 30; c <= 42; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
      if (hash(r, c, 23) < 10) {
        tiles[r][c] = { height: 1, biome: 'dark_grass', collision: false };
      }
    }
  }
  // Water pool (puzzle element)
  tiles[24][35] = { height: 0, biome: 'water', collision: false };
  tiles[24][36] = { height: 0, biome: 'water', collision: false };
  tiles[25][35] = { height: 0, biome: 'water', collision: false };
  tiles[25][36] = { height: 0, biome: 'water', collision: false };
  // Torches
  tiles[20][30] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][36] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][43] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][43] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[25][37] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'ruins_chest2' },
  };

  // =======================================================================
  // Corridor 4 — Overgrown Hall to Library (cols 15-19, rows 30-34)
  // =======================================================================
  carveRoom(15, 30, 19, 33, 'stone_dark', 1);

  // =======================================================================
  // Room 5 — Library of Ages (cols 10-24, rows 21-29)
  // =======================================================================
  carveRoom(10, 21, 24, 29);
  for (let r = 21; r <= 29; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }
  // Barrel clusters (bookshelves)
  tiles[22][11] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[22][12] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[22][22] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[22][23] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  // Torches
  tiles[20][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Puzzle Chamber to Observatory (cols 34-38, rows 17-21)
  // =======================================================================
  carveRoom(34, 17, 38, 20, 'stone_dark', 1);
  tiles[17][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Celestial Observatory (cols 30-42, rows 8-16)
  // =======================================================================
  carveRoom(30, 8, 42, 16);
  for (let r = 8; r <= 16; r++) {
    for (let c = 30; c <= 42; c++) {
      if (hash(r, c, 37) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }
  // Celestial pool
  tiles[11][35] = { height: 0, biome: 'water', collision: false };
  tiles[11][36] = { height: 0, biome: 'water', collision: false };
  tiles[11][37] = { height: 0, biome: 'water', collision: false };
  tiles[12][35] = { height: 0, biome: 'water', collision: false };
  tiles[12][37] = { height: 0, biome: 'water', collision: false };
  tiles[13][35] = { height: 0, biome: 'water', collision: false };
  tiles[13][36] = { height: 0, biome: 'water', collision: false };
  tiles[13][37] = { height: 0, biome: 'water', collision: false };
  // Pillars
  tiles[9][32]  = { height: 4, biome: 'stone', collision: true };
  tiles[9][40]  = { height: 4, biome: 'stone', collision: true };
  tiles[15][32] = { height: 4, biome: 'stone', collision: true };
  tiles[15][40] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[7][30]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][36]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][42]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[10][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[10][43] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][43] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[12][36] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'ruins_chest3' },
  };

  // =======================================================================
  // Corridor 6 — Library to Guardian Vault (cols 15-19, rows 17-21)
  // =======================================================================
  carveRoom(15, 17, 19, 20, 'stone_dark', 1);
  tiles[17][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Guardian Vault (cols 10-24, rows 8-16)
  // =======================================================================
  carveRoom(10, 8, 24, 16);
  for (let r = 8; r <= 16; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 41) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }
  // Pillars
  tiles[9][12]  = { height: 4, biome: 'stone', collision: true };
  tiles[9][22]  = { height: 4, biome: 'stone', collision: true };
  tiles[15][12] = { height: 4, biome: 'stone', collision: true };
  tiles[15][22] = { height: 4, biome: 'stone', collision: true };
  // Skull decorations
  tiles[8][11]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[8][23]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[16][11] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[16][23] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[7][10]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][24]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 7 — Guardian Vault to Boss Room (cols 15-19, rows 4-8)
  // =======================================================================
  carveRoom(15, 4, 19, 7, 'stone_dark', 1);
  tiles[4][14]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 8 — Boss Room: Ancient Guardian (cols 8-26, rows 1-4) — checkerboard
  // =======================================================================
  for (let r = 1; r <= 4; r++) {
    for (let c = 8; c <= 26; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'cobble', collision: false };
    }
  }
  for (let r = 0; r <= 5; r++) {
    for (let c = 7; c <= 27; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 1 && r <= 4 && c >= 8 && c <= 26) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'stone_dark') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }
  // Corner pillars
  tiles[1][8]   = { height: 5, biome: 'stone', collision: true };
  tiles[1][26]  = { height: 5, biome: 'stone', collision: true };
  tiles[4][8]   = { height: 5, biome: 'stone', collision: true };
  tiles[4][26]  = { height: 5, biome: 'stone', collision: true };
  // Skull ring
  tiles[1][11]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[1][23]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][11]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][23]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][26]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][26]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  // Torch ring
  tiles[0][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][27]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile
  tiles[2][17] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'ancient_guardian', name: 'Ancient Guardian' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoRuinsScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: RuinsMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Ruins');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Ruins';

    trackZoneVisit('Ruins');

    this.initZone(buildRuinsTiles(), 3, 24);

    if (!state.flags.has('ruins_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('ruins_chest1')) {
      this.createChestIndicator(17, 38);
    }
    if (!state.flags.has('ruins_chest2')) {
      this.createChestIndicator(37, 25);
    }
    if (!state.flags.has('ruins_chest3')) {
      this.createChestIndicator(36, 12);
    }

    this.monsterSprites = [];
    for (const m of RUINS_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Ancient Ruins');
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.checkMonsterOverlap();
  }

  protected onInteract(tile: ZoneTile, _tx: number, _ty: number): void {
    if (!tile.interact) return;
    const state = PlayerState.get();

    switch (tile.interact) {
      case 'boss':
        this.handleBoss(state);
        break;
      case 'chest':
        this.handleChest(state, tile, _tx, _ty);
        break;
      case 'exit_forest':
        this.exitToScene('Forest');
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Monster spawning
  // -----------------------------------------------------------------------
  private spawnDungeonMonsterAt(m: RuinsMonster): void {
    const pos = toScreen(m.tx, m.ty, 1);
    const container = this.add.container(pos.x, pos.y);

    const body = this.add.circle(0, -8, 6, m.color, 1);
    container.add(body);

    const label = this.add.text(0, -22, `Lv${m.level}`, {
      fontSize: '8px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(label);

    const name = this.add.text(0, 2, m.name, {
      fontSize: '7px', fontFamily: 'monospace', color: '#ffcccc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(name);

    container.setDepth((m.tx + m.ty) * 10 + m.ty + 5);

    this.tweens.add({
      targets: container, y: pos.y - 3,
      duration: 1200 + Math.random() * 400,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

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
        this.startMonsterBattle(entry);
        break;
      }
    }
  }

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: RuinsMonster; alive: boolean }): void {
    if (!entry.alive) return;
    entry.alive = false;
    entry.sprite.setVisible(false);

    this.freeze();
    const m = entry.data;

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
      returnScene: 'Ruins',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        entry.sprite.destroy();
        const state = PlayerState.get();
        state.addKill(isElite ? `elite_${m.type}` : m.type);
        updateDailyProgress('daily_slayer');
        this.events.emit('quest-update');
        this.events.emit('hp-change');

        const timer = this.time.delayedCall(20000, () => {
          this.spawnDungeonMonsterAt(m);
        });
        this.respawnTimers.push(timer);
      } else {
        entry.alive = true;
        entry.sprite.setVisible(true);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Boss
  // -----------------------------------------------------------------------
  private handleBoss(state: PlayerState): void {
    const dialogue = BOSS_DIALOGUES['ancient_guardian'];
    if (state.flags.has('ruins_boss_defeated')) {
      this.showDialog('Ancient Guardian', ['The ruins rest in eternal peace...'], 17, 2);
      return;
    }

    this.showDialog('Ancient Guardian', dialogue.preBattle, 17, 2);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Ruins',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('ruins_boss_defeated');
        state.addKill('ancient_guardian');

        // Lore tracking
        state.flags.add('lore_ancient_guardian');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['ancient_guardian'];
        this.showDialog('Ancient Guardian', [dialogue.deathLine], 17, 2);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Ancient Guardian', dialogue.loreReveal);
            const waitForChapter = () => {
              if (!this.frozen) {
                this.checkChapterComplete(state);
              } else {
                this.time.delayedCall(100, waitForChapter);
              }
            };
            this.time.delayedCall(500, waitForChapter);
          } else {
            this.time.delayedCall(100, waitForLore);
          }
        };
        this.time.delayedCall(500, waitForLore);

        if (this.bossSprite) {
          this.bossSprite.destroy();
          this.bossSprite = null;
        }

        this.events.emit('quest-update');
        this.events.emit('hp-change');
      }
    });
  }

  // -----------------------------------------------------------------------
  // Lore helpers
  // -----------------------------------------------------------------------
  private showLoreReveal(bossName: string, loreText: string): void {
    this.showDialog(`[LORE] ${bossName}`, [loreText]);
  }

  private checkChapterComplete(state: PlayerState): void {
    const progress = getChapterProgress(state.flags);
    for (const ch of progress) {
      if (ch.collected === ch.total && ch.total > 0) {
        const flagKey = `chapter_${ch.chapter}_complete`;
        if (!state.flags.has(flagKey)) {
          state.flags.add(flagKey);
          const summary = CHAPTER_SUMMARIES[ch.chapter];
          if (summary) {
            this.showDialog(summary.title, [summary.summary]);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Chest
  // -----------------------------------------------------------------------
  private handleChest(state: PlayerState, tile: ZoneTile, tx: number, ty: number): void {
    const chestId = tile.data?.id;
    if (!chestId) return;

    if (!state.flags.has(chestId)) {
      state.flags.add(chestId);
      state.addItem({
        id: 'potion_hp', name: 'Health Potion', sprite: 'potion',
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 3,
      });
      state.gold += 90;
      this.showDialog('Ancient Chest', ['Found: 3x Health Potion, 90 Gold!'], tx, ty);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Ancient Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x88aa66;
    const pos = toScreen(17, 2, 1);
    const container = this.add.container(pos.x, pos.y);

    const body = this.add.circle(0, -10, 10, bossColor, 1);
    container.add(body);

    const glow = this.add.circle(0, -10, 16, bossColor, 0.2);
    container.add(glow);
    this.tweens.add({
      targets: glow, alpha: { from: 0.1, to: 0.35 },
      scaleX: { from: 1, to: 1.3 }, scaleY: { from: 1, to: 1.3 },
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const label = this.add.text(0, -28, 'Ancient Guardian', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#aaccaa', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv38 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#bbddbb', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(lvl);

    container.setDepth(100);

    this.tweens.add({
      targets: container, y: pos.y - 4,
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.bossSprite = container;
  }

  private createChestIndicator(tx: number, ty: number): void {
    const pos = toScreen(tx, ty, 1);
    const container = this.add.container(pos.x, pos.y);

    const box = this.add.rectangle(0, -6, 12, 8, 0xddaa44, 1);
    container.add(box);
    const lid = this.add.rectangle(0, -12, 14, 4, 0xbb8833, 1);
    container.add(lid);

    const label = this.add.text(0, 4, 'Chest', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#ffdd88', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(label);

    container.setDepth((tx + ty) * 10 + ty + 5);

    this.tweens.add({
      targets: box, alpha: { from: 0.8, to: 1 },
      duration: 800, yoyo: true, repeat: -1,
    });
  }
}
