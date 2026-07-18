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
  type: 'abyssal_overlord',
  name: 'Abyssal Overlord',
  level: 60,
  hp: 2000,
  maxHp: 2000,
  atk: 85,
  def: 45,
};

// ---------------------------------------------------------------------------
// Monster definitions
// ---------------------------------------------------------------------------
interface EternalMonster {
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

const ETERNAL_MONSTERS: EternalMonster[] = [
  // Room 1 — Abyss Maw (abyssal terrors Lv45, dread lords Lv45)
  { tx: 16, ty: 50, type: 'abyssal_terror', name: 'Abyssal Terror',   level: 45, color: 0x552233, hp: 650, atk: 60, def: 30 },
  { tx: 22, ty: 51, type: 'abyssal_terror', name: 'Abyssal Terror',   level: 45, color: 0x552233, hp: 650, atk: 60, def: 30 },
  { tx: 19, ty: 49, type: 'dread_lord',     name: 'Dread Lord',       level: 46, color: 0x661144, hp: 700, atk: 62, def: 34 },
  { tx: 24, ty: 50, type: 'dread_lord',     name: 'Dread Lord',       level: 46, color: 0x661144, hp: 700, atk: 62, def: 34 },

  // Room 2 — Desolation Path (primordial beasts Lv47, doom knights Lv47)
  { tx: 38, ty: 46, type: 'primordial_beast', name: 'Primordial Beast', level: 47, color: 0x443322, hp: 750, atk: 64, def: 32 },
  { tx: 44, ty: 48, type: 'primordial_beast', name: 'Primordial Beast', level: 47, color: 0x443322, hp: 750, atk: 64, def: 32 },
  { tx: 41, ty: 45, type: 'doom_knight',    name: 'Doom Knight',       level: 48, color: 0x554433, hp: 780, atk: 66, def: 36 },
  { tx: 43, ty: 47, type: 'doom_knight',    name: 'Doom Knight',       level: 48, color: 0x554433, hp: 780, atk: 66, def: 36 },

  // Room 3 — Screaming Halls (eternal flames Lv48, abyssal terrors Lv49)
  { tx: 16, ty: 39, type: 'eternal_flame',  name: 'Eternal Flame',    level: 48, color: 0xff4400, hp: 700, atk: 68, def: 28 },
  { tx: 22, ty: 41, type: 'eternal_flame',  name: 'Eternal Flame',    level: 48, color: 0xff4400, hp: 700, atk: 68, def: 28 },
  { tx: 19, ty: 38, type: 'abyssal_terror', name: 'Abyssal Terror',   level: 49, color: 0x663344, hp: 740, atk: 66, def: 34 },
  { tx: 23, ty: 40, type: 'abyssal_terror', name: 'Abyssal Terror',   level: 49, color: 0x663344, hp: 740, atk: 66, def: 34 },

  // Room 4 — Bone Spire (doom knights Lv49, world eaters Lv50)
  { tx: 38, ty: 35, type: 'doom_knight',    name: 'Doom Knight',       level: 49, color: 0x665544, hp: 810, atk: 68, def: 38 },
  { tx: 44, ty: 37, type: 'world_eater',    name: 'World Eater',      level: 50, color: 0x332211, hp: 880, atk: 72, def: 36 },
  { tx: 41, ty: 34, type: 'doom_knight',    name: 'Doom Knight',       level: 49, color: 0x665544, hp: 810, atk: 68, def: 38 },
  { tx: 43, ty: 36, type: 'world_eater',    name: 'World Eater',      level: 50, color: 0x332211, hp: 880, atk: 72, def: 36 },

  // Room 5 — Dread Citadel (dread lords Lv50, eternal flames Lv51)
  { tx: 16, ty: 27, type: 'dread_lord',     name: 'Dread Lord',       level: 50, color: 0x772255, hp: 830, atk: 70, def: 38 },
  { tx: 22, ty: 29, type: 'dread_lord',     name: 'Dread Lord',       level: 50, color: 0x772255, hp: 830, atk: 70, def: 38 },
  { tx: 19, ty: 26, type: 'eternal_flame',  name: 'Eternal Flame',    level: 51, color: 0xff5511, hp: 780, atk: 74, def: 30 },
  { tx: 23, ty: 28, type: 'eternal_flame',  name: 'Eternal Flame',    level: 51, color: 0xff5511, hp: 780, atk: 74, def: 30 },

  // Room 6 — Worldbreaker Bridge (world eaters Lv52, primordial beasts Lv52)
  { tx: 38, ty: 23, type: 'world_eater',    name: 'World Eater',      level: 52, color: 0x443322, hp: 920, atk: 76, def: 38 },
  { tx: 44, ty: 25, type: 'primordial_beast', name: 'Primordial Beast', level: 52, color: 0x554433, hp: 860, atk: 72, def: 40 },
  // (37,20): was (41,22) — exactly on eternal_chest3, blocking the chest
  { tx: 37, ty: 20, type: 'world_eater',    name: 'World Eater',      level: 52, color: 0x443322, hp: 920, atk: 76, def: 38 },

  // Room 7 — Eclipse Chamber (dread lords Lv53, abyssal terrors Lv54)
  { tx: 16, ty: 17, type: 'dread_lord',     name: 'Dread Lord',       level: 53, color: 0x883366, hp: 880, atk: 74, def: 40 },
  { tx: 22, ty: 19, type: 'abyssal_terror', name: 'Abyssal Terror',   level: 54, color: 0x774455, hp: 850, atk: 76, def: 38 },
  { tx: 19, ty: 16, type: 'dread_lord',     name: 'Dread Lord',       level: 53, color: 0x883366, hp: 880, atk: 74, def: 40 },

  // Room 8 — Primordial Core (primordial beasts Lv55, world eaters Lv55)
  { tx: 38, ty: 13, type: 'primordial_beast', name: 'Primordial Beast', level: 55, color: 0x665544, hp: 940, atk: 78, def: 42 },
  { tx: 44, ty: 15, type: 'world_eater',    name: 'World Eater',      level: 55, color: 0x443333, hp: 980, atk: 80, def: 40 },
  // (37,10): was (41,12) — exactly on eternal_chest4, blocking the chest
  { tx: 37, ty: 10, type: 'primordial_beast', name: 'Primordial Beast', level: 55, color: 0x665544, hp: 940, atk: 78, def: 42 },

  // Room 9 — Throne of Eternity (doom knights Lv56, eternal flames Lv57)
  { tx: 16, ty: 7,  type: 'doom_knight',    name: 'Doom Knight',       level: 56, color: 0x776655, hp: 950, atk: 78, def: 44 },
  { tx: 22, ty: 9,  type: 'eternal_flame',  name: 'Eternal Flame',    level: 57, color: 0xff6622, hp: 900, atk: 82, def: 34 },
  { tx: 19, ty: 6,  type: 'doom_knight',    name: 'Doom Knight',       level: 56, color: 0x776655, hp: 950, atk: 78, def: 44 },
  { tx: 23, ty: 8,  type: 'eternal_flame',  name: 'Eternal Flame',    level: 57, color: 0xff6622, hp: 900, atk: 82, def: 34 },

  // Corridor monsters
  { tx: 28, ty: 48, type: 'abyssal_terror', name: 'Abyssal Terror',   level: 46, color: 0x552233, hp: 660, atk: 62, def: 31 },
  { tx: 28, ty: 38, type: 'doom_knight',    name: 'Doom Knight',       level: 49, color: 0x665544, hp: 810, atk: 68, def: 38 },
  { tx: 28, ty: 26, type: 'world_eater',    name: 'World Eater',      level: 52, color: 0x443322, hp: 920, atk: 76, def: 38 },
  { tx: 28, ty: 16, type: 'dread_lord',     name: 'Dread Lord',       level: 55, color: 0x883366, hp: 900, atk: 78, def: 42 },
];

// ---------------------------------------------------------------------------
// Map builder — 55 cols x 55 rows
// ---------------------------------------------------------------------------
function buildEternalTiles(): ZoneTile[][] {
  const SIZE = 55;

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
  // Room 1 — Abyss Maw (cols 12-27, rows 47-53)
  // =======================================================================
  carveRoom(12, 47, 27, 53);
  for (let r = 47; r <= 53; r++) {
    for (let c = 12; c <= 27; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava pools
  tiles[50][14] = { height: 0, biome: 'lava', collision: false };
  tiles[50][15] = { height: 0, biome: 'lava', collision: false };
  tiles[51][25] = { height: 0, biome: 'lava', collision: false };
  tiles[51][26] = { height: 0, biome: 'lava', collision: false };
  // Skull decorations
  tiles[48][13] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[48][26] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[52][13] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[52][26] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[46][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[46][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[46][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[49][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[52][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[49][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[52][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom
  tiles[54][19] = { height: 1, biome: 'stone_dark', collision: false, interact: 'exit_forest' };
  tiles[54][20] = { height: 1, biome: 'stone_dark', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Abyss Maw to Desolation Path (cols 27-34, rows 47-49)
  // =======================================================================
  carveRoom(27, 47, 34, 49);

  // =======================================================================
  // Room 2 — Desolation Path (cols 34-48, rows 43-51)
  // =======================================================================
  carveRoom(34, 43, 48, 51);
  for (let r = 43; r <= 51; r++) {
    for (let c = 34; c <= 48; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava strip
  tiles[47][36] = { height: 0, biome: 'lava', collision: false };
  tiles[47][37] = { height: 0, biome: 'lava', collision: false };
  tiles[47][38] = { height: 0, biome: 'lava', collision: false };
  tiles[47][44] = { height: 0, biome: 'lava', collision: false };
  tiles[47][45] = { height: 0, biome: 'lava', collision: false };
  tiles[47][46] = { height: 0, biome: 'lava', collision: false };
  // Rock decorations
  tiles[44][35] = { height: 2, biome: 'stone_dark', collision: true, data: { deco: 'rock' } };
  tiles[50][47] = { height: 2, biome: 'stone_dark', collision: true, data: { deco: 'rock' } };
  // Torches
  tiles[42][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][48] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[45][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[49][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[47][41] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'eternal_chest1' },
  };

  // =======================================================================
  // Corridor 2 — Abyss Maw to Screaming Halls (cols 17-21, rows 43-47)
  // =======================================================================
  carveRoom(17, 43, 21, 46);

  // =======================================================================
  // Room 3 — Screaming Halls (cols 12-27, rows 35-42)
  // =======================================================================
  carveRoom(12, 35, 27, 42);
  for (let r = 35; r <= 42; r++) {
    for (let c = 12; c <= 27; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Pillars
  tiles[36][14] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[36][25] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[41][14] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[41][25] = { height: 4, biome: 'stone_dark', collision: true };
  // Torches
  tiles[34][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[34][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[34][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[40][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Desolation Path to Bone Spire (cols 39-43, rows 39-43)
  // =======================================================================
  carveRoom(39, 39, 43, 42);

  // =======================================================================
  // Room 4 — Bone Spire (cols 34-48, rows 31-38)
  // =======================================================================
  carveRoom(34, 31, 48, 38);
  for (let r = 31; r <= 38; r++) {
    for (let c = 34; c <= 48; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Bone spire (tall pillars)
  tiles[34][40] = { height: 6, biome: 'stone_dark', collision: true };
  tiles[34][42] = { height: 6, biome: 'stone_dark', collision: true };
  tiles[35][41] = { height: 7, biome: 'stone_dark', collision: true };
  // Skull decorations
  tiles[31][35] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[31][47] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[38][35] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[38][47] = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[30][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][48] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[36][41] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'eternal_chest2' },
  };

  // =======================================================================
  // Corridor 4 — Screaming Halls to Dread Citadel (cols 17-21, rows 31-35)
  // =======================================================================
  carveRoom(17, 31, 21, 34);
  tiles[31][16] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Dread Citadel (cols 12-27, rows 23-30)
  // =======================================================================
  carveRoom(12, 23, 27, 30);
  for (let r = 23; r <= 30; r++) {
    for (let c = 12; c <= 27; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Lava moat
  tiles[26][14] = { height: 0, biome: 'lava', collision: false };
  tiles[26][15] = { height: 0, biome: 'lava', collision: false };
  tiles[27][14] = { height: 0, biome: 'lava', collision: false };
  tiles[26][24] = { height: 0, biome: 'lava', collision: false };
  tiles[26][25] = { height: 0, biome: 'lava', collision: false };
  tiles[27][25] = { height: 0, biome: 'lava', collision: false };
  // Pillars
  tiles[24][14] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[24][25] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[29][14] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[29][25] = { height: 4, biome: 'stone_dark', collision: true };
  // Torches
  tiles[22][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Bone Spire to Worldbreaker Bridge (cols 39-43, rows 27-31)
  // =======================================================================
  carveRoom(39, 27, 43, 30);

  // =======================================================================
  // Room 6 — Worldbreaker Bridge (cols 34-48, rows 19-26)
  // =======================================================================
  carveRoom(34, 19, 48, 26);
  for (let r = 19; r <= 26; r++) {
    for (let c = 34; c <= 48; c++) {
      if (hash(r, c, 37) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Bridge lava (sides)
  for (let r = 20; r <= 25; r++) {
    tiles[r][35] = { height: 0, biome: 'lava', collision: false };
    tiles[r][47] = { height: 0, biome: 'lava', collision: false };
  }
  // Torches
  tiles[18][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][41] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][48] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[22][41] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'eternal_chest3' },
  };

  // =======================================================================
  // Corridor 6 — Dread Citadel to Eclipse Chamber (cols 17-21, rows 19-23)
  // =======================================================================
  carveRoom(17, 19, 21, 22);
  tiles[19][16] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Eclipse Chamber (cols 12-27, rows 13-18)
  // =======================================================================
  carveRoom(12, 13, 27, 18);
  for (let r = 13; r <= 18; r++) {
    for (let c = 12; c <= 27; c++) {
      if (hash(r, c, 41) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Eclipse pool (water = dark energy)
  tiles[15][18] = { height: 0, biome: 'water', collision: false };
  tiles[15][19] = { height: 0, biome: 'water', collision: false };
  tiles[15][20] = { height: 0, biome: 'water', collision: false };
  tiles[16][18] = { height: 0, biome: 'water', collision: false };
  tiles[16][20] = { height: 0, biome: 'water', collision: false };
  tiles[17][18] = { height: 0, biome: 'water', collision: false };
  tiles[17][19] = { height: 0, biome: 'water', collision: false };
  tiles[17][20] = { height: 0, biome: 'water', collision: false };
  // Torches
  tiles[12][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 7 — Worldbreaker Bridge to Primordial Core (cols 39-43, rows 15-19)
  // =======================================================================
  carveRoom(39, 15, 43, 18);

  // =======================================================================
  // Room 8 — Primordial Core (cols 34-48, rows 9-14)
  // =======================================================================
  carveRoom(34, 9, 48, 14);
  for (let r = 9; r <= 14; r++) {
    for (let c = 34; c <= 48; c++) {
      if (hash(r, c, 47) < 25) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Primordial core (lava ring)
  tiles[11][40] = { height: 0, biome: 'lava', collision: false };
  tiles[11][41] = { height: 0, biome: 'lava', collision: false };
  tiles[11][42] = { height: 0, biome: 'lava', collision: false };
  tiles[12][40] = { height: 0, biome: 'lava', collision: false };
  tiles[12][42] = { height: 0, biome: 'lava', collision: false };
  tiles[13][40] = { height: 0, biome: 'lava', collision: false };
  tiles[13][41] = { height: 0, biome: 'lava', collision: false };
  tiles[13][42] = { height: 0, biome: 'lava', collision: false };
  // Pillars
  tiles[10][36] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[10][46] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[13][36] = { height: 4, biome: 'stone_dark', collision: true };
  tiles[13][46] = { height: 4, biome: 'stone_dark', collision: true };
  // Torches
  tiles[8][34]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][41]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][48]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[12][41] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'chest', data: { id: 'eternal_chest4' },
  };

  // =======================================================================
  // Corridor 8 — Eclipse Chamber to Throne of Eternity (cols 17-21, rows 9-13)
  // =======================================================================
  carveRoom(17, 9, 21, 12);

  // =======================================================================
  // Room 9 — Throne of Eternity (cols 12-27, rows 3-8)
  // =======================================================================
  carveRoom(12, 3, 27, 8);
  for (let r = 3; r <= 8; r++) {
    for (let c = 12; c <= 27; c++) {
      if (hash(r, c, 53) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }
  // Pillars
  tiles[4][14]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[4][25]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[7][14]  = { height: 4, biome: 'stone_dark', collision: true };
  tiles[7][25]  = { height: 4, biome: 'stone_dark', collision: true };
  // Skull decorations
  tiles[3][13]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[3][26]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[8][13]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[8][26]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  // Torches
  tiles[2][12]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][19]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][27]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][28]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][28]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 9 — Throne to Boss Room (cols 17-21, rows 1-3)
  // =======================================================================
  // Boss room embedded in Throne — checkerboard center
  for (let r = 3; r <= 8; r++) {
    for (let c = 16; c <= 23; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone_dark' : 'volcanic', collision: false };
    }
  }
  // Corner pillars (boss area)
  tiles[3][16]  = { height: 5, biome: 'stone_dark', collision: true };
  tiles[3][23]  = { height: 5, biome: 'stone_dark', collision: true };
  tiles[8][16]  = { height: 5, biome: 'stone_dark', collision: true };
  tiles[8][23]  = { height: 5, biome: 'stone_dark', collision: true };
  // Skull ring
  tiles[3][18]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[3][21]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[8][18]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[8][21]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[4][16]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[6][16]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[4][23]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };
  tiles[6][23]  = { height: 1, biome: 'stone_dark', collision: false, data: { deco: 'skull' } };

  // Boss tile
  tiles[5][19] = {
    height: 1, biome: 'stone_dark', collision: true,
    interact: 'boss', data: { id: 'abyssal_overlord', name: 'Abyssal Overlord' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoEternalScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: EternalMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Eternal');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Eternal';

    trackZoneVisit('Eternal');

    this.initZone(buildEternalTiles(), 19, 52);

    if (!state.flags.has('eternal_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('eternal_chest1')) {
      this.createChestIndicator(41, 47);
    }
    if (!state.flags.has('eternal_chest2')) {
      this.createChestIndicator(41, 36);
    }
    if (!state.flags.has('eternal_chest3')) {
      this.createChestIndicator(41, 22);
    }
    if (!state.flags.has('eternal_chest4')) {
      this.createChestIndicator(41, 12);
    }

    this.monsterSprites = [];
    for (const m of ETERNAL_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Eternal Abyss');
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
  private spawnDungeonMonsterAt(m: EternalMonster): void {
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
      fontSize: '7px', fontFamily: 'monospace', color: '#ff9988',
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: EternalMonster; alive: boolean }): void {
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
      returnScene: 'Eternal',
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
    const dialogue = BOSS_DIALOGUES['abyssal_overlord'];
    if (state.flags.has('eternal_boss_defeated')) {
      this.showDialog('Abyssal Overlord', ['The abyss has been silenced forever...'], 19, 5);
      return;
    }

    this.showDialog('Abyssal Overlord', dialogue.preBattle, 19, 5);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Eternal',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('eternal_boss_defeated');
        state.addKill('abyssal_overlord');

        // Lore tracking
        state.flags.add('lore_abyssal_overlord');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['abyssal_overlord'];
        this.showDialog('Abyssal Overlord', [dialogue.deathLine], 19, 5);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Abyssal Overlord', dialogue.loreReveal);
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
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 5,
      });
      state.gold += 200;
      this.showDialog('Abyssal Chest', ['Found: 5x Health Potion, 200 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Abyssal Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x991122;
    const pos = toScreen(19, 5, 1);
    const container = this.add.container(pos.x, pos.y);

    const body = this.add.circle(0, -10, 12, bossColor, 1);
    container.add(body);

    const glow = this.add.circle(0, -10, 20, bossColor, 0.2);
    container.add(glow);
    this.tweens.add({
      targets: glow, alpha: { from: 0.1, to: 0.4 },
      scaleX: { from: 1, to: 1.4 }, scaleY: { from: 1, to: 1.4 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const label = this.add.text(0, -30, 'Abyssal Overlord', {
      fontSize: '10px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ff3344', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 6, 'Lv60 BOSS', {
      fontSize: '8px', fontFamily: 'monospace',
      color: '#ff6677', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(lvl);

    container.setDepth(100);

    this.tweens.add({
      targets: container, y: pos.y - 5,
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
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
