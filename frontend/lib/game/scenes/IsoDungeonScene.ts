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
  type: 'boss_frost',
  name: 'Frost Dragon',
  level: 8,
  hp: 200,
  maxHp: 200,
  atk: 22,
  def: 12,
};

// Stronger dragon for dragon_revenge quest
const BOSS_V2_DATA = {
  type: 'boss_frost_v2',
  name: 'Empowered Frost Dragon',
  level: 12,
  hp: 350,
  maxHp: 350,
  atk: 30,
  def: 16,
};

// ---------------------------------------------------------------------------
// Dungeon monster definitions
// ---------------------------------------------------------------------------
interface DungeonMonster {
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

const DUNGEON_MONSTERS: DungeonMonster[] = [
  // Room 1 — Entry Hall ghosts & bats
  { tx: 6,  ty: 17, type: 'ghost', name: 'Dungeon Ghost', level: 4, color: 0x88bbdd, hp: 42, atk: 12, def: 3 },
  { tx: 14, ty: 16, type: 'ghost', name: 'Dungeon Ghost', level: 4, color: 0x88bbdd, hp: 42, atk: 12, def: 3 },
  { tx: 10, ty: 18, type: 'bat',   name: 'Cave Bat',      level: 3, color: 0x8866aa, hp: 30, atk: 10, def: 2 },
  { tx: 16, ty: 19, type: 'bat',   name: 'Cave Bat',      level: 3, color: 0x8866aa, hp: 30, atk: 10, def: 2 },
  // Room 2 — Pillar Hall ghosts
  { tx: 5,  ty: 8,  type: 'ghost', name: 'Wraith',        level: 5, color: 0x99ccee, hp: 55, atk: 15, def: 4 },
  { tx: 14, ty: 9,  type: 'ghost', name: 'Wraith',        level: 5, color: 0x99ccee, hp: 55, atk: 15, def: 4 },
  { tx: 9,  ty: 10, type: 'bat',   name: 'Blood Bat',     level: 4, color: 0xaa5599, hp: 38, atk: 13, def: 3 },
  // Corridor
  { tx: 10, ty: 13, type: 'ghost', name: 'Dungeon Ghost', level: 4, color: 0x88bbdd, hp: 42, atk: 12, def: 3 },
  // Special monsters
  { tx: 8,  ty: 9,  type: 'necromancer', name: 'Necromancer', level: 6, color: 0x6633aa, hp: 75, atk: 16, def: 6 },
];

// ---------------------------------------------------------------------------
// Map builder — 22 cols x 22 rows
// ---------------------------------------------------------------------------
function buildDungeonTiles(): ZoneTile[][] {
  const SIZE = 22;

  // Seeded hash for variety
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
    // Wall border tiles adjacent to rooms: 'wall' height 4
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

  // --- Step 2: Room 1 — Entry Hall (cols 4-17, rows 15-20) ---
  carveRoom(4, 15, 17, 20);

  // Room 1 floor detail: stone with ~30% cobble patches
  for (let r = 15; r <= 20; r++) {
    for (let c = 4; c <= 17; c++) {
      if (hash(r, c, 13) < 30) {
        tiles[r][c] = { height: 1, biome: 'cobble', collision: false };
      }
    }
  }

  // Water puddle (3 tiles)
  tiles[18][6]  = { height: 0, biome: 'water', collision: false };
  tiles[18][7]  = { height: 0, biome: 'water', collision: false };
  tiles[19][6]  = { height: 0, biome: 'water', collision: false };

  // Barrel cluster (3 barrels)
  tiles[18][15] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[18][16] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };
  tiles[19][15] = { height: 1, biome: 'stone', collision: true, data: { deco: 'barrel' } };

  // Rubble/rocks (4 spots)
  tiles[16][5]  = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[17][12] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[20][8]  = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };
  tiles[15][16] = { height: 2, biome: 'stone', collision: true, data: { deco: 'rock' } };

  // Torch markers on walls (6 spots)
  tiles[14][4]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][10] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[14][17] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[15][3]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[18][3]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[20][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Exit at (10, 21) and (11, 21) — interact:'exit_forest'
  tiles[21][10] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };
  tiles[21][11] = { height: 1, biome: 'stone', collision: false, interact: 'exit_forest' };

  // --- Step 3: Corridor 1 (cols 9-12, rows 12-15) ---
  carveRoom(9, 12, 12, 14, 'stone_dark', 1);
  // Torch at each end
  tiles[12][8]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[12][13] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 4: Room 2 — Pillar Hall (cols 4-17, rows 7-11) ---
  carveRoom(4, 7, 17, 11, 'cobble');

  // 6 pillars
  tiles[8][6]   = { height: 4, biome: 'stone', collision: true };
  tiles[10][6]  = { height: 4, biome: 'stone', collision: true };
  tiles[8][11]  = { height: 4, biome: 'stone', collision: true };
  tiles[10][11] = { height: 4, biome: 'stone', collision: true };
  tiles[8][15]  = { height: 4, biome: 'stone', collision: true };
  tiles[10][15] = { height: 4, biome: 'stone', collision: true };

  // Chest at (11, 9)
  tiles[9][11] = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'chest', data: { id: 'dungeon_chest1' },
  };

  // Skull decorations along walls (4 spots)
  tiles[7][4]   = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[7][17]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[11][4]  = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };
  tiles[11][17] = { height: 1, biome: 'cobble', collision: false, data: { deco: 'skull' } };

  // Torch markers in room 2 (8 spots)
  tiles[6][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][9]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][13]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[6][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][3]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[10][3]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[7][18]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[10][18] = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 5: Corridor 2 (cols 8-10, rows 4-7) — offset from corridor 1 ---
  carveRoom(8, 4, 10, 6, 'stone_dark', 1);
  // Torch at each end
  tiles[4][7]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[4][11]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // --- Step 6: Room 3 — Boss Arena (cols 5-16, rows 1-4) ---
  // Checkerboard floor
  for (let r = 1; r <= 4; r++) {
    for (let c = 5; c <= 16; c++) {
      const isEven = (r + c) % 2 === 0;
      tiles[r][c] = { height: 1, biome: isEven ? 'stone' : 'stone_dark', collision: false };
    }
  }
  // Wall borders for boss room
  for (let r = 0; r <= 5; r++) {
    for (let c = 4; c <= 17; c++) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      if (r >= 1 && r <= 4 && c >= 5 && c <= 16) continue;
      if (tiles[r][c].collision && tiles[r][c].biome === 'stone_dark') {
        tiles[r][c] = { height: 4, biome: 'wall', collision: true };
      }
    }
  }

  // Exit to Ice Cave (north of boss room, unlocked after boss defeated)
  tiles[0][10] = { height: 1, biome: 'ice', collision: false, interact: 'exit_ice_cave' };
  tiles[0][11] = { height: 1, biome: 'ice', collision: false, interact: 'exit_ice_cave' };

  // Corner pillars (stone height 5)
  tiles[1][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[1][16]  = { height: 5, biome: 'stone', collision: true };
  tiles[4][5]   = { height: 5, biome: 'stone', collision: true };
  tiles[4][16]  = { height: 5, biome: 'stone', collision: true };

  // Skull ring (8 skulls around perimeter)
  tiles[1][7]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[1][14]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][7]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[4][14]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][5]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][5]   = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[2][16]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };
  tiles[3][16]  = { height: 1, biome: 'stone', collision: false, data: { deco: 'skull' } };

  // Torch ring (6 torches)
  tiles[0][6]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][10]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[0][15]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[3][4]   = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };
  tiles[1][17]  = { height: 3, biome: 'wall', collision: true, data: { deco: 'torch' } };

  // Boss tile at (11, 2)
  tiles[2][11] = {
    height: 1, biome: 'stone', collision: true,
    interact: 'boss', data: { id: 'frost_dragon', name: 'Frost Dragon' },
  };

  // Ice patches near boss (frost theme)
  tiles[2][9]   = { height: 1, biome: 'ice', collision: false };
  tiles[3][10]  = { height: 1, biome: 'ice', collision: false };
  tiles[1][12]  = { height: 1, biome: 'ice', collision: false };

  // Hidden ancient chest — tucked in corner of pillar hall (for ancient_artifact quest)
  tiles[7][16] = {
    height: 1, biome: 'cobble', collision: true,
    interact: 'ancient_chest', data: { id: 'ancient_chest' },
  };

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoDungeonScene extends IsoBaseScene {
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private monsterSprites: { sprite: Phaser.GameObjects.Container; data: DungeonMonster; alive: boolean }[] = [];
  private respawnTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('Dungeon');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Dungeon';

    // Track zone visit for daily explorer quest
    trackZoneVisit('Dungeon');

    // Track market_research quest progress
    const mrQuest = state.quests.find(q => q.id === 'market_research' && !q.completed);
    if (mrQuest) {
      if (!state.flags.has('mr_visited_dungeon')) {
        state.flags.add('mr_visited_dungeon');
        mrQuest.progress = Math.min(mrQuest.target, mrQuest.progress + 1);
        if (mrQuest.progress >= mrQuest.target) mrQuest.completed = true;
        state.save();
      }
    }

    this.initZone(buildDungeonTiles(), 11, 20);

    // Boss indicator (if not yet defeated, or dragon_revenge active)
    if (!state.flags.has('boss_defeated')) {
      this.createBossIndicator();
    }

    // Chest indicator (if not yet opened)
    if (!state.flags.has('dungeon_chest1')) {
      this.createChestIndicator(11, 9);
    }

    // Ancient chest indicator (for ancient_artifact quest)
    if (!state.flags.has('ancient_chest_found') && state.quests.some(q => q.id === 'ancient_artifact' && !q.completed)) {
      this.createChestIndicator(16, 7);
    }

    // Spawn dungeon monsters
    this.monsterSprites = [];
    for (const m of DUNGEON_MONSTERS) {
      this.spawnDungeonMonsterAt(m);
    }

    this.events.emit('zone-change', 'Frost Dungeon');
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

      case 'ancient_chest':
        this.handleAncientChest(state);
        break;

      case 'exit_forest':
        this.exitToScene('Forest');
        break;

      case 'exit_ice_cave':
        // The boss kill sets 'boss_defeated'; 'dungeon_boss_done' only comes from
        // the town quest turn-in — accept either, or killing the boss without
        // taking the quest leaves IceCave locked forever with misleading copy.
        if (PlayerState.get().flags.has('dungeon_boss_done') || PlayerState.get().flags.has('boss_defeated')) {
          this.exitToScene('IceCave', { from: 'dungeon' });
        } else {
          this.showDialog('???', ['A frozen passage... but the way is blocked. Defeat the boss first.'], _tx, _ty);
        }
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Dungeon monster spawning
  // -----------------------------------------------------------------------
  private spawnDungeonMonsterAt(m: DungeonMonster): void {
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

  private startMonsterBattle(entry: { sprite: Phaser.GameObjects.Container; data: DungeonMonster; alive: boolean }): void {
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
      returnScene: 'Dungeon',
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

        // Drop bat wing for supply_run quest
        if (m.type === 'bat' && !state.hasItem('bat_wing')) {
          if (Math.random() < 0.4) {
            state.addItem({
              id: 'bat_wing', name: 'Bat Wing', sprite: 'key',
              type: 'quest', stackable: false, count: 1,
            });
          }
        }

        // Update supply_run quest progress
        const srQuest = state.quests.find(q => q.id === 'supply_run' && !q.completed);
        if (srQuest) {
          let prog = 0;
          if (state.hasItem('bone_shard')) prog++;
          if (state.hasItem('spider_silk_mat')) prog++;
          if (state.hasItem('bat_wing')) prog++;
          srQuest.progress = prog;
          if (prog >= 3) srQuest.completed = true;
        }

        this.events.emit('quest-update');
        this.events.emit('hp-change');

        // Respawn after 20 seconds
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
    if (state.flags.has('boss_defeated')) {
      this.showDialog('Frost Dragon', ['The dragon lies defeated...'], 11, 2);
      return;
    }

    const isRevenge = state.flags.has('dragon_revenge_active');
    const bossName = isRevenge ? 'Empowered Frost Dragon' : 'Frost Dragon';

    const dialogue = BOSS_DIALOGUES['boss_frost'];
    this.showDialog(bossName, isRevenge ? [
      'YOU AGAIN? I HAVE GROWN STRONGER!',
      'This time, you will not survive!',
    ] : dialogue.preBattle, 11, 2);

    // Wait for dialog to close, then start fight
    this.runAfterDialog(() => this.startBossFight(state));
  }

  private startBossFight(state: PlayerState): void {
    const isRevenge = state.flags.has('dragon_revenge_active');
    const bossData = isRevenge ? BOSS_V2_DATA : BOSS_DATA;

    this.freeze();
    this.scene.launch('Battle', {
      monster: { ...bossData },
      returnScene: 'Dungeon',
    });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.unfreeze();
      if (result.won) {
        state.flags.add('boss_defeated');

        // Lore tracking
        state.flags.add('lore_boss_frost');

        // Daily quest tracking
        updateDailyProgress('daily_slayer');
        updateDailyProgress('daily_boss');

        const dialogue = BOSS_DIALOGUES['boss_frost'];

        if (isRevenge) {
          state.addKill('boss_frost_v2');
          state.flags.delete('dragon_revenge_active');
          state.flags.add('dragon_revenge_defeated');
          this.showDialog('Victory!', [
            'The Empowered Frost Dragon has been vanquished!',
            'Return to Elder Frost with the news.',
          ], 11, 2);
        } else {
          state.addKill('boss_frost');
          state.addItem({
            id: 'frost_key', name: 'Frost Key', sprite: 'key',
            type: 'quest', stackable: false, count: 1,
          });
          this.showDialog('Frost Dragon', [dialogue.deathLine], 11, 2);

          const waitForLore = () => {
            if (!this.frozen) {
              this.showLoreReveal('Frost Dragon', dialogue.loreReveal);
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
        }

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
  // Ancient Chest (for ancient_artifact quest)
  // -----------------------------------------------------------------------
  private handleAncientChest(state: PlayerState): void {
    if (state.flags.has('ancient_chest_found')) {
      this.showDialog('Ancient Chest', ['Already opened.'], 16, 7);
      return;
    }

    const hasQuest = state.quests.some(q => q.id === 'ancient_artifact' && !q.completed);
    if (!hasQuest) {
      this.showDialog('Ancient Chest', ['A mysterious chest sealed with ancient runes.', 'It won\'t open...'], 16, 7);
      return;
    }

    state.flags.add('ancient_chest_found');
    state.addItem({
      id: 'ancient_artifact_item', name: 'Ancient Artifact', sprite: 'key',
      type: 'quest', stackable: false, count: 1,
    });
    this.showDialog('Ancient Chest', [
      'The ancient seal breaks!',
      'Found: Ancient Artifact!',
      'Return to Elder Frost in town.',
    ], 16, 7);
    this.events.emit('quest-update');
    state.save();
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
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 2,
      });
      state.gold += 25;
      this.showDialog('Chest', ['Found: 2x Health Potion, 25 Gold!'], 11, 9);
      this.events.emit('hp-change');
      state.save(); // persist loot + opened flag immediately
    } else {
      this.showDialog('Chest', ['Already opened.'], 11, 9);
    }
  }

  // -----------------------------------------------------------------------
  // Visual indicators
  // -----------------------------------------------------------------------
  private createBossIndicator(): void {
    const state = PlayerState.get();
    const isRevenge = state.flags.has('dragon_revenge_active');
    const bossName = isRevenge ? 'Empowered Dragon' : 'Frost Dragon';
    const bossLvl = isRevenge ? 'Lv12 BOSS' : 'Lv8 BOSS';
    const bossColor = isRevenge ? 0xff2266 : 0xff3333;

    const pos = toScreen(11, 2, 1);
    const container = this.add.container(pos.x, pos.y);

    // Large red circle
    const body = this.add.circle(0, -10, 10, bossColor, 1);
    container.add(body);

    // Red glow
    const glow = this.add.circle(0, -10, 16, bossColor, 0.2);
    container.add(glow);
    this.tweens.add({
      targets: glow, alpha: { from: 0.1, to: 0.35 },
      scaleX: { from: 1, to: 1.3 }, scaleY: { from: 1, to: 1.3 },
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Name
    const label = this.add.text(0, -28, bossName, {
      fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold',
      color: isRevenge ? '#ff2266' : '#ff4444', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    // Level
    const lvl = this.add.text(0, 4, bossLvl, {
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
