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
  type: 'titan_forgemaster',
  name: 'Titan Forgemaster',
  level: 50,
  hp: 1500,
  maxHp: 1500,
  atk: 72,
  def: 38,
};

// ---------------------------------------------------------------------------
// Monster definitions
// ---------------------------------------------------------------------------
interface ForgeMonster {
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

const FORGE_MONSTERS: ForgeMonster[] = [
  // Room 1 — Forge Gate (forge automatons Lv40, molten giants Lv40)
  { tx: 45, ty: 22, type: 'forge_automaton', name: 'Forge Automaton',  level: 40, color: 0x998866, hp: 550, atk: 52, def: 30 },
  { tx: 45, ty: 26, type: 'forge_automaton', name: 'Forge Automaton',  level: 40, color: 0x998866, hp: 550, atk: 52, def: 30 },
  { tx: 45, ty: 24, type: 'molten_giant',   name: 'Molten Giant',     level: 41, color: 0xcc6600, hp: 600, atk: 55, def: 28 },
  { tx: 47, ty: 25, type: 'molten_giant',   name: 'Molten Giant',     level: 41, color: 0xcc6600, hp: 600, atk: 55, def: 28 },

  // Room 2 — Anvil Hall (steel golems Lv41, hammer sentinels Lv42)
  { tx: 36, ty: 40, type: 'steel_golem',    name: 'Steel Golem',      level: 41, color: 0x778899, hp: 620, atk: 54, def: 34 },
  { tx: 42, ty: 42, type: 'steel_golem',    name: 'Steel Golem',      level: 41, color: 0x778899, hp: 620, atk: 54, def: 34 },
  { tx: 39, ty: 39, type: 'hammer_sentinel', name: 'Hammer Sentinel', level: 42, color: 0xaa8855, hp: 600, atk: 58, def: 32 },
  { tx: 41, ty: 41, type: 'hammer_sentinel', name: 'Hammer Sentinel', level: 42, color: 0xaa8855, hp: 600, atk: 58, def: 32 },

  // Room 3 — Molten River (molten giants Lv42, magma smiths Lv43)
  { tx: 14, ty: 40, type: 'molten_giant',   name: 'Molten Giant',     level: 42, color: 0xdd7711, hp: 650, atk: 58, def: 30 },
  { tx: 20, ty: 42, type: 'magma_smith',    name: 'Magma Smith',      level: 43, color: 0xff5500, hp: 620, atk: 62, def: 28 },
  { tx: 17, ty: 39, type: 'molten_giant',   name: 'Molten Giant',     level: 42, color: 0xdd7711, hp: 650, atk: 58, def: 30 },
  { tx: 19, ty: 41, type: 'magma_smith',    name: 'Magma Smith',      level: 43, color: 0xff5500, hp: 620, atk: 62, def: 28 },

  // Room 4 — Weapon Gallery (forge automatons Lv43, steel golems Lv44)
  { tx: 36, ty: 28, type: 'forge_automaton', name: 'Forge Automaton',  level: 43, color: 0xaa9977, hp: 620, atk: 60, def: 34 },
  { tx: 42, ty: 30, type: 'steel_golem',    name: 'Steel Golem',      level: 44, color: 0x8899aa, hp: 680, atk: 60, def: 36 },
  { tx: 39, ty: 27, type: 'forge_automaton', name: 'Forge Automaton',  level: 43, color: 0xaa9977, hp: 620, atk: 60, def: 34 },

  // Room 5 — Armor Vault (hammer sentinels Lv44, titan guards Lv45)
  { tx: 14, ty: 28, type: 'hammer_sentinel', name: 'Hammer Sentinel', level: 44, color: 0xbb9966, hp: 660, atk: 62, def: 34 },
  { tx: 20, ty: 30, type: 'titan_guard',    name: 'Titan Guard',      level: 45, color: 0x887744, hp: 720, atk: 64, def: 36 },
  { tx: 17, ty: 27, type: 'hammer_sentinel', name: 'Hammer Sentinel', level: 44, color: 0xbb9966, hp: 660, atk: 62, def: 34 },
  { tx: 19, ty: 29, type: 'titan_guard',    name: 'Titan Guard',      level: 45, color: 0x887744, hp: 720, atk: 64, def: 36 },

  // Room 6 — Furnace Core (magma smiths Lv45, molten giants Lv46)
  { tx: 36, ty: 16, type: 'magma_smith',    name: 'Magma Smith',      level: 45, color: 0xff6611, hp: 680, atk: 66, def: 30 },
  { tx: 42, ty: 18, type: 'molten_giant',   name: 'Molten Giant',     level: 46, color: 0xee8822, hp: 730, atk: 64, def: 34 },
  { tx: 39, ty: 15, type: 'magma_smith',    name: 'Magma Smith',      level: 45, color: 0xff6611, hp: 680, atk: 66, def: 30 },

  // Room 7 — Titan Workshop (titan guards Lv46, steel golems Lv47)
  { tx: 14, ty: 16, type: 'titan_guard',    name: 'Titan Guard',      level: 46, color: 0x998855, hp: 760, atk: 66, def: 38 },
  { tx: 20, ty: 18, type: 'steel_golem',    name: 'Steel Golem',      level: 47, color: 0x99aabb, hp: 750, atk: 64, def: 40 },
  { tx: 17, ty: 15, type: 'titan_guard',    name: 'Titan Guard',      level: 46, color: 0x998855, hp: 760, atk: 66, def: 38 },

  // Room 8 — Colossus Chamber (titan guards Lv48, forge automatons Lv48)
  { tx: 14, ty: 7,  type: 'titan_guard',    name: 'Titan Guard',      level: 48, color: 0xaa9966, hp: 800, atk: 68, def: 40 },
  { tx: 20, ty: 9,  type: 'forge_automaton', name: 'Forge Automaton',  level: 48, color: 0xbb9988, hp: 770, atk: 66, def: 38 },
  // (13,7): was (17,6) — exactly on the boss interact tile, forcing a guard
  // battle on every approach to the boss
  { tx: 13, ty: 7,  type: 'titan_guard',    name: 'Titan Guard',      level: 48, color: 0xaa9966, hp: 800, atk: 68, def: 40 },

  // Corridor monsters
  { tx: 44, ty: 35, type: 'forge_automaton', name: 'Forge Automaton',  level: 41, color: 0x998866, hp: 560, atk: 54, def: 31 },
  { tx: 26, ty: 41, type: 'molten_giant',   name: 'Molten Giant',     level: 43, color: 0xdd7711, hp: 650, atk: 58, def: 30 },
  { tx: 26, ty: 29, type: 'steel_golem',    name: 'Steel Golem',      level: 45, color: 0x8899aa, hp: 700, atk: 62, def: 36 },
  { tx: 26, ty: 17, type: 'hammer_sentinel', name: 'Hammer Sentinel', level: 47, color: 0xcc9977, hp: 730, atk: 66, def: 36 },
  { tx: 17, ty: 11, type: 'titan_guard',    name: 'Titan Guard',      level: 48, color: 0xaa9966, hp: 800, atk: 68, def: 40 },
];

// ---------------------------------------------------------------------------
// Map builder — 50 cols x 50 rows
// ---------------------------------------------------------------------------
function buildForgeTiles(): ZoneTile[][] {
  const SIZE = 50;

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
  // Room 1 — Forge Gate (cols 42-48, rows 20-28) — right edge entrance
  // =======================================================================
  carveRoom(42, 20, 48, 28);
  for (let r = 20; r <= 28; r++) {
    for (let c = 42; c <= 48; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava at entrance
  tiles[23][47] = { height: 0, biome: 'lava', collision: false };
  tiles[24][47] = { height: 0, biome: 'lava', collision: false };
  tiles[25][47] = { height: 0, biome: 'lava', collision: false };
  // Torches
  tiles[19][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][45] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][48] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at right edge
  tiles[24][49] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[25][49] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Forge Gate to Anvil Hall (cols 42-44, rows 28-36)
  // =======================================================================
  carveRoom(42, 28, 46, 36, 'stone_dark', 1);
  tiles[29][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[35][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Anvil Hall (cols 33-45, rows 37-45)
  // =======================================================================
  carveRoom(33, 37, 45, 45);
  for (let r = 37; r <= 45; r++) {
    for (let c = 33; c <= 45; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Anvil (rock deco)
  tiles[40][39] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[41][39] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  // Pillars
  tiles[38][35] = { height: 4, biome: 'stone', collision: true };
  tiles[38][43] = { height: 4, biome: 'stone', collision: true };
  tiles[44][35] = { height: 4, biome: 'stone', collision: true };
  tiles[44][43] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[36][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][45] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[43][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[43][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[41][37] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'forge_chest1' },
  };

  // =======================================================================
  // Corridor 2 — Anvil Hall to Molten River (cols 24-33, rows 40-42)
  // =======================================================================
  carveRoom(24, 40, 32, 42, 'stone_dark', 1);
  tiles[40][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Molten River (cols 10-24, rows 37-45)
  // =======================================================================
  carveRoom(10, 37, 24, 45);
  for (let r = 37; r <= 45; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Molten river (lava strip)
  for (let c = 12; c <= 22; c++) {
    tiles[41][c] = { height: 0, biome: 'lava', collision: false };
  }
  tiles[40][15] = { height: 0, biome: 'lava', collision: false };
  tiles[42][19] = { height: 0, biome: 'lava', collision: false };
  // Torches
  tiles[36][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[43][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[43][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Anvil Hall to Weapon Gallery (cols 37-41, rows 33-37)
  // =======================================================================
  carveRoom(37, 33, 41, 36, 'stone_dark', 1);

  // =======================================================================
  // Room 4 — Weapon Gallery (cols 33-45, rows 25-32)
  // =======================================================================
  carveRoom(33, 25, 45, 32);
  for (let r = 25; r <= 32; r++) {
    for (let c = 33; c <= 45; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Barrel clusters (weapon racks)
  tiles[26][34] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[26][35] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[31][43] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[31][44] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  // Torches
  tiles[24][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][45] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Molten River to Armor Vault (cols 15-19, rows 33-37)
  // =======================================================================
  carveRoom(15, 33, 19, 36, 'stone_dark', 1);

  // =======================================================================
  // Room 5 — Armor Vault (cols 10-24, rows 25-32)
  // =======================================================================
  carveRoom(10, 25, 24, 32);
  for (let r = 25; r <= 32; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Pillars
  tiles[26][12] = { height: 4, biome: 'stone', collision: true };
  tiles[26][22] = { height: 4, biome: 'stone', collision: true };
  tiles[31][12] = { height: 4, biome: 'stone', collision: true };
  tiles[31][22] = { height: 4, biome: 'stone', collision: true };
  // Skull decorations
  tiles[25][11] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[25][23] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[24][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[29][17] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'forge_chest2' },
  };

  // =======================================================================
  // Corridor 5 — Weapon Gallery to Furnace Core (cols 37-41, rows 21-25)
  // =======================================================================
  carveRoom(37, 21, 41, 24, 'stone_dark', 1);
  tiles[21][36] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Furnace Core (cols 33-45, rows 13-20)
  // =======================================================================
  carveRoom(33, 13, 45, 20);
  for (let r = 13; r <= 20; r++) {
    for (let c = 33; c <= 45; c++) {
      if (hash(r, c, 37) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Furnace core (lava pool)
  tiles[16][38] = { height: 0, biome: 'lava', collision: false };
  tiles[16][39] = { height: 0, biome: 'lava', collision: false };
  tiles[16][40] = { height: 0, biome: 'lava', collision: false };
  tiles[17][38] = { height: 0, biome: 'lava', collision: false };
  tiles[17][40] = { height: 0, biome: 'lava', collision: false };
  tiles[18][38] = { height: 0, biome: 'lava', collision: false };
  tiles[18][39] = { height: 0, biome: 'lava', collision: false };
  tiles[18][40] = { height: 0, biome: 'lava', collision: false };
  // Torches
  tiles[12][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][45] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[17][39] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'forge_chest3' },
  };

  // =======================================================================
  // Corridor 6 — Armor Vault to Titan Workshop (cols 15-19, rows 21-25)
  // =======================================================================
  carveRoom(15, 21, 19, 24, 'stone_dark', 1);
  tiles[21][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Titan Workshop (cols 10-24, rows 13-20)
  // =======================================================================
  carveRoom(10, 13, 24, 20);
  for (let r = 13; r <= 20; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 41) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Workshop equipment (rocks/barrels)
  tiles[14][11] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[14][23] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[19][11] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[19][12] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  // Pillars
  tiles[14][13] = { height: 4, biome: 'stone', collision: true };
  tiles[14][21] = { height: 4, biome: 'stone', collision: true };
  tiles[19][13] = { height: 4, biome: 'stone', collision: true };
  tiles[19][21] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[12][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 7 — Titan Workshop to Colossus Chamber (cols 15-19, rows 9-13)
  // =======================================================================
  carveRoom(15, 9, 19, 12, 'stone_dark', 1);
  tiles[9][14]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 8 — Colossus Chamber (cols 10-24, rows 4-8)
  // =======================================================================
  carveRoom(10, 4, 24, 8);
  for (let r = 4; r <= 8; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 47) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava hazards
  tiles[5][12] = { height: 0, biome: 'lava', collision: false };
  tiles[5][22] = { height: 0, biome: 'lava', collision: false };
  tiles[7][12] = { height: 0, biome: 'lava', collision: false };
  tiles[7][22] = { height: 0, biome: 'lava', collision: false };
  // Pillars
  tiles[5][13] = { height: 4, biome: 'stone', collision: true };
  tiles[5][21] = { height: 4, biome: 'stone', collision: true };
  tiles[7][13] = { height: 4, biome: 'stone', collision: true };
  tiles[7][21] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[3][10]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][24]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 8 — Colossus Chamber to Boss Room (cols 15-19, rows 1-4)
  // =======================================================================
  carveRoom(15, 1, 19, 3, 'stone_dark', 1);

  // =======================================================================
  // Room 9 — Boss Room: Titan Forgemaster (cols 6-28, rows -2 to 1) — use rows 1-4 region
  // Actually place boss in colossus chamber center
  // =======================================================================
  // Boss room is integrated into Colossus Chamber — checkerboard center
  for (let r = 4; r <= 8; r++) {
    for (let c = 14; c <= 20; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'volcanic', collision: false };
    }
  }
  // Corner pillars (boss area)
  tiles[4][14]  = { height: 5, biome: 'stone', collision: true };
  tiles[4][20]  = { height: 5, biome: 'stone', collision: true };
  tiles[8][14]  = { height: 5, biome: 'stone', collision: true };
  tiles[8][20]  = { height: 5, biome: 'stone', collision: true };
  // Skull ring
  tiles[4][16]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][18]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[8][16]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[8][18]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[5][14]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[7][14]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[5][20]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[7][20]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Boss tile
  tiles[6][17] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'titan_forgemaster', name: 'Titan Forgemaster' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoForgeScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: ForgeMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Forge');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Forge';

    trackZoneVisit('Forge');

    this.initZone(buildForgeTiles(), 46, 24);

    if (!state.flags.has('forge_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('forge_chest1')) {
      this.createChestIndicator(37, 41);
    }
    if (!state.flags.has('forge_chest2')) {
      this.createChestIndicator(17, 29);
    }
    if (!state.flags.has('forge_chest3')) {
      this.createChestIndicator(39, 17);
    }

    this.monsterSprites = [];
    for (const m of FORGE_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', "Titan's Forge");
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
  private spawnDungeonMonsterAt(m: ForgeMonster): void {
    const pos = toScreen(m.tx, m.ty, 1);
    const container = this.add.container(pos.x, pos.y);

    // Gövde: sprite eşlemesi varsa sprite, yoksa eski renkli daire
    const spr = this.createMonsterVisual(container, m.type);
    if (!spr) {
      const body = this.add.circle(0, -8, 6, m.color, 1);
      container.add(body);
    }

    const label = this.add.text(0, -22, `Lv${m.level}`, {
      fontSize: '8px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(label);

    const name = this.add.text(0, 2, m.name, {
      fontSize: '7px', fontFamily: 'monospace', color: '#ffddaa',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(name);

    container.setDepth((m.tx + m.ty) * 10 + m.ty + 5);

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
        this.startMonsterBattle(entry);
        break;
      }
    }
  }

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: ForgeMonster; alive: boolean }): void {
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
      returnScene: 'Forge',
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
    const dialogue = BOSS_DIALOGUES['titan_forgemaster'];
    if (state.flags.has('forge_boss_defeated')) {
      this.showDialog('Titan Forgemaster', ['The forge grows cold and silent...'], 17, 6);
      return;
    }

    this.showDialog('Titan Forgemaster', dialogue.preBattle, 17, 6);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Forge',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('forge_boss_defeated');
        state.addKill('titan_forgemaster');

        // Lore tracking
        state.flags.add('lore_titan_forgemaster');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['titan_forgemaster'];
        this.showDialog('Titan Forgemaster', [dialogue.deathLine], 17, 6);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Titan Forgemaster', dialogue.loreReveal);
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
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 4,
      });
      state.gold += 150;
      this.showDialog('Titan Chest', ['Found: 4x Health Potion, 150 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Titan Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0xcc8800;
    const pos = toScreen(17, 6, 1);
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

    const label = this.add.text(0, -28, 'Titan Forgemaster', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffaa22', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv50 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#ffcc66', stroke: '#000000', strokeThickness: 2,
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
