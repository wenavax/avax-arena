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
  type: 'swamp_hag',
  name: 'Swamp Hag',
  level: 15,
  hp: 350,
  maxHp: 350,
  atk: 22,
  def: 12,
};

// ---------------------------------------------------------------------------
// Swamp monster definitions
// ---------------------------------------------------------------------------
interface SwampMonster {
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

const SWAMP_MONSTERS: SwampMonster[] = [
  // Room 1 — Bog Entry (bog crawlers Lv8, poison toads Lv8)
  { tx: 10, ty: 33, type: 'bog_crawler',   name: 'Bog Crawler',       level: 8,  color: 0x556b2f, hp: 70,  atk: 14, def: 6 },
  { tx: 15, ty: 35, type: 'bog_crawler',   name: 'Bog Crawler',       level: 8,  color: 0x556b2f, hp: 70,  atk: 14, def: 6 },
  // (15,32): diagonal adjacency to the (11,35) spawn also triggers battle on entry
  { tx: 15, ty: 32, type: 'poison_toad',   name: 'Poison Toad',       level: 8,  color: 0x6b8e23, hp: 60,  atk: 15, def: 5 },

  // Room 2 — Poison Marsh (poison toads Lv10, swamp wraiths Lv10)
  { tx: 26, ty: 30, type: 'poison_toad',   name: 'Giant Poison Toad', level: 10, color: 0x7caf29, hp: 85,  atk: 17, def: 7 },
  { tx: 30, ty: 33, type: 'poison_toad',   name: 'Giant Poison Toad', level: 10, color: 0x7caf29, hp: 85,  atk: 17, def: 7 },
  { tx: 28, ty: 31, type: 'swamp_wraith',  name: 'Swamp Wraith',      level: 10, color: 0x4a6741, hp: 90,  atk: 18, def: 6 },
  { tx: 32, ty: 32, type: 'swamp_wraith',  name: 'Swamp Wraith',      level: 10, color: 0x4a6741, hp: 90,  atk: 18, def: 6 },

  // Room 3 — Witch's Hollow (witch apprentices Lv11, fungal beasts Lv12)
  { tx: 10, ty: 20, type: 'witch_apprentice', name: 'Witch Apprentice', level: 11, color: 0x8b45a6, hp: 95,  atk: 19, def: 7 },
  { tx: 16, ty: 22, type: 'witch_apprentice', name: 'Witch Apprentice', level: 11, color: 0x8b45a6, hp: 95,  atk: 19, def: 7 },
  { tx: 13, ty: 21, type: 'fungal_beast',     name: 'Fungal Beast',     level: 12, color: 0x8fbc8f, hp: 110, atk: 17, def: 9 },

  // Room 4 — Fungal Cavern (fungal beasts Lv13, bog crawlers Lv12)
  { tx: 26, ty: 16, type: 'fungal_beast',  name: 'Giant Fungal Beast', level: 13, color: 0x9acd32, hp: 130, atk: 19, def: 10 },
  { tx: 32, ty: 18, type: 'fungal_beast',  name: 'Giant Fungal Beast', level: 13, color: 0x9acd32, hp: 130, atk: 19, def: 10 },
  { tx: 29, ty: 17, type: 'bog_crawler',   name: 'Marsh Crawler',      level: 12, color: 0x6b7b3f, hp: 105, atk: 18, def: 8 },
  { tx: 31, ty: 15, type: 'bog_crawler',   name: 'Marsh Crawler',      level: 12, color: 0x6b7b3f, hp: 105, atk: 18, def: 8 },

  // Corridor monsters
  { tx: 20, ty: 28, type: 'poison_toad',   name: 'Poison Toad',        level: 9,  color: 0x6b8e23, hp: 75,  atk: 16, def: 5 },
  { tx: 20, ty: 14, type: 'swamp_wraith',  name: 'Dark Swamp Wraith',  level: 11, color: 0x3d5c3a, hp: 95,  atk: 18, def: 7 },
  { tx: 18, ty: 7,  type: 'witch_apprentice', name: 'Coven Initiate',  level: 13, color: 0x7b3fa6, hp: 120, atk: 20, def: 8 },
];

// ---------------------------------------------------------------------------
// Map builder — 38 cols x 38 rows
// ---------------------------------------------------------------------------
function buildSwampTiles(): ZoneTile[][] {
  const SIZE = 38;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Step 1: Fill everything with dark_grass (swamp base, collision) ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 3 : 2;
      row.push({ height: h, biome: 'dark_grass', collision: true });
    }
    tiles.push(row);
  }

  // Helper to carve a room
  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'dark_grass', h = 1) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        tiles[r][c] = { height: h, biome, collision: false };
      }
    }
    for (let r = r1 - 1; r <= r2 + 1; r++) {
      for (let c = c1 - 1; c <= c2 + 1; c++) {
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) continue;
        if (tiles[r][c].collision && tiles[r][c].biome === 'dark_grass') {
          tiles[r][c] = { height: 3, biome: 'wall', collision: true };
        }
      }
    }
  };

  // =======================================================================
  // Room 1 — Bog Entry (cols 6-18, rows 30-36)
  // =======================================================================
  carveRoom(6, 30, 18, 36);

  // Floor: dirt paths with water hazards
  for (let r = 30; r <= 36; r++) {
    for (let c = 6; c <= 18; c++) {
      if (hash(r, c, 13) < 25) {
        tiles[r][c] = { height: 1, biome: 'dirt', collision: false };
      }
    }
  }

  // Water hazards in Bog Entry
  tiles[32][9]  = { height: 0, biome: 'water', collision: false };
  tiles[32][10] = { height: 0, biome: 'water', collision: false };
  tiles[33][10] = { height: 0, biome: 'water', collision: false };
  tiles[34][14] = { height: 0, biome: 'water', collision: false };
  tiles[35][14] = { height: 0, biome: 'water', collision: false };
  tiles[35][15] = { height: 0, biome: 'water', collision: false };

  // Rock decorations
  tiles[31][7]  = { height: 2, biome: 'dark_grass', collision: true, data: { deco: 'rock' } };
  tiles[35][17] = { height: 2, biome: 'dark_grass', collision: true, data: { deco: 'rock' } };

  // Torch markers
  tiles[29][6]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[29][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom edge — exit_forest
  tiles[37][11] = { height: 1, biome: 'dirt', collision: false, interact: 'exit_forest' };
  tiles[37][12] = { height: 1, biome: 'dirt', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Bog Entry to Poison Marsh (cols 17-23, rows 31-33)
  // =======================================================================
  carveRoom(17, 31, 23, 33, 'dirt', 1);
  tiles[31][16] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Poison Marsh (cols 23-35, rows 28-35)
  // =======================================================================
  carveRoom(23, 28, 35, 35);

  for (let r = 28; r <= 35; r++) {
    for (let c = 23; c <= 35; c++) {
      if (hash(r, c, 9) < 20) {
        tiles[r][c] = { height: 1, biome: 'dirt', collision: false };
      }
    }
  }

  // Large water hazard in center
  for (let r = 30; r <= 33; r++) {
    for (let c = 27; c <= 31; c++) {
      if (hash(r, c, 44) < 60) {
        tiles[r][c] = { height: 0, biome: 'water', collision: false };
      }
    }
  }

  // Chest in Poison Marsh
  tiles[31][25] = {
    height: 1, biome: 'dark_grass', collision: true,
    interact: 'chest', data: { id: 'swamp_chest1' },
  };

  // Torches
  tiles[27][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Bog Entry to Witch's Hollow (cols 10-14, rows 26-30)
  // =======================================================================
  carveRoom(10, 26, 14, 29, 'dirt', 1);
  tiles[26][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Witch's Hollow (cols 5-19, rows 18-25)
  // =======================================================================
  carveRoom(5, 18, 19, 25);

  for (let r = 18; r <= 25; r++) {
    for (let c = 5; c <= 19; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'dirt', collision: false };
      }
    }
  }

  // Cauldron area — water tiles in center
  tiles[21][11] = { height: 0, biome: 'water', collision: false };
  tiles[21][12] = { height: 0, biome: 'water', collision: false };
  tiles[22][11] = { height: 0, biome: 'water', collision: false };
  tiles[22][12] = { height: 0, biome: 'water', collision: false };

  // Skull decorations (witch's trophies)
  tiles[18][6]  = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[18][18] = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[25][6]  = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[25][18] = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };

  // Pillars
  tiles[19][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[19][17] = { height: 4, biome: 'stone', collision: true };
  tiles[24][7]  = { height: 4, biome: 'stone', collision: true };
  tiles[24][17] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[17][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[17][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest in Witch's Hollow
  tiles[20][15] = {
    height: 1, biome: 'dark_grass', collision: true,
    interact: 'chest', data: { id: 'swamp_chest2' },
  };

  // =======================================================================
  // Corridor 3 — Poison Marsh to Fungal Cavern (cols 27-31, rows 23-28)
  // =======================================================================
  carveRoom(27, 23, 31, 27, 'dirt', 1);
  tiles[23][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][32] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Fungal Cavern (cols 23-35, rows 13-22)
  // =======================================================================
  carveRoom(23, 13, 35, 22);

  for (let r = 13; r <= 22; r++) {
    for (let c = 23; c <= 35; c++) {
      if (hash(r, c, 21) < 25) {
        tiles[r][c] = { height: 1, biome: 'dirt', collision: false };
      }
    }
  }

  // Mushroom-like rock decorations
  tiles[15][25] = { height: 2, biome: 'dark_grass', collision: true, data: { deco: 'rock' } };
  tiles[15][33] = { height: 2, biome: 'dark_grass', collision: true, data: { deco: 'rock' } };
  tiles[20][25] = { height: 2, biome: 'dark_grass', collision: true, data: { deco: 'rock' } };
  tiles[20][33] = { height: 2, biome: 'dark_grass', collision: true, data: { deco: 'rock' } };

  // Chest in Fungal Cavern
  tiles[17][29] = {
    height: 1, biome: 'dark_grass', collision: true,
    interact: 'chest', data: { id: 'swamp_chest3' },
  };

  // Torches
  tiles[12][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 4 — Witch's Hollow to Boss Room (cols 10-14, rows 12-18)
  // =======================================================================
  carveRoom(10, 12, 14, 17, 'dirt', 1);
  tiles[12][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Boss Room: Swamp Hag (cols 5-19, rows 2-11) — checkerboard
  // =======================================================================
  for (let r = 2; r <= 11; r++) {
    for (let c = 5; c <= 19; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'dark_grass' : 'dirt', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 1; r <= 12; r++) {
    for (let c = 4; c <= 20; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 2 && r <= 11 && c >= 5 && c <= 19) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'dark_grass') {
        tiles[r][c] = { height: 3, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[2][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[2][19]  = { height: 5, biome: 'stone', collision: true };
  tiles[11][5]  = { height: 5, biome: 'stone', collision: true };
  tiles[11][19] = { height: 5, biome: 'stone', collision: true };

  // Skull ring
  tiles[2][7]   = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[2][17]  = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[11][7]  = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[11][17] = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[4][5]   = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[9][5]   = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[4][19]  = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };
  tiles[9][19]  = { height: 1, biome: 'dark_grass', collision: false, data: { deco: 'skull' } };

  // Water hazards in boss room
  tiles[5][9]   = { height: 0, biome: 'water', collision: false };
  tiles[5][10]  = { height: 0, biome: 'water', collision: false };
  tiles[8][14]  = { height: 0, biome: 'water', collision: false };
  tiles[8][15]  = { height: 0, biome: 'water', collision: false };

  // Torch ring
  tiles[1][6]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][12]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][18]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (12, 6)
  tiles[6][12] = {
    height: 1, biome: 'dark_grass', collision: true,
    interact: 'boss', data: { id: 'swamp_hag', name: 'Swamp Hag' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoSwampScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: SwampMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Swamp');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Swamp';

    trackZoneVisit('Swamp');

    this.initZone(buildSwampTiles(), 11, 35);

    // Boss indicator (if not yet defeated)
    if (!state.flags.has('swamp_boss_defeated')) {
      this.createBossIndicator();
    }

    // Chest indicators
    if (!state.flags.has('swamp_chest1')) {
      this.createChestIndicator(25, 31);
    }
    if (!state.flags.has('swamp_chest2')) {
      this.createChestIndicator(15, 20);
    }
    if (!state.flags.has('swamp_chest3')) {
      this.createChestIndicator(29, 17);
    }

    // Spawn swamp monsters
    this.monsterSprites = [];
    for (const m of SWAMP_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Haunted Swamp');
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
  private spawnDungeonMonsterAt(m: SwampMonster): void {
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
      fontSize: '7px', fontFamily: 'monospace', color: '#ccffcc',
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: SwampMonster; alive: boolean }): void {
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
      returnScene: 'Swamp',
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
    const dialogue = BOSS_DIALOGUES['swamp_hag'];
    if (state.flags.has('swamp_boss_defeated')) {
      this.showDialog('Swamp Hag', ['The swamp grows still... the hag is no more.'], 12, 6);
      return;
    }

    this.showDialog('Swamp Hag', dialogue.preBattle, 12, 6);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Swamp',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('swamp_boss_defeated');
        state.addKill('swamp_hag');

        // Lore tracking
        state.flags.add('lore_swamp_hag');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['swamp_hag'];
        this.showDialog('Swamp Hag', [dialogue.deathLine], 12, 6);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Swamp Hag', dialogue.loreReveal);
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
      state.gold += 40;
      this.showDialog('Mossy Chest', ['Found: 2x Health Potion, 40 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Mossy Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x556b2f;
    const pos = toScreen(12, 6, 1);
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

    const label = this.add.text(0, -28, 'Swamp Hag', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#88cc44', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv15 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#aadd66', stroke: '#000000', strokeThickness: 2,
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
