# MMORPG Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable 2D pixel-art MMORPG demo with town exploration, forest combat, dungeon boss, NPC quests, and inventory — all running in-browser at `/avalanche/world`

**Architecture:** Phaser 3 game engine embedded in Next.js via dynamic import (ssr:false). Game logic in standalone TypeScript files under `frontend/lib/game/`. Single page component loads Phaser canvas. Kenney 1-bit tileset (16×16, 1px gap, 49 cols × 22 rows) for all visuals. Programmatic tilemaps (no Tiled dependency). Turn-based combat overlay built in Phaser scenes.

**Tech Stack:** Phaser 3, Next.js 14, TypeScript, Kenney 1-bit sprites (832×373px), existing SFX files

**Key Constants:**
- Sprite sheet: `/avalanche/sprites/kenney-1bit.png` — 49 cols × 22 rows, 16px tiles, 1px gap
- basePath: `/avalanche`
- Tile formula: `x = col * 17`, `y = row * 17` (16px tile + 1px gap)

---

### Task 1: Install Phaser + Create Game Page Shell

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/app/world/page.tsx`
- Create: `frontend/lib/game/PhaserGame.tsx`
- Create: `frontend/lib/game/config.ts`

- [ ] **Step 1: Install Phaser 3**

```bash
cd /Users/hts_bot/avax-arena/frontend && npm install phaser@3.80.1
```

- [ ] **Step 2: Create game config**

Create `frontend/lib/game/config.ts`:

```ts
import Phaser from 'phaser';

// Kenney 1-bit spritesheet constants
export const TILE_SIZE = 16;
export const TILE_GAP = 1;
export const TILE_STEP = TILE_SIZE + TILE_GAP; // 17
export const SHEET_COLS = 49;
export const SHEET_ROWS = 22;
export const SPRITE_SHEET_PATH = '/avalanche/sprites/kenney-1bit.png';

// Map dimensions (in tiles)
export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 30;

// Scaled tile size for rendering
export const SCALE = 3;
export const DISPLAY_TILE = TILE_SIZE * SCALE; // 48px

// Game canvas
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

// Convert (col, row) in spritesheet to tile index
export function tileIndex(col: number, row: number): number {
  return row * SHEET_COLS + col;
}

export function createGameConfig(parent: string, scenes: Phaser.Types.Scenes.SceneType[]): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    pixelArt: true,
    backgroundColor: '#1a1a2e',
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: scenes,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
```

- [ ] **Step 3: Create Phaser wrapper component**

Create `frontend/lib/game/PhaserGame.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { TownScene } from './scenes/TownScene';
import { ForestScene } from './scenes/ForestScene';
import { DungeonScene } from './scenes/DungeonScene';
import { BattleScene } from './scenes/BattleScene';
import { HUDScene } from './scenes/HUDScene';

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    const config = createGameConfig('game-container', [
      BootScene,
      TownScene,
      ForestScene,
      DungeonScene,
      BattleScene,
      HUDScene,
    ]);

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      id="game-container"
      ref={containerRef}
      style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}
    />
  );
}
```

- [ ] **Step 4: Create world page**

Create `frontend/app/world/page.tsx`:

```tsx
import dynamic from 'next/dynamic';

const PhaserGame = dynamic(
  () => import('@/lib/game/PhaserGame').then(m => m.PhaserGame),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-[#1a1a2e] rounded-xl">
      <p className="font-mono text-cyan-400 animate-pulse">Loading Frostbite World...</p>
    </div>
  )}
);

export default function WorldPage() {
  return (
    <div className="py-4">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-cyan-400 font-[family-name:var(--font-press-start)]">
          Frostbite World
        </h1>
        <p className="text-sm text-gray-400 mt-2">WASD or Arrow Keys to move • E to interact • ESC menu</p>
      </div>
      <div className="rounded-xl overflow-hidden border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
        <PhaserGame />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify page loads without errors**

```bash
cd /Users/hts_bot/avax-arena/frontend && npx next build 2>&1 | tail -20
```

Expected: Build succeeds (scenes don't exist yet so we'll create stubs first — see Task 2).

---

### Task 2: Boot Scene + Spritesheet Loading

**Files:**
- Create: `frontend/lib/game/scenes/BootScene.ts`
- Create: `frontend/lib/game/sprites.ts`

- [ ] **Step 1: Define sprite catalog**

Create `frontend/lib/game/sprites.ts`:

```ts
// Kenney 1-bit spritesheet tile positions (col, row)
// Sheet: 49 cols × 22 rows, 16×16 tiles, 1px gap

export const SPRITES = {
  // Terrain
  grass1:     { col: 0, row: 0 },
  grass2:     { col: 1, row: 0 },
  grass3:     { col: 2, row: 0 },
  tree1:      { col: 3, row: 0 },
  tree2:      { col: 4, row: 0 },
  treePine:   { col: 5, row: 0 },
  bush:       { col: 6, row: 0 },
  flower:     { col: 7, row: 0 },
  rock:       { col: 8, row: 0 },
  water:      { col: 0, row: 3 },
  bridge:     { col: 1, row: 3 },
  path1:      { col: 9, row: 0 },
  pathH:      { col: 10, row: 0 },
  pathV:      { col: 9, row: 1 },

  // Buildings
  wallH:      { col: 0, row: 4 },
  wallV:      { col: 1, row: 4 },
  wallCorner: { col: 2, row: 4 },
  door:       { col: 3, row: 4 },
  window:     { col: 4, row: 4 },
  roofL:      { col: 0, row: 5 },
  roofM:      { col: 1, row: 5 },
  roofR:      { col: 2, row: 5 },
  floor1:     { col: 5, row: 4 },
  floor2:     { col: 6, row: 4 },

  // Dungeon
  dWall:      { col: 0, row: 6 },
  dFloor:     { col: 1, row: 6 },
  dDoor:      { col: 2, row: 6 },
  torch:      { col: 3, row: 6 },
  chest:      { col: 4, row: 6 },
  barrel:     { col: 5, row: 6 },
  skull:      { col: 44, row: 1 },

  // Characters
  knight:     { col: 42, row: 0 },
  mage:       { col: 43, row: 0 },
  archer:     { col: 44, row: 0 },
  king:       { col: 45, row: 0 },
  warrior2:   { col: 42, row: 1 },
  viking:     { col: 43, row: 1 },

  // Monsters
  skeleton:   { col: 42, row: 2 },
  ghost:      { col: 43, row: 2 },
  demon:      { col: 44, row: 2 },
  spider:     { col: 45, row: 2 },
  bat:        { col: 46, row: 2 },
  slime:      { col: 42, row: 3 },
  dragon:     { col: 43, row: 3 },
  ogre:       { col: 44, row: 3 },

  // NPCs
  npcOld:     { col: 45, row: 0 }, // king as quest giver
  npcShop:    { col: 43, row: 1 }, // viking as shopkeeper

  // Items
  sword:      { col: 46, row: 0 },
  shield:     { col: 47, row: 0 },
  potion:     { col: 46, row: 1 },
  heart:      { col: 36, row: 14 },
  star:       { col: 38, row: 14 },
  coin:       { col: 37, row: 14 },
  key:        { col: 47, row: 1 },

  // UI
  arrowUp:    { col: 36, row: 16 },
  arrowDown:  { col: 36, row: 18 },
  arrowLeft:  { col: 35, row: 17 },
  arrowRight: { col: 37, row: 17 },
} as const;

export type SpriteName = keyof typeof SPRITES;
```

- [ ] **Step 2: Create BootScene — loads spritesheet, then starts TownScene**

Create `frontend/lib/game/scenes/BootScene.ts`:

```ts
import Phaser from 'phaser';
import { TILE_SIZE, TILE_GAP, TILE_STEP, SHEET_COLS, SHEET_ROWS, SPRITE_SHEET_PATH } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    // Loading bar
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const bar = this.add.rectangle(w / 2, h / 2, 300, 20, 0x0e4d6e);
    const fill = this.add.rectangle(w / 2 - 148, h / 2, 4, 16, 0x00e5ff);
    const text = this.add.text(w / 2, h / 2 - 30, 'Loading...', {
      fontSize: '16px', color: '#00e5ff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.load.on('progress', (p: number) => {
      fill.width = 296 * p;
      fill.x = w / 2 - 148 + (296 * p) / 2;
    });
    this.load.on('complete', () => { bar.destroy(); fill.destroy(); text.destroy(); });

    // Load spritesheet as tileset
    this.load.spritesheet('tiles', SPRITE_SHEET_PATH, {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
      spacing: TILE_GAP,
      margin: 0,
    });

    // Load SFX
    const sfxFiles = [
      'slash1', 'slash2', 'slice1', 'slice2', 'chop', 'coins',
      'metal-click', 'hit-heavy1', 'hit-heavy2', 'hit-light1',
      'hit-light2', 'hit-medium1', 'hit-soft1', 'ui-click', 'ui-hover',
    ];
    sfxFiles.forEach(name => {
      this.load.audio(name, `/avalanche/sfx/${name}.ogg`);
    });
  }

  create() {
    this.scene.start('Town');
    this.scene.launch('HUD');
  }
}
```

---

### Task 3: Player State + Shared Data Registry

**Files:**
- Create: `frontend/lib/game/PlayerState.ts`

- [ ] **Step 1: Create shared player state**

```ts
export type PlayerClass = 'knight' | 'mage' | 'archer';

export interface QuestData {
  id: string;
  title: string;
  description: string;
  objective: string;
  target: number;
  progress: number;
  reward: { type: 'item' | 'gold' | 'xp'; id?: string; amount: number };
  completed: boolean;
  turnedIn: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  sprite: string;
  type: 'weapon' | 'armor' | 'potion' | 'key' | 'quest';
  stat?: { atk?: number; def?: number; hp?: number };
  stackable: boolean;
  count: number;
}

export class PlayerState {
  // Singleton
  private static instance: PlayerState;
  static get(): PlayerState {
    if (!PlayerState.instance) PlayerState.instance = new PlayerState();
    return PlayerState.instance;
  }

  // Identity
  name = 'Hero';
  playerClass: PlayerClass = 'knight';

  // Stats
  level = 1;
  xp = 0;
  xpToNext = 100;
  maxHp = 120;
  hp = 120;
  atk = 15;
  def = 8;
  spd = 10;
  gold = 50;

  // Inventory (max 12 slots)
  inventory: InventoryItem[] = [
    { id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion', stat: { hp: 40 }, stackable: true, count: 3 },
  ];

  // Quests
  quests: QuestData[] = [];

  // Kill tracking (for quests)
  killCounts: Record<string, number> = {};

  // Flags
  flags: Set<string> = new Set();

  // Position memory (for zone transitions)
  lastZone = 'Town';
  spawnX = 0;
  spawnY = 0;

  addKill(monsterType: string) {
    this.killCounts[monsterType] = (this.killCounts[monsterType] || 0) + 1;
    // Update quest progress
    for (const q of this.quests) {
      if (!q.completed && q.objective === monsterType) {
        q.progress = Math.min(this.killCounts[monsterType], q.target);
        if (q.progress >= q.target) q.completed = true;
      }
    }
  }

  addXp(amount: number): boolean {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(this.xpToNext * 1.4);
      this.maxHp += 15;
      this.hp = this.maxHp;
      this.atk += 3;
      this.def += 2;
      this.spd += 1;
      return true; // leveled up
    }
    return false;
  }

  addItem(item: InventoryItem): boolean {
    if (item.stackable) {
      const existing = this.inventory.find(i => i.id === item.id);
      if (existing) { existing.count += item.count; return true; }
    }
    if (this.inventory.length >= 12) return false;
    this.inventory.push({ ...item });
    return true;
  }

  removeItem(id: string, count = 1): boolean {
    const idx = this.inventory.findIndex(i => i.id === id);
    if (idx === -1) return false;
    this.inventory[idx].count -= count;
    if (this.inventory[idx].count <= 0) this.inventory.splice(idx, 1);
    return true;
  }

  hasItem(id: string): boolean {
    return this.inventory.some(i => i.id === id);
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  get spriteKey(): string {
    return this.playerClass;
  }
}
```

---

### Task 4: Town Scene — Programmatic Tilemap + Player Movement

**Files:**
- Create: `frontend/lib/game/scenes/TownScene.ts`
- Create: `frontend/lib/game/maps/townMap.ts`
- Create: `frontend/lib/game/Player.ts`

- [ ] **Step 1: Create town map data**

Create `frontend/lib/game/maps/townMap.ts`:

```ts
import { tileIndex } from '../config';

// 40×30 tile map
// Legend: 0=grass, W=wall(collision), T=tree(collision), P=path, D=door(transition), N=npc
// We store layers: ground, decoration, collision

const W = 1; // wall/solid
const _ = 0; // walkable

// Ground layer — tile indices from spritesheet
// Row 0 of sheet: grass variants at cols 0-2
const G1 = tileIndex(0, 0); // grass
const G2 = tileIndex(1, 0); // grass variant
const G3 = tileIndex(2, 0); // grass variant
const PT = tileIndex(9, 0); // path

export function generateTownGround(): number[] {
  const map: number[] = [];
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 40; x++) {
      // Paths: main road through center
      if ((x >= 18 && x <= 21) || (y >= 13 && y <= 16 && x >= 10 && x <= 30)) {
        map.push(PT);
      } else {
        // Random grass
        const r = Math.random();
        map.push(r < 0.6 ? G1 : r < 0.85 ? G2 : G3);
      }
    }
  }
  return map;
}

// Decoration layer (trees, buildings, NPCs) — -1 = empty
const TREE = tileIndex(3, 0);
const PINE = tileIndex(5, 0);
const BUSH = tileIndex(6, 0);
const ROCK = tileIndex(8, 0);
const CHEST_TILE = tileIndex(4, 6);
const TORCH = tileIndex(3, 6);

export interface MapObject {
  x: number;
  y: number;
  tile: number;
  collision: boolean;
  interact?: string; // interaction type
  data?: any;
}

export function getTownObjects(): MapObject[] {
  const objs: MapObject[] = [];

  // Border trees (top/bottom/left/right)
  for (let x = 0; x < 40; x++) {
    objs.push({ x, y: 0, tile: PINE, collision: true });
    objs.push({ x, y: 29, tile: PINE, collision: true });
  }
  for (let y = 1; y < 29; y++) {
    objs.push({ x: 0, y, tile: PINE, collision: true });
    objs.push({ x: 39, y, tile: PINE, collision: true });
  }

  // Scattered trees in town
  const treePositions = [
    [3,3],[5,5],[8,3],[12,4],[35,3],[37,5],[33,4],
    [3,25],[5,27],[8,26],[35,25],[37,27],[33,26],
    [3,10],[3,20],[36,10],[36,20],
  ];
  treePositions.forEach(([x, y]) => {
    objs.push({ x, y, tile: Math.random() > 0.5 ? TREE : PINE, collision: true });
  });

  // Bushes
  const bushPositions = [[6,4],[9,5],[34,4],[31,5],[6,26],[9,25],[34,26]];
  bushPositions.forEach(([x, y]) => {
    objs.push({ x, y, tile: BUSH, collision: true });
  });

  // Inn building (top-left area) — simple wall rectangle
  for (let x = 5; x <= 10; x++) {
    objs.push({ x, y: 8, tile: tileIndex(1, 5), collision: true });  // roof
    objs.push({ x, y: 11, tile: tileIndex(0, 4), collision: true }); // wall bottom
  }
  for (let y = 9; y <= 10; y++) {
    objs.push({ x: 5, y, tile: tileIndex(1, 4), collision: true });
    objs.push({ x: 10, y, tile: tileIndex(1, 4), collision: true });
  }
  // Inn door
  objs.push({ x: 7, y: 11, tile: tileIndex(3, 4), collision: false, interact: 'inn' });
  // Torches
  objs.push({ x: 6, y: 11, tile: TORCH, collision: false });
  objs.push({ x: 8, y: 11, tile: TORCH, collision: false });

  // Shop building (top-right area)
  for (let x = 28; x <= 33; x++) {
    objs.push({ x, y: 8, tile: tileIndex(1, 5), collision: true });
    objs.push({ x, y: 11, tile: tileIndex(0, 4), collision: true });
  }
  for (let y = 9; y <= 10; y++) {
    objs.push({ x: 28, y, tile: tileIndex(1, 4), collision: true });
    objs.push({ x: 33, y, tile: tileIndex(1, 4), collision: true });
  }
  objs.push({ x: 30, y: 11, tile: tileIndex(3, 4), collision: false, interact: 'shop' });

  // Quest giver NPC (town square)
  objs.push({
    x: 19, y: 12, tile: tileIndex(45, 0), collision: true,
    interact: 'npc', data: { id: 'elder', name: 'Elder Frost' },
  });

  // Shop NPC
  objs.push({
    x: 30, y: 12, tile: tileIndex(43, 1), collision: true,
    interact: 'npc', data: { id: 'merchant', name: 'Merchant Bjorn' },
  });

  // Rocks
  objs.push({ x: 15, y: 22, tile: ROCK, collision: true });
  objs.push({ x: 25, y: 22, tile: ROCK, collision: true });

  // Exit to Forest (right side, gap in trees)
  // Mark exit zone at x=39 (right edge), y=14-16
  objs.push({ x: 38, y: 14, tile: tileIndex(37, 17), collision: false, interact: 'exit_forest' });
  objs.push({ x: 38, y: 15, tile: tileIndex(37, 17), collision: false, interact: 'exit_forest' });

  return objs;
}

// Player spawn point
export const TOWN_SPAWN = { x: 20, y: 20 };
```

- [ ] **Step 2: Create Player class with movement**

Create `frontend/lib/game/Player.ts`:

```ts
import Phaser from 'phaser';
import { DISPLAY_TILE, TILE_SIZE, SCALE, tileIndex } from './config';
import { PlayerState } from './PlayerState';

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  interactKey!: Phaser.Input.Keyboard.Key;
  speed = 160;
  facing: 'up' | 'down' | 'left' | 'right' = 'down';
  canMove = true;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const state = PlayerState.get();
    const frameIndex = this.getFrameIndex(state.playerClass);

    this.sprite = scene.physics.add.sprite(
      x * DISPLAY_TILE + DISPLAY_TILE / 2,
      y * DISPLAY_TILE + DISPLAY_TILE / 2,
      'tiles',
      frameIndex
    );
    this.sprite.setScale(SCALE);
    this.sprite.setSize(TILE_SIZE - 4, TILE_SIZE - 4); // slightly smaller hitbox
    this.sprite.setDepth(10);

    // Camera follow
    scene.cameras.main.startFollow(this.sprite, true, 0.1, 0.1);
    scene.cameras.main.setZoom(1);

    // Input
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.interactKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }
  }

  private getFrameIndex(cls: string): number {
    switch (cls) {
      case 'knight': return tileIndex(42, 0);
      case 'mage':   return tileIndex(43, 0);
      case 'archer': return tileIndex(44, 0);
      default:       return tileIndex(42, 0);
    }
  }

  update() {
    if (!this.canMove) {
      this.sprite.setVelocity(0);
      return;
    }

    const up = this.cursors?.up.isDown || this.wasd?.W.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.S.isDown;
    const left = this.cursors?.left.isDown || this.wasd?.A.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.D.isDown;

    let vx = 0;
    let vy = 0;

    if (left) { vx = -this.speed; this.facing = 'left'; }
    else if (right) { vx = this.speed; this.facing = 'right'; }

    if (up) { vy = -this.speed; this.facing = 'up'; }
    else if (down) { vy = this.speed; this.facing = 'down'; }

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    this.sprite.setVelocity(vx, vy);

    // Flip sprite for left/right
    this.sprite.setFlipX(this.facing === 'left');
  }

  get tileX(): number {
    return Math.floor(this.sprite.x / DISPLAY_TILE);
  }

  get tileY(): number {
    return Math.floor(this.sprite.y / DISPLAY_TILE);
  }

  isInteracting(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.interactKey);
  }

  getFacingTile(): { x: number; y: number } {
    let dx = 0, dy = 0;
    switch (this.facing) {
      case 'up': dy = -1; break;
      case 'down': dy = 1; break;
      case 'left': dx = -1; break;
      case 'right': dx = 1; break;
    }
    return { x: this.tileX + dx, y: this.tileY + dy };
  }

  freeze() { this.canMove = false; this.sprite.setVelocity(0); }
  unfreeze() { this.canMove = true; }
}
```

- [ ] **Step 3: Create TownScene**

Create `frontend/lib/game/scenes/TownScene.ts`:

```ts
import Phaser from 'phaser';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, TILE_STEP, DISPLAY_TILE, SCALE, SHEET_COLS } from '../config';
import { generateTownGround, getTownObjects, TOWN_SPAWN, MapObject } from '../maps/townMap';
import { Player } from '../Player';
import { PlayerState } from '../PlayerState';
import { DialogManager } from '../ui/DialogManager';
import { SPRITES } from '../sprites';

export class TownScene extends Phaser.Scene {
  player!: Player;
  colliders!: Phaser.Physics.Arcade.StaticGroup;
  interactables: MapObject[] = [];
  dialog!: DialogManager;

  constructor() {
    super({ key: 'Town' });
  }

  create() {
    const state = PlayerState.get();
    state.lastZone = 'Town';

    // Build ground layer
    const groundData = generateTownGround();
    const groundMap = this.make.tilemap({
      data: this.to2D(groundData, MAP_WIDTH),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = groundMap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, TILE_STEP);
    if (tileset) {
      const layer = groundMap.createLayer(0, tileset, 0, 0);
      if (layer) layer.setScale(SCALE);
    }

    // Collision group
    this.colliders = this.physics.add.staticGroup();

    // Place objects
    const objects = getTownObjects();
    this.interactables = objects.filter(o => o.interact);

    for (const obj of objects) {
      const px = obj.x * DISPLAY_TILE + DISPLAY_TILE / 2;
      const py = obj.y * DISPLAY_TILE + DISPLAY_TILE / 2;
      const sprite = this.add.sprite(px, py, 'tiles', obj.tile).setScale(SCALE);
      sprite.setDepth(obj.y); // y-sort

      if (obj.collision) {
        const blocker = this.colliders.create(px, py, undefined) as Phaser.Physics.Arcade.Sprite;
        blocker.setVisible(false);
        blocker.body?.setSize(DISPLAY_TILE - 4, DISPLAY_TILE - 4);
        (blocker.body as Phaser.Physics.Arcade.StaticBody).setOffset(
          -(DISPLAY_TILE - 4) / 2, -(DISPLAY_TILE - 4) / 2
        );
      }
    }

    // Spawn player
    const spawnX = state.spawnX || TOWN_SPAWN.x;
    const spawnY = state.spawnY || TOWN_SPAWN.y;
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, this.colliders);

    // World bounds
    this.physics.world.setBounds(0, 0, MAP_WIDTH * DISPLAY_TILE, MAP_HEIGHT * DISPLAY_TILE);
    this.player.sprite.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * DISPLAY_TILE, MAP_HEIGHT * DISPLAY_TILE);

    // Dialog manager
    this.dialog = new DialogManager(this);

    // Zone label
    this.events.emit('zone-change', 'Hearthvale Town');
  }

  update() {
    this.player.update();

    // Check interactions
    if (this.player.isInteracting()) {
      this.checkInteraction();
    }

    // Check zone exits
    this.checkExits();
  }

  private checkInteraction() {
    const facing = this.player.getFacingTile();
    const obj = this.interactables.find(
      o => o.x === facing.x && o.y === facing.y
    );
    if (!obj) return;

    if (obj.interact === 'npc') {
      this.handleNPC(obj);
    } else if (obj.interact === 'shop') {
      this.dialog.show('Merchant Bjorn', ['Welcome to my shop!', 'I have potions and gear.', '(Shop coming soon)']);
      this.player.freeze();
    } else if (obj.interact === 'inn') {
      const state = PlayerState.get();
      state.hp = state.maxHp;
      this.dialog.show('Innkeeper', ['Rest well, traveler.', 'Your health has been restored!']);
      this.player.freeze();
      this.events.emit('hp-change');
    }
  }

  private handleNPC(obj: MapObject) {
    const state = PlayerState.get();
    const npcId = obj.data?.id;

    if (npcId === 'elder') {
      // Check if quest is active and completed
      const quest = state.quests.find(q => q.id === 'skeleton_hunt');
      if (quest && quest.completed && !quest.turnedIn) {
        quest.turnedIn = true;
        state.addXp(quest.reward.amount);
        state.gold += 30;
        state.flags.add('skeleton_quest_done');
        this.dialog.show('Elder Frost', [
          'You did it! The forest is safer now.',
          '+50 XP, +30 Gold',
          'Now... the dungeon to the north holds greater dangers.',
          'Find the Frost Key inside. We need it to seal the portal.',
        ]);
        // Give dungeon quest
        state.quests.push({
          id: 'dungeon_boss', title: 'The Frost Key', description: 'Defeat the dungeon boss',
          objective: 'boss_frost', target: 1, progress: 0,
          reward: { type: 'xp', amount: 150 }, completed: false, turnedIn: false,
        });
        this.events.emit('quest-update');
      } else if (quest && !quest.completed) {
        this.dialog.show('Elder Frost', [
          `Skeletons slain: ${quest.progress}/${quest.target}`,
          'Keep hunting in the forest to the east!',
        ]);
      } else if (!quest && !state.flags.has('skeleton_quest_done')) {
        // Give first quest
        state.quests.push({
          id: 'skeleton_hunt', title: 'Forest Threat', description: 'Slay skeletons in the forest',
          objective: 'skeleton', target: 5, progress: 0,
          reward: { type: 'xp', amount: 50 }, completed: false, turnedIn: false,
        });
        this.dialog.show('Elder Frost', [
          'Greetings, warrior.',
          'Skeletons have infested the forest to the east.',
          'Slay 5 of them and return to me.',
          'Quest accepted: Forest Threat',
        ]);
        this.events.emit('quest-update');
      } else {
        this.dialog.show('Elder Frost', ['Thank you for your bravery, hero.']);
      }
      this.player.freeze();
    } else if (npcId === 'merchant') {
      this.dialog.show('Merchant Bjorn', ['Welcome! Take a look.', '(Shop coming soon)']);
      this.player.freeze();
    }
  }

  private checkExits() {
    const tx = this.player.tileX;
    const ty = this.player.tileY;

    // Right edge → Forest
    if (tx >= 38 && ty >= 13 && ty <= 16) {
      const state = PlayerState.get();
      state.spawnX = 1;
      state.spawnY = 15;
      this.scene.start('Forest');
    }
  }

  private to2D(flat: number[], width: number): number[][] {
    const result: number[][] = [];
    for (let y = 0; y < flat.length / width; y++) {
      result.push(flat.slice(y * width, (y + 1) * width));
    }
    return result;
  }
}
```

---

### Task 5: Dialog Manager

**Files:**
- Create: `frontend/lib/game/ui/DialogManager.ts`

- [ ] **Step 1: Create dialog box system**

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

export class DialogManager {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private lineIndex = 0;
  private active = false;
  private advanceKey: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cam = scene.cameras.main;

    // Fixed to camera (ScrollFactor 0)
    this.bg = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 70, GAME_WIDTH - 40, 120, 0x0a0a1a, 0.92)
      .setStrokeStyle(2, 0x00e5ff).setScrollFactor(0).setDepth(100).setVisible(false);

    this.nameText = scene.add.text(40, GAME_HEIGHT - 125, '', {
      fontSize: '14px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(101).setVisible(false);

    this.bodyText = scene.add.text(40, GAME_HEIGHT - 105, '', {
      fontSize: '13px', color: '#e0e0e0', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 80 },
    }).setScrollFactor(0).setDepth(101).setVisible(false);

    this.hint = scene.add.text(GAME_WIDTH - 60, GAME_HEIGHT - 25, '[E]', {
      fontSize: '11px', color: '#00e5ff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(101).setVisible(false);

    this.advanceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.container = scene.add.container(0, 0, [this.bg, this.nameText, this.bodyText, this.hint]);
  }

  show(speaker: string, lines: string[]) {
    this.lines = lines;
    this.lineIndex = 0;
    this.active = true;
    this.nameText.setText(speaker);
    this.bodyText.setText(lines[0]);
    this.bg.setVisible(true);
    this.nameText.setVisible(true);
    this.bodyText.setVisible(true);
    this.hint.setVisible(true);

    // Prevent E from immediately advancing
    this.advanceKey.reset();
  }

  update() {
    if (!this.active) return;
    if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) {
      this.lineIndex++;
      if (this.lineIndex >= this.lines.length) {
        this.close();
      } else {
        this.bodyText.setText(this.lines[this.lineIndex]);
      }
    }
  }

  close() {
    this.active = false;
    this.bg.setVisible(false);
    this.nameText.setVisible(false);
    this.bodyText.setVisible(false);
    this.hint.setVisible(false);
    // Unfreeze player
    const townScene = this.scene as any;
    if (townScene.player) townScene.player.unfreeze();
  }

  isActive(): boolean { return this.active; }
}
```

---

### Task 6: Forest Scene + Monster Encounters

**Files:**
- Create: `frontend/lib/game/scenes/ForestScene.ts`
- Create: `frontend/lib/game/maps/forestMap.ts`
- Create: `frontend/lib/game/Monster.ts`

- [ ] **Step 1: Create forest map data**

Create `frontend/lib/game/maps/forestMap.ts`:

```ts
import { tileIndex } from '../config';

const G1 = tileIndex(0, 0);
const G2 = tileIndex(1, 0);
const G3 = tileIndex(2, 0);
const PT = tileIndex(9, 0);

export function generateForestGround(): number[] {
  const map: number[] = [];
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      // Path from left to right
      if (y >= 14 && y <= 16 && x <= 35) {
        map.push(PT);
      } else if (x >= 18 && x <= 20 && y <= 14) {
        // Path north to dungeon
        map.push(PT);
      } else {
        const r = Math.random();
        map.push(r < 0.5 ? G1 : r < 0.8 ? G2 : G3);
      }
    }
  }
  return map;
}

export interface ForestObject {
  x: number; y: number; tile: number;
  collision: boolean; interact?: string; data?: any;
}

export function getForestObjects(): ForestObject[] {
  const objs: ForestObject[] = [];
  const TREE = tileIndex(3, 0);
  const PINE = tileIndex(5, 0);
  const BUSH = tileIndex(6, 0);
  const ROCK = tileIndex(8, 0);

  // Dense tree borders
  for (let x = 0; x < 40; x++) {
    for (let dy = 0; dy < 3; dy++) {
      if (!(x >= 17 && x <= 21 && dy >= 1)) { // gap for dungeon exit
        objs.push({ x, y: dy, tile: PINE, collision: true });
      }
    }
    objs.push({ x, y: 39, tile: PINE, collision: true });
  }
  for (let y = 3; y < 39; y++) {
    if (!(y >= 13 && y <= 17)) { // gap for town entrance
      objs.push({ x: 0, y, tile: PINE, collision: true });
    }
    objs.push({ x: 39, y, tile: PINE, collision: true });
  }

  // Scattered trees
  const treeSpots = [
    [5,6],[8,8],[12,5],[15,7],[25,6],[28,8],[33,5],[35,7],
    [5,20],[8,22],[12,25],[15,23],[25,20],[28,22],[33,25],[35,23],
    [5,30],[8,32],[12,35],[25,30],[28,32],[33,35],
    [10,10],[14,12],[24,10],[30,12],
    [10,18],[14,20],[24,18],[30,20],
  ];
  treeSpots.forEach(([x, y]) => {
    objs.push({ x, y, tile: Math.random() > 0.4 ? TREE : PINE, collision: true });
  });

  // Bushes & rocks
  for (let i = 0; i < 15; i++) {
    const x = 2 + Math.floor(Math.random() * 36);
    const y = 4 + Math.floor(Math.random() * 34);
    if (!(y >= 13 && y <= 17)) { // don't block path
      objs.push({ x, y, tile: Math.random() > 0.5 ? BUSH : ROCK, collision: true });
    }
  }

  // Exit arrow back to town (left edge)
  objs.push({ x: 0, y: 14, tile: tileIndex(35, 17), collision: false, interact: 'exit_town' });
  objs.push({ x: 0, y: 15, tile: tileIndex(35, 17), collision: false, interact: 'exit_town' });

  // Exit to dungeon (top, through path)
  objs.push({ x: 19, y: 1, tile: tileIndex(36, 16), collision: false, interact: 'exit_dungeon' });

  return objs;
}

// Monster spawn zones (areas where monsters can appear)
export interface SpawnZone {
  x: number; y: number; w: number; h: number;
  monsters: { type: string; tile: number; weight: number }[];
  maxActive: number;
  level: [number, number];
}

export const FOREST_SPAWNS: SpawnZone[] = [
  {
    x: 3, y: 5, w: 15, h: 8,
    monsters: [
      { type: 'skeleton', tile: tileIndex(42, 2), weight: 50 },
      { type: 'slime', tile: tileIndex(42, 3), weight: 30 },
      { type: 'bat', tile: tileIndex(46, 2), weight: 20 },
    ],
    maxActive: 4, level: [1, 5],
  },
  {
    x: 22, y: 5, w: 15, h: 8,
    monsters: [
      { type: 'skeleton', tile: tileIndex(42, 2), weight: 40 },
      { type: 'spider', tile: tileIndex(45, 2), weight: 30 },
      { type: 'ghost', tile: tileIndex(43, 2), weight: 30 },
    ],
    maxActive: 4, level: [3, 8],
  },
  {
    x: 3, y: 20, w: 34, h: 15,
    monsters: [
      { type: 'skeleton', tile: tileIndex(42, 2), weight: 30 },
      { type: 'spider', tile: tileIndex(45, 2), weight: 25 },
      { type: 'ogre', tile: tileIndex(44, 3), weight: 20 },
      { type: 'ghost', tile: tileIndex(43, 2), weight: 25 },
    ],
    maxActive: 6, level: [5, 12],
  },
];

export const FOREST_SPAWN = { x: 1, y: 15 };
```

- [ ] **Step 2: Create Monster class**

Create `frontend/lib/game/Monster.ts`:

```ts
import Phaser from 'phaser';
import { DISPLAY_TILE, SCALE } from './config';

export interface MonsterData {
  type: string;
  tile: number;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  xpReward: number;
  goldReward: number;
}

export class Monster {
  sprite: Phaser.Physics.Arcade.Sprite;
  data: MonsterData;
  private scene: Phaser.Scene;
  private moveTimer: number = 0;
  private targetX: number;
  private targetY: number;
  alive = true;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, tile: number, type: string, level: number) {
    this.scene = scene;
    const px = tileX * DISPLAY_TILE + DISPLAY_TILE / 2;
    const py = tileY * DISPLAY_TILE + DISPLAY_TILE / 2;
    this.targetX = px;
    this.targetY = py;

    this.sprite = scene.physics.add.sprite(px, py, 'tiles', tile);
    this.sprite.setScale(SCALE);
    this.sprite.setDepth(5);
    this.sprite.setImmovable(true);

    // Generate stats based on level
    const baseHp = 30 + level * 12;
    const baseAtk = 5 + level * 2.5;
    const baseDef = 3 + level * 1.5;
    const baseSpd = 3 + level * 1;
    const variance = () => 0.85 + Math.random() * 0.3; // ±15%

    this.data = {
      type, tile, level,
      maxHp: Math.floor(baseHp * variance()),
      hp: 0,
      atk: Math.floor(baseAtk * variance()),
      def: Math.floor(baseDef * variance()),
      spd: Math.floor(baseSpd * variance()),
      xpReward: 10 + level * 5,
      goldReward: 2 + Math.floor(Math.random() * level * 3),
    };
    this.data.hp = this.data.maxHp;
  }

  update(time: number) {
    if (!this.alive) return;

    // Wander randomly every 2-4 seconds
    if (time > this.moveTimer) {
      this.moveTimer = time + 2000 + Math.random() * 2000;
      const dx = (Math.random() - 0.5) * DISPLAY_TILE * 2;
      const dy = (Math.random() - 0.5) * DISPLAY_TILE * 2;
      this.targetX = this.sprite.x + dx;
      this.targetY = this.sprite.y + dy;
    }

    // Move toward target slowly
    const speed = 20;
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 4) {
      this.sprite.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      this.sprite.setFlipX(dx < 0);
    } else {
      this.sprite.setVelocity(0);
    }
  }

  destroy() {
    this.alive = false;
    this.sprite.destroy();
  }
}
```

- [ ] **Step 3: Create ForestScene**

Create `frontend/lib/game/scenes/ForestScene.ts`:

```ts
import Phaser from 'phaser';
import { MAP_WIDTH, DISPLAY_TILE, TILE_SIZE, TILE_STEP, SCALE } from '../config';
import { generateForestGround, getForestObjects, FOREST_SPAWNS, FOREST_SPAWN, SpawnZone } from '../maps/forestMap';
import { Player } from '../Player';
import { PlayerState } from '../PlayerState';
import { Monster } from '../Monster';
import { DialogManager } from '../ui/DialogManager';

const F_MAP_SIZE = 40; // forest is 40x40

export class ForestScene extends Phaser.Scene {
  player!: Player;
  colliders!: Phaser.Physics.Arcade.StaticGroup;
  monsters: Monster[] = [];
  interactables: any[] = [];
  dialog!: DialogManager;
  private spawnTimer = 0;

  constructor() {
    super({ key: 'Forest' });
  }

  create() {
    const state = PlayerState.get();
    state.lastZone = 'Forest';

    // Ground
    const groundData = generateForestGround();
    const groundMap = this.make.tilemap({
      data: this.to2D(groundData, F_MAP_SIZE),
      tileWidth: TILE_SIZE, tileHeight: TILE_SIZE,
    });
    const tileset = groundMap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, TILE_STEP);
    if (tileset) {
      const layer = groundMap.createLayer(0, tileset, 0, 0);
      if (layer) layer.setScale(SCALE);
    }

    // Colliders
    this.colliders = this.physics.add.staticGroup();
    const objects = getForestObjects();
    this.interactables = objects.filter(o => o.interact);

    for (const obj of objects) {
      const px = obj.x * DISPLAY_TILE + DISPLAY_TILE / 2;
      const py = obj.y * DISPLAY_TILE + DISPLAY_TILE / 2;
      this.add.sprite(px, py, 'tiles', obj.tile).setScale(SCALE).setDepth(obj.y);

      if (obj.collision) {
        const b = this.colliders.create(px, py, undefined) as Phaser.Physics.Arcade.Sprite;
        b.setVisible(false);
        b.body?.setSize(DISPLAY_TILE - 4, DISPLAY_TILE - 4);
        (b.body as Phaser.Physics.Arcade.StaticBody).setOffset(-(DISPLAY_TILE - 4) / 2, -(DISPLAY_TILE - 4) / 2);
      }
    }

    // Player
    const spawnX = state.spawnX || FOREST_SPAWN.x;
    const spawnY = state.spawnY || FOREST_SPAWN.y;
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, this.colliders);

    // World bounds
    const worldW = F_MAP_SIZE * DISPLAY_TILE;
    const worldH = F_MAP_SIZE * DISPLAY_TILE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.player.sprite.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Spawn initial monsters
    this.spawnMonsters();

    // Monster-player overlap → battle
    this.monsters.forEach(m => {
      this.physics.add.overlap(this.player.sprite, m.sprite, () => this.startBattle(m));
    });

    this.dialog = new DialogManager(this);
    this.events.emit('zone-change', 'Whispering Forest');
  }

  update(time: number) {
    this.player.update();
    this.dialog.update();
    this.monsters.forEach(m => m.update(time));

    if (this.player.isInteracting()) this.checkInteraction();
    this.checkExits();

    // Respawn monsters periodically
    if (time > this.spawnTimer) {
      this.spawnTimer = time + 10000;
      this.respawnMonsters();
    }
  }

  private spawnMonsters() {
    for (const zone of FOREST_SPAWNS) {
      for (let i = 0; i < zone.maxActive; i++) {
        this.spawnOneMonster(zone);
      }
    }
  }

  private spawnOneMonster(zone: SpawnZone) {
    // Weighted random monster type
    const totalWeight = zone.monsters.reduce((s, m) => s + m.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = zone.monsters[0];
    for (const m of zone.monsters) {
      roll -= m.weight;
      if (roll <= 0) { chosen = m; break; }
    }

    const tx = zone.x + Math.floor(Math.random() * zone.w);
    const ty = zone.y + Math.floor(Math.random() * zone.h);
    const level = zone.level[0] + Math.floor(Math.random() * (zone.level[1] - zone.level[0] + 1));

    const monster = new Monster(this, tx, ty, chosen.tile, chosen.type, level);
    this.monsters.push(monster);

    // Add overlap
    this.physics.add.overlap(this.player.sprite, monster.sprite, () => this.startBattle(monster));
  }

  private respawnMonsters() {
    // Count active per zone and respawn if below max
    for (const zone of FOREST_SPAWNS) {
      const active = this.monsters.filter(m => m.alive &&
        m.sprite.x >= zone.x * DISPLAY_TILE && m.sprite.x < (zone.x + zone.w) * DISPLAY_TILE &&
        m.sprite.y >= zone.y * DISPLAY_TILE && m.sprite.y < (zone.y + zone.h) * DISPLAY_TILE
      ).length;
      if (active < zone.maxActive) {
        this.spawnOneMonster(zone);
      }
    }
  }

  private startBattle(monster: Monster) {
    if (!monster.alive || this.dialog.isActive()) return;
    this.player.freeze();
    // Pass monster data to BattleScene
    this.scene.launch('Battle', { monster: monster.data, returnScene: 'Forest' });
    this.scene.pause();

    // Listen for battle end
    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.player.unfreeze();
      if (result.won) {
        monster.destroy();
        this.monsters = this.monsters.filter(m => m !== monster);
        PlayerState.get().addKill(monster.data.type);
        this.events.emit('quest-update');
        this.events.emit('hp-change');
      }
    });
  }

  private checkInteraction() {
    const facing = this.player.getFacingTile();
    const obj = this.interactables.find((o: any) => o.x === facing.x && o.y === facing.y);
    if (!obj) return;
    // No NPCs in forest yet
  }

  private checkExits() {
    const tx = this.player.tileX;
    const ty = this.player.tileY;
    const state = PlayerState.get();

    // Left edge → Town
    if (tx <= 0 && ty >= 13 && ty <= 17) {
      state.spawnX = 37;
      state.spawnY = 15;
      this.scene.start('Town');
    }

    // Top → Dungeon
    if (ty <= 1 && tx >= 17 && tx <= 21) {
      state.spawnX = 5;
      state.spawnY = 18;
      this.scene.start('Dungeon');
    }
  }

  private to2D(flat: number[], width: number): number[][] {
    const result: number[][] = [];
    for (let y = 0; y < flat.length / width; y++) {
      result.push(flat.slice(y * width, (y + 1) * width));
    }
    return result;
  }
}
```

---

### Task 7: Battle Scene (Turn-Based Combat)

**Files:**
- Create: `frontend/lib/game/scenes/BattleScene.ts`

- [ ] **Step 1: Create turn-based battle scene**

Create `frontend/lib/game/scenes/BattleScene.ts`:

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, SCALE, tileIndex } from '../config';
import { PlayerState } from '../PlayerState';
import { MonsterData } from '../Monster';

interface BattleData {
  monster: MonsterData;
  returnScene: string;
}

type BattleAction = 'attack' | 'defend' | 'skill' | 'potion';

export class BattleScene extends Phaser.Scene {
  private monster!: MonsterData;
  private returnScene!: string;
  private playerHp!: number;
  private playerMaxHp!: number;
  private playerDef!: number;
  private defending = false;

  // UI elements
  private playerSprite!: Phaser.GameObjects.Sprite;
  private monsterSprite!: Phaser.GameObjects.Sprite;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private monsterHpBar!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;
  private monsterHpText!: Phaser.GameObjects.Text;
  private monsterNameText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Container[] = [];
  private battleOver = false;
  private turn: 'player' | 'enemy' = 'player';

  constructor() {
    super({ key: 'Battle' });
  }

  init(data: BattleData) {
    this.monster = { ...data.monster };
    this.returnScene = data.returnScene;
    const state = PlayerState.get();
    this.playerHp = state.hp;
    this.playerMaxHp = state.maxHp;
    this.playerDef = state.def;
    this.defending = false;
    this.battleOver = false;
    this.turn = 'player';
  }

  create() {
    const state = PlayerState.get();

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a, 0.95).setDepth(200);

    // Title
    this.add.text(GAME_WIDTH / 2, 20, '⚔ BATTLE ⚔', {
      fontSize: '18px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(201);

    // Player sprite (left)
    this.playerSprite = this.add.sprite(180, 180, 'tiles', tileIndex(42 + ['knight','mage','archer'].indexOf(state.playerClass), 0))
      .setScale(SCALE * 2).setDepth(201);

    // Monster sprite (right)
    this.monsterSprite = this.add.sprite(620, 180, 'tiles', this.monster.tile)
      .setScale(SCALE * 2).setFlipX(true).setDepth(201);

    // Monster name & level
    this.monsterNameText = this.add.text(620, 80, `${this.monster.type.toUpperCase()} Lv.${this.monster.level}`, {
      fontSize: '13px', color: '#ff6666', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(201);

    // Player HP bar
    this.add.text(60, 290, `${state.name} Lv.${state.level}`, {
      fontSize: '12px', color: '#00e5ff', fontFamily: 'monospace',
    }).setDepth(201);
    this.add.rectangle(180, 310, 202, 18, 0x333333).setDepth(201);
    this.playerHpBar = this.add.rectangle(80, 310, 200, 16, 0x00cc66).setOrigin(0, 0.5).setDepth(202);
    this.playerHpText = this.add.text(180, 310, `${this.playerHp}/${this.playerMaxHp}`, {
      fontSize: '11px', color: '#fff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(203);

    // Monster HP bar
    this.add.text(500, 290, 'Enemy HP', {
      fontSize: '12px', color: '#ff6666', fontFamily: 'monospace',
    }).setDepth(201);
    this.add.rectangle(620, 310, 202, 18, 0x333333).setDepth(201);
    this.monsterHpBar = this.add.rectangle(520, 310, 200, 16, 0xcc3333).setOrigin(0, 0.5).setDepth(202);
    this.monsterHpText = this.add.text(620, 310, `${this.monster.hp}/${this.monster.maxHp}`, {
      fontSize: '11px', color: '#fff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(203);

    // Battle log
    this.logText = this.add.text(GAME_WIDTH / 2, 360, 'A wild enemy appears!', {
      fontSize: '12px', color: '#aaa', fontFamily: 'monospace', wordWrap: { width: 600 },
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(201);

    // Action buttons
    this.createButtons();

    // SFX
    this.playSfx('metal-click');
  }

  private createButtons() {
    const actions: { label: string; action: BattleAction; color: number }[] = [
      { label: '⚔ Attack', action: 'attack', color: 0xcc3333 },
      { label: '🛡 Defend', action: 'defend', color: 0x3366cc },
      { label: '✨ Skill', action: 'skill', color: 0xcc9900 },
      { label: '🧪 Potion', action: 'potion', color: 0x33aa33 },
    ];

    const startX = 110;
    const gap = 160;

    actions.forEach((a, i) => {
      const x = startX + i * gap;
      const y = 480;
      const bg = this.add.rectangle(x, y, 140, 50, a.color, 0.8)
        .setStrokeStyle(2, 0xffffff).setDepth(201).setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, y, a.label, {
        fontSize: '14px', color: '#fff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(202);

      bg.on('pointerover', () => bg.setFillStyle(a.color, 1));
      bg.on('pointerout', () => bg.setFillStyle(a.color, 0.8));
      bg.on('pointerdown', () => {
        if (this.turn === 'player' && !this.battleOver) this.playerAction(a.action);
      });

      const container = this.add.container(0, 0, [bg, txt]);
      this.buttons.push(container);
    });

    // Keyboard shortcuts
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ONE', () => { if (this.turn === 'player' && !this.battleOver) this.playerAction('attack'); });
      this.input.keyboard.on('keydown-TWO', () => { if (this.turn === 'player' && !this.battleOver) this.playerAction('defend'); });
      this.input.keyboard.on('keydown-THREE', () => { if (this.turn === 'player' && !this.battleOver) this.playerAction('skill'); });
      this.input.keyboard.on('keydown-FOUR', () => { if (this.turn === 'player' && !this.battleOver) this.playerAction('potion'); });
    }
  }

  private playerAction(action: BattleAction) {
    const state = PlayerState.get();
    this.turn = 'enemy';

    switch (action) {
      case 'attack': {
        const dmg = Math.max(1, state.atk - this.monster.def + Math.floor(Math.random() * 6) - 3);
        const crit = Math.random() < 0.15;
        const finalDmg = crit ? Math.floor(dmg * 1.5) : dmg;
        this.monster.hp = Math.max(0, this.monster.hp - finalDmg);
        this.updateMonsterHp();
        this.flashSprite(this.monsterSprite);
        this.playSfx('slash1');
        this.logText.setText(`You attack for ${finalDmg} damage!${crit ? ' CRITICAL!' : ''}`);
        this.defending = false;
        break;
      }
      case 'defend':
        this.defending = true;
        this.logText.setText('You brace for impact. Defense doubled this turn!');
        this.playSfx('metal-click');
        break;
      case 'skill': {
        // Power strike: 1.5x damage, costs nothing for now
        const dmg = Math.max(1, Math.floor(state.atk * 1.5) - this.monster.def + Math.floor(Math.random() * 8));
        this.monster.hp = Math.max(0, this.monster.hp - dmg);
        this.updateMonsterHp();
        this.flashSprite(this.monsterSprite);
        this.playSfx('hit-heavy1');
        this.logText.setText(`Power Strike! ${dmg} damage!`);
        this.defending = false;
        break;
      }
      case 'potion': {
        const potion = state.inventory.find(i => i.id === 'potion_hp');
        if (potion && potion.count > 0) {
          const heal = potion.stat?.hp || 40;
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal);
          state.removeItem('potion_hp');
          this.updatePlayerHp();
          this.playSfx('coins');
          this.logText.setText(`Used Health Potion! +${heal} HP (${potion.count - 1} left)`);
        } else {
          this.logText.setText('No potions left!');
          this.turn = 'player'; // don't waste turn
          return;
        }
        this.defending = false;
        break;
      }
    }

    // Check monster death
    if (this.monster.hp <= 0) {
      this.victory();
      return;
    }

    // Enemy turn after delay
    this.time.delayedCall(800, () => this.enemyTurn());
  }

  private enemyTurn() {
    if (this.battleOver) return;
    const state = PlayerState.get();
    const def = this.defending ? this.playerDef * 2 : this.playerDef;
    const dmg = Math.max(1, this.monster.atk - def + Math.floor(Math.random() * 4) - 2);
    this.playerHp = Math.max(0, this.playerHp - dmg);
    this.updatePlayerHp();
    this.flashSprite(this.playerSprite);
    this.playSfx('hit-light1');
    this.logText.setText(`${this.monster.type} attacks for ${dmg} damage!${this.defending ? ' (Blocked!)' : ''}`);

    if (this.playerHp <= 0) {
      this.defeat();
      return;
    }

    this.time.delayedCall(600, () => { this.turn = 'player'; });
  }

  private victory() {
    this.battleOver = true;
    const state = PlayerState.get();
    state.hp = this.playerHp;
    const leveled = state.addXp(this.monster.xpReward);
    state.gold += this.monster.goldReward;

    // Random potion drop
    if (Math.random() < 0.3) {
      state.addItem({
        id: 'potion_hp', name: 'Health Potion', sprite: 'potion',
        type: 'potion', stat: { hp: 40 }, stackable: true, count: 1,
      });
    }

    let msg = `Victory! +${this.monster.xpReward} XP, +${this.monster.goldReward} Gold`;
    if (leveled) msg += `\nLEVEL UP! Now level ${state.level}!`;
    this.logText.setText(msg);
    this.monsterSprite.setAlpha(0.3);

    this.time.delayedCall(2000, () => this.endBattle(true));
  }

  private defeat() {
    this.battleOver = true;
    const state = PlayerState.get();
    state.hp = Math.floor(state.maxHp * 0.3); // Respawn with 30% HP
    this.logText.setText('Defeated... You retreat to safety.');
    this.playerSprite.setAlpha(0.3);

    this.time.delayedCall(2000, () => this.endBattle(false));
  }

  private endBattle(won: boolean) {
    this.events.emit('battle-end', { won });
    this.scene.stop();
  }

  private updatePlayerHp() {
    const ratio = this.playerHp / this.playerMaxHp;
    this.playerHpBar.width = 200 * ratio;
    this.playerHpText.setText(`${this.playerHp}/${this.playerMaxHp}`);
    this.playerHpBar.setFillStyle(ratio > 0.5 ? 0x00cc66 : ratio > 0.25 ? 0xccaa00 : 0xcc3333);
  }

  private updateMonsterHp() {
    const ratio = this.monster.hp / this.monster.maxHp;
    this.monsterHpBar.width = 200 * ratio;
    this.monsterHpText.setText(`${this.monster.hp}/${this.monster.maxHp}`);
  }

  private flashSprite(sprite: Phaser.GameObjects.Sprite) {
    this.tweens.add({
      targets: sprite, alpha: 0.2, duration: 80, yoyo: true, repeat: 2,
    });
  }

  private playSfx(key: string) {
    try { this.sound.play(key, { volume: 0.4 }); } catch {}
  }
}
```

---

### Task 8: Dungeon Scene + Boss Fight

**Files:**
- Create: `frontend/lib/game/scenes/DungeonScene.ts`
- Create: `frontend/lib/game/maps/dungeonMap.ts`

- [ ] **Step 1: Create dungeon map**

Create `frontend/lib/game/maps/dungeonMap.ts`:

```ts
import { tileIndex } from '../config';

const DWALL = tileIndex(0, 6);
const DFLOOR = tileIndex(1, 6);
const TORCH = tileIndex(3, 6);
const CHEST = tileIndex(4, 6);
const BARREL = tileIndex(5, 6);

// 20×20 dungeon
const DW = 20;
const DH = 20;

export function generateDungeonGround(): number[] {
  const map: number[] = [];
  for (let y = 0; y < DH; y++) {
    for (let x = 0; x < DW; x++) {
      map.push(DFLOOR);
    }
  }
  return map;
}

export interface DungeonObject {
  x: number; y: number; tile: number;
  collision: boolean; interact?: string; data?: any;
}

export function getDungeonObjects(): DungeonObject[] {
  const objs: DungeonObject[] = [];

  // Walls — border
  for (let x = 0; x < DW; x++) {
    objs.push({ x, y: 0, tile: DWALL, collision: true });
    objs.push({ x, y: DH - 1, tile: DWALL, collision: true });
  }
  for (let y = 1; y < DH - 1; y++) {
    objs.push({ x: 0, y, tile: DWALL, collision: true });
    objs.push({ x: DW - 1, y, tile: DWALL, collision: true });
  }

  // Room 1 (entry room, bottom) — walls at y=12
  for (let x = 0; x < DW; x++) {
    if (x !== 9 && x !== 10) { // doorway
      objs.push({ x, y: 12, tile: DWALL, collision: true });
    }
  }

  // Room 2 (middle) — walls at y=6
  for (let x = 0; x < DW; x++) {
    if (x !== 9 && x !== 10) {
      objs.push({ x, y: 6, tile: DWALL, collision: true });
    }
  }

  // Room 3 (boss room, top) — y=1 to y=5

  // Torches
  const torchSpots = [[2,14],[17,14],[2,8],[17,8],[2,2],[17,2],[9,12],[10,12],[9,6],[10,6]];
  torchSpots.forEach(([x,y]) => objs.push({ x, y, tile: TORCH, collision: false }));

  // Barrels in room 1
  objs.push({ x: 3, y: 15, tile: BARREL, collision: true });
  objs.push({ x: 4, y: 15, tile: BARREL, collision: true });
  objs.push({ x: 15, y: 15, tile: BARREL, collision: true });

  // Chest in room 2
  objs.push({ x: 10, y: 9, tile: CHEST, collision: true, interact: 'chest', data: { id: 'dungeon_chest1' } });

  // Boss marker in room 3
  objs.push({
    x: 10, y: 3, tile: tileIndex(43, 3), collision: true,  // dragon sprite
    interact: 'boss', data: { id: 'frost_dragon', name: 'Frost Dragon', type: 'dragon' },
  });

  // Exit (bottom)
  objs.push({ x: 9, y: 19, tile: tileIndex(36, 18), collision: false, interact: 'exit_forest' });
  objs.push({ x: 10, y: 19, tile: tileIndex(36, 18), collision: false, interact: 'exit_forest' });

  return objs;
}

// Monster spawns for rooms 1 and 2
export const DUNGEON_MONSTERS = [
  // Room 1 monsters
  { x: 5, y: 16, type: 'skeleton', tile: tileIndex(42, 2), level: 8 },
  { x: 14, y: 14, type: 'ghost', tile: tileIndex(43, 2), level: 9 },
  { x: 8, y: 17, type: 'skeleton', tile: tileIndex(42, 2), level: 10 },
  // Room 2 monsters
  { x: 5, y: 9, type: 'demon', tile: tileIndex(44, 2), level: 12 },
  { x: 14, y: 8, type: 'spider', tile: tileIndex(45, 2), level: 11 },
  { x: 10, y: 10, type: 'ghost', tile: tileIndex(43, 2), level: 13 },
];

export const DUNGEON_SIZE = DW;
export const DUNGEON_SPAWN = { x: 10, y: 18 };

// Boss data
export const BOSS_DATA = {
  type: 'frost_dragon',
  tile: tileIndex(43, 3),
  level: 20,
  maxHp: 300,
  hp: 300,
  atk: 35,
  def: 15,
  spd: 12,
  xpReward: 300,
  goldReward: 100,
};
```

- [ ] **Step 2: Create DungeonScene**

Create `frontend/lib/game/scenes/DungeonScene.ts`:

```ts
import Phaser from 'phaser';
import { DISPLAY_TILE, TILE_SIZE, TILE_STEP, SCALE } from '../config';
import { generateDungeonGround, getDungeonObjects, DUNGEON_MONSTERS, DUNGEON_SIZE, DUNGEON_SPAWN, BOSS_DATA } from '../maps/dungeonMap';
import { Player } from '../Player';
import { PlayerState } from '../PlayerState';
import { Monster } from '../Monster';
import { DialogManager } from '../ui/DialogManager';

export class DungeonScene extends Phaser.Scene {
  player!: Player;
  colliders!: Phaser.Physics.Arcade.StaticGroup;
  monsters: Monster[] = [];
  interactables: any[] = [];
  dialog!: DialogManager;

  constructor() {
    super({ key: 'Dungeon' });
  }

  create() {
    const state = PlayerState.get();
    state.lastZone = 'Dungeon';

    // Ground
    const groundData = generateDungeonGround();
    const groundMap = this.make.tilemap({
      data: this.to2D(groundData, DUNGEON_SIZE),
      tileWidth: TILE_SIZE, tileHeight: TILE_SIZE,
    });
    const tileset = groundMap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, TILE_STEP);
    if (tileset) {
      const layer = groundMap.createLayer(0, tileset, 0, 0);
      if (layer) layer.setScale(SCALE);
    }

    // Dark overlay for dungeon atmosphere
    const worldW = DUNGEON_SIZE * DISPLAY_TILE;
    const worldH = DUNGEON_SIZE * DISPLAY_TILE;
    this.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, 0x000000, 0.3).setDepth(0.5);

    // Colliders
    this.colliders = this.physics.add.staticGroup();
    const objects = getDungeonObjects();
    this.interactables = objects.filter(o => o.interact);

    for (const obj of objects) {
      const px = obj.x * DISPLAY_TILE + DISPLAY_TILE / 2;
      const py = obj.y * DISPLAY_TILE + DISPLAY_TILE / 2;
      this.add.sprite(px, py, 'tiles', obj.tile).setScale(SCALE).setDepth(obj.y);

      if (obj.collision) {
        const b = this.colliders.create(px, py, undefined) as Phaser.Physics.Arcade.Sprite;
        b.setVisible(false);
        b.body?.setSize(DISPLAY_TILE - 4, DISPLAY_TILE - 4);
        (b.body as Phaser.Physics.Arcade.StaticBody).setOffset(-(DISPLAY_TILE - 4) / 2, -(DISPLAY_TILE - 4) / 2);
      }
    }

    // Monsters
    for (const mData of DUNGEON_MONSTERS) {
      const monster = new Monster(this, mData.x, mData.y, mData.tile, mData.type, mData.level);
      this.monsters.push(monster);
      this.physics.add.overlap(this.player?.sprite, monster.sprite, () => this.startBattle(monster));
    }

    // Player
    const spawnX = state.spawnX || DUNGEON_SPAWN.x;
    const spawnY = state.spawnY || DUNGEON_SPAWN.y;
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, this.colliders);

    // Re-add overlaps with player now that it exists
    this.monsters.forEach(m => {
      this.physics.add.overlap(this.player.sprite, m.sprite, () => this.startBattle(m));
    });

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.player.sprite.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.dialog = new DialogManager(this);
    this.events.emit('zone-change', 'Frost Dungeon');
  }

  update(time: number) {
    this.player.update();
    this.dialog.update();
    this.monsters.forEach(m => m.update(time));

    if (this.player.isInteracting()) this.checkInteraction();
    this.checkExits();
  }

  private checkInteraction() {
    const facing = this.player.getFacingTile();
    const obj = this.interactables.find((o: any) => o.x === facing.x && o.y === facing.y);
    if (!obj) return;

    const state = PlayerState.get();

    if (obj.interact === 'boss') {
      if (state.flags.has('boss_defeated')) {
        this.dialog.show('Frost Dragon', ['... (defeated)']);
      } else {
        this.dialog.show('Frost Dragon', [
          'YOU DARE ENTER MY DOMAIN?',
          'I am the guardian of the Frost Key.',
          'Prepare yourself, mortal!',
        ]);
        this.player.freeze();
        // Start boss fight after dialog
        const checkDialog = () => {
          if (!this.dialog.isActive()) {
            this.startBossFight();
          } else {
            this.time.delayedCall(100, checkDialog);
          }
        };
        this.time.delayedCall(500, checkDialog);
      }
    } else if (obj.interact === 'chest') {
      if (!state.flags.has(obj.data.id)) {
        state.flags.add(obj.data.id);
        state.addItem({
          id: 'potion_hp', name: 'Health Potion', sprite: 'potion',
          type: 'potion', stat: { hp: 40 }, stackable: true, count: 2,
        });
        state.gold += 25;
        this.dialog.show('Chest', ['Found: 2x Health Potion, 25 Gold!']);
        this.player.freeze();
        try { this.sound.play('coins', { volume: 0.5 }); } catch {}
      } else {
        this.dialog.show('Chest', ['Already opened.']);
        this.player.freeze();
      }
    }
  }

  private startBossFight() {
    this.player.freeze();
    this.scene.launch('Battle', { monster: { ...BOSS_DATA }, returnScene: 'Dungeon' });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.player.unfreeze();
      if (result.won) {
        const state = PlayerState.get();
        state.flags.add('boss_defeated');
        state.addKill('boss_frost');
        state.addItem({
          id: 'frost_key', name: 'Frost Key', sprite: 'key',
          type: 'quest', stackable: false, count: 1,
        });
        this.dialog.show('Victory!', [
          'The Frost Dragon has been defeated!',
          'You found the Frost Key!',
          'Return to Elder Frost in town.',
        ]);
        this.player.freeze();
        this.events.emit('quest-update');
        this.events.emit('hp-change');
      }
    });
  }

  private startBattle(monster: Monster) {
    if (!monster.alive || this.dialog.isActive()) return;
    this.player.freeze();
    this.scene.launch('Battle', { monster: monster.data, returnScene: 'Dungeon' });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.player.unfreeze();
      if (result.won) {
        monster.destroy();
        this.monsters = this.monsters.filter(m => m !== monster);
        PlayerState.get().addKill(monster.data.type);
        this.events.emit('quest-update');
        this.events.emit('hp-change');
      }
    });
  }

  private checkExits() {
    const ty = this.player.tileY;
    const tx = this.player.tileX;
    if (ty >= 19 && tx >= 8 && tx <= 11) {
      const state = PlayerState.get();
      state.spawnX = 19;
      state.spawnY = 3;
      this.scene.start('Forest');
    }
  }

  private to2D(flat: number[], width: number): number[][] {
    const result: number[][] = [];
    for (let y = 0; y < flat.length / width; y++) {
      result.push(flat.slice(y * width, (y + 1) * width));
    }
    return result;
  }
}
```

---

### Task 9: HUD Scene (HP, Quest Tracker, Zone Label)

**Files:**
- Create: `frontend/lib/game/scenes/HUDScene.ts`

- [ ] **Step 1: Create HUD overlay scene**

Create `frontend/lib/game/scenes/HUDScene.ts`:

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { PlayerState } from '../PlayerState';

export class HUDScene extends Phaser.Scene {
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private xpBar!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private zoneText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'HUD' });
  }

  create() {
    // HP bar (top-left)
    this.add.rectangle(12, 12, 154, 18, 0x333333).setOrigin(0).setDepth(300);
    this.hpBar = this.add.rectangle(13, 13, 152, 16, 0x00cc66).setOrigin(0).setDepth(301);
    this.hpText = this.add.text(88, 20, '', {
      fontSize: '10px', color: '#fff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(302);

    // XP bar (below HP)
    this.add.rectangle(12, 34, 154, 8, 0x222222).setOrigin(0).setDepth(300);
    this.xpBar = this.add.rectangle(13, 35, 0, 6, 0x6666ff).setOrigin(0).setDepth(301);

    // Level + Gold (top-left, below bars)
    this.levelText = this.add.text(12, 48, '', {
      fontSize: '10px', color: '#00e5ff', fontFamily: 'monospace',
    }).setDepth(300);
    this.goldText = this.add.text(12, 62, '', {
      fontSize: '10px', color: '#ffd700', fontFamily: 'monospace',
    }).setDepth(300);

    // Zone label (top-center)
    this.zoneText = this.add.text(GAME_WIDTH / 2, 12, '', {
      fontSize: '14px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(300);

    // Quest tracker (top-right)
    this.questText = this.add.text(GAME_WIDTH - 12, 12, '', {
      fontSize: '10px', color: '#aaa', fontFamily: 'monospace',
      align: 'right', wordWrap: { width: 200 },
    }).setOrigin(1, 0).setDepth(300);

    // Controls hint (bottom-left)
    this.controlsText = this.add.text(12, GAME_HEIGHT - 20, 'WASD:Move  E:Interact  1-4:Battle', {
      fontSize: '9px', color: '#555', fontFamily: 'monospace',
    }).setDepth(300);

    // Listen for events from all scenes
    const sceneKeys = ['Town', 'Forest', 'Dungeon'];
    sceneKeys.forEach(key => {
      const s = this.scene.get(key);
      if (s) {
        s.events.on('zone-change', (name: string) => this.zoneText.setText(name));
        s.events.on('hp-change', () => this.refresh());
        s.events.on('quest-update', () => this.refresh());
      }
    });

    this.refresh();
  }

  update() {
    this.refresh();
  }

  private refresh() {
    const state = PlayerState.get();

    // HP
    const hpRatio = state.hp / state.maxHp;
    this.hpBar.width = 152 * hpRatio;
    this.hpBar.setFillStyle(hpRatio > 0.5 ? 0x00cc66 : hpRatio > 0.25 ? 0xccaa00 : 0xcc3333);
    this.hpText.setText(`HP ${state.hp}/${state.maxHp}`);

    // XP
    const xpRatio = state.xp / state.xpToNext;
    this.xpBar.width = 152 * xpRatio;

    // Level + Gold
    this.levelText.setText(`Lv.${state.level} (${state.xp}/${state.xpToNext} XP)`);
    this.goldText.setText(`Gold: ${state.gold}`);

    // Quests
    const activeQuests = state.quests.filter(q => !q.turnedIn);
    if (activeQuests.length > 0) {
      const lines = activeQuests.map(q => {
        const status = q.completed ? '✓' : `${q.progress}/${q.target}`;
        return `${q.title}: ${status}`;
      });
      this.questText.setText('Quests:\n' + lines.join('\n'));
    } else {
      this.questText.setText('');
    }
  }
}
```

---

### Task 10: Wire Everything + Build Verification

**Files:**
- Verify all imports in `frontend/lib/game/PhaserGame.tsx`
- Run build

- [ ] **Step 1: Create all directory structure**

```bash
mkdir -p /Users/hts_bot/avax-arena/frontend/lib/game/scenes
mkdir -p /Users/hts_bot/avax-arena/frontend/lib/game/maps
mkdir -p /Users/hts_bot/avax-arena/frontend/lib/game/ui
```

- [ ] **Step 2: Run build and fix any TypeScript errors**

```bash
cd /Users/hts_bot/avax-arena/frontend && npx next build 2>&1 | tail -40
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Test locally**

```bash
cd /Users/hts_bot/avax-arena/frontend && npm run dev
```

Open `http://localhost:3000/avalanche/world` — verify:
- Canvas renders with town map
- WASD + Arrow keys move player
- Camera follows player
- Collision with trees/buildings works
- E key opens NPC dialog
- Walking right (exit) transitions to Forest
- Forest has wandering monsters
- Touching monster triggers battle
- Battle has 4 action buttons + keyboard 1-4
- Defeating monster gives XP/gold
- Walking north in forest → Dungeon
- Dungeon has boss at top
- HUD shows HP, level, gold, quests

- [ ] **Step 4: Deploy to production**

```bash
rsync -avz --delete --exclude='node_modules' --exclude='.env' --exclude='.env.local' --exclude='data/frostbite.db' --exclude='data/frostbite.db-shm' --exclude='data/frostbite.db-wal' -e "ssh -i ~/.ssh/id_ed25519" /Users/hts_bot/avax-arena/frontend/ root@5.189.173.167:/opt/frostbite/mainnet/frontend/
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 "cd /opt/frostbite/mainnet/frontend && npm install && npx next build && pm2 restart frostbite-mainnet"
```

Verify at `https://frostbite.pro/avalanche/world`

---

## File Summary

| File | Purpose |
|------|---------|
| `frontend/lib/game/config.ts` | Game constants, tile math, Phaser config |
| `frontend/lib/game/sprites.ts` | Sprite catalog (col,row positions) |
| `frontend/lib/game/PlayerState.ts` | Singleton: stats, inventory, quests, flags |
| `frontend/lib/game/Player.ts` | Player sprite + WASD/Arrow movement + interaction |
| `frontend/lib/game/Monster.ts` | Monster sprite + wandering AI + stat generation |
| `frontend/lib/game/PhaserGame.tsx` | React wrapper for Phaser canvas |
| `frontend/lib/game/ui/DialogManager.ts` | NPC dialog box overlay |
| `frontend/lib/game/maps/townMap.ts` | Town ground + objects + NPCs + exits |
| `frontend/lib/game/maps/forestMap.ts` | Forest ground + spawn zones + exits |
| `frontend/lib/game/maps/dungeonMap.ts` | Dungeon rooms + boss + chest + exits |
| `frontend/lib/game/scenes/BootScene.ts` | Asset loading + boot |
| `frontend/lib/game/scenes/TownScene.ts` | Town exploration, NPC quests |
| `frontend/lib/game/scenes/ForestScene.ts` | Forest combat zone, monster spawns |
| `frontend/lib/game/scenes/DungeonScene.ts` | Dungeon crawl, boss fight |
| `frontend/lib/game/scenes/BattleScene.ts` | Turn-based combat UI |
| `frontend/lib/game/scenes/HUDScene.ts` | HP/XP/quest/gold overlay |
| `frontend/app/world/page.tsx` | Next.js page shell |
