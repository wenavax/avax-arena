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
  type: 'void_sovereign',
  name: 'Void Sovereign',
  level: 45,
  hp: 1300,
  maxHp: 1300,
  atk: 65,
  def: 35,
};

// ---------------------------------------------------------------------------
// Monster definitions
// ---------------------------------------------------------------------------
interface VoidMonster {
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

const VOID_MONSTERS: VoidMonster[] = [
  // Room 1 — Rift Entry (void stalkers Lv35, shadow fiends Lv35)
  { tx: 14, ty: 45, type: 'void_stalker',   name: 'Void Stalker',     level: 35, color: 0x553377, hp: 420, atk: 45, def: 22 },
  { tx: 20, ty: 46, type: 'void_stalker',   name: 'Void Stalker',     level: 35, color: 0x553377, hp: 420, atk: 45, def: 22 },
  { tx: 17, ty: 44, type: 'shadow_fiend',   name: 'Shadow Fiend',     level: 36, color: 0x332255, hp: 440, atk: 48, def: 20 },
  { tx: 21, ty: 45, type: 'shadow_fiend',   name: 'Shadow Fiend',     level: 36, color: 0x332255, hp: 440, atk: 48, def: 20 },

  // Room 2 — Shadow Maze (chaos sprites Lv36, void stalkers Lv37)
  { tx: 35, ty: 42, type: 'chaos_sprite',   name: 'Chaos Sprite',     level: 36, color: 0x9944cc, hp: 390, atk: 50, def: 18 },
  { tx: 41, ty: 44, type: 'chaos_sprite',   name: 'Chaos Sprite',     level: 36, color: 0x9944cc, hp: 390, atk: 50, def: 18 },
  { tx: 38, ty: 41, type: 'void_stalker',   name: 'Void Stalker',     level: 37, color: 0x664488, hp: 460, atk: 49, def: 24 },

  // Room 3 — Void Corridor (nightmare beasts Lv37, shadow fiends Lv38)
  { tx: 14, ty: 34, type: 'nightmare_beast', name: 'Nightmare Beast', level: 37, color: 0x442266, hp: 500, atk: 50, def: 26 },
  { tx: 20, ty: 36, type: 'nightmare_beast', name: 'Nightmare Beast', level: 37, color: 0x442266, hp: 500, atk: 50, def: 26 },
  { tx: 17, ty: 33, type: 'shadow_fiend',   name: 'Shadow Fiend',     level: 38, color: 0x443366, hp: 480, atk: 52, def: 23 },

  // Room 4 — Nightmare Chamber (nightmare beasts Lv38, entropy demons Lv39)
  { tx: 35, ty: 30, type: 'nightmare_beast', name: 'Nightmare Beast', level: 38, color: 0x553377, hp: 530, atk: 52, def: 27 },
  { tx: 41, ty: 32, type: 'entropy_demon',  name: 'Entropy Demon',    level: 39, color: 0x772299, hp: 520, atk: 55, def: 26 },
  { tx: 38, ty: 29, type: 'entropy_demon',  name: 'Entropy Demon',    level: 39, color: 0x772299, hp: 520, atk: 55, def: 26 },

  // Room 5 — Dark Mirror Hall (dark seraphim Lv39, chaos sprites Lv40)
  { tx: 14, ty: 22, type: 'dark_seraphim',  name: 'Dark Seraphim',    level: 39, color: 0x6633aa, hp: 500, atk: 56, def: 25 },
  { tx: 20, ty: 24, type: 'dark_seraphim',  name: 'Dark Seraphim',    level: 39, color: 0x6633aa, hp: 500, atk: 56, def: 25 },
  { tx: 17, ty: 21, type: 'chaos_sprite',   name: 'Chaos Sprite',     level: 40, color: 0xaa55dd, hp: 460, atk: 58, def: 22 },

  // Room 6 — Entropy Pool (entropy demons Lv40, void stalkers Lv41)
  { tx: 35, ty: 18, type: 'entropy_demon',  name: 'Entropy Demon',    level: 40, color: 0x8833aa, hp: 560, atk: 57, def: 28 },
  { tx: 41, ty: 20, type: 'void_stalker',   name: 'Void Stalker',     level: 41, color: 0x775599, hp: 540, atk: 55, def: 30 },
  { tx: 38, ty: 17, type: 'entropy_demon',  name: 'Entropy Demon',    level: 40, color: 0x8833aa, hp: 560, atk: 57, def: 28 },

  // Room 7 — Chaos Sanctum (dark seraphim Lv41, nightmare beasts Lv42)
  { tx: 14, ty: 12, type: 'dark_seraphim',  name: 'Dark Seraphim',    level: 41, color: 0x7744bb, hp: 550, atk: 59, def: 28 },
  { tx: 20, ty: 14, type: 'nightmare_beast', name: 'Nightmare Beast', level: 42, color: 0x553388, hp: 590, atk: 58, def: 30 },
  { tx: 17, ty: 11, type: 'dark_seraphim',  name: 'Dark Seraphim',    level: 41, color: 0x7744bb, hp: 550, atk: 59, def: 28 },

  // Room 8 — Oblivion Gate (chaos sprites Lv43, entropy demons Lv43)
  { tx: 35, ty: 8,  type: 'chaos_sprite',   name: 'Chaos Sprite',     level: 43, color: 0xbb66ee, hp: 520, atk: 62, def: 26 },
  { tx: 41, ty: 10, type: 'entropy_demon',  name: 'Entropy Demon',    level: 43, color: 0x9944bb, hp: 600, atk: 61, def: 30 },
  { tx: 38, ty: 7,  type: 'chaos_sprite',   name: 'Chaos Sprite',     level: 43, color: 0xbb66ee, hp: 520, atk: 62, def: 26 },

  // Corridor monsters
  { tx: 26, ty: 43, type: 'shadow_fiend',   name: 'Shadow Fiend',     level: 36, color: 0x443366, hp: 440, atk: 48, def: 20 },
  { tx: 26, ty: 33, type: 'nightmare_beast', name: 'Nightmare Beast', level: 38, color: 0x553377, hp: 530, atk: 52, def: 27 },
  { tx: 26, ty: 21, type: 'entropy_demon',  name: 'Entropy Demon',    level: 41, color: 0x8833aa, hp: 560, atk: 57, def: 28 },
  { tx: 26, ty: 11, type: 'dark_seraphim',  name: 'Dark Seraphim',    level: 43, color: 0x8855cc, hp: 580, atk: 62, def: 30 },
];

// ---------------------------------------------------------------------------
// Map builder — 50 cols x 50 rows
// ---------------------------------------------------------------------------
function buildVoidTiles(): ZoneTile[][] {
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

  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'stone_dark', h = 1) => {
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
  // Room 1 — Rift Entry (cols 10-24, rows 42-48)
  // =======================================================================
  carveRoom(10, 42, 24, 48, 'stone_dark');
  for (let r = 42; r <= 48; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Void rift (water = void energy)
  tiles[45][16] = { height: 0, biome: 'water', collision: false };
  tiles[45][17] = { height: 0, biome: 'water', collision: false };
  tiles[45][18] = { height: 0, biome: 'water', collision: false };
  // Torches
  tiles[41][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[41][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[41][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[44][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[47][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[44][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[47][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom
  tiles[49][16] = { height: 1, biome: 'stone_dark', collision: false, interact: 'exit_forest' };
  tiles[49][17] = { height: 1, biome: 'stone_dark', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Rift Entry to Shadow Maze (cols 22-30, rows 42-44)
  // =======================================================================
  carveRoom(24, 42, 32, 44, 'stone_dark');

  // =======================================================================
  // Room 2 — Shadow Maze (cols 32-44, rows 39-47)
  // =======================================================================
  carveRoom(32, 39, 44, 47, 'stone_dark');
  for (let r = 39; r <= 47; r++) {
    for (let c = 32; c <= 44; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Maze walls (internal obstacles)
  tiles[41][35] = { height: 3, biome: 'stone_dark', collision: true };
  tiles[42][35] = { height: 3, biome: 'stone_dark', collision: true };
  tiles[44][38] = { height: 3, biome: 'stone_dark', collision: true };
  tiles[44][39] = { height: 3, biome: 'stone_dark', collision: true };
  tiles[41][41] = { height: 3, biome: 'stone_dark', collision: true };
  // Skull decorations
  tiles[39][33] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[39][43] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[47][33] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[47][43] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[38][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][44] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Rift Entry to Void Corridor (cols 15-19, rows 38-42)
  // =======================================================================
  carveRoom(15, 38, 19, 41, 'stone_dark');

  // =======================================================================
  // Room 3 — Void Corridor (cols 10-24, rows 30-37)
  // =======================================================================
  carveRoom(10, 30, 24, 37, 'stone_dark');
  for (let r = 30; r <= 37; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Pillars
  tiles[31][12] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[31][22] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[36][12] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[36][22] = { height: 4, biome: 'stone_dark', collision: true };
  // Torches
  tiles[29][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[34][17] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'void_chest1' },
  };

  // =======================================================================
  // Corridor 3 — Shadow Maze to Nightmare Chamber (cols 36-40, rows 35-39)
  // =======================================================================
  carveRoom(36, 35, 40, 38, 'stone_dark');

  // =======================================================================
  // Room 4 — Nightmare Chamber (cols 32-44, rows 27-34)
  // =======================================================================
  carveRoom(32, 27, 44, 34, 'stone_dark');
  for (let r = 27; r <= 34; r++) {
    for (let c = 32; c <= 44; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Void pool
  tiles[30][37] = { height: 0, biome: 'water', collision: false };
  tiles[30][38] = { height: 0, biome: 'water', collision: false };
  tiles[31][37] = { height: 0, biome: 'water', collision: false };
  tiles[31][38] = { height: 0, biome: 'water', collision: false };
  // Torches
  tiles[26][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][44] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][45] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][45] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Void Corridor to Dark Mirror Hall (cols 15-19, rows 26-30)
  // =======================================================================
  carveRoom(15, 26, 19, 29, 'stone_dark');

  // =======================================================================
  // Room 5 — Dark Mirror Hall (cols 10-24, rows 18-25)
  // =======================================================================
  carveRoom(10, 18, 24, 25, 'stone_dark');
  for (let r = 18; r <= 25; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Mirror pillars
  tiles[19][12] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[19][22] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[24][12] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[24][22] = { height: 4, biome: 'stone_dark', collision: true };
  // Skull decorations
  tiles[18][11] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[18][23] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[25][11] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[25][23] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[17][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[22][17] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'void_chest2' },
  };

  // =======================================================================
  // Corridor 5 — Nightmare Chamber to Entropy Pool (cols 36-40, rows 23-27)
  // =======================================================================
  carveRoom(36, 23, 40, 26, 'stone_dark');

  // =======================================================================
  // Room 6 — Entropy Pool (cols 32-44, rows 15-22)
  // =======================================================================
  carveRoom(32, 15, 44, 22, 'stone_dark');
  for (let r = 15; r <= 22; r++) {
    for (let c = 32; c <= 44; c++) {
      if (hash(r, c, 37) < 25) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Entropy pool (void water)
  tiles[17][37] = { height: 0, biome: 'water', collision: false };
  tiles[17][38] = { height: 0, biome: 'water', collision: false };
  tiles[17][39] = { height: 0, biome: 'water', collision: false };
  tiles[18][37] = { height: 0, biome: 'water', collision: false };
  tiles[18][39] = { height: 0, biome: 'water', collision: false };
  tiles[19][37] = { height: 0, biome: 'water', collision: false };
  tiles[19][38] = { height: 0, biome: 'water', collision: false };
  tiles[19][39] = { height: 0, biome: 'water', collision: false };
  // Torches
  tiles[14][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][44] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[18][38] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'void_chest3' },
  };

  // =======================================================================
  // Corridor 6 — Dark Mirror Hall to Chaos Sanctum (cols 15-19, rows 14-18)
  // =======================================================================
  carveRoom(15, 14, 19, 17, 'stone_dark');
  tiles[14][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Chaos Sanctum (cols 10-24, rows 8-13)
  // =======================================================================
  carveRoom(10, 8, 24, 13, 'stone_dark');
  for (let r = 8; r <= 13; r++) {
    for (let c = 10; c <= 24; c++) {
      if (hash(r, c, 41) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Pillars
  tiles[9][12]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[9][22]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[12][12] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[12][22] = { height: 4, biome: 'stone_dark', collision: true };
  // Torches
  tiles[7][10]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][24]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 7 — Entropy Pool to Oblivion Gate (cols 36-40, rows 11-15)
  // =======================================================================
  carveRoom(36, 11, 40, 14, 'stone_dark');

  // =======================================================================
  // Room 8 — Oblivion Gate (cols 32-44, rows 4-10)
  // =======================================================================
  carveRoom(32, 4, 44, 10, 'stone_dark');
  for (let r = 4; r <= 10; r++) {
    for (let c = 32; c <= 44; c++) {
      if (hash(r, c, 47) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_dark', collision: false };
      }
    }
  }
  // Pillars
  tiles[5][34]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[5][42]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[9][34]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[9][42]  = { height: 4, biome: 'stone_dark', collision: true };
  // Torches
  tiles[3][32]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][38]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][44]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 8 — Chaos Sanctum to Boss Room (cols 15-19, rows 4-8)
  // =======================================================================
  carveRoom(15, 4, 19, 7, 'stone_dark');
  tiles[4][14]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 9 — Boss Room: Void Sovereign (cols 8-26, rows 1-4) — checkerboard
  // =======================================================================
  for (let r = 1; r <= 4; r++) {
    for (let c = 8; c <= 26; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone_dark' : 'ice_dark', collision: false };
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
  tiles[1][8]   = { height: 5, biome: 'stone_dark', collision: true };
  tiles[1][26]  = { height: 5, biome: 'stone_dark', collision: true };
  tiles[4][8]   = { height: 5, biome: 'stone_dark', collision: true };
  tiles[4][26]  = { height: 5, biome: 'stone_dark', collision: true };
  // Skull ring
  tiles[1][11]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[1][23]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[4][11]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[4][23]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[2][8]   = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[3][8]   = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[2][26]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[3][26]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  // Torch ring
  tiles[0][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][27]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile
  tiles[2][17] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'boss', data: { id: 'void_sovereign', name: 'Void Sovereign' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoVoidScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: VoidMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('VoidRealm');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'VoidRealm';

    trackZoneVisit('VoidRealm');

    this.initZone(buildVoidTiles(), 17, 47);

    if (!state.flags.has('void_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('void_chest1')) {
      this.createChestIndicator(17, 34);
    }
    if (!state.flags.has('void_chest2')) {
      this.createChestIndicator(17, 22);
    }
    if (!state.flags.has('void_chest3')) {
      this.createChestIndicator(38, 18);
    }

    this.monsterSprites = [];
    for (const m of VOID_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Void Realm');
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
  private spawnDungeonMonsterAt(m: VoidMonster): void {
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
      fontSize: '7px', fontFamily: 'monospace', color: '#ddbbff',
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: VoidMonster; alive: boolean }): void {
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
      returnScene: 'VoidRealm',
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
    const dialogue = BOSS_DIALOGUES['void_sovereign'];
    if (state.flags.has('void_boss_defeated')) {
      this.showDialog('Void Sovereign', ['The void has been sealed...'], 17, 2);
      return;
    }

    this.showDialog('Void Sovereign', dialogue.preBattle, 17, 2);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'VoidRealm',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('void_boss_defeated');
        state.addKill('void_sovereign');

        // Lore tracking
        state.flags.add('lore_void_sovereign');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['void_sovereign'];
        this.showDialog('Void Sovereign', [dialogue.deathLine], 17, 2);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Void Sovereign', dialogue.loreReveal);
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
      state.gold += 120;
      this.showDialog('Void Chest', ['Found: 4x Health Potion, 120 Gold!'], tx, ty);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Void Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x7733bb;
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

    const label = this.add.text(0, -28, 'Void Sovereign', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#bb77ff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv45 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#cc99ff', stroke: '#000000', strokeThickness: 2,
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
