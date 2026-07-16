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
  type: 'frost_emperor',
  name: 'Frost Emperor',
  level: 32,
  hp: 900,
  maxHp: 900,
  atk: 48,
  def: 28,
};

// ---------------------------------------------------------------------------
// Frost Wastes monster definitions
// ---------------------------------------------------------------------------
interface FrostMonster {
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

const FROST_MONSTERS: FrostMonster[] = [
  // Room 1 — Frozen Gate (frost giants Lv22, blizzard wolves Lv22)
  { tx: 38, ty: 20, type: 'frost_giant',     name: 'Frost Giant',       level: 22, color: 0x88aabb, hp: 250, atk: 30, def: 18 },
  { tx: 40, ty: 24, type: 'frost_giant',     name: 'Frost Giant',       level: 22, color: 0x88aabb, hp: 250, atk: 30, def: 18 },
  // (42,25): keep clear of the player spawn at (39,22) — a monster within 1 tile
  // of spawn forces a battle on the first update tick, before the fade-in ends
  { tx: 42, ty: 25, type: 'blizzard_wolf',   name: 'Blizzard Wolf',     level: 22, color: 0xaaccdd, hp: 200, atk: 32, def: 14 },

  // Room 2 — Blizzard Pass (blizzard wolves Lv24, ice wraiths Lv24)
  { tx: 28, ty: 34, type: 'blizzard_wolf',   name: 'Storm Wolf',        level: 24, color: 0x99bbcc, hp: 230, atk: 34, def: 15 },
  { tx: 32, ty: 36, type: 'blizzard_wolf',   name: 'Storm Wolf',        level: 24, color: 0x99bbcc, hp: 230, atk: 34, def: 15 },
  { tx: 30, ty: 35, type: 'ice_wraith',      name: 'Ice Wraith',        level: 24, color: 0xccddee, hp: 220, atk: 36, def: 13 },

  // Room 3 — Ice Throne (glacier golems Lv26, frost giants Lv26)
  { tx: 12, ty: 32, type: 'glacier_golem',   name: 'Glacier Golem',     level: 26, color: 0x6699aa, hp: 320, atk: 34, def: 22 },
  { tx: 18, ty: 34, type: 'glacier_golem',   name: 'Glacier Golem',     level: 26, color: 0x6699aa, hp: 320, atk: 34, def: 22 },
  { tx: 15, ty: 33, type: 'frost_giant',     name: 'Frost Berserker',   level: 26, color: 0x7799aa, hp: 300, atk: 36, def: 20 },

  // Room 4 — Glacier Cavern (aurora spirits Lv27, ice wraiths Lv27)
  { tx: 12, ty: 20, type: 'aurora_spirit',   name: 'Aurora Spirit',     level: 27, color: 0xee88ff, hp: 270, atk: 38, def: 14 },
  { tx: 18, ty: 22, type: 'aurora_spirit',   name: 'Aurora Spirit',     level: 27, color: 0xee88ff, hp: 270, atk: 38, def: 14 },
  { tx: 15, ty: 21, type: 'ice_wraith',      name: 'Frost Wraith',      level: 27, color: 0xbbddee, hp: 260, atk: 40, def: 15 },
  { tx: 17, ty: 23, type: 'permafrost_wyrm', name: 'Ice Wyrm',          level: 27, color: 0x5588aa, hp: 340, atk: 37, def: 21 },

  // Room 5 — Permafrost Depths (permafrost wyrms Lv29, glacier golems Lv29)
  { tx: 28, ty: 12, type: 'permafrost_wyrm', name: 'Permafrost Wyrm',   level: 29, color: 0x4477aa, hp: 400, atk: 40, def: 23 },
  { tx: 32, ty: 14, type: 'permafrost_wyrm', name: 'Permafrost Wyrm',   level: 29, color: 0x4477aa, hp: 400, atk: 40, def: 23 },
  { tx: 30, ty: 13, type: 'glacier_golem',   name: 'Ancient Golem',     level: 29, color: 0x5588aa, hp: 380, atk: 38, def: 25 },

  // Room 6 — Aurora Chamber (aurora spirits Lv30, blizzard wolves Lv30)
  { tx: 12, ty: 8,  type: 'aurora_spirit',   name: 'Radiant Spirit',    level: 30, color: 0xff99ff, hp: 320, atk: 42, def: 16 },
  { tx: 18, ty: 10, type: 'aurora_spirit',   name: 'Radiant Spirit',    level: 30, color: 0xff99ff, hp: 320, atk: 42, def: 16 },
  { tx: 15, ty: 9,  type: 'blizzard_wolf',   name: 'Alpha Wolf',        level: 30, color: 0x88bbdd, hp: 300, atk: 44, def: 18 },

  // Corridor monsters
  { tx: 34, ty: 28, type: 'ice_wraith',      name: 'Corridor Wraith',   level: 23, color: 0xccddee, hp: 215, atk: 33, def: 13 },
  { tx: 22, ty: 26, type: 'blizzard_wolf',   name: 'Tunnel Wolf',       level: 25, color: 0x99bbcc, hp: 240, atk: 35, def: 15 },
  { tx: 22, ty: 16, type: 'frost_giant',     name: 'Frost Sentinel',    level: 28, color: 0x7799bb, hp: 340, atk: 38, def: 21 },
  { tx: 15, ty: 4,  type: 'permafrost_wyrm', name: 'Elder Wyrm',        level: 31, color: 0x3366aa, hp: 450, atk: 45, def: 24 },
];

// ---------------------------------------------------------------------------
// Map builder — 45 cols x 45 rows
// ---------------------------------------------------------------------------
function buildFrostWastesTiles(): ZoneTile[][] {
  const SIZE = 45;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Fill with ice walls ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'ice', collision: true });
    }
    tiles.push(row);
  }

  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'ice', h = 1) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        tiles[r][c] = { height: h, biome, collision: false };
      }
    }
    for (let r = r1 - 1; r <= r2 + 1; r++) {
      for (let c = c1 - 1; c <= c2 + 1; c++) {
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) continue;
        if (tiles[r][c].collision && tiles[r][c].biome === 'ice') {
          tiles[r][c] = { height: 4, biome: 'wall', collision: true };
        }
      }
    }
  };

  // =======================================================================
  // Room 1 — Frozen Gate (cols 35-43, rows 18-26)
  // =======================================================================
  carveRoom(35, 18, 43, 26);

  for (let r = 18; r <= 26; r++) {
    for (let c = 35; c <= 43; c++) {
      if (hash(r, c, 13) < 25) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Ice crystal decorations
  tiles[19][36] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[19][42] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[25][36] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[25][42] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };

  // Rock decorations (frozen boulders)
  tiles[21][36] = { height: 2, biome: 'ice', collision: true, data: { deco: 'rock' } };
  tiles[24][42] = { height: 2, biome: 'ice', collision: true, data: { deco: 'rock' } };

  // Torches
  tiles[17][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][39] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][43] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at right edge
  tiles[22][44] = { height: 1, biome: 'ice', collision: false, interact: 'exit_forest' };
  tiles[23][44] = { height: 1, biome: 'ice', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Frozen Gate to Blizzard Pass (cols 31-36, rows 26-30)
  // =======================================================================
  carveRoom(31, 26, 36, 30, 'ice', 1);
  tiles[26][30] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Blizzard Pass (cols 25-38, rows 30-39)
  // =======================================================================
  carveRoom(25, 30, 38, 39);

  for (let r = 30; r <= 39; r++) {
    for (let c = 25; c <= 38; c++) {
      if (hash(r, c, 9) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Frozen water hazards
  tiles[33][30] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[33][31] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[34][30] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[36][34] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[36][35] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[37][35] = { height: 0, biome: 'frozen_water', collision: false };

  // Ice crystal decorations
  tiles[31][26] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[31][37] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[38][26] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[38][37] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };

  // Chest
  tiles[34][28] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'chest', data: { id: 'frost_chest1' },
  };

  // Torches
  tiles[29][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Blizzard Pass to Ice Throne (cols 20-26, rows 32-34)
  // =======================================================================
  carveRoom(20, 32, 25, 34, 'ice', 1);
  tiles[32][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Ice Throne (cols 8-22, rows 30-37)
  // =======================================================================
  carveRoom(8, 30, 22, 37);

  for (let r = 30; r <= 37; r++) {
    for (let c = 8; c <= 22; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Throne area — elevated platform
  tiles[32][14] = { height: 2, biome: 'stone', collision: false };
  tiles[32][15] = { height: 2, biome: 'stone', collision: false };
  tiles[33][14] = { height: 2, biome: 'stone', collision: false };
  tiles[33][15] = { height: 2, biome: 'stone', collision: false };

  // Pillars
  tiles[31][10] = { height: 4, biome: 'stone', collision: true };
  tiles[31][20] = { height: 4, biome: 'stone', collision: true };
  tiles[36][10] = { height: 4, biome: 'stone', collision: true };
  tiles[36][20] = { height: 4, biome: 'stone', collision: true };

  // Ice crystal decorations
  tiles[30][9]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[30][21] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };

  // Torches
  tiles[29][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Ice Throne to Glacier Cavern (cols 13-17, rows 26-30)
  // =======================================================================
  carveRoom(13, 26, 17, 29, 'ice', 1);
  tiles[26][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Glacier Cavern (cols 8-22, rows 18-25)
  // =======================================================================
  carveRoom(8, 18, 22, 25);

  for (let r = 18; r <= 25; r++) {
    for (let c = 8; c <= 22; c++) {
      if (hash(r, c, 21) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Frozen water
  tiles[21][13] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[21][14] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[21][15] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[22][14] = { height: 0, biome: 'frozen_water', collision: false };

  // Ice crystal decorations
  tiles[19][10] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[19][20] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[24][10] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[24][20] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };

  // Chest
  tiles[20][18] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'chest', data: { id: 'frost_chest2' },
  };

  // Torches
  tiles[17][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Glacier Cavern to Permafrost Depths (cols 21-26, rows 14-18)
  // =======================================================================
  carveRoom(21, 14, 26, 17, 'ice', 1);
  tiles[14][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Permafrost Depths (cols 25-38, rows 9-17)
  // =======================================================================
  carveRoom(25, 9, 38, 17);

  for (let r = 9; r <= 17; r++) {
    for (let c = 25; c <= 38; c++) {
      if (hash(r, c, 25) < 20) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Frozen water
  tiles[12][30] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[12][31] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[13][30] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[13][31] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[14][31] = { height: 0, biome: 'frozen_water', collision: false };

  // Pillars
  tiles[11][28] = { height: 4, biome: 'stone', collision: true };
  tiles[11][35] = { height: 4, biome: 'stone', collision: true };
  tiles[15][28] = { height: 4, biome: 'stone', collision: true };
  tiles[15][35] = { height: 4, biome: 'stone', collision: true };

  // Chest
  tiles[13][33] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'chest', data: { id: 'frost_chest3' },
  };

  // Torches
  tiles[8][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][31]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][38]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Glacier Cavern to Aurora Chamber (cols 13-17, rows 13-18)
  // =======================================================================
  carveRoom(13, 13, 17, 17, 'ice', 1);
  tiles[13][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[13][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Aurora Chamber (cols 8-22, rows 6-12)
  // =======================================================================
  carveRoom(8, 6, 22, 12);

  for (let r = 6; r <= 12; r++) {
    for (let c = 8; c <= 22; c++) {
      if (hash(r, c, 29) < 25) {
        tiles[r][c] = { height: 1, biome: 'stone', collision: false };
      }
    }
  }

  // Aurora — ice crystal ring
  tiles[7][13]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[7][16]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[11][13] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[11][16] = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[9][11]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[9][18]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };

  // Pillars
  tiles[7][10]  = { height: 4, biome: 'stone', collision: true };
  tiles[7][20]  = { height: 4, biome: 'stone', collision: true };
  tiles[11][10] = { height: 4, biome: 'stone', collision: true };
  tiles[11][20] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[5][8]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[5][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[5][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 6 — Aurora Chamber to Boss Room (cols 13-17, rows 3-6)
  // =======================================================================
  carveRoom(13, 3, 17, 5, 'ice', 1);
  tiles[3][12]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][18]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Boss Room: Frost Emperor (cols 6-24, rows 0-3) — checkerboard
  // =======================================================================
  for (let r = 0; r <= 3; r++) {
    for (let c = 6; c <= 24; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'ice' : 'stone', collision: false };
    }
  }
  for (let r2 = 0; r2 <= 4; r2++) {
    for (let c2 = 5; c2 <= 25; c2++) {
      if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
      if (r2 >= 0 && r2 <= 3 && c2 >= 6 && c2 <= 24) continue;
      if (tiles[r2][c2].collision && tiles[r2][c2].biome === 'ice') {
        tiles[r2][c2] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[0][6]   = { height: 5, biome: 'stone', collision: true };
  tiles[0][24]  = { height: 5, biome: 'stone', collision: true };
  tiles[3][6]   = { height: 5, biome: 'stone', collision: true };
  tiles[3][24]  = { height: 5, biome: 'stone', collision: true };

  // Skull ring
  tiles[0][8]   = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[0][22]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[3][8]   = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[3][22]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[1][6]   = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[2][6]   = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[1][24]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };
  tiles[2][24]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'skull' } };

  // Ice crystal decorations in boss room
  tiles[1][10]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[1][20]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[2][10]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };
  tiles[2][20]  = { height: 1, biome: 'ice', collision: false, data: { deco: 'ice_crystal' } };

  // Torch ring
  tiles[0][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][23]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][5]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][5]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (15, 1)
  tiles[1][15] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'boss', data: { id: 'frost_emperor', name: 'Frost Emperor' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoFrostWastesScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: FrostMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('FrostWastes');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'FrostWastes';

    trackZoneVisit('FrostWastes');

    this.initZone(buildFrostWastesTiles(), 39, 22);

    if (!state.flags.has('frostwastes_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('frost_chest1')) {
      this.createChestIndicator(28, 34);
    }
    if (!state.flags.has('frost_chest2')) {
      this.createChestIndicator(18, 20);
    }
    if (!state.flags.has('frost_chest3')) {
      this.createChestIndicator(33, 13);
    }

    this.monsterSprites = [];
    for (const m of FROST_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Frost Wastes');
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
  private spawnDungeonMonsterAt(m: FrostMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: FrostMonster; alive: boolean }): void {
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
      returnScene: 'FrostWastes',
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
    const dialogue = BOSS_DIALOGUES['frost_emperor'];
    if (state.flags.has('frostwastes_boss_defeated')) {
      this.showDialog('Frost Emperor', ['The eternal winter has ended... the ice melts.'], 15, 1);
      return;
    }

    this.showDialog('Frost Emperor', dialogue.preBattle, 15, 1);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'FrostWastes',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('frostwastes_boss_defeated');
        state.addKill('frost_emperor');

        // Lore tracking
        state.flags.add('lore_frost_emperor');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['frost_emperor'];
        this.showDialog('Frost Emperor', [dialogue.deathLine], 15, 1);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Frost Emperor', dialogue.loreReveal);
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
      state.gold += 100;
      this.showDialog('Frozen Chest', ['Found: 4x Health Potion, 100 Gold!'], tx, ty);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Frozen Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x3366aa;
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

    const label = this.add.text(0, -28, 'Frost Emperor', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#88ccff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv32 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#aaddff', stroke: '#000000', strokeThickness: 2,
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
