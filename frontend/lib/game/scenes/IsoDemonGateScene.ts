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
  type: 'demon_lord',
  name: 'Demon Lord',
  level: 35,
  hp: 1000,
  maxHp: 1000,
  atk: 55,
  def: 30,
};

// ---------------------------------------------------------------------------
// Monster definitions
// ---------------------------------------------------------------------------
interface DemonMonster {
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

const DEMON_MONSTERS: DemonMonster[] = [
  // Room 1 — Hellgate Entry (hell hounds Lv25, lesser demons Lv25)
  { tx: 12, ty: 40, type: 'hell_hound',    name: 'Hell Hound',      level: 25, color: 0xcc4422, hp: 280, atk: 35, def: 16 },
  { tx: 18, ty: 41, type: 'hell_hound',    name: 'Hell Hound',      level: 25, color: 0xcc4422, hp: 280, atk: 35, def: 16 },
  { tx: 15, ty: 39, type: 'lesser_demon',  name: 'Lesser Demon',    level: 26, color: 0x993311, hp: 310, atk: 37, def: 18 },
  { tx: 20, ty: 40, type: 'lesser_demon',  name: 'Lesser Demon',    level: 26, color: 0x993311, hp: 310, atk: 37, def: 18 },

  // Room 2 — Infernal Corridor (hell hounds Lv26, succubi Lv27)
  { tx: 22, ty: 33, type: 'hell_hound',    name: 'Hell Hound',      level: 26, color: 0xdd5533, hp: 300, atk: 37, def: 17 },
  { tx: 22, ty: 30, type: 'succubus',      name: 'Succubus',        level: 27, color: 0xcc44aa, hp: 290, atk: 40, def: 16 },

  // Room 3 — Demon Barracks (lesser demons Lv27, pit fiends Lv28)
  { tx: 10, ty: 28, type: 'lesser_demon',  name: 'Lesser Demon',    level: 27, color: 0xaa3322, hp: 330, atk: 39, def: 19 },
  { tx: 16, ty: 30, type: 'lesser_demon',  name: 'Lesser Demon',    level: 27, color: 0xaa3322, hp: 330, atk: 39, def: 19 },
  { tx: 13, ty: 27, type: 'pit_fiend',     name: 'Pit Fiend',       level: 28, color: 0x881100, hp: 370, atk: 42, def: 22 },
  { tx: 17, ty: 29, type: 'pit_fiend',     name: 'Pit Fiend',       level: 28, color: 0x881100, hp: 370, atk: 42, def: 22 },

  // Room 4 — Torture Chamber (blood knights Lv29, infernal mages Lv29)
  { tx: 30, ty: 28, type: 'blood_knight',  name: 'Blood Knight',    level: 29, color: 0x991133, hp: 400, atk: 43, def: 24 },
  { tx: 36, ty: 30, type: 'blood_knight',  name: 'Blood Knight',    level: 29, color: 0x991133, hp: 400, atk: 43, def: 24 },
  { tx: 33, ty: 27, type: 'infernal_mage', name: 'Infernal Mage',   level: 29, color: 0xff6600, hp: 350, atk: 46, def: 20 },
  { tx: 35, ty: 29, type: 'infernal_mage', name: 'Infernal Mage',   level: 29, color: 0xff6600, hp: 350, atk: 46, def: 20 },

  // Room 5 — Blood Altar (succubi Lv30, blood knights Lv31)
  { tx: 10, ty: 17, type: 'succubus',      name: 'Succubus',        level: 30, color: 0xdd55bb, hp: 340, atk: 44, def: 19 },
  { tx: 16, ty: 19, type: 'succubus',      name: 'Succubus',        level: 30, color: 0xdd55bb, hp: 340, atk: 44, def: 19 },
  { tx: 13, ty: 16, type: 'blood_knight',  name: 'Blood Knight',    level: 31, color: 0xaa2244, hp: 430, atk: 46, def: 25 },
  { tx: 17, ty: 18, type: 'blood_knight',  name: 'Blood Knight',    level: 31, color: 0xaa2244, hp: 430, atk: 46, def: 25 },

  // Room 6 — Summoning Circle (pit fiends Lv32, infernal mages Lv33)
  { tx: 30, ty: 17, type: 'pit_fiend',     name: 'Pit Fiend',       level: 32, color: 0x992200, hp: 460, atk: 48, def: 26 },
  { tx: 36, ty: 19, type: 'pit_fiend',     name: 'Pit Fiend',       level: 32, color: 0x992200, hp: 460, atk: 48, def: 26 },
  // (30,15): was (33,16) — exactly on demon_chest3, blocking the chest
  { tx: 30, ty: 15, type: 'infernal_mage', name: 'Infernal Mage',   level: 33, color: 0xff7711, hp: 400, atk: 50, def: 22 },
  { tx: 35, ty: 18, type: 'infernal_mage', name: 'Infernal Mage',   level: 33, color: 0xff7711, hp: 400, atk: 50, def: 22 },

  // Corridor monsters
  { tx: 22, ty: 37, type: 'hell_hound',    name: 'Hell Hound',      level: 26, color: 0xdd5533, hp: 300, atk: 37, def: 17 },
  { tx: 22, ty: 23, type: 'lesser_demon',  name: 'Lesser Demon',    level: 28, color: 0xbb4433, hp: 350, atk: 41, def: 20 },
  { tx: 22, ty: 12, type: 'pit_fiend',     name: 'Pit Fiend',       level: 31, color: 0x991100, hp: 440, atk: 47, def: 25 },
  { tx: 10, ty: 10, type: 'blood_knight',  name: 'Blood Knight',    level: 33, color: 0xbb3355, hp: 470, atk: 50, def: 27 },
];

// ---------------------------------------------------------------------------
// Map builder — 45 cols x 45 rows
// ---------------------------------------------------------------------------
function buildDemonGateTiles(): ZoneTile[][] {
  const SIZE = 45;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Fill with obsidian walls ---
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
  // Room 1 — Hellgate Entry (cols 8-23, rows 37-43)
  // =======================================================================
  carveRoom(8, 37, 23, 43);
  for (let r = 37; r <= 43; r++) {
    for (let c = 8; c <= 23; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava hazards
  tiles[40][10] = { height: 0, biome: 'lava', collision: false };
  tiles[40][11] = { height: 0, biome: 'lava', collision: false };
  tiles[41][21] = { height: 0, biome: 'lava', collision: false };
  tiles[41][22] = { height: 0, biome: 'lava', collision: false };

  // Barrel cluster
  tiles[42][9]  = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[43][9]  = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[42][10] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };

  // Skull decorations
  tiles[38][22] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[42][22] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torches
  tiles[36][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[39][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom edge
  tiles[44][15] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[44][16] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Entry to Infernal Corridor (cols 20-24, rows 33-37)
  // =======================================================================
  carveRoom(20, 33, 24, 36, 'stone_dark', 1);
  tiles[33][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Infernal Corridor (cols 19-25, rows 28-32)
  // =======================================================================
  carveRoom(19, 28, 25, 32);
  for (let r = 28; r <= 32; r++) {
    for (let c = 19; c <= 25; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  tiles[30][22] = { height: 0, biome: 'lava', collision: false };
  tiles[28][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Infernal Corridor to Demon Barracks (cols 15-19, rows 28-30)
  // =======================================================================
  carveRoom(15, 28, 18, 30, 'stone_dark', 1);

  // =======================================================================
  // Room 3 — Demon Barracks (cols 5-19, rows 24-31)
  // =======================================================================
  carveRoom(5, 24, 18, 31);
  for (let r = 24; r <= 31; r++) {
    for (let c = 5; c <= 18; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Pillars
  tiles[25][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[25][16] = { height: 4, biome: 'stone', collision: true };
  tiles[30][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[30][16] = { height: 4, biome: 'stone', collision: true };
  // Skull decorations
  tiles[24][6]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[24][17] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[23][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest in Demon Barracks
  tiles[27][12] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'demon_chest1' },
  };

  // =======================================================================
  // Corridor 3 — Infernal Corridor to Torture Chamber (cols 25-28, rows 28-30)
  // =======================================================================
  carveRoom(25, 28, 28, 30, 'stone_dark', 1);

  // =======================================================================
  // Room 4 — Torture Chamber (cols 27-39, rows 24-31)
  // =======================================================================
  carveRoom(27, 24, 39, 31);
  for (let r = 24; r <= 31; r++) {
    for (let c = 27; c <= 39; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava pools
  tiles[27][30] = { height: 0, biome: 'lava', collision: false };
  tiles[27][31] = { height: 0, biome: 'lava', collision: false };
  tiles[28][30] = { height: 0, biome: 'lava', collision: false };
  // Rock decorations
  tiles[25][28] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[30][38] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  // Skull decorations
  tiles[24][28] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[24][38] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[31][28] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[31][38] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[23][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest in Torture Chamber
  tiles[28][33] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'demon_chest2' },
  };

  // =======================================================================
  // Corridor 4 — Demon Barracks to Blood Altar (cols 10-14, rows 20-24)
  // =======================================================================
  carveRoom(10, 20, 14, 23, 'stone_dark', 1);
  tiles[20][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Blood Altar (cols 5-19, rows 13-19)
  // =======================================================================
  carveRoom(5, 13, 19, 19);
  for (let r = 13; r <= 19; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Blood altar — water tiles (blood pool)
  tiles[15][11] = { height: 0, biome: 'water', collision: false };
  tiles[15][12] = { height: 0, biome: 'water', collision: false };
  tiles[15][13] = { height: 0, biome: 'water', collision: false };
  tiles[16][11] = { height: 0, biome: 'water', collision: false };
  tiles[16][13] = { height: 0, biome: 'water', collision: false };
  tiles[17][11] = { height: 0, biome: 'water', collision: false };
  tiles[17][12] = { height: 0, biome: 'water', collision: false };
  tiles[17][13] = { height: 0, biome: 'water', collision: false };
  // Pillars
  tiles[14][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[14][17] = { height: 4, biome: 'stone', collision: true };
  tiles[18][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[18][17] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[12][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Torture Chamber to Summoning Circle (cols 31-35, rows 20-24)
  // =======================================================================
  carveRoom(31, 20, 35, 23, 'stone_dark', 1);
  tiles[20][30] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][36] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Summoning Circle (cols 27-39, rows 13-19)
  // =======================================================================
  carveRoom(27, 13, 39, 19);
  for (let r = 13; r <= 19; r++) {
    for (let c = 27; c <= 39; c++) {
      if (hash(r, c, 37) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Summoning circle — lava tiles
  tiles[15][32] = { height: 0, biome: 'lava', collision: false };
  tiles[15][33] = { height: 0, biome: 'lava', collision: false };
  tiles[15][34] = { height: 0, biome: 'lava', collision: false };
  tiles[16][32] = { height: 0, biome: 'lava', collision: false };
  tiles[16][34] = { height: 0, biome: 'lava', collision: false };
  tiles[17][32] = { height: 0, biome: 'lava', collision: false };
  tiles[17][33] = { height: 0, biome: 'lava', collision: false };
  tiles[17][34] = { height: 0, biome: 'lava', collision: false };
  // Pillars
  tiles[14][29] = { height: 4, biome: 'stone', collision: true };
  tiles[14][37] = { height: 4, biome: 'stone', collision: true };
  tiles[18][29] = { height: 4, biome: 'stone', collision: true };
  tiles[18][37] = { height: 4, biome: 'stone', collision: true };
  // Torches
  tiles[12][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest in Summoning Circle
  tiles[16][33] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'demon_chest3' },
  };

  // =======================================================================
  // Corridor 6 — Blood Altar to Boss Room (cols 10-14, rows 9-13)
  // =======================================================================
  carveRoom(10, 9, 14, 12, 'stone_dark', 1);
  tiles[9][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Boss Room: Demon Lord (cols 5-23, rows 2-8) — checkerboard
  // =======================================================================
  for (let r = 2; r <= 8; r++) {
    for (let c = 5; c <= 23; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'volcanic', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 1; r <= 9; r++) {
    for (let c = 4; c <= 24; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 2 && r <= 8 && c >= 5 && c <= 23) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'stone_dark') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }
  // Corner pillars
  tiles[2][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[2][23]  = { height: 5, biome: 'stone', collision: true };
  tiles[8][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[8][23]  = { height: 5, biome: 'stone', collision: true };
  // Skull ring
  tiles[2][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][20]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[8][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[8][20]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][5]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[6][5]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][23]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[6][23]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  // Lava moat around boss
  tiles[4][13] = { height: 0, biome: 'lava', collision: false };
  tiles[4][15] = { height: 0, biome: 'lava', collision: false };
  tiles[6][13] = { height: 0, biome: 'lava', collision: false };
  tiles[6][15] = { height: 0, biome: 'lava', collision: false };
  // Torch ring
  tiles[1][6]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][14]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][24]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile
  tiles[5][14] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'demon_lord', name: 'Demon Lord' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoDemonGateScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: DemonMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('DemonGate');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'DemonGate';

    trackZoneVisit('DemonGate');

    // Cehennem kapısı ışığı — boss/gate odağına kırmızı-turuncu ışık havuzu
    // (torch/lava'dan önce eklenir, bütçe dolsa da düşmez).
    this.priorityLights = [{ tx: 14, ty: 5, color: 0xff4422, radius: 80 }];
    this.initZone(buildDemonGateTiles(), 15, 42);

    if (!state.flags.has('demon_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('demon_chest1')) {
      this.createChestIndicator(12, 27);
    }
    if (!state.flags.has('demon_chest2')) {
      this.createChestIndicator(33, 28);
    }
    if (!state.flags.has('demon_chest3')) {
      this.createChestIndicator(33, 16);
    }

    this.monsterSprites = [];
    for (const m of DEMON_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', "Demon's Gate");
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
  private spawnDungeonMonsterAt(m: DemonMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: DemonMonster; alive: boolean }): void {
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
      returnScene: 'DemonGate',
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
    const dialogue = BOSS_DIALOGUES['demon_lord'];
    if (state.flags.has('demon_boss_defeated')) {
      this.showDialog('Demon Lord', ['The infernal gate has been sealed...'], 14, 5);
      return;
    }

    this.showDialog('Demon Lord', dialogue.preBattle, 14, 5);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'DemonGate',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('demon_boss_defeated');
        state.addKill('demon_lord');

        // Lore tracking
        state.flags.add('lore_demon_lord');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['demon_lord'];
        this.showDialog('Demon Lord', [dialogue.deathLine], 14, 5);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Demon Lord', dialogue.loreReveal);
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
      this.showDialog('Infernal Chest', ['Found: 3x Health Potion, 80 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Infernal Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0xcc2200;
    const pos = toScreen(14, 5, 1);
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

    const label = this.add.text(0, -28, 'Demon Lord', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ff4422', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv35 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#ff8866', stroke: '#000000', strokeThickness: 2,
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
