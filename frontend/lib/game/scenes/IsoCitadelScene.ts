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
  type: 'storm_titan',
  name: 'Storm Titan',
  level: 20,
  hp: 500,
  maxHp: 500,
  atk: 32,
  def: 16,
};

// ---------------------------------------------------------------------------
// Citadel monster definitions
// ---------------------------------------------------------------------------
interface CitadelMonster {
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

const CITADEL_MONSTERS: CitadelMonster[] = [
  // Room 1 — Grand Entry (wind spirits Lv12, cloud wisps Lv12)
  { tx: 12, ty: 35, type: 'wind_spirit',  name: 'Wind Spirit',       level: 12, color: 0xaaddee, hp: 95,  atk: 18, def: 7 },
  { tx: 18, ty: 37, type: 'wind_spirit',  name: 'Wind Spirit',       level: 12, color: 0xaaddee, hp: 95,  atk: 18, def: 7 },
  { tx: 15, ty: 36, type: 'cloud_wisp',   name: 'Cloud Wisp',        level: 12, color: 0xccddff, hp: 80,  atk: 19, def: 5 },

  // Room 2 — Wind Corridor (wind spirits Lv13, storm hawks Lv14)
  { tx: 28, ty: 33, type: 'wind_spirit',  name: 'Gale Spirit',       level: 13, color: 0x88ccdd, hp: 105, atk: 20, def: 8 },
  { tx: 33, ty: 35, type: 'storm_hawk',   name: 'Storm Hawk',        level: 14, color: 0x6699bb, hp: 120, atk: 22, def: 8 },
  { tx: 30, ty: 34, type: 'storm_hawk',   name: 'Storm Hawk',        level: 14, color: 0x6699bb, hp: 120, atk: 22, def: 8 },
  { tx: 35, ty: 33, type: 'cloud_wisp',   name: 'Cloud Wisp',        level: 13, color: 0xccddff, hp: 90,  atk: 20, def: 6 },

  // Room 3 — Storm Hall (lightning elementals Lv15, sky sentinels Lv16)
  { tx: 12, ty: 22, type: 'lightning_elemental', name: 'Lightning Elemental', level: 15, color: 0xffdd44, hp: 135, atk: 25, def: 8 },
  { tx: 18, ty: 24, type: 'lightning_elemental', name: 'Lightning Elemental', level: 15, color: 0xffdd44, hp: 135, atk: 25, def: 8 },
  { tx: 15, ty: 23, type: 'sky_sentinel', name: 'Sky Sentinel',      level: 16, color: 0x5588cc, hp: 155, atk: 24, def: 12 },

  // Room 4 — Lightning Spire (lightning elementals Lv17, sky sentinels Lv17)
  { tx: 28, ty: 18, type: 'lightning_elemental', name: 'Arc Elemental', level: 17, color: 0xffcc33, hp: 160, atk: 27, def: 9 },
  { tx: 34, ty: 20, type: 'sky_sentinel', name: 'Thunder Sentinel',  level: 17, color: 0x4477bb, hp: 175, atk: 26, def: 13 },
  { tx: 31, ty: 19, type: 'sky_sentinel', name: 'Thunder Sentinel',  level: 17, color: 0x4477bb, hp: 175, atk: 26, def: 13 },

  // Room 5 — Cloud Gardens (cloud wisps Lv18, storm hawks Lv18)
  { tx: 12, ty: 10, type: 'cloud_wisp',   name: 'Storm Wisp',        level: 18, color: 0xbbccee, hp: 150, atk: 26, def: 8 },
  { tx: 18, ty: 12, type: 'cloud_wisp',   name: 'Storm Wisp',        level: 18, color: 0xbbccee, hp: 150, atk: 26, def: 8 },
  { tx: 15, ty: 11, type: 'storm_hawk',   name: 'Tempest Hawk',      level: 18, color: 0x5588aa, hp: 170, atk: 28, def: 10 },

  // Corridor monsters
  { tx: 22, ty: 30, type: 'cloud_wisp',   name: 'Drifting Wisp',     level: 13, color: 0xddeeff, hp: 90,  atk: 19, def: 5 },
  { tx: 22, ty: 16, type: 'wind_spirit',  name: 'Howling Spirit',    level: 16, color: 0x99bbcc, hp: 130, atk: 23, def: 8 },
  { tx: 15, ty: 7,  type: 'lightning_elemental', name: 'Spark Elemental', level: 18, color: 0xeecc22, hp: 155, atk: 27, def: 9 },
];

// ---------------------------------------------------------------------------
// Map builder — 40 cols x 40 rows
// ---------------------------------------------------------------------------
function buildCitadelTiles(): ZoneTile[][] {
  const SIZE = 40;

  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Fill with stone walls (sky citadel uses lighter stone) ---
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
  // Room 1 — Grand Entry (cols 8-21, rows 33-38)
  // =======================================================================
  carveRoom(8, 33, 21, 38);

  // Floor: stone with ice highlights (sky blue patches)
  for (let r = 33; r <= 38; r++) {
    for (let c = 8; c <= 21; c++) {
      if (hash(r, c, 13) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice', collision: false };
      }
    }
  }

  // Pillars
  tiles[34][10] = { height: 4, biome: 'stone', collision: true };
  tiles[34][19] = { height: 4, biome: 'stone', collision: true };
  tiles[37][10] = { height: 4, biome: 'stone', collision: true };
  tiles[37][19] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[32][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[32][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[32][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[35][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[35][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom edge
  tiles[39][14] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[39][15] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // =======================================================================
  // Corridor 1 — Grand Entry to Wind Corridor (cols 20-25, rows 33-35)
  // =======================================================================
  carveRoom(20, 33, 25, 35, 'stone', 1);
  tiles[33][19] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[33][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 2 — Wind Corridor (cols 25-38, rows 31-37)
  // =======================================================================
  carveRoom(25, 31, 38, 37);

  for (let r = 31; r <= 37; r++) {
    for (let c = 25; c <= 38; c++) {
      if (hash(r, c, 9) < 18) {
        tiles[r][c] = { height: 1, biome: 'ice', collision: false };
      }
    }
  }

  // Ice crystal decorations
  tiles[32][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[32][37] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[36][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[36][37] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };

  // Chest
  tiles[34][31] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'citadel_chest1' },
  };

  // Torches
  tiles[30][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[30][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 2 — Grand Entry to Storm Hall (cols 12-16, rows 28-33)
  // =======================================================================
  carveRoom(12, 28, 16, 32, 'stone', 1);
  tiles[28][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 3 — Storm Hall (cols 6-21, rows 20-27)
  // =======================================================================
  carveRoom(6, 20, 21, 27);

  for (let r = 20; r <= 27; r++) {
    for (let c = 6; c <= 21; c++) {
      if (hash(r, c, 17) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice', collision: false };
      }
    }
  }

  // Lightning pattern — water tiles in center (electric pools)
  tiles[23][12] = { height: 0, biome: 'water', collision: false };
  tiles[23][13] = { height: 0, biome: 'water', collision: false };
  tiles[23][14] = { height: 0, biome: 'water', collision: false };
  tiles[24][13] = { height: 0, biome: 'water', collision: false };

  // Pillars
  tiles[21][8]  = { height: 4, biome: 'stone', collision: true };
  tiles[21][19] = { height: 4, biome: 'stone', collision: true };
  tiles[26][8]  = { height: 4, biome: 'stone', collision: true };
  tiles[26][19] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[19][6]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[19][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[22][17] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'citadel_chest2' },
  };

  // =======================================================================
  // Corridor 3 — Wind Corridor to Lightning Spire (cols 30-34, rows 26-31)
  // =======================================================================
  carveRoom(30, 26, 34, 30, 'stone', 1);
  tiles[26][29] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][35] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 4 — Lightning Spire (cols 25-38, rows 16-25)
  // =======================================================================
  carveRoom(25, 16, 38, 25);

  for (let r = 16; r <= 25; r++) {
    for (let c = 25; c <= 38; c++) {
      if (hash(r, c, 21) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice', collision: false };
      }
    }
  }

  // Pillars
  tiles[18][28] = { height: 4, biome: 'stone', collision: true };
  tiles[18][35] = { height: 4, biome: 'stone', collision: true };
  tiles[23][28] = { height: 4, biome: 'stone', collision: true };
  tiles[23][35] = { height: 4, biome: 'stone', collision: true };

  // Ice crystal decorations
  tiles[17][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[17][37] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[24][26] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[24][37] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };

  // Torches
  tiles[15][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][38] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Chest
  tiles[20][31] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'chest', data: { id: 'citadel_chest3' },
  };

  // =======================================================================
  // Corridor 4 — Storm Hall to Cloud Gardens (cols 12-16, rows 15-20)
  // =======================================================================
  carveRoom(12, 15, 16, 19, 'stone', 1);
  tiles[15][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 5 — Cloud Gardens (cols 6-21, rows 8-14)
  // =======================================================================
  carveRoom(6, 8, 21, 14);

  for (let r = 8; r <= 14; r++) {
    for (let c = 6; c <= 21; c++) {
      if (hash(r, c, 31) < 25) {
        tiles[r][c] = { height: 1, biome: 'ice', collision: false };
      }
    }
  }

  // Garden water features
  tiles[10][12] = { height: 0, biome: 'water', collision: false };
  tiles[10][13] = { height: 0, biome: 'water', collision: false };
  tiles[11][12] = { height: 0, biome: 'water', collision: false };
  tiles[11][13] = { height: 0, biome: 'water', collision: false };

  // Ice crystal decorations
  tiles[9][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[9][19]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[13][8]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };
  tiles[13][19] = { height: 1, biome: 'stone', collision: false, data: { deco: 'ice_crystal' } };

  // Pillars
  tiles[9][8]   = { height: 4, biome: 'stone', collision: true };
  tiles[9][19]  = { height: 4, biome: 'stone', collision: true };
  tiles[13][8]  = { height: 4, biome: 'stone', collision: true };
  tiles[13][19] = { height: 4, biome: 'stone', collision: true };

  // Torches
  tiles[7][6]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][13]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][21]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Corridor 5 — Cloud Gardens to Boss Room (cols 12-16, rows 4-8)
  // =======================================================================
  carveRoom(12, 4, 16, 7, 'stone', 1);
  tiles[4][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // =======================================================================
  // Room 6 — Boss Room: Storm Titan (cols 6-21, rows 1-4) — checkerboard
  // =======================================================================
  for (let r = 1; r <= 4; r++) {
    for (let c = 6; c <= 21; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'ice', collision: false };
    }
  }
  for (let r2 = 0; r2 <= 5; r2++) {
    for (let c2 = 5; c2 <= 22; c2++) {
      if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
      if (r2 >= 1 && r2 <= 4 && c2 >= 6 && c2 <= 21) continue;
      if (tiles[r2][c2].collision && tiles[r2][c2].biome === 'stone_dark') {
        tiles[r2][c2] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[1][6]   = { height: 5, biome: 'stone', collision: true };
  tiles[1][21]  = { height: 5, biome: 'stone', collision: true };
  tiles[4][6]   = { height: 5, biome: 'stone', collision: true };
  tiles[4][21]  = { height: 5, biome: 'stone', collision: true };

  // Skull ring
  tiles[1][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[1][19]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][8]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][19]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][6]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][6]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][21]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][21]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torch ring
  tiles[0][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][13]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][20]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][5]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][5]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][22]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (13, 2)
  tiles[2][13] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'storm_titan', name: 'Storm Titan' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoCitadelScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: CitadelMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Citadel');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Citadel';

    trackZoneVisit('Citadel');

    this.initZone(buildCitadelTiles(), 14, 37);

    if (!state.flags.has('citadel_boss_defeated')) {
      this.createBossIndicator();
    }

    if (!state.flags.has('citadel_chest1')) {
      this.createChestIndicator(31, 34);
    }
    if (!state.flags.has('citadel_chest2')) {
      this.createChestIndicator(17, 22);
    }
    if (!state.flags.has('citadel_chest3')) {
      this.createChestIndicator(31, 20);
    }

    this.monsterSprites = [];
    for (const m of CITADEL_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Sky Citadel');
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
  private spawnDungeonMonsterAt(m: CitadelMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: CitadelMonster; alive: boolean }): void {
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
      returnScene: 'Citadel',
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
    const dialogue = BOSS_DIALOGUES['storm_titan'];
    if (state.flags.has('citadel_boss_defeated')) {
      this.showDialog('Storm Titan', ['The storms have subsided... the skies are clear.'], 13, 2);
      return;
    }

    this.showDialog('Storm Titan', dialogue.preBattle, 13, 2);

    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Citadel',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('citadel_boss_defeated');
        state.addKill('storm_titan');

        // Lore tracking
        state.flags.add('lore_storm_titan');

        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['storm_titan'];
        this.showDialog('Storm Titan', [dialogue.deathLine], 13, 2);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Storm Titan', dialogue.loreReveal);
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
      state.gold += 60;
      this.showDialog('Ornate Chest', ['Found: 3x Health Potion, 60 Gold!'], tx, ty);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Ornate Chest', ['Already opened.'], tx, ty);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0x4488cc;
    const pos = toScreen(13, 2, 1);
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

    const label = this.add.text(0, -28, 'Storm Titan', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#66aaff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    const lvl = this.add.text(0, 4, 'Lv20 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#88ccff', stroke: '#000000', strokeThickness: 2,
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
