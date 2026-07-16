import * as Phaser from 'phaser';
import { IsoBaseScene } from '../iso/IsoBaseScene';
import { ZoneTile, toScreen } from '../iso/core';
import { PlayerState } from '../PlayerState';
import { updateDailyProgress, trackZoneVisit } from '../dailyQuests';

// ---------------------------------------------------------------------------
// Boss data
// ---------------------------------------------------------------------------
const BOSS_DATA = {
  type: 'crystal_wyrm',
  name: 'Crystal Wyrm',
  level: 30,
  hp: 500,
  maxHp: 500,
  atk: 40,
  def: 22,
};

// ---------------------------------------------------------------------------
// Ice cave monster definitions
// ---------------------------------------------------------------------------
interface IceCaveMonster {
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

const ICE_MONSTERS: IceCaveMonster[] = [
  // Room 1
  { tx: 12, ty: 25, type: 'ice_golem', name: 'Ice Golem', level: 15, color: 0x88ccee, hp: 180, atk: 25, def: 18 },
  { tx: 18, ty: 24, type: 'frost_sprite', name: 'Frost Sprite', level: 12, color: 0xaaeeff, hp: 90, atk: 18, def: 8 },
  // (18,26): diagonal adjacency to the (14,28) spawn also triggers battle on entry
  { tx: 18, ty: 26, type: 'frost_sprite', name: 'Frost Sprite', level: 13, color: 0xaaeeff, hp: 95, atk: 19, def: 9 },
  // Room 2
  { tx: 8, ty: 13, type: 'ice_golem', name: 'Ice Golem', level: 17, color: 0x88ccee, hp: 210, atk: 28, def: 20 },
  { tx: 20, ty: 14, type: 'yeti', name: 'Yeti', level: 18, color: 0xddddff, hp: 260, atk: 32, def: 15 },
  { tx: 14, ty: 11, type: 'frost_sprite', name: 'Ice Wraith', level: 14, color: 0x99ddff, hp: 110, atk: 22, def: 10 },
  { tx: 10, ty: 15, type: 'yeti', name: 'Snow Yeti', level: 20, color: 0xccccff, hp: 300, atk: 35, def: 18 },
  // Corridor
  { tx: 14, ty: 19, type: 'frost_sprite', name: 'Frost Sprite', level: 14, color: 0xaaeeff, hp: 105, atk: 20, def: 9 },
  // Special monsters
  { tx: 12, ty: 12, type: 'crystal_golem',  name: 'Crystal Golem', level: 20, color: 0x99ddee, hp: 350, atk: 30, def: 28 },
  { tx: 18, ty: 16, type: 'venomous_hydra', name: 'Ice Hydra',     level: 16, color: 0x33aa88, hp: 200, atk: 24, def: 12 },
];

// ---------------------------------------------------------------------------
// Map builder — 30 cols x 30 rows
// ---------------------------------------------------------------------------
function buildIceCaveTiles(): ZoneTile[][] {
  const SIZE = 30;

  // Seeded hash for variety
  const hash = (r: number, c: number, salt = 0): number => {
    return (((r * 31 + c * 17 + salt * 53) * 2654435761) >>> 0) % 100;
  };

  // --- Step 1: Fill everything with ice_wall walls (height 5) ---
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < SIZE; c++) {
      const h = hash(r, c) < 25 ? 5 : 4;
      row.push({ height: h, biome: 'ice_wall', collision: true });
    }
    tiles.push(row);
  }

  // Helper to carve a room with wall borders
  const carveRoom = (c1: number, r1: number, c2: number, r2: number, biome = 'ice', h = 1) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        tiles[r][c] = { height: h, biome, collision: false };
      }
    }
    // Wall border tiles adjacent to rooms
    for (let r = r1 - 1; r <= r2 + 1; r++) {
      for (let c = c1 - 1; c <= c2 + 1; c++) {
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) continue;
        if (tiles[r][c].collision && tiles[r][c].biome === 'ice_wall') {
          tiles[r][c] = { height: 4, biome: 'wall', collision: true };
        }
      }
    }
  };

  // --- Step 2: Room 1 — Entry Hall (cols 8-22, rows 22-28) ---
  carveRoom(8, 22, 22, 28);

  // Room 1 floor detail: ice with ~20% ice_crystal patches
  for (let r = 22; r <= 28; r++) {
    for (let c = 8; c <= 22; c++) {
      if (hash(r, c, 13) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_crystal', collision: false };
      }
    }
  }

  // Frozen water patches in Room 1
  tiles[25][10] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[25][11] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[26][10] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[24][20] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[24][21] = { height: 0, biome: 'frozen_water', collision: false };

  // Torch markers on walls (Room 1)
  tiles[21][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][15] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[21][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[23][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[26][23] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom — tiles[29][14] and tiles[29][15] → interact: 'exit_dungeon'
  tiles[29][14] = { height: 1, biome: 'ice', collision: false, interact: 'exit_dungeon' };
  tiles[29][15] = { height: 1, biome: 'ice', collision: false, interact: 'exit_dungeon' };

  // --- Step 3: Corridor 1 (cols 12-16, rows 18-22) — narrow passage ---
  carveRoom(12, 18, 16, 21, 'ice', 1);
  // Torch at each end
  tiles[18][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 4: Room 2 — Crystal Hall (cols 5-25, rows 10-17) ---
  carveRoom(5, 10, 25, 17);

  // Room 2 floor detail: ~20% ice_crystal decoration
  for (let r = 10; r <= 17; r++) {
    for (let c = 5; c <= 25; c++) {
      if (hash(r, c, 7) < 20) {
        tiles[r][c] = { height: 1, biome: 'ice_crystal', collision: false };
      }
    }
  }

  // Ice pillars in Room 2 (collision, height 4)
  tiles[11][8]  = { height: 4, biome: 'ice', collision: true };
  tiles[11][14] = { height: 4, biome: 'ice', collision: true };
  tiles[11][20] = { height: 4, biome: 'ice', collision: true };
  tiles[15][8]  = { height: 4, biome: 'ice', collision: true };
  tiles[15][14] = { height: 4, biome: 'ice', collision: true };
  tiles[15][20] = { height: 4, biome: 'ice', collision: true };

  // Frozen water patches in Room 2
  tiles[13][7]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[13][8]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[14][7]  = { height: 0, biome: 'frozen_water', collision: false };
  tiles[12][22] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[12][23] = { height: 0, biome: 'frozen_water', collision: false };
  tiles[13][23] = { height: 0, biome: 'frozen_water', collision: false };

  // Chest in Room 2
  tiles[13][15] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'chest', data: { id: 'ice_cave_chest1' },
  };

  // Torch markers in Room 2 (8 spots)
  tiles[9][5]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][12]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][18]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[9][25]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[11][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 5: Corridor 2 (cols 12-16, rows 8-10) — connects Room 2 to Boss Room ---
  carveRoom(12, 8, 16, 9, 'ice', 1);
  // Torch at each end
  tiles[8][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 6: Boss Room (cols 8-22, rows 2-8) — checkerboard ---
  for (let r = 2; r <= 7; r++) {
    for (let c = 8; c <= 22; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'ice' : 'ice_dark', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 1; r <= 8; r++) {
    for (let c = 7; c <= 23; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 2 && r <= 7 && c >= 8 && c <= 22) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'ice_wall') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (ice height 5)
  tiles[2][8]   = { height: 5, biome: 'ice', collision: true };
  tiles[2][22]  = { height: 5, biome: 'ice', collision: true };
  tiles[7][8]   = { height: 5, biome: 'ice', collision: true };
  tiles[7][22]  = { height: 5, biome: 'ice', collision: true };

  // Ice crystal decorations along boss room perimeter
  tiles[2][10]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[2][20]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[7][10]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[7][20]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[3][8]   = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[6][8]   = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[3][22]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[6][22]  = { height: 1, biome: 'ice_crystal', collision: false };

  // Torch ring (6 torches)
  tiles[1][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][21]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[5][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[2][23]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (15, 4)
  tiles[4][15] = {
    height: 1, biome: 'ice', collision: true,
    interact: 'boss', data: { id: 'crystal_wyrm', name: 'Crystal Wyrm' },
  };

  // Ice patches near boss
  tiles[3][13]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[5][16]  = { height: 1, biome: 'ice_crystal', collision: false };
  tiles[3][17]  = { height: 1, biome: 'ice_crystal', collision: false };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoIceCaveScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: IceCaveMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('IceCave');
  }

  init(data?: { from?: string }): void {
    // Accept spawn data for entry position
    (this as any)._initData = data;
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'IceCave';

    // Track zone visit for daily explorer quest
    trackZoneVisit('IceCave');

    const initData = (this as any)._initData as { from?: string } | undefined;

    let spawnX = 14;
    let spawnY = 28;

    if (initData?.from === 'boss_room') {
      spawnX = 14;
      spawnY = 8;
    }

    this.initZone(buildIceCaveTiles(), spawnX, spawnY);

    // Boss indicator (if not yet defeated)
    if (!state.flags.has('crystal_wyrm_defeated')) {
      this.createBossIndicator();
    }

    // Chest indicator (if not yet opened)
    if (!state.flags.has('ice_cave_chest1')) {
      this.createChestIndicator(15, 13);
    }

    // Spawn ice cave monsters
    this.monsterSprites = [];
    for (const m of ICE_MONSTERS) {
      this.spawnIceCaveMonsterAt(m);
    }

    this.events.emit('zone-change', 'Ice Cavern');
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
        this.handleChest(state, tile);
        break;

      case 'exit_dungeon':
        this.exitToScene('Dungeon', { from: 'ice_cave' });
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Ice cave monster spawning
  // -----------------------------------------------------------------------
  private spawnIceCaveMonsterAt(m: IceCaveMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: IceCaveMonster; alive: boolean }): void {
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
      returnScene: 'IceCave',
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
          this.spawnIceCaveMonsterAt(m);
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
    if (state.flags.has('crystal_wyrm_defeated')) {
      this.showDialog('Crystal Wyrm', ['The wyrm lies shattered on the frozen ground...'], 15, 4);
      return;
    }

    this.showDialog('Crystal Wyrm', [
      'FOOLISH MORTAL... YOU TRESPASS IN MY DOMAIN!',
      'The ice itself bends to my will.',
      'You will become another frozen statue!',
    ], 15, 4);

    // Wait for dialog to close, then start fight
    const checkDialog = () => {
      if (!this.frozen) {
        this.startBossFight(state);
      } else {
        this.time.delayedCall(100, checkDialog);
      }
    };
    this.time.delayedCall(1000, checkDialog);
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'IceCave',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('crystal_wyrm_defeated');

        // Daily quest tracking
        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        state.addKill('crystal_wyrm');
        this.showDialog('Victory!', [
          'The Crystal Wyrm has been vanquished!',
          'The ice cavern trembles as the beast falls.',
          'A strange warmth fills the frozen air...',
        ], 15, 4);

        // Remove boss sprite
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
  // Chest
  // -----------------------------------------------------------------------
  private handleChest(state: PlayerState, tile: ZoneTile): void {
    const chestId = tile.data?.id;
    if (!chestId) return;

    if (!state.flags.has(chestId)) {
      state.flags.add(chestId);
      state.addItem({
        id: 'potion_hp', name: 'Health Potion', sprite: 'potion',
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 3,
      });
      state.gold += 50;
      this.showDialog('Frozen Chest', ['Found: 3x Health Potion, 50 Gold!'], 15, 13);
      this.events.emit('hp-change');
    } else {
      this.showDialog('Frozen Chest', ['Already opened.'], 15, 13);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const pos = toScreen(15, 4, 1);
    const container = this.add.container(pos.x, pos.y);

    // Large cyan circle for ice boss
    const body = this.add.circle(0, -10, 10, 0x55ccff, 1);
    container.add(body);

    // Cyan glow
    const glow = this.add.circle(0, -10, 16, 0x55ccff, 0.2);
    container.add(glow);
    this.tweens.add({
      targets: glow, alpha: { from: 0.1, to: 0.35 },
      scaleX: { from: 1, to: 1.3 }, scaleY: { from: 1, to: 1.3 },
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Name
    const label = this.add.text(0, -28, 'Crystal Wyrm', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#55ccff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    // Level
    const lvl = this.add.text(0, 4, 'Lv30 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#88ddff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(lvl);

    container.setDepth(100);

    // Floating
    this.tweens.add({
      targets: container, y: pos.y - 4,
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.bossSprite = container;
  }

  private createChestIndicator(tx: number, ty: number): void {
    const pos = toScreen(tx, ty, 1);
    const container = this.add.container(pos.x, pos.y);

    // Chest box
    const box = this.add.rectangle(0, -6, 12, 8, 0xddaa44, 1);
    container.add(box);
    const lid = this.add.rectangle(0, -12, 14, 4, 0xbb8833, 1);
    container.add(lid);

    // Label
    const label = this.add.text(0, 4, 'Chest', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#ffdd88', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(label);

    container.setDepth((tx + ty) * 10 + ty + 5);

    // Glow pulse
    this.tweens.add({
      targets: box, alpha: { from: 0.8, to: 1 },
      duration: 800, yoyo: true, repeat: -1,
    });
  }
}
