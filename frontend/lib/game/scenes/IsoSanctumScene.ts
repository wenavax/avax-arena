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
  type: 'ancient_dragon_king',
  name: 'Ancient Dragon King',
  level: 50,
  hp: 1500,
  maxHp: 1500,
  atk: 70,
  def: 40,
};

// ---------------------------------------------------------------------------
// Sanctum monster definitions
// ---------------------------------------------------------------------------
interface SanctumMonster {
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

const SANCTUM_MONSTERS: SanctumMonster[] = [
  // Room 1 — Sanctum Gate (flame sentries Lv30, obsidian guards Lv30)
  { tx: 22, ty: 46, type: 'flame_sentry',    name: 'Flame Sentry',     level: 30, color: 0xff6622, hp: 380, atk: 40, def: 22 },
  { tx: 28, ty: 47, type: 'flame_sentry',    name: 'Flame Sentry',     level: 30, color: 0xff6622, hp: 380, atk: 40, def: 22 },
  { tx: 25, ty: 45, type: 'obsidian_guard',  name: 'Obsidian Guard',   level: 30, color: 0x554433, hp: 420, atk: 38, def: 28 },

  // Room 2 — Hall of Embers (fire drakes Lv32, magma hounds Lv33)
  { tx: 10, ty: 40, type: 'fire_drake',      name: 'Fire Drake',       level: 32, color: 0xff4422, hp: 400, atk: 44, def: 22 },
  { tx: 16, ty: 42, type: 'fire_drake',      name: 'Fire Drake',       level: 32, color: 0xff4422, hp: 400, atk: 44, def: 22 },
  { tx: 13, ty: 41, type: 'magma_hound',     name: 'Magma Hound',      level: 33, color: 0xcc5500, hp: 360, atk: 46, def: 20 },
  { tx: 15, ty: 39, type: 'magma_hound',     name: 'Magma Hound',      level: 33, color: 0xcc5500, hp: 360, atk: 46, def: 20 },

  // Room 3 — Forge of Ancients (molten smiths Lv34, forge golems Lv35)
  { tx: 38, ty: 40, type: 'molten_smith',    name: 'Molten Smith',     level: 34, color: 0xff7744, hp: 440, atk: 45, def: 24 },
  { tx: 42, ty: 42, type: 'molten_smith',    name: 'Molten Smith',     level: 34, color: 0xff7744, hp: 440, atk: 45, def: 24 },
  { tx: 40, ty: 41, type: 'forge_golem',     name: 'Forge Golem',      level: 35, color: 0x885522, hp: 520, atk: 42, def: 30 },

  // Room 4 — Lava Bridge (flame wraiths Lv35, infernal bats Lv36)
  { tx: 23, ty: 33, type: 'flame_wraith',    name: 'Flame Wraith',     level: 35, color: 0xff8844, hp: 420, atk: 48, def: 20 },
  { tx: 27, ty: 34, type: 'flame_wraith',    name: 'Flame Wraith',     level: 35, color: 0xff8844, hp: 420, atk: 48, def: 20 },
  { tx: 25, ty: 32, type: 'infernal_bat',    name: 'Infernal Bat',     level: 36, color: 0xaa4422, hp: 350, atk: 50, def: 18 },

  // Room 5 — Crystal Throne (dragon priests Lv37, crystal drakes Lv38)
  { tx: 10, ty: 28, type: 'dragon_priest',   name: 'Dragon Priest',    level: 37, color: 0xcc66ff, hp: 480, atk: 50, def: 26 },
  { tx: 16, ty: 30, type: 'dragon_priest',   name: 'Dragon Priest',    level: 37, color: 0xcc66ff, hp: 480, atk: 50, def: 26 },
  { tx: 13, ty: 29, type: 'crystal_drake',   name: 'Crystal Drake',    level: 38, color: 0x88ccee, hp: 500, atk: 48, def: 28 },

  // Room 6 — Wyrm Nest (young dragons Lv38, wyrm guardians Lv39)
  { tx: 38, ty: 28, type: 'young_dragon',    name: 'Young Dragon',     level: 38, color: 0xff5533, hp: 520, atk: 52, def: 26 },
  { tx: 42, ty: 30, type: 'young_dragon',    name: 'Young Dragon',     level: 38, color: 0xff5533, hp: 520, atk: 52, def: 26 },
  { tx: 40, ty: 29, type: 'wyrm_guardian',   name: 'Wyrm Guardian',    level: 39, color: 0xdd6644, hp: 560, atk: 50, def: 30 },

  // Room 7 — Treasure Vault (mimic lords Lv40, golden golems Lv40)
  { tx: 10, ty: 18, type: 'mimic_lord',      name: 'Mimic Lord',       level: 40, color: 0xddaa22, hp: 500, atk: 55, def: 24 },
  { tx: 16, ty: 20, type: 'mimic_lord',      name: 'Mimic Lord',       level: 40, color: 0xddaa22, hp: 500, atk: 55, def: 24 },
  { tx: 13, ty: 19, type: 'golden_golem',    name: 'Golden Golem',     level: 40, color: 0xeecc33, hp: 600, atk: 48, def: 35 },

  // Room 8 — Dragon Graveyard (undead dragons Lv42, death knights Lv43)
  { tx: 38, ty: 18, type: 'undead_dragon',   name: 'Undead Dragon',    level: 42, color: 0x556644, hp: 650, atk: 55, def: 28 },
  { tx: 42, ty: 20, type: 'undead_dragon',   name: 'Undead Dragon',    level: 42, color: 0x556644, hp: 650, atk: 55, def: 28 },
  { tx: 40, ty: 19, type: 'death_knight',    name: 'Death Knight',     level: 43, color: 0x443355, hp: 580, atk: 58, def: 32 },

  // Room 9 — Inner Sanctum (elder wyrms Lv45, flame archons Lv45)
  { tx: 22, ty: 12, type: 'elder_wyrm',      name: 'Elder Wyrm',       level: 45, color: 0xcc3322, hp: 750, atk: 60, def: 32 },
  { tx: 28, ty: 14, type: 'elder_wyrm',      name: 'Elder Wyrm',       level: 45, color: 0xcc3322, hp: 750, atk: 60, def: 32 },
  { tx: 25, ty: 13, type: 'flame_archon',    name: 'Flame Archon',     level: 45, color: 0xff9922, hp: 700, atk: 62, def: 30 },

  // Corridor monsters
  { tx: 25, ty: 38, type: 'flame_sentry',    name: 'Gate Sentry',      level: 31, color: 0xff5522, hp: 390, atk: 41, def: 23 },
  { tx: 25, ty: 24, type: 'flame_wraith',    name: 'Corridor Wraith',  level: 36, color: 0xff7744, hp: 430, atk: 49, def: 21 },
  { tx: 25, ty: 8,  type: 'infernal_bat',    name: 'Hell Bat',         level: 44, color: 0xbb3322, hp: 500, atk: 56, def: 22 },
  { tx: 13, ty: 9,  type: 'flame_archon',    name: 'Fire Guardian',    level: 46, color: 0xff8811, hp: 720, atk: 58, def: 28 },
  { tx: 40, ty: 9,  type: 'death_knight',    name: 'Bone Guardian',    level: 44, color: 0x554466, hp: 600, atk: 56, def: 30 },
];

// ---------------------------------------------------------------------------
// Map builder — 50 cols x 50 rows
// ---------------------------------------------------------------------------
function buildSanctumTiles(): ZoneTile[][] {
  const SIZE = 50;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Step 1: Fill everything with volcanic_rock walls (height 5) ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'volcanic_rock', collision: true });
    }
    tiles.push(row);
  }

  // Helper to carve a room with wall borders
  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'volcanic', h = 1) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        tiles[r][c] = { height: h, biome, collision: false };
      }
    }
    for (let r = r1 - 1; r <= r2 + 1; r++) {
      for (let c = c1 - 1; c <= c2 + 1; c++) {
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) continue;
        if (tiles[r][c].collision && tiles[r][c].biome === 'volcanic_rock') {
          tiles[r][c] = { height: 4, biome: 'wall', collision: true };
        }
      }
    }
  };

  // =======================================================================
  // Room 1 — Sanctum Gate (cols 18-32, rows 43-48)
  // =======================================================================
  carveRoom(18, 43, 32, 48, 'volcanic');

  for (let r = 43; r <= 48; r++) {
    for (let c = 18; c <= 32; c++) {
      if (hash(r, c, 13) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Rock formations
  tiles[44][19] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[47][31] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };

  // Torches
  tiles[42][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[44][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[47][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[44][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[47][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom edge — exit_volcano
  tiles[49][24] = { height: 1, biome: 'volcanic', collision: false, interact: 'exit_forest' };
  tiles[49][25] = { height: 1, biome: 'volcanic', collision: false, interact: 'exit_forest' };
  tiles[49][26] = { height: 1, biome: 'volcanic', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor — Gate to Hall of Embers (cols 11-18, rows 39-43)
  // =======================================================================
  carveRoom(11, 39, 18, 42, 'volcanic', 1);

  // =======================================================================
  // Room 2 — Hall of Embers (cols 5-19, rows 37-43) — left branch
  // =======================================================================
  carveRoom(5, 37, 19, 43, 'volcanic');

  for (let r = 37; r <= 43; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 7) < 20) {
        tiles[r][c] = { height: 1, biome: 'magma', collision: false };
      }
    }
  }

  // Lava patches
  tiles[39][7]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[39][8]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[40][7]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[41][17] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[41][18] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };

  // Torches
  tiles[36][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — Gate to Forge (cols 32-35, rows 39-43)
  // =======================================================================
  carveRoom(32, 39, 35, 42, 'volcanic', 1);

  // =======================================================================
  // Room 3 — Forge of Ancients (cols 34-46, rows 37-44) — right branch
  // =======================================================================
  carveRoom(34, 37, 46, 44, 'volcanic');

  for (let r = 37; r <= 44; r++) {
    for (let c = 34; c <= 46; c++) {
      if (hash(r, c, 11) < 20) {
        tiles[r][c] = { height: 1, biome: 'magma', collision: false };
      }
    }
  }

  // Forge details — lava
  tiles[40][36] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[40][37] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[41][44] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[41][45] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };

  // Chest in Forge
  tiles[39][40] = {
    height: 1, biome: 'volcanic', collision: true,
    interact: 'chest', data: { id: 'sanctum_chest1' },
  };

  // Torches
  tiles[36][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[38][47] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[42][47] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — to Lava Bridge (cols 23-27, rows 36-43)
  // =======================================================================
  carveRoom(23, 36, 27, 42, 'volcanic', 1);

  // =======================================================================
  // Room 4 — Lava Bridge (cols 18-32, rows 30-36)
  // =======================================================================
  carveRoom(18, 30, 32, 36, 'volcanic');

  // Lava river through the middle
  for (let c = 19; c <= 31; c++) {
    tiles[33][c] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  }
  // Bridge across (walkable)
  tiles[33][24] = { height: 1, biome: 'obsidian', collision: false };
  tiles[33][25] = { height: 1, biome: 'obsidian', collision: false };
  tiles[33][26] = { height: 1, biome: 'obsidian', collision: false };

  // Torches
  tiles[29][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[35][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[35][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — Lava Bridge to Crystal Throne (cols 10-18, rows 28-30)
  // =======================================================================
  carveRoom(10, 28, 18, 30, 'volcanic', 1);

  // =======================================================================
  // Room 5 — Crystal Throne (cols 5-19, rows 25-31) — left
  // =======================================================================
  carveRoom(5, 25, 19, 31, 'volcanic');

  for (let r = 25; r <= 31; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 29) < 20) {
        tiles[r][c] = { height: 1, biome: 'obsidian', collision: false };
      }
    }
  }

  // Crystal pillars
  tiles[26][7]  = { height: 4, biome: 'ice', collision: true };
  tiles[26][17] = { height: 4, biome: 'ice', collision: true };
  tiles[30][7]  = { height: 4, biome: 'ice', collision: true };
  tiles[30][17] = { height: 4, biome: 'ice', collision: true };

  // Chest
  tiles[28][12] = {
    height: 1, biome: 'volcanic', collision: true,
    interact: 'chest', data: { id: 'sanctum_chest2' },
  };

  // Torches
  tiles[24][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — Lava Bridge to Wyrm Nest (cols 32-35, rows 28-30)
  // =======================================================================
  carveRoom(32, 28, 35, 30, 'volcanic', 1);

  // =======================================================================
  // Room 6 — Wyrm Nest (cols 34-46, rows 25-32) — right
  // =======================================================================
  carveRoom(34, 25, 46, 32, 'volcanic');

  for (let r = 25; r <= 32; r++) {
    for (let c = 34; c <= 46; c++) {
      if (hash(r, c, 33) < 20) {
        tiles[r][c] = { height: 1, biome: 'magma', collision: false };
      }
    }
  }

  // Nest details — lava eggs
  tiles[28][38] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[28][39] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[29][38] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[29][42] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };
  tiles[29][43] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 8 } };

  // Skull decorations
  tiles[26][35] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[26][45] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[31][35] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[31][45] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };

  // Torches
  tiles[24][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][47] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][47] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — Crystal Throne to Treasure Vault (cols 10-14, rows 21-25)
  // =======================================================================
  carveRoom(10, 21, 14, 24, 'volcanic', 1);
  tiles[21][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 7 — Treasure Vault (cols 5-19, rows 15-21) — left
  // =======================================================================
  carveRoom(5, 15, 19, 21, 'obsidian');

  // Gold floor patches
  for (let r = 15; r <= 21; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 41) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Barrel clusters (treasure)
  tiles[16][6]  = { height: 1, biome: 'obsidian', collision: true, data: { deco: 'barrel' } };
  tiles[16][7]  = { height: 1, biome: 'obsidian', collision: true, data: { deco: 'barrel' } };
  tiles[20][17] = { height: 1, biome: 'obsidian', collision: true, data: { deco: 'barrel' } };
  tiles[20][18] = { height: 1, biome: 'obsidian', collision: true, data: { deco: 'barrel' } };

  // Chest
  tiles[18][12] = {
    height: 1, biome: 'obsidian', collision: true,
    interact: 'chest', data: { id: 'sanctum_chest3' },
  };

  // Torches
  tiles[14][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — Wyrm Nest to Dragon Graveyard (cols 38-42, rows 21-25)
  // =======================================================================
  carveRoom(38, 21, 42, 24, 'volcanic', 1);
  tiles[21][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][43] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 8 — Dragon Graveyard (cols 34-46, rows 15-21) — right
  // =======================================================================
  carveRoom(34, 15, 46, 21, 'volcanic');

  for (let r = 15; r <= 21; r++) {
    for (let c = 34; c <= 46; c++) {
      if (hash(r, c, 43) < 25) {
        tiles[r][c] = { height: 1, biome: 'stone_dark', collision: false };
      }
    }
  }

  // Bone/skull decorations
  tiles[16][35] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[16][45] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[20][35] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[20][45] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[18][36] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };
  tiles[18][44] = { height: 1, biome: 'volcanic', collision: false, data: { deco: 'skull' } };

  // Large rock formations (dragon bones)
  tiles[17][38] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[19][42] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Chest
  tiles[18][40] = {
    height: 1, biome: 'volcanic', collision: true,
    interact: 'chest', data: { id: 'sanctum_chest4' },
  };

  // Torches
  tiles[14][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][40] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][46] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][47] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][47] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — merging left and right to Inner Sanctum (cols 18-32, rows 12-15)
  // =======================================================================
  carveRoom(18, 12, 32, 15, 'volcanic', 1);
  // Connect left
  carveRoom(14, 14, 18, 15, 'volcanic', 1);
  // Connect right
  carveRoom(32, 14, 38, 15, 'volcanic', 1);

  // =======================================================================
  // Room 9 — Inner Sanctum (cols 16-34, rows 8-12)
  // =======================================================================
  carveRoom(16, 8, 34, 12, 'magma');

  for (let r = 8; r <= 12; r++) {
    for (let c = 16; c <= 34; c++) {
      if (hash(r, c, 47) < 25) {
        tiles[r][c] = { height: 1, biome: 'obsidian', collision: false };
      }
    }
  }

  // Lava moat around edges
  tiles[9][17]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[9][18]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[11][17] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[9][32]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[9][33]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[11][33] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };

  // Pillars
  tiles[9][20]  = { height: 4, biome: 'obsidian', collision: true };
  tiles[9][30]  = { height: 4, biome: 'obsidian', collision: true };
  tiles[11][20] = { height: 4, biome: 'obsidian', collision: true };
  tiles[11][30] = { height: 4, biome: 'obsidian', collision: true };

  // Torches
  tiles[7][16]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][34]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][35]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor — Inner Sanctum to Boss Room (cols 23-27, rows 4-8)
  // =======================================================================
  carveRoom(23, 4, 27, 7, 'volcanic', 1);
  tiles[4][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][28]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 10 — Boss Room: Ancient Dragon King (cols 10-40, rows 1-4) — obsidian checkerboard
  // =======================================================================
  for (let r = 1; r <= 4; r++) {
    for (let c = 10; c <= 40; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'obsidian' : 'magma', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 0; r <= 5; r++) {
    for (let c = 9; c <= 41; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 1 && r <= 4 && c >= 10 && c <= 40) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'volcanic_rock') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (obsidian height 5)
  tiles[1][10]  = { height: 5, biome: 'obsidian', collision: true };
  tiles[1][40]  = { height: 5, biome: 'obsidian', collision: true };
  tiles[4][10]  = { height: 5, biome: 'obsidian', collision: true };
  tiles[4][40]  = { height: 5, biome: 'obsidian', collision: true };

  // Extra pillars for grandeur
  tiles[1][18]  = { height: 5, biome: 'obsidian', collision: true };
  tiles[1][32]  = { height: 5, biome: 'obsidian', collision: true };
  tiles[4][18]  = { height: 5, biome: 'obsidian', collision: true };
  tiles[4][32]  = { height: 5, biome: 'obsidian', collision: true };

  // Skull ring
  tiles[1][13]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[1][37]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[4][13]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[4][37]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[2][10]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[3][10]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[2][40]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[3][40]  = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };

  // Torch ring (8 torches)
  tiles[0][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][19]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][31]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][39]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][41]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Lava patches near boss
  tiles[2][12]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[3][15]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[1][35]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };
  tiles[3][38]  = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 10 } };

  // Boss tile at (25, 2)
  tiles[2][25] = {
    height: 1, biome: 'obsidian', collision: true,
    interact: 'boss', data: { id: 'ancient_dragon_king', name: 'Ancient Dragon King' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoSanctumScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: SanctumMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Sanctum');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Sanctum';

    trackZoneVisit('Sanctum');

    this.initZone(buildSanctumTiles(), 25, 47);

    // Boss indicator (if not yet defeated)
    if (!state.flags.has('sanctum_boss_defeated')) {
      this.createBossIndicator();
    }

    // Chest indicators
    if (!state.flags.has('sanctum_chest1')) {
      this.createChestIndicator(40, 39);
    }
    if (!state.flags.has('sanctum_chest2')) {
      this.createChestIndicator(12, 28);
    }
    if (!state.flags.has('sanctum_chest3')) {
      this.createChestIndicator(12, 18);
    }
    if (!state.flags.has('sanctum_chest4')) {
      this.createChestIndicator(40, 18);
    }

    // Spawn sanctum monsters
    this.monsterSprites = [];
    for (const m of SANCTUM_MONSTERS) {
      this.spawnSanctumMonsterAt(m);
    }

    this.events.emit('zone-change', "Dragon's Sanctum");
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.checkMonsterOverlap();
    this.checkLavaHazard();
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
  // Lava hazard check
  // -----------------------------------------------------------------------
  private lastLavaTick = 0;

  private checkLavaHazard(): void {
    if (this.frozen) return;
    const ptx = this.playerTx;
    const pty = this.playerTy;
    if (pty < 0 || pty >= this.tiles.length || ptx < 0 || ptx >= this.tiles[0].length) return;

    const tile = this.tiles[pty][ptx];
    if (tile.data?.hazard === 'lava') {
      // update() calls this every frame — throttle to a damage tick, or the
      // mandatory lava bridge deals ~480 HP/s and saves to localStorage per frame
      const now = this.time.now;
      if (now - this.lastLavaTick < 700) return;
      this.lastLavaTick = now;
      const state = PlayerState.get();
      const dmg = tile.data.dmg ?? 8;
      state.hp = Math.max(1, state.hp - dmg);
      this.events.emit('hp-change');
      state.save();
    }
  }

  // -----------------------------------------------------------------------
  // Sanctum monster spawning
  // -----------------------------------------------------------------------
  private spawnSanctumMonsterAt(m: SanctumMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: SanctumMonster; alive: boolean }): void {
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
      returnScene: 'Sanctum',
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
          this.spawnSanctumMonsterAt(m);
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
    const dialogue = BOSS_DIALOGUES['ancient_dragon_king'];
    if (state.flags.has('sanctum_boss_defeated')) {
      this.showDialog('Ancient Dragon King', ['The great dragon sleeps... its reign has ended.'], 25, 2);
      return;
    }

    this.showDialog('Ancient Dragon King', dialogue.preBattle, 25, 2);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Sanctum',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('sanctum_boss_defeated');
        state.addKill('ancient_dragon_king');

        // Lore tracking
        state.flags.add('lore_ancient_dragon_king');

        // Daily quest tracking
        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['ancient_dragon_king'];
        this.showDialog('Ancient Dragon King', [dialogue.deathLine], 25, 2);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Ancient Dragon King', dialogue.loreReveal);
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

      // Higher tier loot for harder dungeon
      state.addItem({
        id: 'potion_hp', name: 'Health Potion', sprite: 'potion',
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 5,
      });
      state.gold += 200;
      this.showDialog('Dragon Hoard Chest', ['Found: 5x Health Potion, 200 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Dragon Hoard Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0xff2200;
    const pos = toScreen(25, 2, 1);
    const container = this.add.container(pos.x, pos.y);

    // Larger body for the king
    const body = this.add.circle(0, -10, 12, bossColor, 1);
    container.add(body);

    const glow = this.add.circle(0, -10, 20, bossColor, 0.2);
    container.add(glow);
    this.tweens.add({
      targets: glow, alpha: { from: 0.1, to: 0.4 },
      scaleX: { from: 1, to: 1.4 }, scaleY: { from: 1, to: 1.4 },
      duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const label = this.add.text(0, -32, 'Ancient Dragon King', {
      fontSize: '10px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ff4400', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 6, 'Lv50 BOSS', {
      fontSize: '8px', fontFamily: 'monospace',
      color: '#ff8866', stroke: '#000000', strokeThickness: 2,
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
