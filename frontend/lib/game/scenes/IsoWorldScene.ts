import * as Phaser from 'phaser';
import {
  generateWorld,
  WorldTile,
  Biome,
  ObjectType,
  MAP_SIZE,
  ZONES,
  ZoneInfo,
} from '../iso/terrainGen';

// ---------------------------------------------------------------------------
// Isometric constants
// ---------------------------------------------------------------------------
const TILE_W = 64;
const TILE_H = 32;
const BLOCK_H = 12;

// ---------------------------------------------------------------------------
// Biome colour palettes  (top / left-wall / right-wall)
// ---------------------------------------------------------------------------
const BIOME_COLORS: Record<number, { top: number; left: number; right: number }> = {
  [Biome.DEEP_WATER]: { top: 0x1a5c8a, left: 0x144a6e, right: 0x1a5c8a },
  [Biome.WATER]:      { top: 0x2288bb, left: 0x1a6e99, right: 0x2288bb },
  [Biome.SAND]:       { top: 0xddcc66, left: 0xbbaa44, right: 0xccbb55 },
  [Biome.GRASS]:      { top: 0x55aa44, left: 0x3d8833, right: 0x4a9938 },
  [Biome.DARK_GRASS]: { top: 0x3d8833, left: 0x2d6625, right: 0x35772c },
  [Biome.ROCK]:       { top: 0x888899, left: 0x666677, right: 0x777788 },
  [Biome.SNOW]:       { top: 0xddeeff, left: 0xbbccdd, right: 0xccddee },
  [Biome.LAVA]:       { top: 0xcc4422, left: 0xaa3311, right: 0xbb3818 },
};

// Alternate water shades for the animation tick
const WATER_ALT: Record<number, { top: number; left: number; right: number }> = {
  [Biome.DEEP_WATER]: { top: 0x1e6694, left: 0x165278, right: 0x1e6694 },
  [Biome.WATER]:      { top: 0x2694cc, left: 0x1e78aa, right: 0x2694cc },
};

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
function toScreen(tx: number, ty: number, height: number): { x: number; y: number } {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2) - height * BLOCK_H,
  };
}

function toTile(sx: number, sy: number): { tx: number; ty: number } {
  // Inverse of toScreen at height 0 — user must account for height manually
  const tx = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const ty = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return { tx: Math.floor(tx), ty: Math.floor(ty) };
}

// ---------------------------------------------------------------------------
// Zone → scene mapping
// ---------------------------------------------------------------------------
const ZONE_SCENE_MAP: Record<string, string | null> = {
  town:       'Town',
  forest:     'Forest',
  dungeon:    'Dungeon',
  icecave:    'IceCave',
  volcano:    'Volcano',
  crypt:      'Crypt',
  abyss:      'Abyss',
  sanctum:    'Sanctum',
  swamp:      'Swamp',
  mines:      'Mines',
  citadel:    'Citadel',
  necropolis: 'Necropolis',
  frostwastes:'FrostWastes',
  demongate:  'DemonGate',
  ruins:      'Ruins',
  voidrealm:  'VoidRealm',
  forge:      'Forge',
  eternal:    'Eternal',
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoWorldScene extends Phaser.Scene {
  private camKeys: {
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key;
  } | null = null;
  private world: WorldTile[][] = [];
  private terrainGfx!: Phaser.GameObjects.Graphics;
  private waterTiles: { tx: number; ty: number }[] = [];
  private waterPhase = 0;
  private waterTimer!: Phaser.Time.TimerEvent;

  // Interaction
  private selectedZone: string | null = null;
  private tooltipText: Phaser.GameObjects.Text | null = null;
  private tooltipBg: Phaser.GameObjects.Graphics | null = null;

  // Camera drag
  private dragStart: { x: number; y: number } | null = null;
  private camDragStart: { x: number; y: number } | null = null;
  private isDragging = false;

  constructor() {
    super({ key: 'IsoWorld' });
  }

  // -----------------------------------------------------------------------
  // CREATE
  // -----------------------------------------------------------------------
  create(): void {
    this.camKeys = null; // key objects belong to the previous run's keyboard plugin
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.cameras.main.setBackgroundColor(0x0a0a14);

    // Generate world data
    this.world = generateWorld();

    // Collect water tiles for animation
    this.waterTiles = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = this.world[y][x];
        if (t.biome === Biome.WATER || t.biome === Biome.DEEP_WATER) {
          this.waterTiles.push({ tx: x, ty: y });
        }
      }
    }

    // ----- Terrain rendering -----
    this.terrainGfx = this.add.graphics();
    this.drawTerrain(false);

    // ----- Objects layer -----
    this.drawObjects();

    // ----- Zone labels -----
    this.drawZoneLabels();

    // ----- HUD (fixed to camera) -----
    this.createHUD();

    // ----- Camera setup -----
    this.setupCamera();

    // ----- Input -----
    this.setupInput();

    // ----- Water animation timer -----
    this.waterTimer = this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        this.waterPhase = 1 - this.waterPhase;
        this.redrawWater();
      },
    });
  }

  // -----------------------------------------------------------------------
  // TERRAIN DRAWING
  // -----------------------------------------------------------------------
  private drawTerrain(waterOnly: boolean): void {
    const gfx = this.terrainGfx;
    if (!waterOnly) gfx.clear();

    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = this.world[y][x];
        if (waterOnly) {
          if (tile.biome !== Biome.WATER && tile.biome !== Biome.DEEP_WATER) continue;
        }
        this.drawTile(gfx, x, y, tile);
      }
    }
  }

  private redrawWater(): void {
    // Redraw only water tiles by clearing and re-rendering everything.
    // (Phaser Graphics doesn't support partial clear, so we redraw all.)
    this.terrainGfx.clear();
    this.drawTerrain(false);
  }

  private drawTile(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, tile: WorldTile): void {
    const h = tile.height;
    const pos = toScreen(tx, ty, h);
    const sx = pos.x;
    const sy = pos.y;

    const isWater = tile.biome === Biome.WATER || tile.biome === Biome.DEEP_WATER;
    let palette: { top: number; left: number; right: number };
    if (isWater && this.waterPhase === 1) {
      palette = WATER_ALT[tile.biome] ?? BIOME_COLORS[tile.biome];
    } else {
      palette = BIOME_COLORS[tile.biome] ?? BIOME_COLORS[Biome.GRASS];
    }

    const hw = TILE_W / 2; // 32
    const hh = TILE_H / 2; // 16

    // ----- Left wall -----
    const leftNeighborH = (ty + 1 < MAP_SIZE) ? this.world[ty + 1][tx].height : 0;
    if (h > leftNeighborH) {
      const wallH = (h - leftNeighborH) * BLOCK_H;
      gfx.fillStyle(palette.left, 1);
      gfx.beginPath();
      gfx.moveTo(sx - hw, sy);           // top-left of diamond
      gfx.lineTo(sx, sy + hh);           // bottom of diamond
      gfx.lineTo(sx, sy + hh + wallH);   // down by wall height
      gfx.lineTo(sx - hw, sy + wallH);   // left column base
      gfx.closePath();
      gfx.fillPath();
    }

    // ----- Right wall -----
    const rightNeighborH = (tx + 1 < MAP_SIZE) ? this.world[ty][tx + 1].height : 0;
    if (h > rightNeighborH) {
      const wallH = (h - rightNeighborH) * BLOCK_H;
      gfx.fillStyle(palette.right, 1);
      gfx.beginPath();
      gfx.moveTo(sx + hw, sy);           // top-right of diamond
      gfx.lineTo(sx, sy + hh);           // bottom of diamond
      gfx.lineTo(sx, sy + hh + wallH);   // down by wall height
      gfx.lineTo(sx + hw, sy + wallH);   // right column base
      gfx.closePath();
      gfx.fillPath();
    }

    // ----- Top face (diamond) -----
    gfx.fillStyle(palette.top, 1);
    gfx.beginPath();
    gfx.moveTo(sx, sy - hh);       // top
    gfx.lineTo(sx + hw, sy);       // right
    gfx.lineTo(sx, sy + hh);       // bottom
    gfx.lineTo(sx - hw, sy);       // left
    gfx.closePath();
    gfx.fillPath();

    // Subtle edge highlight on top face
    gfx.lineStyle(0.5, 0xffffff, 0.08);
    gfx.beginPath();
    gfx.moveTo(sx, sy - hh);
    gfx.lineTo(sx + hw, sy);
    gfx.lineTo(sx, sy + hh);
    gfx.lineTo(sx - hw, sy);
    gfx.closePath();
    gfx.strokePath();
  }

  // -----------------------------------------------------------------------
  // OBJECT DRAWING
  // -----------------------------------------------------------------------
  private drawObjects(): void {
    const objGfx = this.add.graphics();
    objGfx.setDepth(1);

    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = this.world[y][x];
        if (!tile.object) continue;
        const pos = toScreen(x, y, tile.height);
        this.drawObject(objGfx, pos.x, pos.y, tile.object);
      }
    }
  }

  private drawObject(gfx: Phaser.GameObjects.Graphics, sx: number, sy: number, obj: ObjectType): void {
    switch (obj) {
      case ObjectType.TREE_GREEN:
        this.drawTree(gfx, sx, sy, 0x44aa33, 0x55cc44, 10, 8);
        break;
      case ObjectType.TREE_PINE:
        this.drawPineTree(gfx, sx, sy);
        break;
      case ObjectType.TREE_PALM:
        this.drawTree(gfx, sx, sy, 0x886633, 0x66bb33, 8, 7);
        break;
      case ObjectType.ROCK_SMALL:
      case ObjectType.ROCK_LARGE:
        this.drawRock(gfx, sx, sy);
        break;
      case ObjectType.HOUSE:
      case ObjectType.SHOP:
      case ObjectType.INN:
        this.drawBuilding(gfx, sx, sy, 0xbb8855, 0xcc4444);
        break;
      case ObjectType.TOWER:
        this.drawBuilding(gfx, sx, sy, 0x888899, 0x5566aa);
        break;
      case ObjectType.CRYSTAL:
        this.drawCrystal(gfx, sx, sy);
        break;
      case ObjectType.LAVA_ROCK:
        this.drawRock(gfx, sx, sy);
        break;
      case ObjectType.FLOWER:
      case ObjectType.BUSH:
        this.drawBush(gfx, sx, sy);
        break;
      default:
        break;
    }
  }

  private drawTree(
    gfx: Phaser.GameObjects.Graphics,
    sx: number, sy: number,
    trunkColor: number, leafColor: number,
    leafH: number, leafW: number,
  ): void {
    // Trunk
    gfx.fillStyle(0x664422, 1);
    gfx.fillRect(sx - 1.5, sy - 14, 3, 10);
    // Leaf canopy (triangle)
    gfx.fillStyle(leafColor, 1);
    gfx.beginPath();
    gfx.moveTo(sx, sy - 14 - leafH);
    gfx.lineTo(sx + leafW / 2, sy - 14);
    gfx.lineTo(sx - leafW / 2, sy - 14);
    gfx.closePath();
    gfx.fillPath();
    // Darker inner triangle for depth
    gfx.fillStyle(trunkColor, 0.5);
    gfx.beginPath();
    gfx.moveTo(sx, sy - 14 - leafH + 3);
    gfx.lineTo(sx + leafW / 2 - 2, sy - 14);
    gfx.lineTo(sx - 1, sy - 14);
    gfx.closePath();
    gfx.fillPath();
  }

  private drawPineTree(gfx: Phaser.GameObjects.Graphics, sx: number, sy: number): void {
    // Trunk
    gfx.fillStyle(0x553311, 1);
    gfx.fillRect(sx - 1, sy - 18, 2, 14);
    // Three layers of foliage
    const layers = [
      { y: -18, w: 5, h: 6 },
      { y: -14, w: 7, h: 6 },
      { y: -10, w: 9, h: 6 },
    ];
    for (const layer of layers) {
      gfx.fillStyle(0x226633, 1);
      gfx.beginPath();
      gfx.moveTo(sx, sy + layer.y - layer.h);
      gfx.lineTo(sx + layer.w / 2, sy + layer.y);
      gfx.lineTo(sx - layer.w / 2, sy + layer.y);
      gfx.closePath();
      gfx.fillPath();
    }
  }

  private drawRock(gfx: Phaser.GameObjects.Graphics, sx: number, sy: number): void {
    gfx.fillStyle(0x777788, 1);
    gfx.beginPath();
    gfx.moveTo(sx - 4, sy - 2);
    gfx.lineTo(sx - 2, sy - 6);
    gfx.lineTo(sx + 3, sy - 5);
    gfx.lineTo(sx + 5, sy - 1);
    gfx.lineTo(sx + 2, sy + 1);
    gfx.lineTo(sx - 3, sy + 1);
    gfx.closePath();
    gfx.fillPath();
    // Highlight
    gfx.fillStyle(0x9999aa, 0.6);
    gfx.beginPath();
    gfx.moveTo(sx - 2, sy - 6);
    gfx.lineTo(sx + 3, sy - 5);
    gfx.lineTo(sx + 1, sy - 3);
    gfx.lineTo(sx - 1, sy - 4);
    gfx.closePath();
    gfx.fillPath();
  }

  private drawBuilding(
    gfx: Phaser.GameObjects.Graphics,
    sx: number, sy: number,
    wallColor: number, roofColor: number,
  ): void {
    const bw = 14;
    const bh = 16;
    const rh = 8;
    // Front wall
    gfx.fillStyle(wallColor, 1);
    gfx.fillRect(sx - bw / 2, sy - bh, bw, bh);
    // Side wall (darker)
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(wallColor).darken(20).color, 1);
    gfx.beginPath();
    gfx.moveTo(sx + bw / 2, sy - bh);
    gfx.lineTo(sx + bw / 2 + 6, sy - bh - 4);
    gfx.lineTo(sx + bw / 2 + 6, sy - 4);
    gfx.lineTo(sx + bw / 2, sy);
    gfx.closePath();
    gfx.fillPath();
    // Roof
    gfx.fillStyle(roofColor, 1);
    gfx.beginPath();
    gfx.moveTo(sx - bw / 2 - 2, sy - bh);
    gfx.lineTo(sx, sy - bh - rh);
    gfx.lineTo(sx + bw / 2 + 2, sy - bh);
    gfx.closePath();
    gfx.fillPath();
    // Roof side
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(roofColor).darken(15).color, 1);
    gfx.beginPath();
    gfx.moveTo(sx + bw / 2 + 2, sy - bh);
    gfx.lineTo(sx, sy - bh - rh);
    gfx.lineTo(sx + 6, sy - bh - rh - 4);
    gfx.lineTo(sx + bw / 2 + 8, sy - bh - 4);
    gfx.closePath();
    gfx.fillPath();
    // Door
    gfx.fillStyle(0x332211, 1);
    gfx.fillRect(sx - 2, sy - 7, 4, 7);
    // Window
    gfx.fillStyle(0xffffaa, 0.8);
    gfx.fillRect(sx - bw / 2 + 2, sy - bh + 3, 3, 3);
  }

  private drawCampfire(gfx: Phaser.GameObjects.Graphics, sx: number, sy: number): void {
    // Logs
    gfx.fillStyle(0x553311, 1);
    gfx.fillRect(sx - 4, sy - 2, 8, 2);
    gfx.fillRect(sx - 3, sy - 3, 6, 2);
    // Flame
    gfx.fillStyle(0xff6622, 0.9);
    gfx.beginPath();
    gfx.moveTo(sx, sy - 10);
    gfx.lineTo(sx + 3, sy - 3);
    gfx.lineTo(sx - 3, sy - 3);
    gfx.closePath();
    gfx.fillPath();
    // Inner flame
    gfx.fillStyle(0xffcc22, 0.9);
    gfx.beginPath();
    gfx.moveTo(sx, sy - 8);
    gfx.lineTo(sx + 1.5, sy - 3);
    gfx.lineTo(sx - 1.5, sy - 3);
    gfx.closePath();
    gfx.fillPath();
  }

  private drawCrystal(gfx: Phaser.GameObjects.Graphics, sx: number, sy: number): void {
    gfx.fillStyle(0x88ccff, 0.8);
    gfx.beginPath();
    gfx.moveTo(sx, sy - 14);
    gfx.lineTo(sx + 4, sy - 4);
    gfx.lineTo(sx, sy);
    gfx.lineTo(sx - 4, sy - 4);
    gfx.closePath();
    gfx.fillPath();
    gfx.fillStyle(0xaaeeff, 0.6);
    gfx.beginPath();
    gfx.moveTo(sx + 2, sy - 12);
    gfx.lineTo(sx + 5, sy - 5);
    gfx.lineTo(sx + 2, sy - 2);
    gfx.closePath();
    gfx.fillPath();
  }

  private drawBush(gfx: Phaser.GameObjects.Graphics, sx: number, sy: number): void {
    gfx.fillStyle(0x55aa33, 1);
    gfx.fillCircle(sx, sy - 3, 4);
    gfx.fillStyle(0x66bb44, 1);
    gfx.fillCircle(sx - 2, sy - 4, 3);
    gfx.fillCircle(sx + 2, sy - 4, 3);
  }

  // -----------------------------------------------------------------------
  // ZONE LABELS
  // -----------------------------------------------------------------------
  private drawZoneLabels(): void {
    for (const zone of ZONES) {
      const pos = toScreen(zone.cx, zone.cy, this.world[zone.cy]?.[zone.cx]?.height ?? 0);

      // Text (measure first for bg size)
      const label = this.add.text(pos.x, pos.y, zone.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(10);

      // Background rectangle (sized to text)
      const pad = 10;
      const labelBg = this.add.graphics();
      labelBg.setDepth(9);
      labelBg.fillStyle(0x0a0e1a, 0.7);
      labelBg.fillRoundedRect(pos.x - label.width / 2 - pad, pos.y - label.height / 2 - pad / 2, label.width + pad * 2, label.height + pad, 8);
      labelBg.lineStyle(1, zone.color, 0.5);
      labelBg.strokeRoundedRect(pos.x - label.width / 2 - pad, pos.y - label.height / 2 - pad / 2, label.width + pad * 2, label.height + pad, 8);
    }
  }

  // -----------------------------------------------------------------------
  // HUD (scroll-fixed overlay)
  // -----------------------------------------------------------------------
  private createHUD(): void {
    const cam = this.cameras.main;

    // Title — top left
    const title = this.add.text(20, 18, 'FROSTBITE WORLD', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#88ccff',
      stroke: '#000000',
      strokeThickness: 5,
    });
    title.setScrollFactor(0);
    title.setDepth(100);

    // Hint — bottom center
    const hint = this.add.text(cam.width / 2, cam.height - 28,
      'Click a zone to enter  |  Scroll to zoom  |  Drag to pan  |  F: Fullscreen', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#aaaacc',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      });
    hint.setOrigin(0.5, 0.5);
    hint.setScrollFactor(0);
    hint.setDepth(100);

    // Return hint — top right
    const returnHint = this.add.text(cam.width - 20, 18, 'M : Return to World', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#aaaaaa',
      stroke: '#000000',
      strokeThickness: 3,
    });
    returnHint.setOrigin(1, 0);
    returnHint.setScrollFactor(0);
    returnHint.setDepth(100);
  }

  // -----------------------------------------------------------------------
  // CAMERA
  // -----------------------------------------------------------------------
  private setupCamera(): void {
    const cam = this.cameras.main;

    // Compute world bounds in screen space
    const topLeft = toScreen(0, 0, 0);
    const topRight = toScreen(MAP_SIZE, 0, 0);
    const bottomLeft = toScreen(0, MAP_SIZE, 0);
    const bottomRight = toScreen(MAP_SIZE, MAP_SIZE, 0);

    const minX = Math.min(topLeft.x, bottomLeft.x) - 200;
    const maxX = Math.max(topRight.x, bottomRight.x) + 200;
    const minY = Math.min(topLeft.y, topRight.y) - 300;
    const maxY = Math.max(bottomLeft.y, bottomRight.y) + 200;

    cam.setBounds(minX, minY, maxX - minX, maxY - minY);

    // Center on the town zone (first zone in list, or map center)
    const townZone = ZONES.find(z => z.name === 'town') ?? ZONES[0];
    if (townZone) {
      const townH = this.world[townZone.cy]?.[townZone.cx]?.height ?? 0;
      const townPos = toScreen(townZone.cx, townZone.cy, townH);
      cam.centerOn(townPos.x, townPos.y);
    } else {
      const center = toScreen(MAP_SIZE / 2, MAP_SIZE / 2, 0);
      cam.centerOn(center.x, center.y);
    }

    cam.setZoom(0.5);
  }

  // -----------------------------------------------------------------------
  // INPUT
  // -----------------------------------------------------------------------
  private setupInput(): void {
    // --- Mouse wheel zoom ---
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: any[], _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.3, 2.0);
      cam.setZoom(newZoom);
    });

    // --- Pinch-to-zoom (mobile) ---
    let pinchStartDist = 0;
    let pinchStartZoom = 0;
    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer) => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        const dx = this.input.pointer1.x - this.input.pointer2.x;
        const dy = this.input.pointer1.y - this.input.pointer2.y;
        pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        pinchStartZoom = this.cameras.main.zoom;
      }
    });
    this.input.on('pointermove', () => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown && pinchStartDist > 0) {
        const dx = this.input.pointer1.x - this.input.pointer2.x;
        const dy = this.input.pointer1.y - this.input.pointer2.y;
        const currentDist = Math.sqrt(dx * dx + dy * dy);
        const scale = currentDist / pinchStartDist;
        const cam = this.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(pinchStartZoom * scale, 0.3, 2.0));
      }
    });
    this.input.on('pointerup', () => {
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) {
        pinchStartDist = 0;
      }
    });

    // --- Drag to pan ---
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragStart = { x: pointer.x, y: pointer.y };
      this.camDragStart = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
      this.isDragging = false;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.dragStart || !this.camDragStart) return;
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.isDragging = true;
      const cam = this.cameras.main;
      cam.scrollX = this.camDragStart.x - dx / cam.zoom;
      cam.scrollY = this.camDragStart.y - dy / cam.zoom;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) {
        this.handleClick(pointer);
      }
      this.dragStart = null;
      this.camDragStart = null;
      this.isDragging = false;
    });

    // --- Keyboard: Enter to confirm zone ---
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.selectedZone) {
        this.enterZone(this.selectedZone);
      }
    });

    // --- Keyboard: M to re-show world (useful when returning) ---
    this.input.keyboard?.on('keydown-M', () => {
      // Already in world — no-op, but keeps symmetry with sub-scenes
    });
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    // Convert to tile coords (approximate — ignores height)
    const tileCoord = toTile(worldX, worldY);
    const tx = Phaser.Math.Clamp(tileCoord.tx, 0, MAP_SIZE - 1);
    const ty = Phaser.Math.Clamp(tileCoord.ty, 0, MAP_SIZE - 1);
    const tile = this.world[ty][tx];

    // Check if tile belongs to a zone
    if (tile.zoneName) {
      if (this.selectedZone === tile.zoneName) {
        // Second click — enter the zone
        this.enterZone(tile.zoneName);
      } else {
        // First click — show tooltip
        this.selectedZone = tile.zoneName;
        this.showTooltip(worldX, worldY, tile.zoneName);
      }
    } else {
      // Clicked outside any zone — dismiss tooltip
      this.dismissTooltip();
      this.selectedZone = null;
    }
  }

  // -----------------------------------------------------------------------
  // TOOLTIP
  // -----------------------------------------------------------------------
  private showTooltip(wx: number, wy: number, zoneName: string): void {
    this.dismissTooltip();

    const zone = ZONES.find(z => z.name === zoneName);
    const displayName = zone?.label || zoneName;
    const msg = `Enter ${displayName}?\nClick again or press Enter`;

    // Text first to measure
    this.tooltipText = this.add.text(wx, wy, msg, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 6,
    });
    this.tooltipText.setOrigin(0.5, 0.5);
    this.tooltipText.setDepth(51);

    // Background sized to text
    const pad = 16;
    const tw = this.tooltipText.width + pad * 2;
    const th = this.tooltipText.height + pad * 2;
    this.tooltipBg = this.add.graphics();
    this.tooltipBg.setDepth(50);
    this.tooltipBg.fillStyle(0x0a0e1a, 0.9);
    this.tooltipBg.fillRoundedRect(wx - tw / 2, wy - th / 2, tw, th, 10);
    this.tooltipBg.lineStyle(2, 0x4488cc, 0.7);
    this.tooltipBg.strokeRoundedRect(wx - tw / 2, wy - th / 2, tw, th, 10);
  }

  private dismissTooltip(): void {
    if (this.tooltipBg) { this.tooltipBg.destroy(); this.tooltipBg = null; }
    if (this.tooltipText) { this.tooltipText.destroy(); this.tooltipText = null; }
  }

  // -----------------------------------------------------------------------
  // ZONE TRANSITION
  // -----------------------------------------------------------------------
  private enterZone(zoneId: string): void {
    const targetScene = ZONE_SCENE_MAP[zoneId];

    if (targetScene === null || targetScene === undefined) {
      // Coming soon
      this.dismissTooltip();
      this.selectedZone = null;
      this.showComingSoon(zoneId);
      return;
    }

    this.dismissTooltip();
    this.selectedZone = null;
    this.waterTimer.remove();

    // Register the fade listener BEFORE fading: if the lazy chunk import outlasts
    // the 500ms fade, a listener attached afterwards misses the one-shot event
    // and the player is stuck on a black screen.
    const fadeDone = new Promise<void>(resolve => {
      this.cameras.main.once('camerafadeoutcomplete', () => resolve());
      this.cameras.main.fadeOut(500, 0, 0, 0);
    });
    const sceneReady = import('../sceneLoader')
      .then(({ ensureScene }) => ensureScene(this.game, targetScene))
      .catch(() => false as const);

    Promise.all([fadeDone, sceneReady]).then(() => {
      this.scene.start(targetScene);
      this.scene.launch('HUD');
      import('../sceneLoader')
        .then(({ preloadNeighbors }) => preloadNeighbors(this.game, targetScene))
        .catch(() => {});
    });
  }

  private showComingSoon(zoneId: string): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const displayName = zoneId.charAt(0).toUpperCase() + zoneId.slice(1);
    const text = this.add.text(cx, cy, `${displayName} — Coming Soon`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffcc44',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    });
    text.setOrigin(0.5, 0.5);
    text.setScrollFactor(0);
    text.setDepth(200);

    // Fade out after 2 seconds
    this.tweens.add({
      targets: text,
      alpha: 0,
      duration: 1500,
      delay: 1500,
      onComplete: () => text.destroy(),
    });
  }

  // -----------------------------------------------------------------------
  // UPDATE
  // -----------------------------------------------------------------------
  update(_time: number, _delta: number): void {
    // Camera movement with arrow keys / WASD (keys cached — createCursorKeys
    // per frame allocated a fresh object 60×/s)
    const cam = this.cameras.main;
    const speed = 6 / cam.zoom;
    if (!this.camKeys && this.input.keyboard) {
      this.camKeys = {
        cursors: this.input.keyboard.createCursorKeys(),
        w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
    const k = this.camKeys;
    if (k) {
      if (k.cursors.left?.isDown || k.a.isDown)  cam.scrollX -= speed;
      if (k.cursors.right?.isDown || k.d.isDown) cam.scrollX += speed;
      if (k.cursors.up?.isDown || k.w.isDown)    cam.scrollY -= speed;
      if (k.cursors.down?.isDown || k.s.isDown)  cam.scrollY += speed;
    }
  }
}
