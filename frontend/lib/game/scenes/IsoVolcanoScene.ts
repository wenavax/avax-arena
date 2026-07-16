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
  type: 'infernal_dragon',
  name: 'Infernal Dragon',
  level: 40,
  hp: 800,
  maxHp: 800,
  atk: 55,
  def: 30,
};

// ---------------------------------------------------------------------------
// Volcano monster definitions
// ---------------------------------------------------------------------------
interface VolcanoMonster {
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

const VOLCANO_MONSTERS: VolcanoMonster[] = [
  // Room 1 — Entry
  { tx: 14, ty: 30, type: 'fire_elemental', name: 'Fire Elemental', level: 20, color: 0xff6622, hp: 220, atk: 30, def: 12 },
  { tx: 22, ty: 31, type: 'lava_slime', name: 'Lava Slime', level: 18, color: 0xff4400, hp: 160, atk: 25, def: 10 },
  { tx: 18, ty: 29, type: 'fire_elemental', name: 'Fire Elemental', level: 21, color: 0xff6622, hp: 230, atk: 32, def: 13 },
  // Room 2 — Lava Halls
  { tx: 8, ty: 20, type: 'magma_golem', name: 'Magma Golem', level: 22, color: 0xcc4400, hp: 320, atk: 38, def: 22 },
  { tx: 20, ty: 18, type: 'lava_slime', name: 'Magma Slime', level: 20, color: 0xff5500, hp: 180, atk: 28, def: 12 },
  { tx: 26, ty: 22, type: 'fire_elemental', name: 'Blaze Spirit', level: 23, color: 0xff8844, hp: 250, atk: 35, def: 14 },
  { tx: 12, ty: 24, type: 'magma_golem', name: 'Magma Golem', level: 25, color: 0xcc4400, hp: 350, atk: 40, def: 24 },
  // Room 3 — Magma Pit
  { tx: 14, ty: 8, type: 'fire_elemental', name: 'Inferno', level: 25, color: 0xff4422, hp: 280, atk: 38, def: 16 },
  { tx: 22, ty: 7, type: 'magma_golem', name: 'Obsidian Golem', level: 28, color: 0x884422, hp: 400, atk: 45, def: 28 },
  // Special monsters
  { tx: 16, ty: 20, type: 'phoenix',   name: 'Phoenix',   level: 24, color: 0xff8800, hp: 280, atk: 36, def: 14 },
  { tx: 24, ty: 24, type: 'lava_worm', name: 'Lava Worm', level: 22, color: 0xdd5500, hp: 240, atk: 30, def: 10 },
];

// ---------------------------------------------------------------------------
// Map builder — 35 cols x 35 rows
// ---------------------------------------------------------------------------
function buildVolcanoTiles(): ZoneTile[][] {
  const SIZE = 35;

  // Seeded hash for variety
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
    // Wall border tiles adjacent to rooms
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

  // --- Step 2: Room 1 — Entry (cols 10-25, rows 28-33) ---
  carveRoom(10, 28, 25, 33, 'volcanic');

  // Room 1 floor detail: volcanic with ~25% ash patches
  for (let r = 28; r <= 33; r++) {
    for (let c = 10; c <= 25; c++) {
      if (hash(r, c, 13) < 25) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Rock formations in Room 1
  tiles[29][11] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[31][24] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[33][15] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };

  // Torch markers on walls (Room 1)
  tiles[27][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[27][25] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][9]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[28][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[31][26] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at bottom — tiles[34][17] and tiles[34][18] → exit_forest
  tiles[34][17] = { height: 1, biome: 'volcanic', collision: false, interact: 'exit_forest' };
  tiles[34][18] = { height: 1, biome: 'volcanic', collision: false, interact: 'exit_forest' };

  // --- Step 3: Room 2 — Lava Halls (cols 5-30, rows 16-26) ---
  carveRoom(5, 16, 30, 26, 'volcanic');

  // Room 2 floor detail
  for (let r = 16; r <= 26; r++) {
    for (let c = 5; c <= 30; c++) {
      if (hash(r, c, 7) < 20) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Lava pool tiles (~15 scattered in Room 2)
  const lavaTiles: [number, number][] = [
    [18, 8], [18, 9], [19, 8],
    [20, 14], [20, 15], [21, 14],
    [22, 25], [22, 26], [23, 26],
    [17, 20], [17, 21],
    [24, 10], [24, 11],
    [19, 28], [20, 28],
  ];
  for (const [r, c] of lavaTiles) {
    tiles[r][c] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 5 } };
  }

  // Rock formations in Room 2
  tiles[17][7]  = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[23][12] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[19][22] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[25][28] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };
  tiles[16][16] = { height: 3, biome: 'volcanic', collision: true, data: { deco: 'rock' } };

  // Torch markers in Room 2
  tiles[15][5]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][12] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][20] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[16][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[22][31] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 4: Corridor (cols 14-20, rows 12-16) ---
  carveRoom(14, 12, 20, 15, 'volcanic', 1);
  // Torch at each end
  tiles[12][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 5: Room 3 — Magma Pit (cols 8-27, rows 5-11) ---
  carveRoom(8, 5, 27, 11, 'magma');

  // Room 3 floor detail
  for (let r = 5; r <= 11; r++) {
    for (let c = 8; c <= 27; c++) {
      if (hash(r, c, 21) < 20) {
        tiles[r][c] = { height: 1, biome: 'volcanic', collision: false };
      }
    }
  }

  // Rock formations in Room 3
  tiles[6][10]  = { height: 3, biome: 'magma', collision: true, data: { deco: 'rock' } };
  tiles[9][25]  = { height: 3, biome: 'magma', collision: true, data: { deco: 'rock' } };
  tiles[10][14] = { height: 3, biome: 'magma', collision: true, data: { deco: 'rock' } };
  tiles[7][20]  = { height: 3, biome: 'magma', collision: true, data: { deco: 'rock' } };

  // Torch markers in Room 3
  tiles[4][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][14] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][21] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][27] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[5][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][7]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[5][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[8][28] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 6: Boss Room (cols 12-23, rows 1-4) — obsidian checkerboard ---
  for (let r = 1; r <= 4; r++) {
    for (let c = 12; c <= 23; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'obsidian' : 'magma', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 0; r <= 5; r++) {
    for (let c = 11; c <= 24; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 1 && r <= 4 && c >= 12 && c <= 23) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'volcanic_rock') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Corner pillars (height 5)
  tiles[1][12] = { height: 5, biome: 'obsidian', collision: true };
  tiles[1][23] = { height: 5, biome: 'obsidian', collision: true };
  tiles[4][12] = { height: 5, biome: 'obsidian', collision: true };
  tiles[4][23] = { height: 5, biome: 'obsidian', collision: true };

  // Skull ring (8 skulls around perimeter)
  tiles[1][14] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[1][21] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[4][14] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[4][21] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[2][12] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[3][12] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[2][23] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };
  tiles[3][23] = { height: 1, biome: 'obsidian', collision: false, data: { deco: 'skull' } };

  // Torch ring (6 torches)
  tiles[0][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][22] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][11] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][24] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (17, 2)
  tiles[2][17] = {
    height: 1, biome: 'obsidian', collision: true,
    interact: 'boss', data: { id: 'infernal_dragon', name: 'Infernal Dragon' },
  };

  // Lava patches near boss (fire theme)
  tiles[2][15] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 5 } };
  tiles[3][16] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 5 } };
  tiles[1][19] = { height: 0, biome: 'lava', collision: false, data: { hazard: 'lava', dmg: 5 } };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoVolcanoScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: VolcanoMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];
  private spawnFrom: string | null = null;

  constructor() {
    super('Volcano');
  }

  init(data?: { from?: string }): void {
    this.spawnFrom = data?.from ?? null;
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Volcano';

    // Track zone visit for daily explorer quest
    trackZoneVisit('Volcano');

    // Determine spawn position based on entry direction
    let spawnX = 17;
    let spawnY = 33;
    if (this.spawnFrom === 'magma_pit') {
      spawnX = 17;
      spawnY = 6;
    }

    this.initZone(buildVolcanoTiles(), spawnX, spawnY);

    // Boss indicator (if not yet defeated)
    if (!state.flags.has('volcano_boss_defeated')) {
      this.createBossIndicator();
    }

    // Spawn volcano monsters
    this.monsterSprites = [];
    for (const m of VOLCANO_MONSTERS) {
      this.spawnVolcanoMonsterAt(m);
    }

    this.events.emit('zone-change', 'Volcano');
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

      case 'exit_forest':
        this.exitToScene('Forest', { from: 'volcano' });
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
      // update() runs this every frame — without a throttle lava burns ~300 HP/s
      // and hammers localStorage with a save per frame
      const now = this.time.now;
      if (now - this.lastLavaTick < 700) return;
      this.lastLavaTick = now;
      const state = PlayerState.get();
      const dmg = tile.data.dmg ?? 5;
      state.hp = Math.max(1, state.hp - dmg);
      this.events.emit('hp-change');
      state.save();
    }
  }

  // -----------------------------------------------------------------------
  // Volcano monster spawning
  // -----------------------------------------------------------------------
  private spawnVolcanoMonsterAt(m: VolcanoMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: VolcanoMonster; alive: boolean }): void {
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
      returnScene: 'Volcano',
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
          this.spawnVolcanoMonsterAt(m);
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
    const dialogue = BOSS_DIALOGUES['infernal_dragon'];
    if (state.flags.has('volcano_boss_defeated')) {
      this.showDialog('Infernal Dragon', ['The dragon lies defeated... its flames extinguished.'], 17, 2);
      return;
    }

    this.showDialog('Infernal Dragon', dialogue.preBattle, 17, 2);

    // Wait for dialog to close, then start fight
    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...BOSS_DATA },
      returnScene: 'Volcano',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('volcano_boss_defeated');
        state.addKill('infernal_dragon');

        // Lore tracking
        state.flags.add('lore_infernal_dragon');

        // Daily quest tracking
        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['infernal_dragon'];
        this.showDialog('Infernal Dragon', [dialogue.deathLine], 17, 2);

        const waitForLore = () => {
          if (!this.frozen) {
            this.showLoreReveal('Infernal Dragon', dialogue.loreReveal);
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
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const bossColor = 0xff4400;
    const pos = toScreen(17, 2, 1);
    const container = this.add.container(pos.x, pos.y);

    // Large red-orange circle
    const body = this.add.circle(0, -10, 10, bossColor, 1);
    container.add(body);

    // Fire glow
    const glow = this.add.circle(0, -10, 16, bossColor, 0.2);
    container.add(glow);
    this.tweens.add({
      targets: glow, alpha: { from: 0.1, to: 0.35 },
      scaleX: { from: 1, to: 1.3 }, scaleY: { from: 1, to: 1.3 },
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Name
    const label = this.add.text(0, -28, 'Infernal Dragon', {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ff4400', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    // Level
    const lvl = this.add.text(0, 4, 'Lv40 BOSS', {
      fontSize: '7px', fontFamily: 'monospace',
      color: '#ff8888', stroke: '#000000', strokeThickness: 2,
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
}
