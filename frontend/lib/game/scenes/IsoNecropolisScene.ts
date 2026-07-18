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
  type: 'lich_king',
  name: 'Lich King',
  level: 30,
  hp: 800,
  maxHp: 800,
  atk: 45,
  def: 25,
};

// ---------------------------------------------------------------------------
// Necropolis monster definitions
// ---------------------------------------------------------------------------
interface NecropolisMonster {
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

const NECROPOLIS_MONSTERS: NecropolisMonster[] = [
  // Room 1 — City Gates (skeleton lords Lv20, plague zombies Lv20)
  { tx: 14, ty: 43, type: 'skeleton_lord',  name: 'Skeleton Lord',     level: 20, color: 0xddddaa, hp: 200, atk: 28, def: 14 },
  { tx: 20, ty: 45, type: 'skeleton_lord',  name: 'Skeleton Lord',     level: 20, color: 0xddddaa, hp: 200, atk: 28, def: 14 },
  { tx: 17, ty: 44, type: 'plague_zombie',  name: 'Plague Zombie',     level: 20, color: 0x667744, hp: 220, atk: 26, def: 16 },

  // Room 2 — Bone Avenue (death knights Lv22, skeleton lords Lv22)
  { tx: 32, ty: 40, type: 'death_knight',   name: 'Death Knight',      level: 22, color: 0x444466, hp: 260, atk: 32, def: 18 },
  { tx: 36, ty: 42, type: 'death_knight',   name: 'Death Knight',      level: 22, color: 0x444466, hp: 260, atk: 32, def: 18 },
  { tx: 34, ty: 41, type: 'skeleton_lord',  name: 'Bone Overlord',     level: 22, color: 0xeeeecc, hp: 240, atk: 30, def: 16 },
  { tx: 38, ty: 43, type: 'plague_zombie',  name: 'Rotting Horror',    level: 21, color: 0x778855, hp: 230, atk: 27, def: 17 },

  // Room 3 — Plague Ward (plague zombies Lv23, soul reapers Lv24)
  { tx: 14, ty: 30, type: 'plague_zombie',  name: 'Plague Hulk',       level: 23, color: 0x889966, hp: 280, atk: 30, def: 18 },
  { tx: 20, ty: 32, type: 'plague_zombie',  name: 'Plague Hulk',       level: 23, color: 0x889966, hp: 280, atk: 30, def: 18 },
  { tx: 17, ty: 31, type: 'soul_reaper',    name: 'Soul Reaper',       level: 24, color: 0x553388, hp: 250, atk: 35, def: 14 },

  // Room 4 — Tomb of Kings (bone dragons Lv25, death knights Lv25)
  { tx: 32, ty: 27, type: 'bone_dragon',    name: 'Bone Dragon',       level: 25, color: 0xccbb88, hp: 350, atk: 36, def: 20 },
  { tx: 38, ty: 29, type: 'death_knight',   name: 'Tomb Guardian',     level: 25, color: 0x555577, hp: 300, atk: 34, def: 22 },
  { tx: 35, ty: 28, type: 'death_knight',   name: 'Tomb Guardian',     level: 25, color: 0x555577, hp: 300, atk: 34, def: 22 },

  // Room 5 — Lich Library (lich acolytes Lv26, soul reapers Lv26)
  { tx: 14, ty: 18, type: 'lich_acolyte',   name: 'Lich Acolyte',      level: 26, color: 0x6633aa, hp: 280, atk: 37, def: 16 },
  { tx: 20, ty: 20, type: 'lich_acolyte',   name: 'Lich Acolyte',      level: 26, color: 0x6633aa, hp: 280, atk: 37, def: 16 },
  { tx: 17, ty: 19, type: 'soul_reaper',    name: 'Dark Reaper',       level: 26, color: 0x443377, hp: 270, atk: 38, def: 15 },

  // Room 6 — Death Garden (bone dragons Lv27, plague zombies Lv27)
  { tx: 32, ty: 15, type: 'bone_dragon',    name: 'Frost Dragon',      level: 27, color: 0xddcc99, hp: 380, atk: 38, def: 21 },
  { tx: 38, ty: 17, type: 'plague_zombie',  name: 'Garden Horror',     level: 27, color: 0x99aa77, hp: 320, atk: 33, def: 20 },
  { tx: 35, ty: 16, type: 'soul_reaper',    name: 'Garden Wraith',     level: 27, color: 0x664499, hp: 290, atk: 39, def: 16 },

  // Room 7 — Soul Forge (skeleton lords Lv28, lich acolytes Lv28)
  { tx: 14, ty: 8,  type: 'skeleton_lord',  name: 'Forge Guardian',    level: 28, color: 0xffeecc, hp: 340, atk: 38, def: 20 },
  { tx: 20, ty: 10, type: 'lich_acolyte',   name: 'Forge Magus',       level: 28, color: 0x7744bb, hp: 310, atk: 40, def: 17 },
  { tx: 17, ty: 9,  type: 'lich_acolyte',   name: 'Forge Magus',       level: 28, color: 0x7744bb, hp: 310, atk: 40, def: 17 },

  // Corridor monsters
  { tx: 24, ty: 38, type: 'plague_zombie',  name: 'Shambling Dead',    level: 21, color: 0x667744, hp: 225, atk: 27, def: 16 },
  { tx: 24, ty: 24, type: 'soul_reaper',    name: 'Corridor Wraith',   level: 24, color: 0x553399, hp: 260, atk: 35, def: 15 },
  { tx: 24, ty: 14, type: 'death_knight',   name: 'Dark Sentinel',     level: 27, color: 0x555588, hp: 310, atk: 36, def: 22 },
  { tx: 17, ty: 4,  type: 'bone_dragon',    name: 'Elder Wyrm',        level: 29, color: 0xeedd99, hp: 400, atk: 42, def: 23 },
];

// ---------------------------------------------------------------------------
// Map builder — 48 cols x 48 rows
// ---------------------------------------------------------------------------
function buildNecropolisTiles(): ZoneTile[][] {
  const SIZE = 48;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Fill with stone_dark walls ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'stone_dark', collision: true });
    }
    tiles.push(row);
  }

  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'cobble', h = 1) => {
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
  // Room 1 — City Gates (cols 10-23, rows 41-46)
  // =======================================================================
  carveRoom(10, 41, 23, 46);

  for (let r = 41; r <= 46; r++) {
    for (let c = 10; c <= 23; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Barrel cluster
  tiles[44][11] = { height: 1, biome: 'cobble', collision: true, data: { deco: 'barrel' } };
  tiles[45][11] = { height: 1, biome: 'cobble', collision: true, data: { deco: 'barrel' } };

  // Skull decorations
  tiles[42][22] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[45][22] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };

  // Torches
  tiles[40][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][16] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom
  tiles[47][16] = { height: 1, biome: 'cobble', collision: false, interact: 'exit_forest' };
  tiles[47][17] = { height: 1, biome: 'cobble', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — City Gates to Bone Avenue (cols 22-29, rows 41-43)
  // =======================================================================
  carveRoom(22, 41, 29, 43, 'stone_dark', 1);
  tiles[41][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[41][30] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Bone Avenue (cols 29-42, rows 38-45)
  // =======================================================================
  carveRoom(29, 38, 42, 45);

  for (let r = 38; r <= 45; r++) {
    for (let c = 29; c <= 42; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Skull decorations (bone avenue)
  tiles[39][30] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[39][41] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[44][30] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[44][41] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };

  // Chest
  tiles[41][35] = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'chest', data: { id: 'necro_chest1' },
  };

  // Torches
  tiles[37][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — City Gates to Plague Ward (cols 14-18, rows 36-41)
  // =======================================================================
  carveRoom(14, 36, 18, 40, 'stone_dark', 1);
  tiles[36][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Plague Ward (cols 8-23, rows 28-35)
  // =======================================================================
  carveRoom(8, 28, 23, 35);

  for (let r = 28; r <= 35; r++) {
    for (let c = 8; c <= 23; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Lava accents (plague pools)
  tiles[31][14] = { height: 0, biome: 'lava', collision: false };
  tiles[31][15] = { height: 0, biome: 'lava', collision: false };
  tiles[32][14] = { height: 0, biome: 'lava', collision: false };
  tiles[32][15] = { height: 0, biome: 'lava', collision: false };

  // Pillars
  tiles[29][10] = { height: 4, biome: 'stone', collision: true };
  tiles[29][21] = { height: 4, biome: 'stone', collision: true };
  tiles[34][10] = { height: 4, biome: 'stone', collision: true };
  tiles[34][21] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[27][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Bone Avenue to Tomb of Kings (cols 33-37, rows 33-38)
  // =======================================================================
  carveRoom(33, 33, 37, 37, 'stone_dark', 1);
  tiles[33][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Tomb of Kings (cols 29-42, rows 25-32)
  // =======================================================================
  carveRoom(29, 25, 42, 32);

  for (let r = 25; r <= 32; r++) {
    for (let c = 29; c <= 42; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Skull decorations
  tiles[26][30] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[26][41] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[31][30] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[31][41] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };

  // Pillars
  tiles[27][32] = { height: 4, biome: 'stone', collision: true };
  tiles[27][39] = { height: 4, biome: 'stone', collision: true };
  tiles[30][32] = { height: 4, biome: 'stone', collision: true };
  tiles[30][39] = { height: 4, biome: 'stone', collision: true };

  // Chest
  tiles[28][35] = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'chest', data: { id: 'necro_chest2' },
  };

  // Torches
  tiles[24][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Plague Ward to Lich Library (cols 14-18, rows 23-28)
  // =======================================================================
  carveRoom(14, 23, 18, 27, 'stone_dark', 1);
  tiles[23][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Lich Library (cols 8-23, rows 16-22)
  // =======================================================================
  carveRoom(8, 16, 23, 22);

  for (let r = 16; r <= 22; r++) {
    for (let c = 8; c <= 23; c++) {
      if (hash(r, c, 25) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Book shelf obstacles (rock decorations)
  tiles[17][10] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[17][21] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[21][10] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[21][21] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Torches
  tiles[15][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[19][15] = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'chest', data: { id: 'necro_chest3' },
  };

  // =======================================================================
  // Corridor 5 — Tomb of Kings to Death Garden (cols 33-37, rows 20-25)
  // =======================================================================
  carveRoom(33, 20, 37, 24, 'stone_dark', 1);
  tiles[20][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Death Garden (cols 29-42, rows 13-19)
  // =======================================================================
  carveRoom(29, 13, 42, 19);

  for (let r = 13; r <= 19; r++) {
    for (let c = 29; c <= 42; c++) {
      if (hash(r, c, 29) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Lava accents
  tiles[15][34] = { height: 0, biome: 'lava', collision: false };
  tiles[15][35] = { height: 0, biome: 'lava', collision: false };
  tiles[16][34] = { height: 0, biome: 'lava', collision: false };
  tiles[17][38] = { height: 0, biome: 'lava', collision: false };
  tiles[17][39] = { height: 0, biome: 'lava', collision: false };

  // Torches
  tiles[12][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][42] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 6 — Lich Library to Soul Forge (cols 14-18, rows 11-16)
  // =======================================================================
  carveRoom(14, 11, 18, 15, 'stone_dark', 1);
  tiles[11][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Soul Forge (cols 8-23, rows 5-11)
  // =======================================================================
  carveRoom(8, 5, 23, 10);

  for (let r = 5; r <= 10; r++) {
    for (let c = 8; c <= 23; c++) {
      if (hash(r, c, 33) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Lava forge in center
  tiles[7][14]  = { height: 0, biome: 'lava', collision: false };
  tiles[7][15]  = { height: 0, biome: 'lava', collision: false };
  tiles[7][16]  = { height: 0, biome: 'lava', collision: false };
  tiles[8][14]  = { height: 0, biome: 'lava', collision: false };
  tiles[8][16]  = { height: 0, biome: 'lava', collision: false };

  // Pillars
  tiles[6][10]  = { height: 4, biome: 'stone', collision: true };
  tiles[6][21]  = { height: 4, biome: 'stone', collision: true };
  tiles[9][10]  = { height: 4, biome: 'stone', collision: true };
  tiles[9][21]  = { height: 4, biome: 'stone', collision: true };

  // Chest
  tiles[8][19]  = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'chest', data: { id: 'necro_chest4' },
  };

  // Torches
  tiles[4][8]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][23]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 7 — Soul Forge to Boss Room (cols 14-18, rows 2-5)
  // =======================================================================
  carveRoom(14, 2, 18, 4, 'stone_dark', 1);
  tiles[2][13]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][19]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 8 — Boss Room: Lich King (cols 8-23, rows 0-2) — checkerboard
  // =======================================================================
  for (let r = 0; r <= 2; r++) {
    for (let c = 8; c <= 23; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'cobble' : 'stone_dark', collision: false };
    }
  }
  for (let r2 = 0; r2 <= 3; r2++) {
    for (let c2 = 7; c2 <= 24; c2++) {
      if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
      if (r2 >= 0 && r2 <= 2 && c2 >= 8 && c2 <= 23) continue;
      if (tiles[r2][c2].collision && tiles[r2][c2].biome === 'stone_dark') {
        tiles[r2][c2] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[0][8]   = { height: 5, biome: 'stone', collision: true };
  tiles[0][23]  = { height: 5, biome: 'stone', collision: true };
  tiles[2][8]   = { height: 5, biome: 'stone', collision: true };
  tiles[2][23]  = { height: 5, biome: 'stone', collision: true };

  // Skull ring
  tiles[0][10]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[0][21]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[2][10]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[2][21]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[1][8]   = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[1][23]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };

  // Torch ring
  tiles[0][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (15, 1)
  tiles[1][15] = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'boss', data: { id: 'lich_king', name: 'Lich King' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoNecropolisScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: NecropolisMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Necropolis');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Necropolis';

    trackZoneVisit('Necropolis');

    this.initZone(buildNecropolisTiles(), 16, 45);

    if (!state.flags.has('necropolis_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('necro_chest1')) {
      this.createChestIndicator(35, 41);
    }
    if (!state.flags.has('necro_chest2')) {
      this.createChestIndicator(35, 28);
    }
    if (!state.flags.has('necro_chest3')) {
      this.createChestIndicator(15, 19);
    }
    if (!state.flags.has('necro_chest4')) {
      this.createChestIndicator(19, 8);
    }

    this.monsterSprites = [];
    for (const m of NECROPOLIS_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Necropolis');
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
  private spawnDungeonMonsterAt(m: NecropolisMonster): void {
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
      fontSize: '7px', fontFamily: 'monospace', color: '#ffcccc',
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: NecropolisMonster; alive: boolean }): void {
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
      returnScene: 'Necropolis',
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
    const dialogue = BOSS_DIALOGUES['lich_king'];
    if (state.flags.has('necropolis_boss_defeated')) {
      this.showDialog('Lich King', ['The throne of death lies empty... for now.'], 15, 1);
      return;
    }

    this.showDialog('Lich King', dialogue.preBattle, 15, 1);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Necropolis',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('necropolis_boss_defeated');
        state.addKill('lich_king');

        // Lore tracking
        state.flags.add('lore_lich_king');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['lich_king'];
        this.showDialog('Lich King', [dialogue.deathLine], 15, 1);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Lich King', dialogue.loreReveal);
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
      state.gold += 80;
      this.showDialog('Ancient Sarcophagus', ['Found: 3x Health Potion, 80 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Ancient Sarcophagus', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x6633cc;
    const pos = toScreen(15, 1, 1);
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

    const label = this.add.text(0, -28, 'Lich King', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#aa44ff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv30 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#cc88ff', stroke: '#000000', strokeThickness: 2,
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
