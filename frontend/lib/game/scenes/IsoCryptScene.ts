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
  type: 'shadow_lord',
  name: 'Shadow Lord',
  level: 12,
  hp: 300,
  maxHp: 300,
  atk: 25,
  def: 14,
};

// ---------------------------------------------------------------------------
// Crypt monster definitions
// ---------------------------------------------------------------------------
interface CryptMonster {
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

const CRYPT_MONSTERS: CryptMonster[] = [
  // Room 1 — Entry Hall (skeletons Lv5, ghosts Lv5)
  { tx: 10, ty: 35, type: 'skeleton',   name: 'Skeleton',       level: 5, color: 0xccccaa, hp: 50, atk: 12, def: 4 },
  { tx: 16, ty: 36, type: 'skeleton',   name: 'Skeleton',       level: 5, color: 0xccccaa, hp: 50, atk: 12, def: 4 },
  { tx: 13, ty: 34, type: 'ghost',      name: 'Crypt Ghost',    level: 5, color: 0x88bbdd, hp: 45, atk: 13, def: 3 },

  // Room 2 — Bone Chamber (skeletons Lv6, bats Lv5)
  { tx: 28, ty: 33, type: 'skeleton',   name: 'Bone Warrior',   level: 6, color: 0xddddbb, hp: 60, atk: 14, def: 5 },
  { tx: 33, ty: 35, type: 'skeleton',   name: 'Bone Warrior',   level: 6, color: 0xddddbb, hp: 60, atk: 14, def: 5 },
  { tx: 30, ty: 36, type: 'bat',        name: 'Crypt Bat',      level: 5, color: 0x8866aa, hp: 40, atk: 11, def: 3 },

  // Room 3 — Ritual Room (wraiths Lv7, necromancers Lv8)
  { tx: 10, ty: 22, type: 'wraith',     name: 'Wraith',         level: 7, color: 0x99ccee, hp: 70, atk: 16, def: 5 },
  { tx: 16, ty: 24, type: 'wraith',     name: 'Wraith',         level: 7, color: 0x99ccee, hp: 70, atk: 16, def: 5 },
  { tx: 13, ty: 23, type: 'necromancer', name: 'Necromancer',   level: 8, color: 0x6633aa, hp: 85, atk: 18, def: 7 },

  // Room 4 — Catacombs (ghosts Lv8, skeleton warriors Lv9)
  { tx: 28, ty: 20, type: 'ghost',      name: 'Wailing Ghost',  level: 8, color: 0xaaddff, hp: 75, atk: 17, def: 5 },
  { tx: 34, ty: 22, type: 'ghost',      name: 'Wailing Ghost',  level: 8, color: 0xaaddff, hp: 75, atk: 17, def: 5 },
  { tx: 31, ty: 21, type: 'skeleton_warrior', name: 'Skeleton Warrior', level: 9, color: 0xeeeecc, hp: 95, atk: 19, def: 8 },
  { tx: 33, ty: 24, type: 'skeleton_warrior', name: 'Skeleton Warrior', level: 9, color: 0xeeeecc, hp: 95, atk: 19, def: 8 },

  // Room 5 — Shadow Vault (shadow assassins Lv10, dark knights Lv10)
  { tx: 10, ty: 10, type: 'shadow_assassin', name: 'Shadow Assassin', level: 10, color: 0x553388, hp: 100, atk: 22, def: 7 },
  { tx: 16, ty: 12, type: 'shadow_assassin', name: 'Shadow Assassin', level: 10, color: 0x553388, hp: 100, atk: 22, def: 7 },
  { tx: 13, ty: 11, type: 'dark_knight', name: 'Dark Knight',   level: 10, color: 0x444466, hp: 120, atk: 20, def: 10 },

  // Corridor monsters
  { tx: 20, ty: 30, type: 'ghost',      name: 'Crypt Ghost',    level: 5, color: 0x88bbdd, hp: 45, atk: 13, def: 3 },
  { tx: 20, ty: 16, type: 'wraith',     name: 'Dark Wraith',    level: 8, color: 0x7799bb, hp: 72, atk: 16, def: 5 },
  { tx: 20, ty: 7,  type: 'skeleton',   name: 'Bone Sentry',    level: 9, color: 0xddddbb, hp: 90, atk: 18, def: 7 },
];

// ---------------------------------------------------------------------------
// Map builder — 40 cols x 40 rows
// ---------------------------------------------------------------------------
function buildCryptTiles(): ZoneTile[][] {
  const SIZE = 40;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Step 1: Fill everything with stone_dark walls (height 5) ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'stone_dark', collision: true });
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
        if (tiles[r][c].collision && tiles[r][c].biome === 'stone_dark') {
          tiles[r][c] = { height: 4, biome: 'wall', collision: true };
        }
      }
    }
  };

  // =======================================================================
  // Room 1 — Entry Hall (cols 6-19, rows 32-38)
  // =======================================================================
  carveRoom(6, 32, 19, 38);

  // Floor detail: stone with ~30% cobble patches
  for (let r = 32; r <= 38; r++) {
    for (let c = 6; c <= 19; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Barrel cluster
  tiles[36][7]  = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[37][7]  = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[36][8]  = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };

  // Bone pile decorations
  tiles[33][18] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[37][18] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torch markers on walls (Room 1)
  tiles[31][6]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[34][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[34][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[37][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom edge — exit_forest
  tiles[39][12] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[39][13] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Entry Hall to Bone Chamber (cols 18-24, rows 33-35)
  // =======================================================================
  carveRoom(18, 33, 24, 35, 'stone_dark', 1);
  tiles[33][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Bone Chamber (cols 25-37, rows 31-38)
  // =======================================================================
  carveRoom(25, 31, 37, 38);

  for (let r = 31; r <= 38; r++) {
    for (let c = 25; c <= 37; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Bone pile decorations
  tiles[32][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[32][36] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[37][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[37][36] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Rock decorations
  tiles[34][27] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[36][35] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Chest in Bone Chamber
  tiles[34][31] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'crypt_chest1' },
  };

  // Torches
  tiles[30][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[32][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[36][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[32][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Entry Hall to Ritual Room (cols 10-14, rows 28-32)
  // =======================================================================
  carveRoom(10, 28, 14, 31, 'stone_dark', 1);
  tiles[28][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Ritual Room (cols 5-19, rows 20-27)
  // =======================================================================
  carveRoom(5, 20, 19, 27);

  for (let r = 20; r <= 27; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Ritual circle — water tiles in center
  tiles[23][11] = { height: 0, biome: 'water', collision: false };
  tiles[23][12] = { height: 0, biome: 'water', collision: false };
  tiles[23][13] = { height: 0, biome: 'water', collision: false };
  tiles[24][11] = { height: 0, biome: 'water', collision: false };
  tiles[24][13] = { height: 0, biome: 'water', collision: false };
  tiles[25][11] = { height: 0, biome: 'water', collision: false };
  tiles[25][12] = { height: 0, biome: 'water', collision: false };
  tiles[25][13] = { height: 0, biome: 'water', collision: false };

  // Pillars
  tiles[21][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[21][17] = { height: 4, biome: 'stone', collision: true };
  tiles[26][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[26][17] = { height: 4, biome: 'stone', collision: true };

  // Skull decorations
  tiles[20][6]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[20][18] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torches
  tiles[19][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Bone Chamber to Catacombs (cols 29-33, rows 26-31)
  // =======================================================================
  carveRoom(29, 26, 33, 30, 'stone_dark', 1);
  tiles[26][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][34] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Catacombs (cols 25-37, rows 18-25)
  // =======================================================================
  carveRoom(25, 18, 37, 25);

  for (let r = 18; r <= 25; r++) {
    for (let c = 25; c <= 37; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Bone piles
  tiles[19][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[19][36] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[24][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[24][36] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Pillars
  tiles[20][28] = { height: 4, biome: 'stone', collision: true };
  tiles[20][34] = { height: 4, biome: 'stone', collision: true };
  tiles[23][28] = { height: 4, biome: 'stone', collision: true };
  tiles[23][34] = { height: 4, biome: 'stone', collision: true };

  // Chest in Catacombs
  tiles[21][31] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'crypt_chest2' },
  };

  // Torches
  tiles[17][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Ritual Room to Shadow Vault (cols 10-14, rows 15-20)
  // =======================================================================
  carveRoom(10, 15, 14, 19, 'stone_dark', 1);
  tiles[15][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Shadow Vault (cols 5-19, rows 8-14)
  // =======================================================================
  carveRoom(5, 8, 19, 14);

  for (let r = 8; r <= 14; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Dark ambiance — some stone_dark floor patches
  tiles[10][8]  = { height: 1, biome: 'stone_dark', collision: false };
  tiles[11][15] = { height: 1, biome: 'stone_dark', collision: false };
  tiles[12][7]  = { height: 1, biome: 'stone_dark', collision: false };
  tiles[13][16] = { height: 1, biome: 'stone_dark', collision: false };

  // Pillars
  tiles[9][7]   = { height: 4, biome: 'stone', collision: true };
  tiles[9][17]  = { height: 4, biome: 'stone', collision: true };
  tiles[13][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[13][17] = { height: 4, biome: 'stone', collision: true };

  // Chest in Shadow Vault
  tiles[11][12] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'crypt_chest3' },
  };

  // Skull decorations
  tiles[8][6]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[8][18]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[14][6]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[14][18] = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torches
  tiles[7][5]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][12]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][19]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Shadow Vault to Boss Room (cols 10-14, rows 4-8)
  // =======================================================================
  carveRoom(10, 4, 14, 7, 'stone_dark', 1);
  tiles[4][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Boss Room: Shadow Lord (cols 5-19, rows 1-4) — checkerboard
  // =======================================================================
  for (let r = 1; r <= 4; r++) {
    for (let c = 5; c <= 19; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'stone_dark', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 0; r <= 5; r++) {
    for (let c = 4; c <= 20; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 1 && r <= 4 && c >= 5 && c <= 19) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'stone_dark') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (stone height 5)
  tiles[1][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[1][19]  = { height: 5, biome: 'stone', collision: true };
  tiles[4][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[4][19]  = { height: 5, biome: 'stone', collision: true };

  // Skull ring (8 skulls around perimeter)
  tiles[1][7]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[1][17]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][7]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][17]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][5]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][5]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][19]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][19]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torch ring (6 torches)
  tiles[0][6]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][12]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][18]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (12, 2)
  tiles[2][12] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'shadow_lord', name: 'Shadow Lord' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoCryptScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: CryptMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Crypt');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Crypt';

    trackZoneVisit('Crypt');

    this.initZone(buildCryptTiles(), 12, 37);

    // Boss indicator (if not yet defeated)
    if (!state.flags.has('crypt_boss_defeated')) {
      this.createBossIndicator();
    }

    // Chest indicators
    if (!state.flags.has('crypt_chest1')) {
      this.createChestIndicator(31, 34);
    }
    if (!state.flags.has('crypt_chest2')) {
      this.createChestIndicator(31, 21);
    }
    if (!state.flags.has('crypt_chest3')) {
      this.createChestIndicator(12, 11);
    }

    // Spawn crypt monsters
    this.monsterSprites = [];
    for (const m of CRYPT_MONSTERS) {
      this.spawnCryptMonsterAt(m);
    }

    this.events.emit('zone-change', 'Crypt of Shadows');
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
  // Crypt monster spawning
  // -----------------------------------------------------------------------
  private spawnCryptMonsterAt(m: CryptMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: CryptMonster; alive: boolean }): void {
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
      returnScene: 'Crypt',
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
          this.spawnCryptMonsterAt(m);
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
    const dialogue = BOSS_DIALOGUES['shadow_lord'];
    if (state.flags.has('crypt_boss_defeated')) {
      this.showDialog('Shadow Lord', ['The shadows have been banished...'], 12, 2);
      return;
    }

    this.showDialog('Shadow Lord', dialogue.preBattle, 12, 2);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Crypt',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('crypt_boss_defeated');
        state.addKill('shadow_lord');

        // Lore tracking
        state.flags.add('lore_shadow_lord');

        // Daily quest tracking
        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['shadow_lord'];
        this.showDialog('Shadow Lord', [dialogue.deathLine], 12, 2);

        // Show lore reveal after death line dialog closes
        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Shadow Lord', dialogue.loreReveal);
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
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 2,
      });
      state.gold += 30;
      this.showDialog('Dusty Chest', ['Found: 2x Health Potion, 30 Gold!'], tx, ty);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Dusty Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x8833cc;
    const pos = toScreen(12, 2, 1);
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

    const label = this.add.text(0, -28, 'Shadow Lord', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#aa44ff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv12 BOSS', {
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
