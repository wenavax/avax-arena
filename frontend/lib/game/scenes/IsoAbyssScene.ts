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
  type: 'abyssal_leviathan',
  name: 'Abyssal Leviathan',
  level: 25,
  hp: 600,
  maxHp: 600,
  atk: 38,
  def: 20,
};

// ---------------------------------------------------------------------------
// Abyss monster definitions
// ---------------------------------------------------------------------------
interface AbyssMonster {
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

const ABYSS_MONSTERS: AbyssMonster[] = [
  // Room 1 — Drowned Entry (slimes Lv15, water elementals Lv16)
  { tx: 10, ty: 40, type: 'deep_slime',       name: 'Deep Slime',       level: 15, color: 0x338866, hp: 160, atk: 22, def: 10 },
  { tx: 16, ty: 41, type: 'deep_slime',       name: 'Deep Slime',       level: 15, color: 0x338866, hp: 160, atk: 22, def: 10 },
  { tx: 13, ty: 39, type: 'water_elemental',  name: 'Water Elemental',  level: 16, color: 0x4488cc, hp: 180, atk: 24, def: 12 },

  // Room 2 — Coral Passage (sea serpents Lv16, deep lurkers Lv17)
  { tx: 32, ty: 39, type: 'sea_serpent',       name: 'Sea Serpent',      level: 16, color: 0x22aa88, hp: 175, atk: 25, def: 11 },
  { tx: 36, ty: 41, type: 'sea_serpent',       name: 'Sea Serpent',      level: 16, color: 0x22aa88, hp: 175, atk: 25, def: 11 },
  { tx: 34, ty: 40, type: 'deep_lurker',      name: 'Deep Lurker',      level: 17, color: 0x225577, hp: 200, atk: 26, def: 13 },

  // Room 3 — Tide Pool (jellyfish Lv17, water elementals Lv18)
  { tx: 10, ty: 28, type: 'jellyfish',        name: 'Jellyfish',        level: 17, color: 0xcc88ff, hp: 150, atk: 28, def: 8 },
  { tx: 16, ty: 30, type: 'jellyfish',        name: 'Jellyfish',        level: 17, color: 0xcc88ff, hp: 150, atk: 28, def: 8 },
  { tx: 13, ty: 29, type: 'water_elemental',  name: 'Tide Elemental',   level: 18, color: 0x5599dd, hp: 210, atk: 27, def: 14 },

  // Room 4 — Sunken Library (arcane wisps Lv18, corrupted scholars Lv19)
  { tx: 32, ty: 27, type: 'arcane_wisp',      name: 'Arcane Wisp',      level: 18, color: 0xaacc44, hp: 170, atk: 30, def: 10 },
  { tx: 38, ty: 29, type: 'arcane_wisp',      name: 'Arcane Wisp',      level: 18, color: 0xaacc44, hp: 170, atk: 30, def: 10 },
  { tx: 35, ty: 28, type: 'corrupted_scholar', name: 'Corrupted Scholar', level: 19, color: 0x6655aa, hp: 220, atk: 29, def: 15 },

  // Room 5 — Abyssal Trench (deep horrors Lv20, leviathan spawn Lv20)
  { tx: 10, ty: 18, type: 'deep_horror',      name: 'Deep Horror',      level: 20, color: 0x334455, hp: 260, atk: 32, def: 16 },
  { tx: 16, ty: 20, type: 'deep_horror',      name: 'Deep Horror',      level: 20, color: 0x334455, hp: 260, atk: 32, def: 16 },
  { tx: 13, ty: 19, type: 'leviathan_spawn',  name: 'Leviathan Spawn',  level: 20, color: 0x225544, hp: 280, atk: 30, def: 18 },

  // Room 6 — Crystal Grotto (crystal sentinels Lv21, gem golems Lv22)
  { tx: 32, ty: 17, type: 'crystal_sentinel', name: 'Crystal Sentinel', level: 21, color: 0x88ddee, hp: 290, atk: 31, def: 20 },
  { tx: 38, ty: 19, type: 'crystal_sentinel', name: 'Crystal Sentinel', level: 21, color: 0x88ddee, hp: 290, atk: 31, def: 20 },
  { tx: 35, ty: 18, type: 'gem_golem',        name: 'Gem Golem',        level: 22, color: 0x66ccaa, hp: 320, atk: 33, def: 22 },
  { tx: 36, ty: 16, type: 'gem_golem',        name: 'Gem Golem',        level: 22, color: 0x66ccaa, hp: 320, atk: 33, def: 22 },

  // Room 7 — Whirlpool Chamber (maelstrom spirits Lv22, tidal guardians Lv23)
  { tx: 20, ty: 10, type: 'maelstrom_spirit', name: 'Maelstrom Spirit', level: 22, color: 0x4477bb, hp: 300, atk: 34, def: 17 },
  { tx: 26, ty: 12, type: 'maelstrom_spirit', name: 'Maelstrom Spirit', level: 22, color: 0x4477bb, hp: 300, atk: 34, def: 17 },
  { tx: 23, ty: 11, type: 'tidal_guardian',   name: 'Tidal Guardian',   level: 23, color: 0x3366aa, hp: 340, atk: 35, def: 20 },

  // Corridor monsters
  { tx: 22, ty: 37, type: 'deep_slime',       name: 'Abyssal Slime',    level: 16, color: 0x447766, hp: 170, atk: 23, def: 11 },
  { tx: 22, ty: 24, type: 'jellyfish',        name: 'Toxic Jellyfish',  level: 19, color: 0xdd88ee, hp: 180, atk: 30, def: 9 },
  { tx: 22, ty: 14, type: 'deep_lurker',      name: 'Abyss Lurker',     level: 21, color: 0x336677, hp: 270, atk: 32, def: 15 },
  { tx: 13, ty: 7,  type: 'water_elemental',  name: 'Storm Elemental',  level: 23, color: 0x6699ee, hp: 310, atk: 35, def: 18 },
];

// ---------------------------------------------------------------------------
// Map builder — 45 cols x 45 rows
// ---------------------------------------------------------------------------
function buildAbyssTiles(): ZoneTile[][] {
  const SIZE = 45;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Step 1: Fill everything with ice_dark walls (height 5) ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'ice_dark', collision: true });
    }
    tiles.push(row);
  }

  // Helper to carve a room with wall borders
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
        if (tiles[r][c].collision && tiles[r][c].biome === 'ice_dark') {
          tiles[r][c] = { height: 4, biome: 'wall', collision: true };
        }
      }
    }
  };

  // =======================================================================
  // Room 1 — Drowned Entry (cols 6-19, rows 37-43)
  // =======================================================================
  carveRoom(6, 37, 19, 43, 'stone');

  for (let r = 37; r <= 43; r++) {
    for (let c = 6; c <= 19; c++) {
      if (hash(r, c, 13) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Water hazard patches
  tiles[40][8]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[40][9]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[41][8]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[39][16] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[39][17] = { height: 0, biome: 'frozen_water', collision: false };

  // Rock decorations
  tiles[38][7]  = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[42][18] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Torches
  tiles[36][6]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[41][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[41][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at right edge — carve the corridor FIRST: carveRoom writes plain floor
  // over its whole area and was erasing the interact tiles below
  carveRoom(42, 39, 44, 42, 'stone', 1);
  tiles[40][44] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[41][44] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Entry to Coral Passage (cols 18-28, rows 39-41)
  // =======================================================================
  carveRoom(18, 39, 28, 41, 'stone', 1);
  tiles[39][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Coral Passage (cols 28-40, rows 37-43)
  // =======================================================================
  carveRoom(28, 37, 40, 43, 'stone');

  for (let r = 37; r <= 43; r++) {
    for (let c = 28; c <= 40; c++) {
      if (hash(r, c, 7) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_crystal', collision: false };
      }
    }
  }

  // Water patches
  tiles[40][30] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[40][31] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[41][31] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[38][38] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[38][39] = { height: 0, biome: 'frozen_water', collision: false };

  // Torches
  tiles[36][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Entry to Tide Pool (cols 10-14, rows 33-37)
  // =======================================================================
  carveRoom(10, 33, 14, 36, 'stone', 1);
  tiles[33][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Tide Pool (cols 5-19, rows 26-32)
  // =======================================================================
  carveRoom(5, 26, 19, 32, 'stone');

  for (let r = 26; r <= 32; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 19) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_crystal', collision: false };
      }
    }
  }

  // Large water pool in center
  for (let r = 28; r <= 30; r++) {
    for (let c = 10; c <= 14; c++) {
      tiles[r][c] = { height: 0, biome: 'frozen_water', collision: false };
    }
  }

  // Pillars
  tiles[27][7]  = { height: 4, biome: 'ice', collision: true };
  tiles[27][17] = { height: 4, biome: 'ice', collision: true };
  tiles[31][7]  = { height: 4, biome: 'ice', collision: true };
  tiles[31][17] = { height: 4, biome: 'ice', collision: true };

  // Chest
  tiles[29][7] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'abyss_chest1' },
  };

  // Torches
  tiles[25][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Coral Passage to Sunken Library (cols 32-36, rows 33-37)
  // =======================================================================
  carveRoom(32, 33, 36, 36, 'stone', 1);
  tiles[33][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Sunken Library (cols 28-40, rows 25-32)
  // =======================================================================
  carveRoom(28, 25, 40, 32, 'stone');

  for (let r = 25; r <= 32; r++) {
    for (let c = 28; c <= 40; c++) {
      if (hash(r, c, 23) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Bookshelves (collision pillars)
  tiles[26][30] = { height: 3, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[26][34] = { height: 3, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[26][38] = { height: 3, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[30][30] = { height: 3, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[30][34] = { height: 3, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[30][38] = { height: 3, biome: 'stone', collision: true, data: { deco: 'barrel' } };

  // Chest
  tiles[28][34] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'abyss_chest2' },
  };

  // Torches
  tiles[24][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Tide Pool to Abyssal Trench (cols 10-14, rows 22-26)
  // =======================================================================
  carveRoom(10, 22, 14, 25, 'stone', 1);
  tiles[22][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Abyssal Trench (cols 5-19, rows 15-21)
  // =======================================================================
  carveRoom(5, 15, 19, 21, 'ice_dark');

  // Deep water hazard zone
  for (let r = 17; r <= 19; r++) {
    for (let c = 9; c <= 15; c++) {
      tiles[r][c] = { height: 0, biome: 'frozen_water', collision: false };
    }
  }

  // Rocks
  tiles[16][6]  = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[20][18] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[16][17] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Torches
  tiles[14][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Sunken Library to Crystal Grotto (cols 32-36, rows 21-25)
  // =======================================================================
  carveRoom(32, 21, 36, 24, 'stone', 1);
  tiles[21][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Crystal Grotto (cols 28-40, rows 14-20)
  // =======================================================================
  carveRoom(28, 14, 40, 20, 'ice');

  for (let r = 14; r <= 20; r++) {
    for (let c = 28; c <= 40; c++) {
      if (hash(r, c, 29) < 25) {
        tiles[r][c] = { height: 1, biome: 'ice_crystal', collision: false };
      }
    }
  }

  // Crystal pillars
  tiles[15][30] = { height: 4, biome: 'ice', collision: true };
  tiles[15][38] = { height: 4, biome: 'ice', collision: true };
  tiles[19][30] = { height: 4, biome: 'ice', collision: true };
  tiles[19][38] = { height: 4, biome: 'ice', collision: true };

  // Chest
  tiles[17][34] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'chest', data: { id: 'abyss_chest3' },
  };

  // Torches
  tiles[13][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[13][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[13][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 6 — connecting left and right sides (cols 18-28, rows 16-18)
  // =======================================================================
  carveRoom(18, 16, 28, 18, 'stone', 1);

  // =======================================================================
  // Corridor 7 — to Whirlpool Chamber (cols 20-24, rows 12-16)
  // =======================================================================
  carveRoom(20, 12, 24, 15, 'stone', 1);
  tiles[12][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Whirlpool Chamber (cols 14-30, rows 7-12)
  // =======================================================================
  carveRoom(14, 7, 30, 12, 'stone');

  for (let r = 7; r <= 12; r++) {
    for (let c = 14; c <= 30; c++) {
      if (hash(r, c, 37) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_crystal', collision: false };
      }
    }
  }

  // Central whirlpool (water tiles)
  for (let r = 9; r <= 11; r++) {
    for (let c = 20; c <= 24; c++) {
      tiles[r][c] = { height: 0, biome: 'frozen_water', collision: false };
    }
  }

  // Pillars
  tiles[8][16]  = { height: 4, biome: 'ice', collision: true };
  tiles[8][28]  = { height: 4, biome: 'ice', collision: true };
  tiles[11][16] = { height: 4, biome: 'ice', collision: true };
  tiles[11][28] = { height: 4, biome: 'ice', collision: true };

  // Torches
  tiles[6][14]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][30]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][13]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][31]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 8 — Whirlpool to Boss Room (cols 20-24, rows 4-7)
  // =======================================================================
  carveRoom(20, 4, 24, 6, 'stone', 1);
  tiles[4][19]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 8 — Boss Room: Abyssal Leviathan (cols 12-32, rows 1-4) — checkerboard
  // =======================================================================
  for (let r = 1; r <= 4; r++) {
    for (let c = 12; c <= 32; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'ice' : 'ice_dark', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 0; r <= 5; r++) {
    for (let c = 11; c <= 33; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 1 && r <= 4 && c >= 12 && c <= 32) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'ice_dark') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[1][12]  = { height: 5, biome: 'ice', collision: true };
  tiles[1][32]  = { height: 5, biome: 'ice', collision: true };
  tiles[4][12]  = { height: 5, biome: 'ice', collision: true };
  tiles[4][32]  = { height: 5, biome: 'ice', collision: true };

  // Crystal decorations along boss room
  tiles[1][15]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[1][29]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[4][15]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[4][29]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[2][12]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[3][12]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[2][32]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[3][32]  = { height: 1, biome: 'ice_crystal', collision: false };

  // Torch ring (6 torches)
  tiles[0][13]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][31]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][33]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Water patches near boss
  tiles[2][14]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[3][20]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[1][26]  = { height: 0, biome: 'frozen_water', collision: false };

  // Boss tile at (22, 2)
  tiles[2][22] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'boss', data: { id: 'abyssal_leviathan', name: 'Abyssal Leviathan' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoAbyssScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: AbyssMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Abyss');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Abyss';

    trackZoneVisit('Abyss');

    this.initZone(buildAbyssTiles(), 12, 42);

    // Boss indicator (if not yet defeated)
    if (!state.flags.has('abyss_boss_defeated')) {
      this.createBossIndicator();
    }

    // Chest indicators
    if (!state.flags.has('abyss_chest1')) {
      this.createChestIndicator(7, 29);
    }
    if (!state.flags.has('abyss_chest2')) {
      this.createChestIndicator(34, 28);
    }
    if (!state.flags.has('abyss_chest3')) {
      this.createChestIndicator(34, 17);
    }

    // Spawn abyss monsters
    this.monsterSprites = [];
    for (const m of ABYSS_MONSTERS) {
      this.spawnAbyssMonsterAt(m);
    }

    this.events.emit('zone-change', 'Abyssal Depths');
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
  // Abyss monster spawning
  // -----------------------------------------------------------------------
  private spawnAbyssMonsterAt(m: AbyssMonster): void {
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
      fontSize: '7px', fontFamily: 'monospace', color: '#ccddff',
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: AbyssMonster; alive: boolean }): void {
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
      returnScene: 'Abyss',
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

        this.events.emit('quest-update');
        this.events.emit('hp-change');

        // Respawn after 20 seconds
        const timer = this.time.delayedCall(20000, () => {
          this.spawnAbyssMonsterAt(m);
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
    const dialogue = BOSS_DIALOGUES['abyssal_leviathan'];
    if (state.flags.has('abyss_boss_defeated')) {
      this.showDialog('Abyssal Leviathan', ['The depths are silent... the leviathan sleeps forever.'], 22, 2);
      return;
    }

    this.showDialog('Abyssal Leviathan', dialogue.preBattle, 22, 2);

    const checkDialog = () => {
      if (!this.frozen) {
        this.startBossFight(state);
      } else {
        this.time.delayedCall(100, checkDialog);
      }
    };
    this.time.delayedCall(1000, checkDialog);
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Abyss',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('abyss_boss_defeated');
        state.addKill('abyssal_leviathan');

        // Lore tracking
        state.flags.add('lore_abyssal_leviathan');

        // Daily quest tracking
        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['abyssal_leviathan'];
        this.showDialog('Abyssal Leviathan', [dialogue.deathLine], 22, 2);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Abyssal Leviathan', dialogue.loreReveal);
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
      state.gold += 75;
      this.showDialog('Sunken Chest', ['Found: 3x Health Potion, 75 Gold!'], tx, ty);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Sunken Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x2266aa;
    const pos = toScreen(22, 2, 1);
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

    const label = this.add.text(0, -28, 'Abyssal Leviathan', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#4488cc', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv25 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#6699dd', stroke: '#000000', strokeThickness: 2,
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
