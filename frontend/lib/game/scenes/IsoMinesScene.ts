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
  type: 'crystal_colossus',
  name: 'Crystal Colossus',
  level: 18,
  hp: 400,
  maxHp: 400,
  atk: 28,
  def: 18,
};

// ---------------------------------------------------------------------------
// Mine monster definitions
// ---------------------------------------------------------------------------
interface MineMonster {
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

const MINE_MONSTERS: MineMonster[] = [
  // Room 1 — Mine Entrance (mine rats Lv10, rock golems Lv10)
  { tx: 36, ty: 18, type: 'mine_rat',     name: 'Mine Rat',         level: 10, color: 0x8b7355, hp: 75,  atk: 15, def: 5 },
  { tx: 38, ty: 22, type: 'mine_rat',     name: 'Mine Rat',         level: 10, color: 0x8b7355, hp: 75,  atk: 15, def: 5 },
  // (34,22): keep clear of the player spawn at (37,20) — see FrostWastes note
  { tx: 34, ty: 22, type: 'rock_golem',   name: 'Rock Golem',       level: 10, color: 0x808080, hp: 100, atk: 16, def: 10 },

  // Room 2 — Ore Tunnels (mine rats Lv11, gem beetles Lv12)
  { tx: 28, ty: 30, type: 'mine_rat',     name: 'Giant Mine Rat',   level: 11, color: 0x9b8365, hp: 85,  atk: 17, def: 6 },
  { tx: 24, ty: 33, type: 'gem_beetle',   name: 'Gem Beetle',       level: 12, color: 0x44aacc, hp: 95,  atk: 18, def: 8 },
  { tx: 26, ty: 32, type: 'gem_beetle',   name: 'Gem Beetle',       level: 12, color: 0x44aacc, hp: 95,  atk: 18, def: 8 },

  // Room 3 — Crystal Chamber (crystal spiders Lv13, gem beetles Lv13)
  { tx: 12, ty: 28, type: 'crystal_spider', name: 'Crystal Spider', level: 13, color: 0x88ddff, hp: 110, atk: 20, def: 9 },
  { tx: 18, ty: 30, type: 'crystal_spider', name: 'Crystal Spider', level: 13, color: 0x88ddff, hp: 110, atk: 20, def: 9 },
  { tx: 15, ty: 29, type: 'gem_beetle',     name: 'Jewel Beetle',   level: 13, color: 0x55bbdd, hp: 105, atk: 19, def: 9 },

  // Room 4 — Collapsed Shaft (rock golems Lv14, cave trolls Lv15)
  { tx: 12, ty: 18, type: 'rock_golem',   name: 'Iron Golem',       level: 14, color: 0x696969, hp: 140, atk: 21, def: 13 },
  { tx: 18, ty: 20, type: 'cave_troll',   name: 'Cave Troll',       level: 15, color: 0x5a5a3a, hp: 160, atk: 23, def: 12 },
  { tx: 15, ty: 19, type: 'cave_troll',   name: 'Cave Troll',       level: 15, color: 0x5a5a3a, hp: 160, atk: 23, def: 12 },

  // Room 5 — Gem Vault (crystal spiders Lv16, cave trolls Lv16)
  { tx: 28, ty: 10, type: 'crystal_spider', name: 'Prism Spider',   level: 16, color: 0xaaeeff, hp: 150, atk: 24, def: 11 },
  { tx: 32, ty: 12, type: 'crystal_spider', name: 'Prism Spider',   level: 16, color: 0xaaeeff, hp: 150, atk: 24, def: 11 },
  { tx: 30, ty: 11, type: 'cave_troll',     name: 'Gem Troll',      level: 16, color: 0x6a6a4a, hp: 175, atk: 25, def: 14 },

  // Corridor monsters
  { tx: 33, ty: 26, type: 'mine_rat',     name: 'Tunnel Rat',        level: 11, color: 0x8b7355, hp: 80,  atk: 16, def: 5 },
  { tx: 20, ty: 24, type: 'rock_golem',   name: 'Corridor Golem',    level: 13, color: 0x707070, hp: 120, atk: 19, def: 11 },
  { tx: 22, ty: 14, type: 'gem_beetle',   name: 'Tunnel Beetle',     level: 15, color: 0x55ccdd, hp: 130, atk: 22, def: 10 },
];

// ---------------------------------------------------------------------------
// Map builder — 42 cols x 42 rows
// ---------------------------------------------------------------------------
function buildMineTiles(): ZoneTile[][] {
  const SIZE = 42;

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
  // Room 1 — Mine Entrance (cols 33-40, rows 16-24)
  // =======================================================================
  carveRoom(33, 16, 40, 24);

  for (let r = 16; r <= 24; r++) {
    for (let c = 33; c <= 40; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Rock decorations (mine entrance debris)
  tiles[17][34] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[23][39] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Barrel cluster
  tiles[22][34] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[23][34] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };

  // Torches
  tiles[15][33] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][37] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at left edge — exit_forest
  tiles[20][0]  = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[21][0]  = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  // Make path to exit reachable — carve a small corridor on left edge later

  // =======================================================================
  // Corridor 1 — Mine Entrance to Ore Tunnels (cols 29-34, rows 25-28)
  // =======================================================================
  carveRoom(29, 24, 34, 28, 'stone_dark', 1);
  tiles[24][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[24][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Ore Tunnels (cols 22-35, rows 28-36)
  // =======================================================================
  carveRoom(22, 28, 35, 36);

  for (let r = 28; r <= 36; r++) {
    for (let c = 22; c <= 35; c++) {
      if (hash(r, c, 9) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Ice crystal decorations
  tiles[29][23] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[29][34] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[35][23] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[35][34] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };

  // Rock decorations
  tiles[31][24] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[34][33] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Chest in Ore Tunnels
  tiles[32][28] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'mines_chest1' },
  };

  // Torches
  tiles[27][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Ore Tunnels to Crystal Chamber (cols 18-23, rows 28-30)
  // =======================================================================
  carveRoom(18, 28, 22, 30, 'stone_dark', 1);
  tiles[28][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Crystal Chamber (cols 8-21, rows 26-33)
  // =======================================================================
  carveRoom(8, 26, 21, 33);

  for (let r = 26; r <= 33; r++) {
    for (let c = 8; c <= 21; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Ice crystal decorations (crystal chamber is full of them)
  tiles[27][10] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[27][19] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[32][10] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[32][19] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[29][14] = { height: 2, biome: 'stone', collision: true, data: { deco: 'ice_crystal' } };

  // Pillars
  tiles[27][10] = { height: 4, biome: 'stone', collision: true };
  tiles[27][19] = { height: 4, biome: 'stone', collision: true };
  tiles[32][10] = { height: 4, biome: 'stone', collision: true };
  tiles[32][19] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[25][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[25][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 3 — Crystal Chamber to Collapsed Shaft (cols 12-16, rows 22-26)
  // =======================================================================
  carveRoom(12, 22, 16, 25, 'stone_dark', 1);
  tiles[22][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Collapsed Shaft (cols 8-21, rows 15-22)
  // =======================================================================
  carveRoom(8, 15, 21, 21);

  for (let r = 15; r <= 21; r++) {
    for (let c = 8; c <= 21; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Collapsed rubble (rock decorations)
  tiles[16][10] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[16][11] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[20][18] = { height: 3, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[20][19] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Chest in Collapsed Shaft
  tiles[18][14] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'mines_chest2' },
  };

  // Torches
  tiles[14][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Collapsed Shaft to Gem Vault (cols 20-25, rows 12-16)
  // =======================================================================
  carveRoom(20, 12, 25, 15, 'stone_dark', 1);
  tiles[12][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Gem Vault (cols 25-37, rows 7-15)
  // =======================================================================
  carveRoom(25, 7, 37, 15);

  for (let r = 7; r <= 15; r++) {
    for (let c = 25; c <= 37; c++) {
      if (hash(r, c, 31) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Ice crystal decorations
  tiles[8][26]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[8][36]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[14][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[14][36] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };

  // Pillars
  tiles[9][28]  = { height: 4, biome: 'stone', collision: true };
  tiles[9][34]  = { height: 4, biome: 'stone', collision: true };
  tiles[13][28] = { height: 4, biome: 'stone', collision: true };
  tiles[13][34] = { height: 4, biome: 'stone', collision: true };

  // Chest in Gem Vault
  tiles[11][31] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'mines_chest3' },
  };

  // Torches
  tiles[6][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][31]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][37]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Gem Vault to Boss Room (cols 29-33, rows 3-7)
  // =======================================================================
  carveRoom(29, 3, 33, 6, 'stone_dark', 1);
  tiles[3][28]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][34]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Boss Room: Crystal Colossus (cols 25-37, rows 0-3) — checkerboard
  // =======================================================================
  for (let r = 0; r <= 3; r++) {
    for (let c = 25; c <= 37; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'stone_dark', collision: false };
    }
  }
  for (let r2 = 0; r2 <= 4; r2++) {
    for (let c2 = 24; c2 <= 38; c2++) {
      if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
      if (r2 >= 0 && r2 <= 3 && c2 >= 25 && c2 <= 37) continue;
      if (tiles[r2][c2].collision && tiles[r2][c2].biome === 'stone_dark') {
        tiles[r2][c2] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[0][25]  = { height: 5, biome: 'stone', collision: true };
  tiles[0][37]  = { height: 5, biome: 'stone', collision: true };
  tiles[3][25]  = { height: 5, biome: 'stone', collision: true };
  tiles[3][37]  = { height: 5, biome: 'stone', collision: true };

  // Skull ring
  tiles[0][27]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[0][35]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][27]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][35]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[1][25]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][25]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[1][37]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][37]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Boss tile at (31, 1)
  tiles[1][31] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'crystal_colossus', name: 'Crystal Colossus' },
  };

  // Exit path on left edge — carve corridor to entrance
  carveRoom(0, 19, 8, 21, 'stone_dark', 1);
  carveRoom(8, 16, 9, 21, 'stone_dark', 1);
  // Re-set exit tiles
  tiles[20][0] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[21][0] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoMinesScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: MineMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Mines');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Mines';

    trackZoneVisit('Mines');

    this.initZone(buildMineTiles(), 37, 20);

    if (!state.flags.has('mines_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('mines_chest1')) {
      this.createChestIndicator(28, 32);
    }
    if (!state.flags.has('mines_chest2')) {
      this.createChestIndicator(14, 18);
    }
    if (!state.flags.has('mines_chest3')) {
      this.createChestIndicator(31, 11);
    }

    this.monsterSprites = [];
    for (const m of MINE_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Crystal Mines');
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
  private spawnDungeonMonsterAt(m: MineMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: MineMonster; alive: boolean }): void {
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
      returnScene: 'Mines',
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
    const dialogue = BOSS_DIALOGUES['crystal_colossus'];
    if (state.flags.has('mines_boss_defeated')) {
      this.showDialog('Crystal Colossus', ['The crystals have shattered... peace reigns.'], 31, 1);
      return;
    }

    this.showDialog('Crystal Colossus', dialogue.preBattle, 31, 1);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Mines',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('mines_boss_defeated');
        state.addKill('crystal_colossus');

        // Lore tracking
        state.flags.add('lore_crystal_colossus');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['crystal_colossus'];
        this.showDialog('Crystal Colossus', [dialogue.deathLine], 31, 1);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Crystal Colossus', dialogue.loreReveal);
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
      state.gold += 50;
      this.showDialog('Iron Chest', ['Found: 3x Health Potion, 50 Gold!'], tx, ty);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Iron Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x44aadd;
    const pos = toScreen(31, 1, 1);
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

    const label = this.add.text(0, -28, 'Crystal Colossus', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#66ccff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv18 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#88ddff', stroke: '#000000', strokeThickness: 2,
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
