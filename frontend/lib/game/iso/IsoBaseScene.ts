import * as Phaser from 'phaser';
import {
  ISO_TILE_W, ISO_TILE_H, ISO_BLOCK_H,
  toScreen, toTile, isoDepth,
  ZoneTile, ZONE_BIOME_COLORS, BiomeColors, drawColumn,
  drawTopFace, drawLeftWall, drawRightWall,
} from './core';
import { PlayerState } from '../PlayerState';
import { mp } from '../multiplayer/socket';
import { RemotePlayer, RemotePlayerData } from '../multiplayer/RemotePlayer';
import { music, ZoneMusic } from '../musicSystem';
import { generateHeroTraits, drawHero, ELEMENTS, type DrawHeroOptions } from '../nft/heroGenerator';
import { HUB_INTERACT_PREFIX } from '../hub/hubGames';
import { getMonsterVisual } from './monsterSprites';
import { ZONE_ATMOSPHERE } from './zoneAtmosphere';
import { LightPool } from './lightPool';
import { ZONE_PROPS } from '../maps/zoneProps';

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------
// Isometric movement: WASD maps to grid axes (diamond pattern on screen)
// Single key  → one grid axis (diagonal on screen: ↗↖↙↘)
// Two keys    → screen cardinal (diagonal in grid: ↑→↓←)
const DIR_OFFSETS: Record<string, { dx: number; dy: number }> = {
  // Single keys (grid-aligned, standard isometric controls)
  up:    { dx: 0,  dy: -1 },  // W = iso north ↗
  down:  { dx: 0,  dy: 1 },   // S = iso south ↙
  left:  { dx: -1, dy: 0 },   // A = iso west  ↖
  right: { dx: 1,  dy: 0 },   // D = iso east  ↘
  // Two key combos (screen-aligned cardinals)
  up_left:    { dx: -1, dy: -1 },  // W+A = screen up    ↑
  up_right:   { dx: 1,  dy: -1 },  // W+D = screen right →
  down_left:  { dx: -1, dy: 1 },   // S+A = screen left  ←
  down_right: { dx: 1,  dy: 1 },   // S+D = screen down  ↓
};

const CLASS_COLORS: Record<string, number> = {
  knight: 0x4488cc,
  mage:   0x9944cc,
  archer: 0x44aa44,
};

/** Darken a hex color by a factor (0..1, lower = darker). */
function darkenColor(color: number, factor: number): number {
  const r = Math.max(0, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Lighten a hex color by a factor (>1 = lighter). */
function lightenColor(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// IsoBaseScene — shared base for all isometric zone scenes
// ---------------------------------------------------------------------------
export class IsoBaseScene extends Phaser.Scene {
  protected mapW: number = 0;
  protected mapH: number = 0;
  protected tiles: ZoneTile[][] = [];

  protected playerTx: number = 0;
  protected playerTy: number = 0;
  protected playerSprite!: Phaser.GameObjects.Container;
  protected playerMoving: boolean = false;
  protected playerFacing: string = 'down';
  protected moveSpeed: number = 150;
  private inputBufferMs: number = 0;
  private readonly INPUT_BUFFER_THRESHOLD: number = 16;
  private clickPath: { tx: number; ty: number }[] = [];
  private clickMarker: Phaser.GameObjects.Graphics | null = null;

  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  protected frozen: boolean = false;
  protected zoneMusicKey: ZoneMusic = 'town';

  // Animated character rendering
  private playerBodyGfx!: Phaser.GameObjects.Graphics;
  private playerAuraGfx!: Phaser.GameObjects.Graphics;
  private walkFrame: number = 0;
  private walkAnim: Phaser.Time.TimerEvent | null = null;
  private auraTimer: Phaser.Time.TimerEvent | null = null;
  private auraPhase: number = 0;
  private nftSpriteImage: Phaser.GameObjects.Image | null = null;
  private breathPhase: boolean = false;
  private nftWalkBobTween: Phaser.Tweens.Tween | null = null;
  private nftWalkSwayTween: Phaser.Tweens.Tween | null = null;

  // Minimap
  private minimapGfx: Phaser.GameObjects.Graphics | null = null;
  private minimapBg: Phaser.GameObjects.Graphics | null = null;
  private minimapVisible: boolean = true;
  private minimapSize: number = 140;
  private minimapPad: number = 14;

  // Objects created on the map (for cleanup)
  private objectGfxList: Phaser.GameObjects.GameObject[] = [];
  private npcContainers: Phaser.GameObjects.Container[] = [];

  // Terrain chunking + culling (world visual upgrade Task 4)
  private terrainChunks: { gfx: Phaser.GameObjects.Graphics; bounds: Phaser.Geom.Rectangle }[] = [];
  private static readonly TERRAIN_CHUNK = 16;
  protected lightPool!: LightPool;
  // Öncelikli ışıklar (portal/gate gibi tematik odaklar). Sahne, initZone'dan
  // ÖNCE bunları doldurur; initZone bunları terrain torch/lava'sından ÖNCE
  // havuza ekler, böylece bütçe dolsa bile bu ışıklar düşmez.
  protected priorityLights: { tx: number; ty: number; z?: number; color: number; radius: number }[] = [];

  // Input listener tracking (prevent leaks)
  private inputSetup: boolean = false;
  private clickSetup: boolean = false;
  private boundHandlers: { target: any; event: string; fn: Function }[] = [];

  // Active dialog cleanup (prevent stacking)
  private activeDialogCleanup: (() => void) | null = null;

  // Multiplayer — remote players
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private mpBound = false;
  /** HUD event forwarding registered once per scene instance */
  private hudForwardBound = false;
  /** [event, handler] pairs this scene registered on the mp singleton */
  private mpHandlers: Array<[string, (data?: any) => void]> = [];

  /** Register an mp listener tracked for per-scene cleanup — offAll() here would
   *  also strip the HUD ChatOverlay's listeners (chat went dead after any
   *  zone→zone transition). */
  private mpOn(event: string, fn: (data?: any) => void): void {
    this.mpHandlers.push([event, fn]);
    mp.on(event, fn);
  }
  private playerMenu: Phaser.GameObjects.Container | null = null;
  private activeBattleId: string | null = null;

  // Mobile touch controls
  protected isMobile: boolean = false;
  private touchControls: Phaser.GameObjects.Container | null = null;
  private joystickBase: Phaser.GameObjects.Graphics | null = null;
  private joystickThumb: Phaser.GameObjects.Graphics | null = null;
  private joystickPointer: Phaser.Input.Pointer | null = null;
  private joystickDir: string | null = null;
  private joystickBaseX: number = 0;
  private joystickBaseY: number = 0;
  private joystickHit: Phaser.GameObjects.Rectangle | null = null;
  private joystickDefaultX: number = 0;
  private joystickDefaultY: number = 0;

  constructor(key: string) {
    super({ key });
  }

  // -----------------------------------------------------------------------
  // initZone — called by subclass in create()
  // -----------------------------------------------------------------------
  protected initZone(tiles: ZoneTile[][], spawnTx: number, spawnTy: number): void {
    this.tiles = tiles;
    this.mapH = tiles.length;
    this.mapW = tiles.length > 0 ? tiles[0].length : 0;
    this.playerTx = spawnTx;
    this.playerTy = spawnTy;
    this.playerMoving = false;
    this.playerFacing = 'down';
    this.frozen = false;
    this.inputBufferMs = 0;
    this.activeDialogCleanup = null;

    // Forward HUD-relevant events onto the HUD's own emitter: the HUD only
    // direct-wires scenes that existed at its create() time, so lazy-loaded
    // expansion zones never reached it (zone label/HP bar didn't update).
    if (!this.hudForwardBound) {
      this.hudForwardBound = true;
      const fwd = (event: string) => (arg?: unknown) => {
        const hud = this.scene.get('HUD');
        if (hud && hud.scene.isActive()) hud.events.emit(event, arg);
      };
      this.events.on('zone-change', fwd('zone-change'));
      this.events.on('hp-change', fwd('hp-change'));
      this.events.on('quest-update', fwd('quest-update'));
    }

    this.objectGfxList = [];
    this.npcContainers = [];
    this.clickPath = [];

    // Detect mobile/touch device
    this.isMobile = this.detectMobile();

    // Clean up previous listeners before setting up new ones
    this.cleanupInputListeners();

    // Light pool must exist before renderTerrain (torch/lava cases use it)
    this.lightPool = new LightPool(this, this.isMobile ? 3 : 6);
    // Öncelikli ışıklar (portal/gate) terrain torch/lava'sından ÖNCE eklenir —
    // bütçe önceliği için (sahnenin priorityLights'ı create() içinde initZone
    // çağrısından önce doldurulur).
    for (const pl of this.priorityLights) {
      const s = toScreen(pl.tx, pl.ty, pl.z ?? 1);
      this.lightPool.add(s.x, s.y - 8, pl.color, pl.radius);
    }
    this.renderTerrain();
    this.createPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupClickToMove();
    this.addAmbientParticles();
    this.applyZoneAtmosphere();

    // Mobile: add virtual joystick + action buttons
    if (this.isMobile) {
      this.setupMobileControls();
    }

    // Minimap
    this.createMinimap();

    // Multiplayer: join zone room
    this.setupMultiplayer();

    // Play zone music
    const musicMap: Record<string, ZoneMusic> = {
      Town: 'town', IsoTownScene: 'town',
      Forest: 'forest', IsoForestScene: 'forest',
      Dungeon: 'dungeon', IsoDungeonScene: 'dungeon',
      IceCave: 'ice_cave', IsoIceCaveScene: 'ice_cave',
      Volcano: 'volcano', IsoVolcanoScene: 'volcano',
      // Expansion zones — dungeon-flavored ambience (they fell back to town music)
      Crypt: 'dungeon', Abyss: 'dungeon', Sanctum: 'volcano', Swamp: 'forest',
      Mines: 'dungeon', Citadel: 'ice_cave', Necropolis: 'dungeon',
      FrostWastes: 'ice_cave', DemonGate: 'volcano', Ruins: 'forest',
      VoidRealm: 'dungeon', Forge: 'volcano', Eternal: 'dungeon',
    };
    const zoneMusic = musicMap[this.scene.key] || 'town';
    this.zoneMusicKey = zoneMusic;
    music.play(zoneMusic);

    // HP regen: +1 HP every 3 seconds (out of combat)
    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        if (this.frozen) return;
        const s = PlayerState.get();
        if (s.hp < s.maxHp) {
          s.hp = Math.min(s.maxHp, s.hp + 1);
        }
      },
    });

    // Register scene lifecycle cleanup
    this.events.once('shutdown', () => this.onSceneShutdown());
    this.events.once('destroy', () => this.onSceneShutdown());
  }

  // -----------------------------------------------------------------------
  // Scene lifecycle cleanup — prevent listener leaks
  // -----------------------------------------------------------------------
  private onSceneShutdown(): void {
    // Clean up all tracked listeners
    this.cleanupInputListeners();

    // Clean up active dialog
    if (this.activeDialogCleanup) {
      this.activeDialogCleanup();
      this.activeDialogCleanup = null;
    }

    // Stop all running timers
    this.time.removeAllEvents();

    // Kill all tweens
    this.tweens.killAll();

    // Clear click marker
    this.clearClickMarker();

    // Stop walk animation
    if (this.walkAnim) {
      this.walkAnim.destroy();
      this.walkAnim = null;
    }

    // Destroy remote players
    for (const rp of this.remotePlayers.values()) rp.destroy();
    this.remotePlayers.clear();
    this.cleanupMultiplayer();

    // Destroy mobile controls
    if (this.touchControls) {
      this.touchControls.destroy(true);
      this.touchControls = null;
    }
    this.joystickBase = null;
    this.joystickThumb = null;
    this.joystickPointer = null;
    this.joystickDir = null;
    this.joystickHit = null;

    // Reset state
    this.inputSetup = false;
    this.clickSetup = false;
    this.clickPath = [];
    this.playerMoving = false;
    this.frozen = false;

    // Drop terrain chunk refs so cullTerrain won't touch destroyed gfx
    this.terrainChunks = [];
  }

  private cleanupInputListeners(): void {
    // Remove all tracked event handlers
    for (const h of this.boundHandlers) {
      try { h.target.off(h.event, h.fn); } catch {}
    }
    this.boundHandlers = [];
    this.inputSetup = false;
    this.clickSetup = false;
  }

  /** Register an event handler with automatic cleanup tracking */
  private trackListener(target: any, event: string, fn: Function): void {
    target.on(event, fn);
    this.boundHandlers.push({ target, event, fn });
  }

  // -----------------------------------------------------------------------
  // Terrain rendering
  // -----------------------------------------------------------------------
  private renderTerrain(): void {
    this.terrainChunks = [];
    const C = IsoBaseScene.TERRAIN_CHUNK;

    // Draw back-to-front for correct overlap; one Graphics per chunk for culling
    for (let cy = 0; cy < this.mapH; cy += C) {
      for (let cx = 0; cx < this.mapW; cx += C) {
        const gfx = this.add.graphics();
        gfx.setDepth(0);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let ty = cy; ty < Math.min(cy + C, this.mapH); ty++) {
          for (let tx = cx; tx < Math.min(cx + C, this.mapW); tx++) {
            const tile = this.tiles[ty][tx];
            const colors = ZONE_BIOME_COLORS[tile.biome] || ZONE_BIOME_COLORS['grass'];
            const screen = toScreen(tx, ty);

            // Neighbor heights for wall visibility
            const neighborLeft = ty + 1 < this.mapH ? this.tiles[ty + 1][tx].height : 0;
            const neighborRight = tx + 1 < this.mapW ? this.tiles[ty][tx + 1].height : 0;

            drawColumn(gfx, screen.x, screen.y, colors, tile.height, neighborLeft, neighborRight, tx, ty);

            // Cast shadow: sun from NW — if west neighbor (tx-1) is taller,
            // drop a shadow wedge onto the west edge of this tile's top face
            const hW = tx > 0 ? this.tiles[ty][tx - 1].height : tile.height;
            if (hW > tile.height) {
              const sy = screen.y - tile.height * ISO_BLOCK_H;
              const hw = ISO_TILE_W / 2, hh = ISO_TILE_H / 2;
              gfx.fillStyle(0x000015, Math.min(0.22, 0.11 * (hW - tile.height)));
              gfx.beginPath();
              gfx.moveTo(screen.x - hw, sy);
              gfx.lineTo(screen.x, sy - hh);
              gfx.lineTo(screen.x, sy - hh + 7);
              gfx.lineTo(screen.x - hw + 11, sy + 5);
              gfx.closePath();
              gfx.fillPath();
            }

            // Lava glow — sparse light pools over lava biome
            if (tile.biome === 'lava' && ((tx * 7 + ty * 13) % 41) === 0) {
              this.lightPool.add(screen.x, screen.y - tile.height * ISO_BLOCK_H, 0xff5522, 90);
            }

            // Ice glow — sparse cold-blue pools over ice_crystal biome
            // (IceCave / Abyss). Aynı seyreklik kalıbı, buz-mavisi ton.
            if (tile.biome === 'ice_crystal' && ((tx * 7 + ty * 13) % 41) === 0) {
              this.lightPool.add(screen.x, screen.y - tile.height * ISO_BLOCK_H, 0x66ccff, 60);
            }

            // Draw decoration objects (trees / rocks) indicated by tile data
            if (tile.data?.deco) {
              this.drawDecoration(tx, ty, tile.data.deco, tile.height);
            }

            // Zone kimlik prop'ları — görsel katman, collision'a dokunmaz.
            // Ayrı Graphics objelerine çizilir (drawDecoration), chunk gfx'ine değil.
            const props = ZONE_PROPS[this.scene.key];
            if (props && !tile.data?.deco && !tile.interact) {
              const h = (tx * 374761393 + ty * 668265263) >>> 0;
              for (const p of props) {
                if (!p.biomes.includes(tile.biome)) continue;
                // Yürünebilir (küçük zemin) prop yalnız açık tile'a; büyük prop yalnız collision tile'a
                if (p.allowWalkable ? tile.collision : !tile.collision) continue;
                if ((h % 1000) < p.density * 1000) {
                  this.drawDecoration(tx, ty, p.deco, tile.height);
                  break; // tile başına en fazla 1 prop
                }
              }
            }

            // Chunk bounding box (for culling) — wall + height padding
            minX = Math.min(minX, screen.x - ISO_TILE_W / 2);
            maxX = Math.max(maxX, screen.x + ISO_TILE_W / 2);
            minY = Math.min(minY, screen.y - tile.height * ISO_BLOCK_H - ISO_TILE_H);
            maxY = Math.max(maxY, screen.y + ISO_TILE_H + tile.height * ISO_BLOCK_H);
          }
        }
        if (minX !== Infinity) {
          this.terrainChunks.push({
            gfx,
            bounds: new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY),
          });
        }
      }
    }
  }

  /** Hide terrain chunks whose bounds are off-screen (viewport culling). */
  private cullTerrain(): void {
    const view = this.cameras.main.worldView;
    for (const ch of this.terrainChunks) {
      ch.gfx.setVisible(Phaser.Geom.Intersects.RectangleToRectangle(ch.bounds, view));
    }
  }

  /** Screen-space color wash + bottom fog band keyed to the current zone. */
  private applyZoneAtmosphere(): void {
    const atmo = ZONE_ATMOSPHERE[this.scene.key];
    if (!atmo) return;
    const w = this.scale.width, h = this.scale.height;
    const wash = this.add.graphics().setScrollFactor(0).setDepth(1500);
    wash.fillGradientStyle(atmo.tint, atmo.tint, atmo.fogColor, atmo.fogColor,
      atmo.tintAlpha, atmo.tintAlpha, 0, 0);
    wash.fillRect(0, 0, w, h);
    const fog = this.add.graphics().setScrollFactor(0).setDepth(1501);
    fog.fillGradientStyle(atmo.fogColor, atmo.fogColor, atmo.fogColor, atmo.fogColor,
      0, 0, atmo.fogAlpha, atmo.fogAlpha);
    fog.fillRect(0, h * 0.62, w, h * 0.38);
  }

  /** Draw a decoration (tree, rock, etc.) as a separate Graphics object with correct depth. */
  private drawDecoration(tx: number, ty: number, decoType: string, tileH: number): void {
    const screen = toScreen(tx, ty, tileH);
    const depth = isoDepth(tx, ty) + 2;

    switch (decoType) {
      case 'tree':
        this.drawTreeAt(tx, ty, 'pine');
        break;
      case 'tree_oak':
        this.drawTreeAt(tx, ty, 'oak');
        break;
      case 'tree_palm':
        this.drawTreeAt(tx, ty, 'palm');
        break;
      case 'rock': {
        const g = this.add.graphics();
        g.setDepth(depth);
        g.fillStyle(0x888899, 1);
        g.fillEllipse(screen.x, screen.y - 6, 18, 12);
        g.fillStyle(0x9999aa, 1);
        g.fillEllipse(screen.x - 2, screen.y - 8, 14, 9);
        this.objectGfxList.push(g);
        break;
      }
      case 'flower': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const flowerColors = [0xffdd44, 0xff88aa, 0xbb66dd, 0xff6688];
        for (let i = 0; i < 4; i++) {
          const ox = (((tx * 31 + i * 17) % 11) - 5) * 1.5;
          const oy = (((ty * 23 + i * 13) % 9) - 4) * 1.0;
          // Stem
          g.lineStyle(1, 0x44aa44, 0.8);
          g.beginPath();
          g.moveTo(screen.x + ox, screen.y - 2);
          g.lineTo(screen.x + ox, screen.y - 6 - i);
          g.strokePath();
          // Petal
          g.fillStyle(flowerColors[i % flowerColors.length], 1);
          g.fillCircle(screen.x + ox, screen.y - 7 - i, 2.2);
          // Center
          g.fillStyle(0xffff88, 1);
          g.fillCircle(screen.x + ox, screen.y - 7 - i, 0.8);
        }
        this.objectGfxList.push(g);
        break;
      }
      case 'mushroom': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Stem
        g.fillStyle(0xeeddcc, 1);
        g.fillRect(screen.x - 2, screen.y - 6, 4, 6);
        // Red cap
        g.fillStyle(0xcc2222, 1);
        g.fillEllipse(screen.x, screen.y - 8, 12, 7);
        // White dots on cap
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(screen.x - 3, screen.y - 9, 1.2);
        g.fillCircle(screen.x + 2, screen.y - 8, 1);
        g.fillCircle(screen.x, screen.y - 10, 0.8);
        this.objectGfxList.push(g);
        break;
      }
      case 'grass_tuft': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const grassColors = [0x44aa44, 0x55bb55, 0x338833, 0x66cc66];
        for (let i = 0; i < 4; i++) {
          const angle = -0.8 + i * 0.45;
          g.lineStyle(1.2, grassColors[i], 0.9);
          g.beginPath();
          g.moveTo(screen.x + (i - 1.5) * 2, screen.y);
          g.lineTo(screen.x + (i - 1.5) * 2 + Math.sin(angle) * 4, screen.y - 6 - i * 1.5);
          g.strokePath();
        }
        this.objectGfxList.push(g);
        break;
      }
      case 'torch': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Glow circle (semi-transparent orange behind)
        g.fillStyle(0xff8800, 0.12);
        g.fillCircle(screen.x, screen.y - 14, 16);
        g.fillStyle(0xff6600, 0.08);
        g.fillCircle(screen.x, screen.y - 14, 22);
        // Stick
        g.fillStyle(0x664422, 1);
        g.fillRect(screen.x - 1.5, screen.y - 12, 3, 12);
        // Flame shape (layered triangles)
        g.fillStyle(0xff4400, 0.9);
        g.fillTriangle(screen.x, screen.y - 22, screen.x - 4, screen.y - 12, screen.x + 4, screen.y - 12);
        g.fillStyle(0xffaa00, 0.9);
        g.fillTriangle(screen.x, screen.y - 20, screen.x - 2.5, screen.y - 13, screen.x + 2.5, screen.y - 13);
        g.fillStyle(0xffdd44, 0.8);
        g.fillTriangle(screen.x, screen.y - 18, screen.x - 1.5, screen.y - 14, screen.x + 1.5, screen.y - 14);
        this.objectGfxList.push(g);
        this.lightPool.add(screen.x, screen.y - 18, 0xffaa44, 70);
        break;
      }
      case 'skull': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Skull head
        g.fillStyle(0xddddcc, 1);
        g.fillCircle(screen.x, screen.y - 6, 5);
        // Jaw
        g.fillStyle(0xccccbb, 1);
        g.fillRect(screen.x - 3.5, screen.y - 3, 7, 3);
        // Eye sockets
        g.fillStyle(0x222222, 1);
        g.fillCircle(screen.x - 2, screen.y - 7, 1.3);
        g.fillCircle(screen.x + 2, screen.y - 7, 1.3);
        // Nose
        g.fillStyle(0x333333, 1);
        g.fillTriangle(screen.x, screen.y - 4, screen.x - 1, screen.y - 5.5, screen.x + 1, screen.y - 5.5);
        this.objectGfxList.push(g);
        break;
      }
      case 'barrel': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Body (brown rectangle)
        g.fillStyle(0x8B6914, 1);
        g.fillRect(screen.x - 5, screen.y - 12, 10, 12);
        // Bands (darker horizontal lines)
        g.fillStyle(0x5a4510, 1);
        g.fillRect(screen.x - 5.5, screen.y - 11, 11, 1.5);
        g.fillRect(screen.x - 5.5, screen.y - 5, 11, 1.5);
        // Oval top
        g.fillStyle(0x9B7924, 1);
        g.fillEllipse(screen.x, screen.y - 12, 12, 5);
        // Top rim
        g.lineStyle(1, 0x5a4510, 1);
        g.strokeEllipse(screen.x, screen.y - 12, 12, 5);
        this.objectGfxList.push(g);
        break;
      }
      case 'crate': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Wooden crate — top face + two side faces for a boxy 3D look
        g.fillStyle(0xa87c3f, 1);
        g.fillRect(screen.x - 6, screen.y - 11, 12, 11);
        // Side shading (right face darker)
        g.fillStyle(0x8a6530, 1);
        g.fillRect(screen.x + 2, screen.y - 11, 4, 11);
        // Slats
        g.lineStyle(1, 0x6b4d24, 0.9);
        g.strokeRect(screen.x - 6, screen.y - 11, 12, 11);
        g.beginPath();
        g.moveTo(screen.x - 6, screen.y - 6);
        g.lineTo(screen.x + 6, screen.y - 6);
        g.strokePath();
        g.beginPath();
        g.moveTo(screen.x - 6, screen.y - 11);
        g.lineTo(screen.x, screen.y - 5);
        g.strokePath();
        // Top rim highlight
        g.fillStyle(0xc79a55, 1);
        g.fillRect(screen.x - 6, screen.y - 11, 12, 2);
        this.objectGfxList.push(g);
        break;
      }
      case 'coins': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Stacked gold coin pile — 3 ellipse "stacks" of decreasing size
        const drawStack = (ox: number, count: number, w: number) => {
          for (let i = 0; i < count; i++) {
            const cy = screen.y - 2 - i * 2.2;
            g.fillStyle(0xd4a017, 1);
            g.fillEllipse(screen.x + ox, cy, w, 3.5);
            g.lineStyle(0.8, 0x8a6a10, 0.9);
            g.strokeEllipse(screen.x + ox, cy, w, 3.5);
          }
          // Top coin highlight
          g.fillStyle(0xffe066, 1);
          g.fillEllipse(screen.x + ox, screen.y - 2 - count * 2.2, w * 0.55, 2);
        };
        drawStack(-4, 3, 9);
        drawStack(3, 4, 8);
        drawStack(0, 2, 7);
        this.objectGfxList.push(g);
        break;
      }
      case 'rocket': {
        const g = this.add.graphics();
        g.setDepth(depth);
        // Small standing rocket silhouette — nose cone + body + fins + flame flicker
        const bx = screen.x, by = screen.y;
        // Fins
        g.fillStyle(0xc0392b, 1);
        g.fillTriangle(bx - 3.5, by - 6, bx - 7, by, bx - 3.5, by - 2);
        g.fillTriangle(bx + 3.5, by - 6, bx + 7, by, bx + 3.5, by - 2);
        // Body
        g.fillStyle(0xe6e9ee, 1);
        g.fillRect(bx - 3.5, by - 20, 7, 16);
        // Nose cone
        g.fillStyle(0xc0392b, 1);
        g.fillTriangle(bx - 3.5, by - 20, bx + 3.5, by - 20, bx, by - 27);
        // Window
        g.fillStyle(0x2dd4bf, 1);
        g.fillCircle(bx, by - 13, 2.2);
        g.lineStyle(0.8, 0x1a1a1a, 0.6);
        g.strokeCircle(bx, by - 13, 2.2);
        // Body seam lines
        g.lineStyle(0.6, 0xaab0bb, 0.8);
        g.beginPath(); g.moveTo(bx - 3.5, by - 8); g.lineTo(bx + 3.5, by - 8); g.strokePath();
        // Flame (drawn last, glow underneath)
        g.fillStyle(0xff8800, 0.25);
        g.fillCircle(bx, by + 1, 7);
        g.fillStyle(0xffaa33, 0.95);
        g.fillTriangle(bx, by + 9, bx - 3, by - 1, bx + 3, by - 1);
        g.fillStyle(0xffdd66, 0.9);
        g.fillTriangle(bx, by + 6, bx - 1.5, by - 1, bx + 1.5, by - 1);
        this.objectGfxList.push(g);
        break;
      }
      case 'ice_crystal': {
        // Buz kristali dekoru (Citadel / Mines / FrostWastes) — parlayan mavi
        // sivri buz + soğuk ışık havuzu.
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Glow halo behind the shard (pulsed via tween on alpha)
        const glow = this.add.graphics();
        glow.setDepth(depth - 1);
        glow.fillStyle(0x99ddff, 0.26);
        glow.fillCircle(bx, by - 12, 13);
        glow.fillStyle(0x99ddff, 0.14);
        glow.fillCircle(bx, by - 12, 19);
        // Faceted ice shard body (cool blues)
        g.fillStyle(0x5aa8e0, 1);
        g.fillTriangle(bx, by - 24, bx - 6, by - 10, bx + 6, by - 10);
        g.fillStyle(0x8fd0ff, 1);
        g.fillTriangle(bx, by - 24, bx - 6, by - 10, bx, by - 10);
        g.fillStyle(0xcbeeff, 0.95);
        g.fillTriangle(bx, by - 22, bx - 2.5, by - 11, bx + 1, by - 11);
        g.fillStyle(0x3f82c0, 1);
        g.fillTriangle(bx - 6, by - 10, bx + 6, by - 10, bx, by - 3);
        // Sparkle
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(bx - 1.5, by - 18, 1.1);
        this.objectGfxList.push(g, glow);
        this.tweens.add({
          targets: glow, alpha: { from: 1, to: 0.45 }, duration: 1500,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.lightPool.add(bx, by - 12, 0x66ccff, 55);
        break;
      }
      case 'crystal': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Small stone pedestal
        g.fillStyle(0x555566, 1);
        g.fillRect(bx - 6, by - 4, 12, 4);
        g.fillStyle(0x6b6b7d, 1);
        g.fillEllipse(bx, by - 4, 12, 3);
        // Glow halo behind the gem (pulsed via tween on alpha)
        const glow = this.add.graphics();
        glow.setDepth(depth - 1);
        glow.fillStyle(0xc084fc, 0.28);
        glow.fillCircle(bx, by - 14, 14);
        glow.fillStyle(0xc084fc, 0.16);
        glow.fillCircle(bx, by - 14, 20);
        // Faceted gem body
        g.fillStyle(0x9f5fe0, 1);
        g.fillTriangle(bx, by - 26, bx - 7, by - 12, bx + 7, by - 12);
        g.fillStyle(0xc084fc, 1);
        g.fillTriangle(bx, by - 26, bx - 7, by - 12, bx, by - 12);
        g.fillStyle(0xe0b3ff, 0.9);
        g.fillTriangle(bx, by - 24, bx - 3, by - 13, bx + 1, by - 13);
        g.fillStyle(0x7a3fc0, 1);
        g.fillTriangle(bx - 7, by - 12, bx + 7, by - 12, bx, by - 4);
        // Sparkle
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(bx - 2, by - 20, 1.1);
        this.objectGfxList.push(g, glow);
        this.tweens.add({
          targets: glow, alpha: { from: 1, to: 0.45 }, duration: 1400,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        break;
      }
      case 'banner': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Hanging pole
        g.fillStyle(0x4a3620, 1);
        g.fillRect(bx - 1, by - 22, 2, 20);
        // Gold finial
        g.fillStyle(0xd4af37, 1);
        g.fillCircle(bx, by - 22, 2);
        // Cloth banner (gold, tapered bottom point)
        g.fillStyle(0xd4af37, 0.95);
        g.beginPath();
        g.moveTo(bx - 6, by - 20);
        g.lineTo(bx + 6, by - 20);
        g.lineTo(bx + 6, by - 6);
        g.lineTo(bx, by - 2);
        g.lineTo(bx - 6, by - 6);
        g.closePath();
        g.fillPath();
        // Inner emblem stripe
        g.fillStyle(0x8a6d1f, 0.8);
        g.fillRect(bx - 6, by - 15, 12, 2);
        // Rim highlight
        g.lineStyle(0.8, 0xf5e28c, 0.7);
        g.strokeRect(bx - 6, by - 20, 12, 14);
        this.objectGfxList.push(g);
        break;
      }
      case 'flag_checkered': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Pole
        g.fillStyle(0x3a3a3a, 1);
        g.fillRect(bx - 1, by - 22, 2, 22);
        // Checkered pennant (triangle) — 3x2 grid of small squares
        const flagW = 12, flagH = 8, cell = flagW / 3;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            const isDark = (row + col) % 2 === 0;
            g.fillStyle(isDark ? 0x111111 : 0xffffff, 0.95);
            g.fillRect(bx + 1 + col * cell, by - 21 + row * (flagH / 2), cell, flagH / 2);
          }
        }
        g.lineStyle(0.8, 0x000000, 0.5);
        g.strokeRect(bx + 1, by - 21, flagW, flagH);
        this.objectGfxList.push(g);
        break;
      }
      case 'skull_post': {
        // Skull perched on a small post — warning-marker look for Battle Royale entrance
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Post
        g.fillStyle(0x4a3620, 1);
        g.fillRect(bx - 1, by - 10, 2, 10);
        // Skull head
        g.fillStyle(0xddddcc, 1);
        g.fillCircle(bx, by - 15, 5);
        g.fillStyle(0xccccbb, 1);
        g.fillRect(bx - 3.5, by - 12, 7, 3);
        g.fillStyle(0x222222, 1);
        g.fillCircle(bx - 2, by - 16, 1.3);
        g.fillCircle(bx + 2, by - 16, 1.3);
        g.fillStyle(0x333333, 1);
        g.fillTriangle(bx, by - 13, bx - 1, by - 14.5, bx + 1, by - 14.5);
        this.objectGfxList.push(g);
        break;
      }
      case 'gravestone': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Base
        g.fillStyle(0x555560, 1);
        g.fillEllipse(bx, by - 1, 12, 4);
        // Round-topped slab
        g.fillStyle(0x888892, 1);
        g.fillRect(bx - 5, by - 12, 10, 10);
        g.fillCircle(bx, by - 12, 5);
        // Shading
        g.fillStyle(0x6a6a74, 1);
        g.fillRect(bx + 2, by - 12, 3, 10);
        // Cross engraving
        g.lineStyle(1, 0x55555f, 0.9);
        g.beginPath();
        g.moveTo(bx, by - 13); g.lineTo(bx, by - 6);
        g.moveTo(bx - 2.5, by - 11); g.lineTo(bx + 2.5, by - 11);
        g.strokePath();
        this.objectGfxList.push(g);
        break;
      }
      case 'bones': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Two crossed bones (light grey)
        g.lineStyle(2, 0xd8d8cc, 1);
        g.beginPath();
        g.moveTo(bx - 5, by - 1); g.lineTo(bx + 5, by - 5);
        g.moveTo(bx - 5, by - 5); g.lineTo(bx + 5, by - 1);
        g.strokePath();
        // Bone knobs
        g.fillStyle(0xe6e6da, 1);
        g.fillCircle(bx - 5, by - 1, 1.4); g.fillCircle(bx + 5, by - 5, 1.4);
        g.fillCircle(bx - 5, by - 5, 1.4); g.fillCircle(bx + 5, by - 1, 1.4);
        // Small skull
        g.fillStyle(0xe6e6da, 1);
        g.fillCircle(bx - 1, by - 8, 3);
        g.fillStyle(0x333333, 1);
        g.fillCircle(bx - 2.2, by - 8.5, 0.8);
        g.fillCircle(bx + 0.2, by - 8.5, 0.8);
        this.objectGfxList.push(g);
        break;
      }
      case 'ice_shard': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Cluster of angular ice shards
        g.fillStyle(0x66b8e8, 0.95);
        g.fillTriangle(bx, by - 15, bx - 5, by - 1, bx + 5, by - 1);
        g.fillStyle(0x9fdcff, 0.95);
        g.fillTriangle(bx - 4, by - 9, bx - 8, by - 1, bx - 1, by - 1);
        g.fillStyle(0x9fdcff, 0.95);
        g.fillTriangle(bx + 4, by - 8, bx + 1, by - 1, bx + 8, by - 1);
        // Highlight
        g.fillStyle(0xe8f8ff, 0.85);
        g.fillTriangle(bx, by - 15, bx - 1.5, by - 6, bx + 1, by - 6);
        this.objectGfxList.push(g);
        break;
      }
      case 'lava_rock': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Dark rock
        g.fillStyle(0x2a2420, 1);
        g.fillEllipse(bx, by - 6, 18, 12);
        g.fillStyle(0x3a322c, 1);
        g.fillEllipse(bx - 2, by - 8, 13, 8);
        // Glowing lava cracks
        g.lineStyle(1.2, 0xff6622, 0.9);
        g.beginPath();
        g.moveTo(bx - 5, by - 5); g.lineTo(bx - 1, by - 8); g.lineTo(bx + 3, by - 5);
        g.strokePath();
        g.fillStyle(0xffaa33, 0.9);
        g.fillCircle(bx - 1, by - 8, 1);
        g.fillCircle(bx + 3, by - 5, 0.8);
        this.objectGfxList.push(g);
        break;
      }
      case 'ember_vent': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Cracked vent mouth
        g.fillStyle(0x1e1814, 1);
        g.fillEllipse(bx, by - 2, 12, 5);
        g.fillStyle(0xff5522, 0.8);
        g.fillEllipse(bx, by - 2, 7, 3);
        g.fillStyle(0xffcc44, 0.9);
        g.fillEllipse(bx, by - 2, 3, 1.5);
        // Rising ember glow
        const glow = this.add.graphics();
        glow.setDepth(depth - 1);
        glow.fillStyle(0xff7733, 0.5);
        glow.fillCircle(bx, by - 8, 4);
        this.objectGfxList.push(g, glow);
        this.tweens.add({
          targets: glow, alpha: { from: 0.6, to: 0.2 }, y: -3, duration: 900,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        break;
      }
      case 'mushroom_cluster': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        const caps = [
          { ox: -4, oy: 0, s: 1.0, c: 0xcc3333 },
          { ox: 3,  oy: -1, s: 0.8, c: 0x9a5a3a },
          { ox: -1, oy: -3, s: 0.7, c: 0xbb4444 },
        ];
        for (const m of caps) {
          const mx = bx + m.ox, my = by + m.oy;
          g.fillStyle(0xeaddc8, 1);
          g.fillRect(mx - 1.2, my - 5 * m.s, 2.4, 5 * m.s);
          g.fillStyle(m.c, 1);
          g.fillEllipse(mx, my - 6 * m.s, 8 * m.s, 5 * m.s);
          g.fillStyle(0xffffff, 0.8);
          g.fillCircle(mx - 1.5 * m.s, my - 7 * m.s, 0.9);
          g.fillCircle(mx + 1.5 * m.s, my - 6 * m.s, 0.7);
        }
        this.objectGfxList.push(g);
        break;
      }
      case 'fallen_log': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Horizontal log
        g.fillStyle(0x5a3d24, 1);
        g.fillEllipse(bx, by - 4, 22, 7);
        g.fillStyle(0x6e4a2c, 1);
        g.fillEllipse(bx, by - 5, 20, 5);
        // End cap rings
        g.fillStyle(0x8a6038, 1);
        g.fillEllipse(bx - 10, by - 4, 4, 6);
        g.lineStyle(0.8, 0x5a3d24, 0.9);
        g.strokeEllipse(bx - 10, by - 4, 2.5, 4);
        // Moss
        g.fillStyle(0x4a8a3a, 0.7);
        g.fillEllipse(bx + 3, by - 7, 6, 2);
        this.objectGfxList.push(g);
        break;
      }
      case 'swamp_reed': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        const reeds = [-4, -1, 2, 5];
        for (let i = 0; i < reeds.length; i++) {
          const rx = bx + reeds[i];
          const h = 10 + ((tx * 13 + ty * 7 + i * 5) % 5);
          g.lineStyle(1.2, i % 2 === 0 ? 0x4a7a3a : 0x5c8c46, 0.95);
          g.beginPath();
          g.moveTo(rx, by);
          g.lineTo(rx + (i % 2 === 0 ? 1 : -1), by - h);
          g.strokePath();
          // Seed head
          g.fillStyle(0x6a4a2a, 0.9);
          g.fillEllipse(rx + (i % 2 === 0 ? 1 : -1), by - h, 1.6, 3);
        }
        this.objectGfxList.push(g);
        break;
      }
      case 'crystal_small': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Small purple crystal shard
        g.fillStyle(0x8a4fd0, 1);
        g.fillTriangle(bx, by - 12, bx - 4, by - 1, bx + 4, by - 1);
        g.fillStyle(0xb47fe8, 1);
        g.fillTriangle(bx, by - 12, bx - 4, by - 1, bx, by - 1);
        g.fillStyle(0xd8b8ff, 0.9);
        g.fillTriangle(bx, by - 10, bx - 1.5, by - 3, bx + 0.5, by - 3);
        // Sparkle
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(bx - 1, by - 8, 0.9);
        this.objectGfxList.push(g);
        break;
      }
      case 'pebbles': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        const pebs = [
          { ox: -4, oy: 0, r: 2.2 },
          { ox: 2,  oy: -1, r: 1.8 },
          { ox: 5,  oy: 1, r: 1.4 },
        ];
        for (const p of pebs) {
          g.fillStyle(0x555560, 1);
          g.fillEllipse(bx + p.ox, by + p.oy, p.r * 2, p.r * 1.4);
          g.fillStyle(0x6a6a74, 1);
          g.fillEllipse(bx + p.ox - 0.5, by + p.oy - 0.5, p.r * 1.4, p.r);
        }
        this.objectGfxList.push(g);
        break;
      }
      case 'ruin_pillar': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Base
        g.fillStyle(0x777782, 1);
        g.fillRect(bx - 6, by - 4, 12, 4);
        g.fillStyle(0x8a8a95, 1);
        g.fillEllipse(bx, by - 4, 12, 3);
        // Broken column shaft (angled top break)
        g.fillStyle(0x9a9aa4, 1);
        g.beginPath();
        g.moveTo(bx - 4, by - 4);
        g.lineTo(bx + 4, by - 4);
        g.lineTo(bx + 4, by - 16);
        g.lineTo(bx - 4, by - 12);
        g.closePath();
        g.fillPath();
        // Shading + fluting
        g.lineStyle(0.8, 0x6a6a74, 0.7);
        g.beginPath();
        g.moveTo(bx - 1, by - 4); g.lineTo(bx - 1, by - 13);
        g.moveTo(bx + 2, by - 4); g.lineTo(bx + 2, by - 14);
        g.strokePath();
        // Toppled capital piece on the ground
        g.fillStyle(0x88888f, 1);
        g.fillEllipse(bx + 8, by - 2, 8, 4);
        this.objectGfxList.push(g);
        break;
      }
      case 'void_wisp': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Translucent purple orb
        g.fillStyle(0xaa66ff, 0.4);
        g.fillCircle(bx, by - 8, 6);
        g.fillStyle(0xcc99ff, 0.5);
        g.fillCircle(bx, by - 8, 3.5);
        g.fillStyle(0xeeddff, 0.7);
        g.fillCircle(bx, by - 8, 1.6);
        this.objectGfxList.push(g);
        this.tweens.add({
          targets: g, alpha: { from: 0.9, to: 0.35 }, duration: 1600,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        break;
      }
      case 'anvil_scrap': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Anvil silhouette
        g.fillStyle(0x33333a, 1);
        g.fillRect(bx - 3, by - 4, 6, 4);            // base
        g.fillRect(bx - 5, by - 8, 10, 3);           // body
        g.beginPath();                               // horn + top
        g.moveTo(bx - 5, by - 11);
        g.lineTo(bx + 5, by - 11);
        g.lineTo(bx + 8, by - 9.5);
        g.lineTo(bx + 5, by - 8);
        g.lineTo(bx - 5, by - 8);
        g.closePath();
        g.fillPath();
        g.fillStyle(0x4a4a52, 1);
        g.fillRect(bx - 5, by - 11, 10, 1);
        // Spark
        g.fillStyle(0xffcc44, 0.95);
        g.fillCircle(bx + 6, by - 12, 1);
        g.fillStyle(0xff8822, 0.8);
        g.fillCircle(bx + 4, by - 13, 0.7);
        this.objectGfxList.push(g);
        break;
      }
      case 'coral': {
        const g = this.add.graphics();
        g.setDepth(depth);
        const bx = screen.x, by = screen.y;
        // Branching coral
        g.lineStyle(2, 0xe8734a, 0.95);
        g.beginPath();
        g.moveTo(bx, by); g.lineTo(bx, by - 8);
        g.moveTo(bx, by - 5); g.lineTo(bx - 5, by - 10);
        g.moveTo(bx, by - 6); g.lineTo(bx + 5, by - 11);
        g.strokePath();
        g.lineStyle(2, 0xf29ac0, 0.9);
        g.beginPath();
        g.moveTo(bx - 5, by - 10); g.lineTo(bx - 6, by - 14);
        g.moveTo(bx + 5, by - 11); g.lineTo(bx + 6, by - 15);
        g.moveTo(bx, by - 8); g.lineTo(bx, by - 13);
        g.strokePath();
        // Polyp tips
        g.fillStyle(0xffc0d8, 0.95);
        g.fillCircle(bx - 6, by - 14, 1.3);
        g.fillCircle(bx + 6, by - 15, 1.3);
        g.fillCircle(bx, by - 13, 1.3);
        this.objectGfxList.push(g);
        break;
      }
      default:
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Player creation
  // -----------------------------------------------------------------------
  private createPlayer(): void {
    const ps = PlayerState.get();
    const screen = toScreen(this.playerTx, this.playerTy, this.getTileHeight(this.playerTx, this.playerTy));
    const container = this.add.container(screen.x, screen.y);

    // Sync NFT data from window global (set by WorldLoginGate) into PlayerState
    const heroNft = (window as any).__frostbiteHero;
    if (heroNft && heroNft.tokenId > 0) {
      ps.nftTokenId = heroNft.tokenId;
      ps.nftElement = heroNft.element;
      ps.nftRarity = heroNft.rarity;
      ps.useNftSprite = true;
      ps.atk = heroNft.atk;
      ps.def = heroNft.def;
      ps.spd = heroNft.spd;
      ps.save();
    }

    // Import NFT items into inventory (ERC-1155)
    const nftItems = (window as any).__frostbiteItems;
    if (nftItems && Array.isArray(nftItems) && nftItems.length > 0) {
      const CATEGORY_NAMES = ['weapon', 'armor', 'accessory', 'armor', 'ring']; // helmet→accessory, shield→armor
      const CATEGORY_LABELS = ['NFT Weapon', 'NFT Armor', 'NFT Helmet', 'NFT Shield', 'NFT Ring'];
      const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
      const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

      for (const item of nftItems) {
        const nftItemId = `nft_item_${item.tokenId}`;
        // Skip if already imported
        if (ps.inventory.some(inv => inv.id === nftItemId)) continue;

        const type = CATEGORY_NAMES[item.category] || 'accessory';
        const label = CATEGORY_LABELS[item.category] || 'NFT Item';
        const elemName = ELEMENT_NAMES[item.element] || '';
        const rarityName = RARITY_NAMES[item.rarity] || '';

        ps.inventory.push({
          id: nftItemId,
          name: `${rarityName} ${elemName} ${label}`,
          sprite: type,
          type: type as any,
          stat: {
            ...(item.atk > 0 ? { atk: item.atk } : {}),
            ...(item.def > 0 ? { def: item.def } : {}),
            ...(item.spd > 0 ? { spd: item.spd } : {}),
          },
          stackable: false,
          count: 1,
        });
      }
      ps.save();
      console.log('[NFT Items] Imported', nftItems.length, 'items into inventory');
    }

    // NFT hero — generate pixel art from heroGenerator (same as mint page)
    if (ps.nftTokenId > 0 && ps.nftElement >= 0) {
      const textureKey = `nft_hero_${ps.nftTokenId}`;

      // Generate texture if not cached
      if (!this.textures.exists(textureKey)) {
        try {
          const element = ELEMENTS[ps.nftElement] || 'fire';
          const rarityNames = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
          const rarity = rarityNames[Math.min(ps.nftRarity, 4)];

          // Use tokenId as seed — same visual every time
          const traits = generateHeroTraits(ps.nftTokenId, element);
          // Override rarity with actual on-chain rarity
          traits.rarity = rarity;
          // Ensure epic+ features
          if (ps.nftRarity >= 3) { traits.eyeGlow = true; traits.hasAura = true; }
          if (ps.nftRarity >= 4) { traits.hasCape = true; }

          const canvas = document.createElement('canvas');
          drawHero(canvas, traits, { transparent: true });
          this.textures.addCanvas(textureKey, canvas);
        } catch (e) {
          console.warn('[NFT] Failed to generate hero texture:', e);
        }
      }

      // Aura layer (behind sprite)
      this.playerAuraGfx = this.add.graphics();
      container.add(this.playerAuraGfx);

      if (this.textures.exists(textureKey)) {
        const sprite = this.add.image(0, -24, textureKey);
        sprite.setDisplaySize(56, 56);
        container.add(sprite);
        this.nftSpriteImage = sprite;
      }

      // Weapon overlay on top of sprite
      this.playerBodyGfx = this.add.graphics();
      container.add(this.playerBodyGfx);

      // NFT aura animation
      this.auraPhase = 0;
      this.auraTimer = this.time.addEvent({
        delay: 80,
        loop: true,
        callback: () => {
          this.auraPhase = (this.auraPhase + 1) % 40;
          this.redrawNftAura();
        },
      });
      this.redrawNftAura();
    } else {
      // Non-NFT: Animated character drawn with Graphics API
      this.playerAuraGfx = this.add.graphics();
      container.add(this.playerAuraGfx);

      this.playerBodyGfx = this.add.graphics();
      container.add(this.playerBodyGfx);
      this.walkFrame = 0;
      this.redrawPlayerBody();
    }

    // Name label
    const label = this.add.text(0, 12, ps.name, {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(label);

    container.setDepth(isoDepth(this.playerTx, this.playerTy) + 5);
    this.playerSprite = container;

    // Idle breathing — while standing still, gentle sway (NFT sprite: scale, non-NFT: bodyBob)
    // Cleaned up by onSceneShutdown -> time.removeAllEvents()
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        if (this.playerMoving || this.frozen) return;
        this.breathPhase = !this.breathPhase;
        if (this.nftSpriteImage) {
          this.nftSpriteImage.setDisplaySize(56, this.breathPhase ? 55 : 56);
        } else {
          this.redrawPlayerBody();
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // NFT Element Colors & Rarity config
  // -----------------------------------------------------------------------
  private static readonly NFT_ELEM_COLORS: Record<number, number> = {
    0: 0xcc3300, // Fire
    1: 0x2266cc, // Water
    2: 0x22aa44, // Wind
    3: 0x44bbdd, // Ice
    4: 0x886622, // Earth
    5: 0xddaa00, // Thunder
    6: 0x662288, // Shadow
    7: 0xddddaa, // Light
  };

  private static readonly RARITY_GLOW: { color: number; alpha: number; radius: number; stars: number }[] = [
    { color: 0x888888, alpha: 0,    radius: 0,  stars: 0 }, // Common
    { color: 0x44bb44, alpha: 0.15, radius: 18, stars: 1 }, // Uncommon
    { color: 0x4488ff, alpha: 0.2,  radius: 22, stars: 2 }, // Rare
    { color: 0xaa44ff, alpha: 0.3,  radius: 26, stars: 3 }, // Epic
    { color: 0xffaa00, alpha: 0.4,  radius: 30, stars: 4 }, // Legendary
  ];

  // -----------------------------------------------------------------------
  // NFT Aura effect (animated, drawn on separate graphics behind body)
  // -----------------------------------------------------------------------
  private redrawNftAura(): void {
    const ps = PlayerState.get();
    const gfx = this.playerAuraGfx;
    if (!gfx || ps.nftElement < 0) return;
    gfx.clear();

    const rarity = Math.min(ps.nftRarity, 4);
    const cfg = IsoBaseScene.RARITY_GLOW[rarity];
    if (cfg.alpha <= 0) return;

    const phase = this.auraPhase;
    const pulse = Math.sin(phase * Math.PI / 20) * 0.5 + 0.5; // 0..1

    const elemColor = IsoBaseScene.NFT_ELEM_COLORS[ps.nftElement] ?? 0x4488cc;

    // Outer glow ring (rarity color, pulsing)
    const glowR = cfg.radius + pulse * 4;
    gfx.fillStyle(cfg.color, cfg.alpha * (0.5 + pulse * 0.5));
    gfx.fillEllipse(0, -12, glowR * 2, glowR * 1.2);

    // Inner element glow (element color)
    gfx.fillStyle(elemColor, cfg.alpha * 0.4 * (0.6 + pulse * 0.4));
    gfx.fillEllipse(0, -12, glowR * 1.2, glowR * 0.8);

    // Element particles orbiting (2-4 based on rarity)
    const particleCount = Math.max(2, rarity + 1);
    for (let i = 0; i < particleCount; i++) {
      const angle = (phase * 0.15) + (i * Math.PI * 2 / particleCount);
      const orbitX = Math.cos(angle) * (12 + rarity * 2);
      const orbitY = Math.sin(angle) * (6 + rarity) - 14;
      const pSize = 1.5 + rarity * 0.5;
      gfx.fillStyle(elemColor, 0.6 + pulse * 0.4);
      gfx.fillCircle(orbitX, orbitY, pSize);
      // Particle trail
      const trailAngle = angle - 0.4;
      const trailX = Math.cos(trailAngle) * (12 + rarity * 2);
      const trailY = Math.sin(trailAngle) * (6 + rarity) - 14;
      gfx.fillStyle(elemColor, 0.2);
      gfx.fillCircle(trailX, trailY, pSize * 0.6);
    }
  }

  // -----------------------------------------------------------------------
  // Animated character body redraw
  // -----------------------------------------------------------------------
  private redrawPlayerBody(): void {
    const ps = PlayerState.get();
    const gfx = this.playerBodyGfx;
    if (!gfx) return;
    gfx.clear();

    const isNft = ps.nftTokenId > 0 && ps.nftElement >= 0;
    const rarity = isNft ? Math.min(ps.nftRarity, 4) : 0;

    // --- Determine colors ---
    const bodyColor = isNft
      ? (IsoBaseScene.NFT_ELEM_COLORS[ps.nftElement] ?? 0x4488cc)
      : (CLASS_COLORS[ps.playerClass] ?? 0x4488cc);

    const skinColor = ps.skinColor || 0xffddbb;
    const facingLeft = this.playerFacing.includes('left');
    const facingUp = this.playerFacing === 'up' || this.playerFacing === 'up_left' || this.playerFacing === 'up_right';
    const fx = facingLeft ? -1 : 1;

    // --- Walk animation offsets (6-frame cycle) ---
    const f = this.walkFrame % 6;
    const legL = [0, -3, -5, 0, 3, 5][f];
    const legR = [0, 3, 5, 0, -3, -5][f];
    const armF = [0, -2, -4, 0, 2, 4][f];
    const armB = [0, 2, 4, 0, -2, -4][f];
    // Idle breathing — when standing still, gentle whole-body rise/fall
    const breathOffset = (!this.playerMoving && this.breathPhase) ? -0.6 : 0;
    const bodyBob = [0, -1, -1.5, 0, -1, -1.5][f] + breathOffset;

    const legColor = darkenColor(bodyColor, 0.65);
    const armColor = darkenColor(bodyColor, 0.85);
    const beltColor = darkenColor(bodyColor, 0.5);
    const bootColor = darkenColor(bodyColor, 0.45);

    // --- Rarity visual multipliers ---
    const rarityGlow = IsoBaseScene.RARITY_GLOW[rarity];

    // ─── 1. SHADOW (rarity affects shadow color) ───
    if (isNft && rarity >= 2) {
      gfx.fillStyle(rarityGlow.color, 0.15);
      gfx.fillEllipse(0, 8, 34, 14);
    }
    gfx.fillStyle(0x000000, 0.25);
    gfx.fillEllipse(0, 8, 30, 12);

    // ─── 2. BACK ARM ───
    gfx.fillStyle(armColor, 1);
    gfx.fillRoundedRect(-10 * fx, -20 + bodyBob + armB, 5, 14, 2);
    gfx.fillStyle(skinColor, 1);
    gfx.fillCircle(-8 * fx, -6 + bodyBob + armB, 3);

    // Shield on back arm
    const armorId = ps.equipped.armor?.id ?? '';
    if (armorId === 'iron_shield') {
      gfx.fillStyle(0x778899, 1);
      gfx.fillRoundedRect(-14 * fx, -18 + bodyBob + armB, 8 * fx, 12, 2);
      gfx.fillStyle(0x99aabb, 0.5);
      gfx.fillRoundedRect(-13 * fx, -16 + bodyBob + armB, 4 * fx, 7, 1);
      gfx.lineStyle(1, 0x556677, 0.8);
      gfx.strokeRoundedRect(-14 * fx, -18 + bodyBob + armB, 8 * fx, 12, 2);
    }

    // ─── 3. LEGS ───
    gfx.fillStyle(legColor, 1);
    gfx.fillRoundedRect(-5, -2 + legL, 4, 10, 1);
    gfx.fillStyle(bootColor, 1);
    gfx.fillRect(-5.5, 6 + legL, 5, 3);
    gfx.fillStyle(legColor, 1);
    gfx.fillRoundedRect(1, -2 + legR, 4, 10, 1);
    gfx.fillStyle(bootColor, 1);
    gfx.fillRect(0.5, 6 + legR, 5, 3);

    // ─── NFT: Boot trim (rarity ≥ Rare) ───
    if (isNft && rarity >= 2) {
      gfx.fillStyle(rarityGlow.color, 0.6);
      gfx.fillRect(-5.5, 5.5 + legL, 5, 1);
      gfx.fillRect(0.5, 5.5 + legR, 5, 1);
    }

    // ─── 4. BODY / TORSO ───
    gfx.fillStyle(bodyColor, 1);
    gfx.fillRoundedRect(-9, -22 + bodyBob, 18, 20, 3);

    // Body highlight
    gfx.fillStyle(lightenColor(bodyColor, 1.3), 0.2);
    gfx.fillRoundedRect(-8, -20 + bodyBob, 7, 14, 2);

    // ─── 5. ARMOR / NFT ELEMENT PATTERN ───
    if (isNft) {
      // Element-specific armor pattern on torso
      const elem = ps.nftElement;
      const patternColor = lightenColor(bodyColor, 1.5);

      if (elem === 0) {
        // Fire — flame lick marks
        gfx.lineStyle(1, 0xff6622, 0.5);
        for (let i = 0; i < 3; i++) {
          const bx = -5 + i * 5;
          gfx.beginPath(); gfx.moveTo(bx, -4 + bodyBob); gfx.lineTo(bx + 1, -10 + bodyBob); gfx.lineTo(bx + 2, -6 + bodyBob); gfx.strokePath();
        }
      } else if (elem === 1) {
        // Water — wave lines
        gfx.lineStyle(1, 0x66bbff, 0.4);
        for (let row = 0; row < 3; row++) {
          const ly = -18 + bodyBob + row * 5;
          gfx.beginPath();
          for (let x = -6; x <= 6; x += 2) { gfx.lineTo(x, ly + Math.sin(x + row) * 1.5); }
          gfx.strokePath();
        }
      } else if (elem === 2) {
        // Wind — swirl marks
        gfx.lineStyle(0.8, 0x88ff88, 0.4);
        gfx.beginPath(); gfx.arc(0, -12 + bodyBob, 5, 0, Math.PI * 1.5, false); gfx.strokePath();
        gfx.beginPath(); gfx.arc(2, -14 + bodyBob, 3, 0.5, Math.PI * 1.2, false); gfx.strokePath();
      } else if (elem === 3) {
        // Ice — crystal shards
        gfx.fillStyle(0xaaeeff, 0.4);
        gfx.fillTriangle(-4, -8 + bodyBob, -2, -16 + bodyBob, 0, -8 + bodyBob);
        gfx.fillTriangle(2, -6 + bodyBob, 4, -14 + bodyBob, 6, -6 + bodyBob);
      } else if (elem === 4) {
        // Earth — rock plates
        gfx.fillStyle(lightenColor(bodyColor, 1.3), 0.4);
        gfx.fillRoundedRect(-7, -20 + bodyBob, 6, 5, 1);
        gfx.fillRoundedRect(1, -16 + bodyBob, 6, 5, 1);
        gfx.fillRoundedRect(-5, -10 + bodyBob, 5, 4, 1);
      } else if (elem === 5) {
        // Thunder — lightning bolts
        gfx.lineStyle(1.5, 0xffee44, 0.5);
        gfx.beginPath(); gfx.moveTo(-3, -18 + bodyBob); gfx.lineTo(1, -12 + bodyBob); gfx.lineTo(-2, -12 + bodyBob); gfx.lineTo(3, -6 + bodyBob); gfx.strokePath();
      } else if (elem === 6) {
        // Shadow — dark mist wisps
        gfx.fillStyle(0x000000, 0.2);
        gfx.fillEllipse(-3, -14 + bodyBob, 8, 4);
        gfx.fillEllipse(3, -10 + bodyBob, 6, 3);
        gfx.fillStyle(0xaa44ff, 0.15);
        gfx.fillEllipse(0, -12 + bodyBob, 10, 6);
      } else if (elem === 7) {
        // Light — radiant cross
        gfx.lineStyle(1, 0xffffcc, 0.4);
        gfx.beginPath(); gfx.moveTo(0, -18 + bodyBob); gfx.lineTo(0, -6 + bodyBob); gfx.strokePath();
        gfx.beginPath(); gfx.moveTo(-5, -12 + bodyBob); gfx.lineTo(5, -12 + bodyBob); gfx.strokePath();
        gfx.fillStyle(0xffffdd, 0.3);
        gfx.fillCircle(0, -12 + bodyBob, 3);
      }

      // Rarity armor trim (border lines on torso)
      if (rarity >= 1) {
        gfx.lineStyle(1, rarityGlow.color, 0.5 + rarity * 0.1);
        gfx.strokeRoundedRect(-9, -22 + bodyBob, 18, 20, 3);
      }
    } else {
      // Non-NFT armor overlays (existing)
      if (armorId === 'chain_armor') {
        const cc = lightenColor(bodyColor, 1.4);
        gfx.lineStyle(1, cc, 0.45);
        for (let row = 0; row < 6; row++) {
          const ly = -20 + bodyBob + row * 3;
          gfx.beginPath(); gfx.moveTo(-7, ly); gfx.lineTo(7, ly); gfx.strokePath();
        }
      } else if (armorId === 'dragon_scale') {
        gfx.lineStyle(1, 0x44aaaa, 0.4);
        for (let row = 0; row < 6; row++) {
          const ly = -21 + bodyBob + row * 3;
          gfx.beginPath(); gfx.moveTo(-7, ly); gfx.lineTo(7, ly + 4); gfx.strokePath();
        }
        gfx.lineStyle(1, 0x338888, 0.3);
        for (let row = 0; row < 6; row++) {
          const ly = -21 + bodyBob + row * 3;
          gfx.beginPath(); gfx.moveTo(7, ly); gfx.lineTo(-7, ly + 4); gfx.strokePath();
        }
      }
    }

    // ─── 6. BELT ───
    gfx.fillStyle(beltColor, 1);
    gfx.fillRect(-9, -4 + bodyBob, 18, 3);
    // Belt buckle — rarity color if NFT
    gfx.fillStyle(isNft ? rarityGlow.color : 0xccaa44, 1);
    gfx.fillRect(-2, -4 + bodyBob, 4, 3);

    // ─── NFT: Shoulder pauldrons (level-based) ───
    if (isNft) {
      const tierLevel = Math.min(Math.floor(ps.level / 10), 6); // 0-6 tiers
      if (tierLevel >= 1) {
        // Pauldrons grow with level
        const pSize = 3 + tierLevel;
        const pColor = darkenColor(bodyColor, 0.6);
        // Left pauldron
        gfx.fillStyle(pColor, 1);
        gfx.fillEllipse(-10 * fx, -20 + bodyBob, pSize, pSize * 0.6);
        gfx.lineStyle(0.5, rarityGlow.color, 0.4);
        gfx.strokeEllipse(-10 * fx, -20 + bodyBob, pSize, pSize * 0.6);
        // Right pauldron
        gfx.fillStyle(pColor, 1);
        gfx.fillEllipse(10 * fx, -20 + bodyBob, pSize, pSize * 0.6);
        gfx.lineStyle(0.5, rarityGlow.color, 0.4);
        gfx.strokeEllipse(10 * fx, -20 + bodyBob, pSize, pSize * 0.6);
      }
    }

    // ─── 7. FRONT ARM + WEAPON ───
    gfx.fillStyle(armColor, 1);
    gfx.fillRoundedRect(6 * fx, -20 + bodyBob + armF, 5, 14, 2);
    gfx.fillStyle(skinColor, 1);
    gfx.fillCircle(8 * fx, -6 + bodyBob + armF, 3);

    // Weapon in front hand
    const weaponId = ps.equipped.weapon?.id ?? '';
    if (weaponId && !facingUp) {
      const wx = 8 * fx;
      const wy = -8 + bodyBob + armF;
      this.drawWeapon(gfx, weaponId, wx, wy, false);
    } else if (weaponId && facingUp) {
      gfx.lineStyle(2.5, 0x999999, 0.5);
      gfx.beginPath();
      gfx.moveTo(3 * fx, -10 + bodyBob);
      gfx.lineTo(3 * fx, -28 + bodyBob);
      gfx.strokePath();
    }

    // ─── 8. HEAD ───
    gfx.fillStyle(skinColor, 1);
    gfx.fillCircle(0, -28 + bodyBob, 8);

    // ─── 9. HAIR ───
    const defaultHairC: Record<string, number> = { knight: 0x443322, mage: 0xccccdd, archer: 0x668833 };
    gfx.fillStyle(ps.hairColor || defaultHairC[ps.playerClass] || 0x553322, 1);
    gfx.beginPath();
    gfx.arc(0, -30 + bodyBob, 8, Math.PI, 0, false);
    gfx.closePath();
    gfx.fillPath();

    // ─── 10. FACE ───
    if (!facingUp) {
      gfx.fillStyle(0xffffff, 1);
      gfx.fillCircle(-3 * fx, -29 + bodyBob, 2);
      gfx.fillCircle(3 * fx, -29 + bodyBob, 2);
      // NFT eye color matches element
      gfx.fillStyle(isNft ? bodyColor : 0x222222, 1);
      gfx.fillCircle(-3 * fx, -29 + bodyBob, 1);
      gfx.fillCircle(3 * fx, -29 + bodyBob, 1);
      gfx.lineStyle(0.8, 0xcc9988, 1);
      gfx.beginPath();
      gfx.arc(0, -25 + bodyBob, 2, 0.3, Math.PI - 0.3, false);
      gfx.strokePath();
    }

    // ─── 11. HEADGEAR (element-based for NFT, class-based otherwise) ───
    if (isNft) {
      // NFT headgear based on element
      const elem = ps.nftElement;
      if (elem === 0) {
        // Fire — flame crown
        gfx.fillStyle(0xff4400, 0.8);
        gfx.fillTriangle(-4, -36 + bodyBob, -2, -42 + bodyBob, 0, -36 + bodyBob);
        gfx.fillTriangle(-1, -36 + bodyBob, 1, -44 + bodyBob, 3, -36 + bodyBob);
        gfx.fillTriangle(2, -36 + bodyBob, 4, -40 + bodyBob, 6, -36 + bodyBob);
        gfx.fillStyle(0xffaa00, 0.5);
        gfx.fillTriangle(-2, -36 + bodyBob, 0, -40 + bodyBob, 2, -36 + bodyBob);
      } else if (elem === 1) {
        // Water — flowing crest
        gfx.fillStyle(0x2288ff, 0.7);
        gfx.fillEllipse(0, -36 + bodyBob, 14, 4);
        gfx.fillStyle(0x66bbff, 0.5);
        gfx.fillEllipse(0, -37 + bodyBob, 10, 2);
      } else if (elem === 2) {
        // Wind — feathered band
        gfx.fillStyle(0x44cc44, 0.7);
        gfx.fillRoundedRect(-6, -36 + bodyBob, 12, 3, 1);
        gfx.fillStyle(0x88ff88, 0.5);
        gfx.fillTriangle(5, -36 + bodyBob, 8, -42 + bodyBob, 7, -34 + bodyBob);
      } else if (elem === 3) {
        // Ice — crystal tiara
        gfx.fillStyle(0x88ddff, 0.7);
        gfx.fillRoundedRect(-5, -36 + bodyBob, 10, 3, 1);
        gfx.fillStyle(0xaaeeff, 0.8);
        gfx.fillTriangle(-1, -36 + bodyBob, 0, -42 + bodyBob, 1, -36 + bodyBob);
        gfx.fillStyle(0xccffff, 0.6);
        gfx.fillCircle(0, -42 + bodyBob, 1.5);
      } else if (elem === 4) {
        // Earth — stone helm
        gfx.fillStyle(0x997733, 0.8);
        gfx.fillRoundedRect(-7, -36 + bodyBob, 14, 5, 2);
        gfx.fillStyle(0xbb9944, 0.5);
        gfx.fillRoundedRect(-5, -38 + bodyBob, 10, 3, 1);
      } else if (elem === 5) {
        // Thunder — spark crown
        gfx.fillStyle(0xffdd00, 0.7);
        gfx.fillRoundedRect(-6, -36 + bodyBob, 12, 3, 1);
        // Lightning bolt spikes
        gfx.lineStyle(1.5, 0xffee44, 0.8);
        gfx.beginPath(); gfx.moveTo(-3, -36 + bodyBob); gfx.lineTo(-1, -42 + bodyBob); gfx.lineTo(1, -38 + bodyBob); gfx.lineTo(3, -44 + bodyBob); gfx.strokePath();
      } else if (elem === 6) {
        // Shadow — dark hood
        gfx.fillStyle(0x221133, 0.9);
        gfx.beginPath();
        gfx.arc(0, -30 + bodyBob, 10, Math.PI + 0.3, -0.3, false);
        gfx.closePath();
        gfx.fillPath();
        gfx.fillStyle(0x442266, 0.4);
        gfx.fillEllipse(0, -33 + bodyBob, 16, 4);
      } else if (elem === 7) {
        // Light — halo
        gfx.lineStyle(1.5, 0xffffaa, 0.6);
        gfx.strokeEllipse(0, -38 + bodyBob, 16, 5);
        gfx.fillStyle(0xffffcc, 0.2);
        gfx.fillEllipse(0, -38 + bodyBob, 14, 4);
      }
    } else {
      // Non-NFT class headgear
      if (ps.playerClass === 'knight') {
        gfx.fillStyle(0x88aacc, 1);
        gfx.fillRoundedRect(-6, -36 + bodyBob, 12, 4, 1);
        gfx.fillStyle(0x6699bb, 1);
        gfx.fillRoundedRect(-4, -38 + bodyBob, 8, 3, 1);
        if (!facingUp) {
          gfx.fillStyle(0x334455, 1);
          gfx.fillRect(-4, -35 + bodyBob, 8, 1.5);
        }
      } else if (ps.playerClass === 'mage') {
        gfx.fillStyle(bodyColor, 1);
        gfx.fillTriangle(0, -48 + bodyBob, -8, -32 + bodyBob, 8, -32 + bodyBob);
        gfx.fillStyle(darkenColor(bodyColor, 0.7), 1);
        gfx.fillEllipse(0, -32 + bodyBob, 20, 6);
        gfx.fillStyle(0xffdd44, 0.8);
        gfx.fillCircle(0, -47 + bodyBob, 2);
      } else if (ps.playerClass === 'archer') {
        gfx.fillStyle(darkenColor(bodyColor, 0.75), 1);
        gfx.beginPath();
        gfx.arc(0, -30 + bodyBob, 9, Math.PI + 0.2, -0.2, false);
        gfx.closePath();
        gfx.fillPath();
      }
    }

    // ─── 12. NFT RARITY STARS (above head) ───
    if (isNft && rarityGlow.stars > 0) {
      const starY = (isNft ? -46 : -40) + bodyBob;
      const totalW = (rarityGlow.stars - 1) * 6;
      for (let i = 0; i < rarityGlow.stars; i++) {
        const sx = -totalW / 2 + i * 6;
        gfx.fillStyle(rarityGlow.color, 0.9);
        gfx.fillCircle(sx, starY, 1.5);
        gfx.fillStyle(0xffffff, 0.6);
        gfx.fillCircle(sx, starY, 0.7);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Draw weapon shape on graphics
  // -----------------------------------------------------------------------
  private drawWeapon(gfx: Phaser.GameObjects.Graphics, weaponId: string, wx: number, wy: number, facingUp: boolean): void {
    if (facingUp) {
      // Weapon on back — draw a simple line behind head
      gfx.lineStyle(2, 0x999999, 0.6);
      gfx.beginPath();
      gfx.moveTo(wx, wy + 4);
      gfx.lineTo(wx, wy - 12);
      gfx.strokePath();
      return;
    }

    // Blade colors by weapon type
    let bladeColor = 0xaabbcc; // default iron gray
    let bladeLength = 12;
    let glowAlpha = 0;

    switch (weaponId) {
      case 'iron_sword':
        bladeColor = 0xaabbcc;
        break;
      case 'steel_sword':
        bladeColor = 0xddeeff;
        glowAlpha = 0.3;
        break;
      case 'flame_sword':
        bladeColor = 0xff6622;
        glowAlpha = 0.25;
        break;
      case 'ice_blade':
        bladeColor = 0x66ddff;
        glowAlpha = 0.25;
        break;
      case 'shadow_dagger':
        bladeColor = 0x9944cc;
        bladeLength = 8;
        break;
      default:
        // Generic weapon
        bladeColor = 0xaabbcc;
        break;
    }

    // Glow effect for magic weapons
    if (glowAlpha > 0) {
      gfx.fillStyle(bladeColor, glowAlpha);
      gfx.fillCircle(wx, wy - bladeLength / 2, bladeLength * 0.6);
    }

    // Blade (thin rectangle)
    gfx.fillStyle(bladeColor, 1);
    gfx.fillRect(wx - 1, wy - bladeLength, 2, bladeLength);

    // Crossguard
    gfx.fillStyle(0x886644, 1);
    gfx.fillRect(wx - 3, wy, 6, 2);

    // Handle
    gfx.fillStyle(0x664422, 1);
    gfx.fillRect(wx - 1, wy + 2, 3, 4);

    // Hilt wrap band (darker grip detail)
    gfx.fillStyle(0x3a2612, 1);
    gfx.fillRect(wx - 1, wy + 3.5, 3, 1);

    // Magic/enchanted weapons — pulsing point of light at the blade tip
    if (glowAlpha > 0) {
      const tipPulse = 0.4 + Math.abs(Math.sin(this.walkFrame * Math.PI / 6)) * 0.4; // 0.4..0.8
      gfx.fillStyle(0xffffff, tipPulse);
      gfx.fillCircle(wx, wy - bladeLength, 1.2);
    }
  }

  // -----------------------------------------------------------------------
  // Draw armor overlay on body
  // -----------------------------------------------------------------------
  private drawArmorOverlay(gfx: Phaser.GameObjects.Graphics, armorId: string, bodyColor: number): void {
    switch (armorId) {
      case 'iron_shield': {
        // Shield on off-arm (left side)
        gfx.fillStyle(0x889999, 1);
        gfx.fillRoundedRect(-14, -18, 7, 10, 2);
        // Shield highlight
        gfx.fillStyle(0xaabbbb, 0.4);
        gfx.fillRoundedRect(-13, -17, 3, 6, 1);
        break;
      }
      case 'chain_armor': {
        // Chain-mail pattern: horizontal lines over body, slightly lighter
        const chainColor = lightenColor(bodyColor, 1.3);
        gfx.lineStyle(1, chainColor, 0.5);
        for (let row = 0; row < 5; row++) {
          const ly = -18 + row * 3;
          gfx.beginPath();
          gfx.moveTo(-6, ly);
          gfx.lineTo(6, ly);
          gfx.strokePath();
        }
        break;
      }
      case 'dragon_scale': {
        // Scale pattern: diagonal lines in blue-green
        gfx.lineStyle(1, 0x44aaaa, 0.5);
        for (let row = 0; row < 6; row++) {
          const ly = -19 + row * 3;
          gfx.beginPath();
          gfx.moveTo(-7, ly);
          gfx.lineTo(7, ly + 4);
          gfx.strokePath();
        }
        // Second set (opposite diagonal)
        gfx.lineStyle(1, 0x338888, 0.35);
        for (let row = 0; row < 6; row++) {
          const ly = -19 + row * 3;
          gfx.beginPath();
          gfx.moveTo(7, ly);
          gfx.lineTo(-7, ly + 4);
          gfx.strokePath();
        }
        break;
      }
      default: {
        // Generic armor: two horizontal accent lines
        const accentColor = lightenColor(bodyColor, 1.2);
        gfx.lineStyle(1, accentColor, 0.4);
        gfx.beginPath();
        gfx.moveTo(-6, -14);
        gfx.lineTo(6, -14);
        gfx.strokePath();
        gfx.beginPath();
        gfx.moveTo(-6, -8);
        gfx.lineTo(6, -8);
        gfx.strokePath();
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Camera setup
  // -----------------------------------------------------------------------
  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.startFollow(this.playerSprite, true, 0.08, 0.08);
    cam.setZoom(1.2);

    // Compute bounds of the full iso map
    const topLeft = toScreen(0, 0);
    const topRight = toScreen(this.mapW - 1, 0);
    const bottomLeft = toScreen(0, this.mapH - 1);
    const bottomRight = toScreen(this.mapW - 1, this.mapH - 1);
    const padding = 200;

    const minX = Math.min(topLeft.x, bottomLeft.x) - padding;
    const maxX = Math.max(topRight.x, bottomRight.x) + padding;
    const minY = Math.min(topLeft.y, topRight.y) - padding - 5 * ISO_BLOCK_H;
    const maxY = Math.max(bottomLeft.y, bottomRight.y) + padding + 5 * ISO_BLOCK_H;

    cam.setBounds(minX, minY, maxX - minX, maxY - minY);

    // Scroll wheel zoom
    this.input.on('wheel', (_pointer: any, _gx: any, _gy: any, _gz: any, deltaY: number) => {
      const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.6, 2.5);
      cam.setZoom(newZoom);
    });

    // F key fullscreen toggle
    if (this.input.keyboard) {
      const fKey = this.input.keyboard.addKey('F');
      const onFKey = () => {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
        } else {
          this.scale.startFullscreen();
        }
      };
      this.trackListener(fKey, 'down', onFKey);
    }
  }

  // -----------------------------------------------------------------------
  // Input setup
  // -----------------------------------------------------------------------
  private setupInput(): void {
    if (!this.input.keyboard || this.inputSetup) return;
    this.inputSetup = true;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard.addKey('W'),
      A: this.input.keyboard.addKey('A'),
      S: this.input.keyboard.addKey('S'),
      D: this.input.keyboard.addKey('D'),
    };
    this.interactKey = this.input.keyboard.addKey('E');

    // M key — return to world map (suppressed while typing in chat: "im coming"
    // must not teleport the player to the world map)
    const mKey = this.input.keyboard.addKey('M');
    const onMKey = () => { if (!this.frozen && !this.registry.get('chatInputOpen')) this.goToWorld(); };
    this.trackListener(mKey, 'down', onMKey);

    // I key — open inventory via the HUD (the old 'toggle-inventory' emit had
    // no listener anywhere; the key was advertised in the help text but dead)
    const iKey = this.input.keyboard.addKey('I');
    const onIKey = () => {
      if (this.frozen || this.registry.get('chatInputOpen')) return;
      const hud = this.scene.get('HUD') as any;
      hud?.openInventory?.();
    };
    this.trackListener(iKey, 'down', onIKey);

    // Reset keys when browser loses focus (prevent stuck keys on alt-tab)
    const onBlur = () => this.resetKeyStates();
    window.addEventListener('blur', onBlur);
    this.events.once('shutdown', () => window.removeEventListener('blur', onBlur));
    this.events.once('destroy', () => window.removeEventListener('blur', onBlur));
  }

  // -----------------------------------------------------------------------
  // Update loop
  // -----------------------------------------------------------------------
  update(_time: number, _delta: number): void {
    this.cullTerrain();

    // Safety: if playerMoving is stuck (tween was destroyed), force reset
    if (this.playerMoving && this.playerSprite && !this.tweens.isTweening(this.playerSprite)) {
      this.playerMoving = false;
      if (this.walkAnim) { this.walkAnim.destroy(); this.walkAnim = null; }
    }

    if (this.frozen || this.playerMoving) return;
    // While the chat input is open, keystrokes belong to the message — don't
    // walk (WASD) or interact (E)
    if (this.registry.get('chatInputOpen')) return;

    // Read current key states
    const kUp = this.cursors?.up.isDown || this.wasd?.W?.isDown;
    const kDown = this.cursors?.down.isDown || this.wasd?.S?.isDown;
    const kLeft = this.cursors?.left.isDown || this.wasd?.A?.isDown;
    const kRight = this.cursors?.right.isDown || this.wasd?.D?.isDown;
    const anyMovementKey = kUp || kDown || kLeft || kRight;

    // Mobile joystick input
    const joystickActive = this.isMobile && this.joystickDir !== null;
    const anyInput = anyMovementKey || joystickActive;

    if (!anyInput) {
      this.inputBufferMs = 0;
    } else {
      // Cancel click-path when player uses keyboard/joystick
      if (this.clickPath.length > 0) {
        this.clickPath = [];
        this.clearClickMarker();
      }
      // Keys/joystick held → accumulate buffer time, then resolve direction
      this.inputBufferMs += _delta;

      if (this.inputBufferMs >= this.INPUT_BUFFER_THRESHOLD) {
        // Determine direction with all currently held keys or joystick
        let dir: string | null = null;

        if (joystickActive) {
          dir = this.joystickDir;
        } else {
          if (kUp && kRight) dir = 'up_right';
          else if (kUp && kLeft) dir = 'up_left';
          else if (kDown && kRight) dir = 'down_right';
          else if (kDown && kLeft) dir = 'down_left';
          else if (kUp) dir = 'up';
          else if (kDown) dir = 'down';
          else if (kLeft) dir = 'left';
          else if (kRight) dir = 'right';
        }

        if (dir) {
          this.playerFacing = dir;
          const offset = DIR_OFFSETS[dir];
          const targetTx = this.playerTx + offset.dx;
          const targetTy = this.playerTy + offset.dy;

          if (this.canMoveTo(targetTx, targetTy)) {
            this.movePlayerTo(targetTx, targetTy);
          }
        }
        this.inputBufferMs = 0;
      }
    }

    // Interaction check — proximity-based (check current tile + all 8 neighbors)
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      // First check tile player is standing on
      if (this.inBounds(this.playerTx, this.playerTy)) {
        const standTile = this.tiles[this.playerTy][this.playerTx];
        if (standTile.interact && !standTile.interact.startsWith('exit_')) {
          this.dispatchInteract(standTile, this.playerTx, this.playerTy);
          return;
        }
      }
      // Then check all 8 neighbors
      const neighbors = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
      ];
      for (const n of neighbors) {
        const ntx = this.playerTx + n.dx;
        const nty = this.playerTy + n.dy;
        if (this.inBounds(ntx, nty)) {
          const tile = this.tiles[nty][ntx];
          if (tile.interact && !tile.interact.startsWith('exit_')) {
            this.dispatchInteract(tile, ntx, nty);
            return;
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Movement
  // -----------------------------------------------------------------------
  private canMoveTo(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    return !this.tiles[ty][tx].collision;
  }

  private inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && tx < this.mapW && ty >= 0 && ty < this.mapH;
  }

  private movePlayerTo(tx: number, ty: number): void {
    this.playerMoving = true;

    // Update target tile immediately so pathfinding uses correct position
    const prevTx = this.playerTx;
    const prevTy = this.playerTy;
    this.playerTx = tx;
    this.playerTy = ty;

    // Broadcast movement to other players
    mp.sendMove(tx, ty, this.playerFacing);

    const targetH = this.getTileHeight(tx, ty);
    const target = toScreen(tx, ty, targetH);

    // Start walk animation (cycle through frames while moving)
    if (this.walkAnim) {
      this.walkAnim.destroy();
      this.walkAnim = null;
    }
    const ps = PlayerState.get();
    const hasNftSprite = ps.nftTokenId > 0 && ps.nftElement >= 0;
    if (!hasNftSprite) {
      this.walkAnim = this.time.addEvent({
        delay: 80,
        repeat: Math.ceil(this.moveSpeed / 80),
        callback: () => {
          this.walkFrame = (this.walkFrame + 1) % 6;
          this.redrawPlayerBody();
        },
      });
    }

    // NFT hero walk effects: bob, dust particles, body sway
    if (hasNftSprite && this.nftSpriteImage) {
      const nftImg = this.nftSpriteImage;
      const originalY = nftImg.y;

      // Stop any previous walk tweens
      if (this.nftWalkBobTween) { this.nftWalkBobTween.destroy(); this.nftWalkBobTween = null; }
      if (this.nftWalkSwayTween) { this.nftWalkSwayTween.destroy(); this.nftWalkSwayTween = null; }

      // Bob animation: -3px up, back, -3px up, back — two cycles over move duration
      this.nftWalkBobTween = this.tweens.add({
        targets: nftImg,
        y: { from: originalY, to: originalY - 3 },
        duration: this.moveSpeed / 4,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
      });

      // Body sway: scaleX oscillation 1.0 → 0.95 → 1.0 → 1.05 → 1.0
      this.nftWalkSwayTween = this.tweens.add({
        targets: nftImg,
        scaleX: { from: 1.0, to: 0.95 },
        duration: this.moveSpeed / 4,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
        onYoyo: () => {
          // After first yoyo (back to 1.0), next cycle goes to 1.05
          if (this.nftWalkSwayTween) {
            this.nftWalkSwayTween.updateTo('scaleX', 1.05);
          }
        },
      });

      // Dust particles at feet
      const dustCount = 2 + Math.floor(Math.random() * 2); // 2-3 particles
      for (let i = 0; i < dustCount; i++) {
        const dust = this.add.circle(
          this.playerSprite.x + (Math.random() - 0.5) * 12,
          this.playerSprite.y + 8 + Math.random() * 4,
          2,
          0xbbaa88,
          0.4,
        );
        dust.setDepth(this.playerSprite.depth - 1);
        this.tweens.add({
          targets: dust,
          x: dust.x + (Math.random() - 0.5) * 16,
          y: dust.y - 4 - Math.random() * 6,
          alpha: 0,
          duration: 300,
          ease: 'Power1',
          onComplete: () => { dust.destroy(); },
        });
      }
    }

    this.tweens.add({
      targets: this.playerSprite,
      x: target.x,
      y: target.y,
      duration: this.moveSpeed,
      ease: 'Power1',
      onComplete: () => {
        this.playerMoving = false;
        this.playerSprite.setDepth(isoDepth(tx, ty) + 5);
        this.updateMinimapPlayer();

        // Stop walk animation and reset to standing
        if (this.walkAnim) {
          this.walkAnim.destroy();
          this.walkAnim = null;
        }
        if (!hasNftSprite) {
          this.walkFrame = 0;
          this.redrawPlayerBody();
        }

        // Reset NFT walk effects
        if (hasNftSprite && this.nftSpriteImage) {
          if (this.nftWalkBobTween) { this.nftWalkBobTween.destroy(); this.nftWalkBobTween = null; }
          if (this.nftWalkSwayTween) { this.nftWalkSwayTween.destroy(); this.nftWalkSwayTween = null; }
          this.nftSpriteImage.y = -24;
          this.nftSpriteImage.scaleX = 1.0;
        }

        // Auto-trigger exit tiles
        if (this.inBounds(tx, ty)) {
          const tile = this.tiles[ty][tx];
          if (tile.interact && tile.interact.startsWith('exit_')) {
            this.clickPath = [];
            this.onInteract(tile, tx, ty);
            return;
          }
        }

        // Continue click-path if exists
        if (this.clickPath.length > 0) {
          const next = this.clickPath.shift()!;
          if (this.canMoveTo(next.tx, next.ty)) {
            this.movePlayerTo(next.tx, next.ty);
          } else {
            this.clickPath = [];
            this.clearClickMarker();
          }
        } else {
          this.clearClickMarker();
        }
      },
    });
  }

  private getTileHeight(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    return this.tiles[ty][tx].height;
  }

  // -----------------------------------------------------------------------
  // Interaction (override in subclass)
  // -----------------------------------------------------------------------
  protected onInteract(_tile: ZoneTile, _tx: number, _ty: number): void {
    // Subclass handles specific interactions
  }

  // hub_ kapıları tüm zone'larda ortak işlenir; kalan her şey alt sınıfın
  // onInteract switch'ine gider
  private dispatchInteract(tile: ZoneTile, tx: number, ty: number): void {
    if (tile.interact?.startsWith(HUB_INTERACT_PREFIX)) {
      this.openHubGame(tile.interact.slice(HUB_INTERACT_PREFIX.length));
      return;
    }
    this.onInteract(tile, tx, ty);
  }

  // -----------------------------------------------------------------------
  // Run an action once the current dialog closes (frozen → false).
  // Single-slot: a second E in the gap between dialog close and the poll used
  // to queue a SECOND boss fight that fired right after the first one ended.
  // -----------------------------------------------------------------------
  private afterDialogPending = false;
  protected runAfterDialog(fn: () => void, delayMs = 1000): void {
    if (this.afterDialogPending) return;
    this.afterDialogPending = true;
    const poll = () => {
      if (!this.frozen) {
        this.afterDialogPending = false;
        fn();
      } else {
        this.time.delayedCall(100, poll);
      }
    };
    this.time.delayedCall(delayMs, poll);
  }

  // ── World Hub: oyun binası kapısı — React overlay'ini açar ──
  // Sahne duraklar (update durur, render sürer), müzik durur; overlay
  // kapanınca 'hub-overlay-closed' ile kaldığı yerden devam eder. MP
  // socket'e dokunulmaz (presence düşmez; paused sahne update işlemez zaten).
  protected openHubGame(gameId: string): void {
    this.freeze();
    music.stop();
    let acked = false;
    const onAck = () => { acked = true; };
    window.addEventListener('hub-overlay-opened', onAck, { once: true });
    window.dispatchEvent(new CustomEvent('hub-open-game', { detail: { gameId } }));
    const onClosed = () => {
      window.removeEventListener('hub-overlay-closed', onClosed);
      clearTimeout(rollbackTimer);
      this.scene.resume();
      music.play(this.zoneMusicKey);
      this.unfreeze();
    };
    window.addEventListener('hub-overlay-closed', onClosed);
    this.events.once('shutdown', () => {
      window.removeEventListener('hub-overlay-closed', onClosed);
      window.removeEventListener('hub-overlay-opened', onAck);
      clearTimeout(rollbackTimer);
    });
    // Overlay ack'lemezse (GameOverlay mount değilse) donmayı geri al —
    // aksi hâlde sahne kalıcı kilitlenirdi (sadece sayfa yenileme kurtarır).
    // window.setTimeout kullanılıyor: this.time (sahne Clock'u) scene.pause()
    // ile birlikte durur, bu yüzden Phaser'ın kendi delayedCall'ı hiç ateşlemez.
    const rollbackTimer = window.setTimeout(() => {
      if (acked) return;
      window.removeEventListener('hub-overlay-closed', onClosed);
      window.removeEventListener('hub-overlay-opened', onAck);
      if (this.scene.isPaused()) this.scene.resume();
      music.play(this.zoneMusicKey);
      this.unfreeze();
    }, 1500);
    // pause'u ertele: dispatch + freeze görselleri otursun (not: pause update'i
    // durdurur, render sürer — overlay opak olduğundan sorun değil)
    this.time.delayedCall(50, () => { if (this.frozen) this.scene.pause(); });
  }

  // -----------------------------------------------------------------------
  // Freeze / unfreeze
  // -----------------------------------------------------------------------
  protected freeze(): void {
    this.frozen = true;
    // Cancel any active click path
    this.clickPath = [];
    this.clearClickMarker();
    // Force-release all held keys to prevent stuck movement
    this.resetKeyStates();
  }

  protected unfreeze(): void {
    this.frozen = false;
    this.inputBufferMs = 0;
    this.resetKeyStates();
    // Reset movement state to prevent teleport after freeze
    if (this.playerMoving && this.playerSprite && !this.tweens.isTweening(this.playerSprite)) {
      this.playerMoving = false;
    }
    if (this.walkAnim) { this.walkAnim.destroy(); this.walkAnim = null; }
  }

  private resetKeyStates(): void {
    // Force all movement keys to "up" state
    if (this.wasd) {
      Object.values(this.wasd).forEach((key: any) => {
        if (key) { key.isDown = false; key.isUp = true; }
      });
    }
    if (this.cursors) {
      ['up', 'down', 'left', 'right'].forEach(dir => {
        const key = (this.cursors as any)?.[dir];
        if (key) { key.isDown = false; key.isUp = true; }
      });
    }
  }

  // -----------------------------------------------------------------------
  // Click-to-move
  // -----------------------------------------------------------------------
  private setupClickToMove(): void {
    if (this.clickSetup) return;
    this.clickSetup = true;

    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      if (this.frozen || this.playerMoving) return;
      // Ignore if clicking on UI areas (top 50px for HUD, bottom 100px for mobile controls)
      if (pointer.y < 50 || pointer.y > this.scale.height - 100) return;
      // Ignore right side (minimap area — top-right 180x200)
      if (pointer.x > this.scale.width - 180 && pointer.y < 200) return;
      // Mobile: the left half belongs to the floating joystick — the same
      // touch used to ALSO start a click-to-walk path, and the two movement
      // systems fought over the player
      if (this.isMobile && pointer.x < this.scale.width / 2) return;

      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      // Convert screen → tile (try multiple heights for best match)
      let bestTx = -1, bestTy = -1, bestDist = Infinity;
      for (let h = 0; h <= 5; h++) {
        const t = toTile(worldX, worldY, h);
        if (this.inBounds(t.tx, t.ty)) {
          const tileH = this.tiles[t.ty][t.tx].height;
          if (tileH === h) {
            const s = toScreen(t.tx, t.ty, tileH);
            const dist = Math.abs(s.x - worldX) + Math.abs(s.y - worldY);
            if (dist < bestDist) {
              bestDist = dist;
              bestTx = t.tx;
              bestTy = t.ty;
            }
          }
        }
      }

      if (bestTx < 0 || bestTy < 0) return;
      if (bestTx === this.playerTx && bestTy === this.playerTy) return;

      // Find path via BFS
      const path = this.findPath(this.playerTx, this.playerTy, bestTx, bestTy);
      if (path.length === 0) return;

      // Show click marker
      this.showClickMarker(bestTx, bestTy);

      // Store path and start walking
      this.clickPath = path;
      const first = this.clickPath.shift()!;
      this.movePlayerTo(first.tx, first.ty);
    };

    this.trackListener(this.input, 'pointerdown', onPointerDown);
  }

  private findPath(fromTx: number, fromTy: number, toTx: number, toTy: number): { tx: number; ty: number }[] {
    // BFS pathfinding (max 200 tiles explored to keep it fast)
    const maxSearch = 200;
    const visited = new Set<string>();
    const queue: { tx: number; ty: number; path: { tx: number; ty: number }[] }[] = [];
    const key = (x: number, y: number) => `${x},${y}`;

    visited.add(key(fromTx, fromTy));
    queue.push({ tx: fromTx, ty: fromTy, path: [] });

    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
    ];

    let searched = 0;
    while (queue.length > 0 && searched < maxSearch) {
      const curr = queue.shift()!;
      searched++;

      for (const d of dirs) {
        const ntx = curr.tx + d.dx;
        const nty = curr.ty + d.dy;
        const k = key(ntx, nty);

        if (visited.has(k)) continue;
        if (!this.inBounds(ntx, nty)) continue;

        const newPath = [...curr.path, { tx: ntx, ty: nty }];

        // Reached target (allow clicking on collision tiles like NPCs for interaction)
        if (ntx === toTx && nty === toTy) {
          if (this.tiles[nty][ntx].collision) {
            // Stop one tile before collision target
            return curr.path.length > 0 ? [...curr.path] : [];
          }
          return newPath;
        }

        // Can only walk through non-collision tiles
        if (this.tiles[nty][ntx].collision) {
          visited.add(k);
          continue;
        }

        visited.add(k);
        queue.push({ tx: ntx, ty: nty, path: newPath });
      }
    }

    return []; // No path found
  }

  private showClickMarker(tx: number, ty: number): void {
    this.clearClickMarker();
    const h = this.getTileHeight(tx, ty);
    const s = toScreen(tx, ty, h);
    this.clickMarker = this.add.graphics();
    this.clickMarker.setDepth(isoDepth(tx, ty) + 1);
    // Pulsing diamond outline
    this.clickMarker.lineStyle(2, 0x00e5ff, 0.7);
    this.clickMarker.beginPath();
    this.clickMarker.moveTo(s.x, s.y - ISO_TILE_H / 2 - h * 0);
    this.clickMarker.lineTo(s.x + ISO_TILE_W / 2, s.y);
    this.clickMarker.lineTo(s.x, s.y + ISO_TILE_H / 2);
    this.clickMarker.lineTo(s.x - ISO_TILE_W / 2, s.y);
    this.clickMarker.closePath();
    this.clickMarker.strokePath();
    // Auto-remove after 2 seconds
    this.time.delayedCall(2000, () => this.clearClickMarker());
  }

  private clearClickMarker(): void {
    if (this.clickMarker) {
      this.clickMarker.destroy();
      this.clickMarker = null;
    }
  }

  // -----------------------------------------------------------------------
  // Scene transitions
  // -----------------------------------------------------------------------
  protected goToWorld(): void {
    this.freeze();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('HUD');
      this.scene.start('IsoWorld');
    });
  }

  protected exitToScene(sceneName: string, spawnData?: any): void {
    this.freeze();
    PlayerState.get().save();

    // Register the fade listener BEFORE starting the fade: the one-shot
    // camerafadeoutcomplete event fires ~350ms in, and if the lazy chunk import
    // finished after that, a late listener would never fire — black-screen lock.
    const fadeDone = new Promise<void>(resolve => {
      if (!this.cameras?.main) return resolve();
      this.cameras.main.once('camerafadeoutcomplete', () => resolve());
      this.cameras.main.fadeOut(350, 0, 0, 0);
    });

    const game = this.game;
    const sceneReady = import('../sceneLoader')
      .then(({ ensureScene }) => ensureScene(game, sceneName))
      .catch(() => false as const);

    Promise.all([fadeDone, sceneReady]).then(() => {
      this.scene.start(sceneName, spawnData);
      import('../sceneLoader')
        .then(({ preloadNeighbors }) => preloadNeighbors(game, sceneName))
        .catch(() => {});
    });
  }

  // -----------------------------------------------------------------------
  // Helper: add NPC at tile
  // -----------------------------------------------------------------------
  protected addNpcAt(tx: number, ty: number, name: string, color: number = 0xee8844): Phaser.GameObjects.Container {
    const tileH = this.getTileHeight(tx, ty);
    const screen = toScreen(tx, ty, tileH);
    const container = this.add.container(screen.x, screen.y);

    // Colored aura/glow ring (larger semi-transparent circle)
    const aura = this.add.graphics();
    aura.fillStyle(color, 0.08);
    aura.fillCircle(0, -10, 28);
    aura.fillStyle(color, 0.05);
    aura.fillCircle(0, -10, 36);
    container.add(aura);

    // Glow circle under NPC
    const glow = this.add.graphics();
    glow.fillStyle(0xffff88, 0.18);
    glow.fillEllipse(0, 4, 32, 16);
    container.add(glow);

    // Body
    const body = this.add.graphics();
    body.fillStyle(0x000000, 0.25);
    body.fillEllipse(0, 5, 24, 11);
    // Taller body
    body.fillStyle(color, 1);
    body.fillRoundedRect(-7, -22, 14, 20, 3);
    // Body highlight (lighter strip on left)
    const highlightColor = ((Math.min(((color >> 16) & 0xff) + 40, 255)) << 16) |
                           ((Math.min(((color >> 8) & 0xff) + 40, 255)) << 8) |
                           (Math.min((color & 0xff) + 40, 255));
    body.fillStyle(highlightColor, 0.4);
    body.fillRoundedRect(-6, -20, 5, 14, 2);
    // Head
    body.fillStyle(0xffddbb, 1);
    body.fillCircle(0, -28, 7);
    // Hair on top (small colored arc)
    body.fillStyle(0x553322, 1);
    body.beginPath();
    body.arc(0, -30, 7, Math.PI, 0, false);
    body.closePath();
    body.fillPath();
    // Eyes
    body.fillStyle(0x222222, 1);
    body.fillCircle(-2, -29, 1.2);
    body.fillCircle(2, -29, 1.2);
    // Mouth
    body.lineStyle(0.8, 0xcc8866, 1);
    body.beginPath();
    body.arc(0, -26, 2, 0.2, Math.PI - 0.2, false);
    body.strokePath();
    container.add(body);

    // Exclamation mark "!" above quest NPCs
    const tileData = this.inBounds(tx, ty) ? this.tiles[ty][tx] : null;
    if (tileData?.interact === 'npc' || tileData?.interact === 'quest') {
      const questMark = this.add.text(0, -48, '!', {
        fontSize: '24px',
        fontStyle: 'bold',
        fontFamily: 'Arial, sans-serif',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
      }).setOrigin(0.5, 0.5);
      container.add(questMark);

      // Bounce the "!" mark
      this.tweens.add({
        targets: questMark,
        y: -56,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Name label
    const label = this.add.text(0, 12, name, {
      fontSize: '14px',
      color: '#ffee88',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(label);

    // Floating animation
    this.tweens.add({
      targets: container,
      y: screen.y - 3,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    container.setDepth(Math.max(isoDepth(tx, ty) + 4, 100));
    this.npcContainers.push(container);
    return container;
  }

  // -----------------------------------------------------------------------
  // Helper: monster body visual (sprite path, shared by all scenes)
  // -----------------------------------------------------------------------
  /**
   * Monster gövde görseli: eşleme varsa sprite (NEAREST, ölçekli, gölgeli),
   * yoksa null döner — çağıran mevcut prosedürel çizimini kullanır.
   * Dönen sprite'ta yön için setFlipX kullanılabilir.
   */
  protected createMonsterVisual(
    container: Phaser.GameObjects.Container,
    type: string,
  ): Phaser.GameObjects.Sprite | null {
    const v = getMonsterVisual(type);
    if (!v || !this.textures.exists(v.sheet)) return null;

    // Gölge (sprite'ın altına)
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillEllipse(0, 2, 26, 9);
    container.add(shadow);

    const spr = this.add.sprite(0, -10, v.sheet, v.frame);
    spr.setScale(v.scale);
    if (v.tint !== undefined) spr.setTint(v.tint);
    container.add(spr);

    if (v.frame2 !== undefined) {
      // 2-frame idle — anim tanımını tekilleştir
      const animKey = `mon_${v.sheet}_${v.frame}`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: [
            { key: v.sheet, frame: v.frame },
            { key: v.sheet, frame: v.frame2 },
          ],
          frameRate: 3,
          repeat: -1,
        });
      }
      spr.play(animKey);
    } else {
      // Frame yoksa yumuşak bob (container'ı değil sprite'ı oynat —
      // container tween'leri (gezinme) ile çakışmasın)
      this.tweens.add({
        targets: spr,
        y: -13,
        duration: 900 + Math.random() * 300,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
    return spr;
  }

  // -----------------------------------------------------------------------
  // Helper: add monster at tile with wandering AI
  // -----------------------------------------------------------------------
  protected addMonsterAt(tx: number, ty: number, _tileIndex: number, type: string, level: number): Phaser.GameObjects.Container {
    const tileH = this.getTileHeight(tx, ty);
    const screen = toScreen(tx, ty, tileH);
    const container = this.add.container(screen.x, screen.y);

    // Monster body: sprite eşlemesi varsa sprite, yoksa eski prosedürel oval
    const spr = this.createMonsterVisual(container, type);
    if (!spr) {
      const monGfx = this.add.graphics();
      monGfx.fillStyle(0x000000, 0.2);
      monGfx.fillEllipse(0, 4, 24, 10);
      monGfx.fillStyle(0xcc3333, 1);
      monGfx.fillEllipse(0, -8, 20, 16);
      // Eyes
      monGfx.fillStyle(0xffff00, 1);
      monGfx.fillCircle(-4, -10, 2.5);
      monGfx.fillCircle(4, -10, 2.5);
      monGfx.fillStyle(0x000000, 1);
      monGfx.fillCircle(-4, -10, 1);
      monGfx.fillCircle(4, -10, 1);
      container.add(monGfx);
    }

    // Level + type label
    const label = this.add.text(0, 12, `Lv${level} ${type}`, {
      fontSize: '13px',
      color: '#ff6666',
      fontFamily: 'Arial, sans-serif',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(label);

    container.setDepth(isoDepth(tx, ty) + 3);
    container.setData('monsterType', type);
    container.setData('monsterLevel', level);
    container.setData('currentTx', tx);
    container.setData('currentTy', ty);

    // Wandering AI — move to a random neighboring tile every few seconds
    this.time.addEvent({
      delay: 2000 + Math.random() * 2000,
      loop: true,
      callback: () => {
        const cTx: number = container.getData('currentTx');
        const cTy: number = container.getData('currentTy');
        const dirs = [
          { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
          { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        ];
        // Shuffle and try to find a valid tile
        Phaser.Utils.Array.Shuffle(dirs);
        for (const d of dirs) {
          const ntx = cTx + d.dx;
          const nty = cTy + d.dy;
          if (this.inBounds(ntx, nty) && !this.tiles[nty][ntx].collision) {
            const nh = this.getTileHeight(ntx, nty);
            const ns = toScreen(ntx, nty, nh);
            if (spr) spr.setFlipX(d.dx < 0);
            this.tweens.add({
              targets: container,
              x: ns.x,
              y: ns.y,
              duration: 600,
              ease: 'Sine.easeInOut',
              onComplete: () => {
                container.setData('currentTx', ntx);
                container.setData('currentTy', nty);
                container.setDepth(isoDepth(ntx, nty) + 3);
              },
            });
            break;
          }
        }
      },
    });

    this.npcContainers.push(container);
    return container;
  }

  // -----------------------------------------------------------------------
  // Helper: show dialog
  // -----------------------------------------------------------------------
  protected showDialog(speaker: string, lines: string[], sourceTx?: number, sourceTy?: number): void {
    // Close any existing dialog first
    if (this.activeDialogCleanup) {
      this.activeDialogCleanup();
      this.activeDialogCleanup = null;
    }

    this.freeze();
    let lineIndex = 0;
    let canAdvance = false;
    this.time.delayedCall(250, () => { canAdvance = true; });

    // ── Speech bubble in world space (above NPC) ──
    const container = this.add.container(0, 0);
    container.setDepth(2000);

    // Position: above NPC tile, or above player if no source
    let anchorX: number;
    let anchorY: number;
    if (sourceTx !== undefined && sourceTy !== undefined && this.inBounds(sourceTx, sourceTy)) {
      const h = this.getTileHeight(sourceTx, sourceTy);
      const s = toScreen(sourceTx, sourceTy, h);
      anchorX = s.x;
      anchorY = s.y - 60;
    } else {
      const ph = this.getTileHeight(this.playerTx, this.playerTy);
      const ps = toScreen(this.playerTx, this.playerTy, ph);
      anchorX = ps.x;
      anchorY = ps.y - 70;
    }

    // Bubble dimensions
    const maxW = 280;
    const pad = 14;
    const tailH = 12;

    // Measure text to size bubble
    const measureText = this.add.text(0, 0, lines[0], {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', wordWrap: { width: maxW - pad * 2 }, lineSpacing: 4,
    });
    const nameM = this.add.text(0, 0, speaker, { fontSize: '13px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold' });
    const textW = Math.min(maxW, Math.max(measureText.width, nameM.width) + pad * 2 + 20);
    measureText.destroy();
    nameM.destroy();

    // Draw function (redraws bubble for each line)
    const drawBubble = (text: string, idx: number) => {
      container.removeAll(true);

      // Measure current line
      const tmpText = this.add.text(0, 0, text, {
        fontSize: '14px', fontFamily: 'Arial, sans-serif', wordWrap: { width: textW - pad * 2 }, lineSpacing: 4,
      });
      const lineH = tmpText.height;
      tmpText.destroy();

      const nameH = 18;
      const hintH = 16;
      const bubbleH = pad + nameH + 6 + lineH + 6 + hintH + pad;
      const bx = -textW / 2;
      const by = -bubbleH - tailH;

      // Bubble background
      const bg = this.add.graphics();
      // Shadow
      bg.fillStyle(0x000000, 0.3);
      bg.fillRoundedRect(bx + 3, by + 3, textW, bubbleH, 12);
      // Main bubble
      bg.fillStyle(0x1a2030, 0.95);
      bg.fillRoundedRect(bx, by, textW, bubbleH, 12);
      bg.lineStyle(1.5, 0x3388aa, 0.6);
      bg.strokeRoundedRect(bx, by, textW, bubbleH, 12);
      // Tail (triangle pointing down)
      bg.fillStyle(0x1a2030, 0.95);
      bg.fillTriangle(-8, by + bubbleH, 8, by + bubbleH, 0, by + bubbleH + tailH);
      bg.lineStyle(1.5, 0x3388aa, 0.6);
      bg.beginPath();
      bg.moveTo(-8, by + bubbleH - 1);
      bg.lineTo(0, by + bubbleH + tailH);
      bg.lineTo(8, by + bubbleH - 1);
      bg.strokePath();
      container.add(bg);

      // Speaker name
      const nameT = this.add.text(bx + pad, by + pad, speaker, {
        fontSize: '13px', color: '#ffcc44', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      });
      container.add(nameT);

      // Page counter
      if (lines.length > 1) {
        const pageT = this.add.text(bx + textW - pad, by + pad, `${idx + 1}/${lines.length}`, {
          fontSize: '11px', color: '#557788', fontFamily: 'Arial, sans-serif',
        }).setOrigin(1, 0);
        container.add(pageT);
      }

      // Line text
      const lineT = this.add.text(bx + pad, by + pad + nameH + 4, text, {
        fontSize: '14px', color: '#d0d8e4', fontFamily: 'Arial, sans-serif',
        wordWrap: { width: textW - pad * 2 }, lineSpacing: 4,
      });
      container.add(lineT);

      // Hint
      const hintStr = idx === lines.length - 1 ? '[E] Close' : '[E] Next';
      const hintT = this.add.text(bx + textW - pad, by + bubbleH - pad - 2, hintStr, {
        fontSize: '11px', color: '#4488aa', fontFamily: 'Arial, sans-serif',
      }).setOrigin(1, 1);
      container.add(hintT);
    };

    container.setPosition(anchorX, anchorY);
    // Pan camera to ensure dialog is visible
    this.cameras.main.pan(anchorX, anchorY, 300, 'Sine.easeInOut');
    drawBubble(lines[0], 0);

    // Pop-in animation
    container.setScale(0);
    this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });

    const cleanup = () => {
      this.activeDialogCleanup = null;
      // Remove listeners immediately
      if (this.input.keyboard) {
        this.input.keyboard.off('keydown-E', advanceDialog);
        this.input.keyboard.off('keydown-SPACE', advanceDialog);
      }
      this.input.off('pointerdown', advanceDialog);
      // Pop-out animation
      this.tweens.add({
        targets: container, scaleX: 0, scaleY: 0, duration: 150, ease: 'Power2',
        onComplete: () => { try { container.destroy(); } catch {} },
      });
      this.time.delayedCall(200, () => this.unfreeze());
    };

    // Store cleanup so it can be called externally (scene shutdown, new dialog)
    this.activeDialogCleanup = cleanup;

    const advanceDialog = () => {
      if (!canAdvance) return;
      lineIndex++;
      if (lineIndex < lines.length) {
        drawBubble(lines[lineIndex], lineIndex);
      } else {
        cleanup();
      }
    };

    // Multiple ways to advance: E key, Space key, or mouse click
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-E', advanceDialog);
      this.input.keyboard.on('keydown-SPACE', advanceDialog);
    }
    this.input.on('pointerdown', advanceDialog);
  }

  // -----------------------------------------------------------------------
  // Helper: draw tree at tile
  // -----------------------------------------------------------------------
  protected drawTreeAt(tx: number, ty: number, type: string = 'pine'): void {
    const tileH = this.getTileHeight(tx, ty);
    const screen = toScreen(tx, ty, tileH);
    const g = this.add.graphics();
    const depth = isoDepth(tx, ty) + 2;
    g.setDepth(depth);

    // Random size variation based on tile hash (±15%)
    const hash = ((tx * 7919 + ty * 104729) % 1000) / 1000; // 0..1 deterministic
    const scale = 0.85 + hash * 0.30; // 0.85 .. 1.15
    const sx = screen.x;
    const sy = screen.y;

    if (type === 'pine') {
      // Ground shadow (dark ellipse, offset right)
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(sx + 8, sy + 2, 24 * scale, 10 * scale);

      // Trunk — tapered: wider at base
      g.fillStyle(0x553311, 1);
      g.fillRect(sx - 3 * scale, sy - 22 * scale, 6 * scale, 18 * scale);
      // Bark detail (darker vertical lines)
      g.fillStyle(0x442200, 1);
      g.fillRect(sx - 1 * scale, sy - 20 * scale, 1.5 * scale, 14 * scale);
      g.fillRect(sx + 1 * scale, sy - 18 * scale, 1 * scale, 10 * scale);

      // 4 layers of foliage (bottom to top, each narrower)
      const foliageColors = [0x1a5c1a, 0x226622, 0x2a7a2a, 0x338833];
      const layerWidths = [16, 14, 11, 8];
      const layerBases = [-10, -18, -26, -34];
      const layerTops = [-24, -30, -36, -44];

      for (let i = 0; i < 4; i++) {
        g.fillStyle(foliageColors[i], 1);
        g.fillTriangle(
          sx, sy + layerTops[i] * scale,
          sx - layerWidths[i] * scale, sy + layerBases[i] * scale,
          sx + layerWidths[i] * scale, sy + layerBases[i] * scale,
        );
      }

      // Snow cap on top layer for height > 3
      if (tileH > 3) {
        g.fillStyle(0xeeeeff, 0.9);
        g.fillTriangle(
          sx, sy - 47 * scale,
          sx - 5 * scale, sy - 40 * scale,
          sx + 5 * scale, sy - 40 * scale,
        );
      }
    } else if (type === 'oak') {
      // Ground shadow
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(sx + 8, sy + 2, 28 * scale, 12 * scale);

      // Sturdy trunk (wider)
      g.fillStyle(0x664422, 1);
      g.fillRect(sx - 4 * scale, sy - 20 * scale, 8 * scale, 18 * scale);
      // Bark texture
      g.fillStyle(0x553311, 1);
      g.fillRect(sx - 2 * scale, sy - 18 * scale, 2 * scale, 12 * scale);

      // Large round canopy — 5 overlapping circles in different greens
      g.fillStyle(0x2d8a2d, 1);
      g.fillCircle(sx, sy - 30 * scale, 16 * scale);
      g.fillStyle(0x339933, 1);
      g.fillCircle(sx - 6 * scale, sy - 33 * scale, 11 * scale);
      g.fillCircle(sx + 7 * scale, sy - 31 * scale, 10 * scale);
      g.fillStyle(0x44aa44, 1);
      g.fillCircle(sx - 3 * scale, sy - 28 * scale, 12 * scale);
      g.fillCircle(sx + 4 * scale, sy - 34 * scale, 9 * scale);

      // Highlight circles (lighter green) on top-left for light direction
      g.fillStyle(0x66cc55, 0.6);
      g.fillCircle(sx - 6 * scale, sy - 36 * scale, 6 * scale);

      // Shadow circles (darker) on bottom-right
      g.fillStyle(0x1a6a1a, 0.5);
      g.fillCircle(sx + 8 * scale, sy - 25 * scale, 7 * scale);

      // Hanging branch detail (small darker circle below main canopy)
      g.fillStyle(0x2a7a2a, 0.8);
      g.fillCircle(sx + 10 * scale, sy - 20 * scale, 4 * scale);
    } else if (type === 'palm') {
      // Ground shadow
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(sx + 6, sy + 2, 22 * scale, 10 * scale);

      // Tall curved trunk — multiple angled segments
      g.lineStyle(4 * scale, 0x8B6914, 1);
      g.beginPath();
      g.moveTo(sx, sy - 4 * scale);
      g.lineTo(sx + 2 * scale, sy - 16 * scale);
      g.lineTo(sx + 3 * scale, sy - 28 * scale);
      g.lineTo(sx + 2 * scale, sy - 40 * scale);
      g.strokePath();

      // Trunk highlight
      g.lineStyle(1.5 * scale, 0xA07818, 0.5);
      g.beginPath();
      g.moveTo(sx - 1 * scale, sy - 6 * scale);
      g.lineTo(sx + 1 * scale, sy - 18 * scale);
      g.lineTo(sx + 2 * scale, sy - 30 * scale);
      g.lineTo(sx + 1 * scale, sy - 38 * scale);
      g.strokePath();

      // 4 leaf fronds radiating from top (elongated ovals at angles)
      const topX = sx + 2 * scale;
      const topY = sy - 42 * scale;
      const frondAngles = [-2.2, -1.0, 0.3, 1.5];
      const frondLengths = [18, 20, 19, 17];
      for (let i = 0; i < frondAngles.length; i++) {
        const angle = frondAngles[i];
        const len = frondLengths[i] * scale;
        const ex = topX + Math.cos(angle) * len;
        const ey = topY + Math.sin(angle) * len * 0.5;
        g.fillStyle(0x33aa33, 0.9);
        // Draw frond as a thin ellipse approximated by a triangle pair
        const perpX = Math.sin(angle) * 3 * scale;
        const perpY = -Math.cos(angle) * 3 * scale * 0.5;
        g.fillTriangle(topX, topY, ex + perpX, ey + perpY, ex - perpX, ey - perpY);
        // Second layer lighter
        g.fillStyle(0x44bb44, 0.7);
        g.fillTriangle(topX, topY, ex + perpX * 0.5, ey + perpY * 0.5 + 1, ex - perpX * 0.5, ey - perpY * 0.5 + 1);
      }

      // Coconuts (2 small brown circles under fronds)
      g.fillStyle(0x6B4226, 1);
      g.fillCircle(topX - 2 * scale, topY + 4 * scale, 2.5 * scale);
      g.fillCircle(topX + 3 * scale, topY + 3 * scale, 2 * scale);
    }

    this.objectGfxList.push(g);
  }

  // -----------------------------------------------------------------------
  // Multiplayer integration
  // -----------------------------------------------------------------------
  private setupMultiplayer(): void {
    if (!mp.connected) {
      mp.connect();
      // Register once connected
      this.mpOn('_connected', () => this.mpRegisterAndJoin());
    } else {
      this.mpRegisterAndJoin();
    }

    if (this.mpBound) return;
    this.mpBound = true;

    // Other players join
    this.mpOn('player-joined', (data: RemotePlayerData) => {
      if (this.remotePlayers.has(data.id)) return;
      const rp = new RemotePlayer(this, data, (tx, ty) => this.getTileHeight(tx, ty));
      this.remotePlayers.set(data.id, rp);
    });

    // Existing players in zone
    this.mpOn('zone-players', (players: RemotePlayerData[]) => {
      for (const data of players) {
        if (this.remotePlayers.has(data.id)) continue;
        const rp = new RemotePlayer(this, data, (tx, ty) => this.getTileHeight(tx, ty));
        this.remotePlayers.set(data.id, rp);
      }
    });

    // Player left
    this.mpOn('player-left', (data: { id: string }) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) { rp.destroy(); this.remotePlayers.delete(data.id); }
    });

    // Player moved
    this.mpOn('player-moved', (data: { id: string; tx: number; ty: number; facing: string }) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) rp.moveTo(data.tx, data.ty, data.facing, (tx, ty) => this.getTileHeight(tx, ty));
    });

    // Chat message → show bubble on remote player
    this.mpOn('chat-message', (data: { id: string; name: string; message: string }) => {
      if (data.id === mp.id) return; // Don't show own messages as bubble
      const rp = this.remotePlayers.get(data.id);
      if (rp) rp.showChatBubble(data.message);
    });

    // Emote
    this.mpOn('player-emote', (data: { id: string; emote: string }) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) rp.showEmote(data.emote);
    });

    // PvP challenge received
    this.mpOn('pvp-challenged', (data: { challengeId: string; name: string; level: number; playerClass: string }) => {
      this.showPvpChallenge(data);
    });

    // PvP battle start
    this.mpOn('pvp-start', (data: { battleId: string; opponent: any }) => {
      this.activeBattleId = data.battleId;
      // Send our stats
      const s = PlayerState.get();
      mp.pvpReady(data.battleId, { hp: s.hp, mp: s.mp, atk: s.atk, def: s.def, spd: s.spd });
    });

    // PvP battle state update
    this.mpOn('pvp-battle-state', (data: any) => {
      // TODO: Open PvP battle scene with state
      console.log('[PvP] Battle state:', data);
    });

    // PvP result
    this.mpOn('pvp-result', (data: { won: boolean; reason?: string }) => {
      this.activeBattleId = null;
      const msg = data.won ? '🏆 You won the duel!' : '💀 You lost the duel...';
      this.showDialog('PvP', [msg]);
    });

    // PvP declined
    this.mpOn('pvp-declined', () => {
      this.showDialog('PvP', ['Challenge declined.']);
    });

    // Trade events
    this.mpOn('trade-requested', (data: { tradeId: string; name: string }) => {
      this.showTradeRequest(data);
    });

    this.mpOn('trade-complete', (data: { received: { items: any[]; gold: number } }) => {
      const items = data.received.items.length;
      const gold = data.received.gold;
      this.showDialog('Trade', [`Trade complete! Received ${items} item(s) and ${gold} gold.`]);
    });
  }

  private mpRegisterAndJoin(): void {
    const state = PlayerState.get();
    const wallet = (window as any).__frostbiteWallet?.address || `guest_${Date.now()}`;

    mp.register({
      wallet,
      name: state.name,
      playerClass: state.playerClass,
      level: state.level,
      skinColor: state.skinColor,
      hairColor: state.hairColor,
    });

    // Map scene key to zone name
    const zoneMap: Record<string, string> = {
      Town: 'town', IsoTownScene: 'town',
      Forest: 'forest', IsoForestScene: 'forest',
      Dungeon: 'dungeon', IsoDungeonScene: 'dungeon',
      IceCave: 'icecave', IsoIceCaveScene: 'icecave',
      Volcano: 'volcano', IsoVolcanoScene: 'volcano',
      IsoWorld: 'world',
    };
    // Unknown zones get their own room (lowercased key) — the old fallback to
    // 'town' put all 14 expansion zones in the town room, so players saw each
    // other's ghosts rendered at nonsense tile positions across maps.
    const zone = zoneMap[this.scene.key] || this.scene.key.toLowerCase();
    mp.joinZone(zone, this.playerTx, this.playerTy);
  }

  /** Show context menu when clicking a remote player */
  protected showPlayerMenu(rp: RemotePlayer): void {
    this.closePlayerMenu();
    const { tx, ty } = rp.data;
    const h = this.getTileHeight(tx, ty);
    const pos = toScreen(tx, ty, h);

    this.playerMenu = this.add.container(pos.x, pos.y - 60);
    this.playerMenu.setDepth(3000);

    const bg = this.add.graphics();
    bg.fillStyle(0x141a28, 0.95);
    bg.fillRoundedRect(-70, -50, 140, 100, 8);
    bg.lineStyle(1, 0x3388aa, 0.6);
    bg.strokeRoundedRect(-70, -50, 140, 100, 8);
    this.playerMenu.add(bg);

    // Player name
    const name = this.add.text(0, -40, `${rp.data.name} Lv${rp.data.level}`, {
      fontSize: '12px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.playerMenu.add(name);

    // PvP button
    const pvpBtn = this.add.rectangle(0, -8, 120, 30, 0xcc3333, 0.8).setInteractive({ useHandCursor: true });
    const pvpTxt = this.add.text(0, -8, '⚔ Challenge', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    pvpBtn.on('pointerdown', () => {
      mp.challengePlayer(rp.data.id);
      this.closePlayerMenu();
      this.showDialog('PvP', ['Challenge sent! Waiting for response...']);
    });
    this.playerMenu.add(pvpBtn);
    this.playerMenu.add(pvpTxt);

    // Trade button
    const tradeBtn = this.add.rectangle(0, 28, 120, 30, 0x336699, 0.8).setInteractive({ useHandCursor: true });
    const tradeTxt = this.add.text(0, 28, '🔄 Trade', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    tradeBtn.on('pointerdown', () => {
      mp.requestTrade(rp.data.id);
      this.closePlayerMenu();
      this.showDialog('Trade', ['Trade request sent!']);
    });
    this.playerMenu.add(tradeBtn);
    this.playerMenu.add(tradeTxt);

    // Close on click outside (delayed to prevent immediate close)
    this.time.delayedCall(100, () => {
      const closeHit = this.add.rectangle(0, 0, 2000, 2000).setAlpha(0.001).setDepth(2999).setInteractive();
      closeHit.on('pointerdown', () => { this.closePlayerMenu(); closeHit.destroy(); });
    });
  }

  private closePlayerMenu(): void {
    if (this.playerMenu) { this.playerMenu.destroy(true); this.playerMenu = null; }
  }

  /** Show incoming PvP challenge popup */
  private showPvpChallenge(data: { challengeId: string; name: string; level: number; playerClass: string }): void {
    this.showDialog('⚔ PvP Challenge', [
      `${data.name} (Lv${data.level} ${data.playerClass}) challenges you to a duel!`,
    ]);

    // Add accept/decline buttons after dialog
    this.time.delayedCall(300, () => {
      const W = this.scale.width;
      const H = this.scale.height;
      const container = this.add.container(W / 2, H * 0.6).setDepth(5000);

      const acceptBtn = this.add.rectangle(-60, 0, 100, 36, 0x44aa44, 0.9).setInteractive({ useHandCursor: true });
      const acceptTxt = this.add.text(-60, 0, 'ACCEPT', {
        fontSize: '13px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      acceptBtn.on('pointerdown', () => { mp.acceptChallenge(data.challengeId); container.destroy(true); });

      const declineBtn = this.add.rectangle(60, 0, 100, 36, 0xcc3333, 0.9).setInteractive({ useHandCursor: true });
      const declineTxt = this.add.text(60, 0, 'DECLINE', {
        fontSize: '13px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      declineBtn.on('pointerdown', () => { mp.declineChallenge(data.challengeId); container.destroy(true); });

      container.add([acceptBtn, acceptTxt, declineBtn, declineTxt]);

      // Auto-expire
      this.time.delayedCall(25000, () => { try { container.destroy(true); } catch {} });
    });
  }

  /** Show incoming trade request popup */
  private showTradeRequest(data: { tradeId: string; name: string }): void {
    this.showDialog('🔄 Trade', [`${data.name} wants to trade with you!`]);

    this.time.delayedCall(300, () => {
      const W = this.scale.width;
      const H = this.scale.height;
      const container = this.add.container(W / 2, H * 0.6).setDepth(5000);

      const acceptBtn = this.add.rectangle(-60, 0, 100, 36, 0x44aa44, 0.9).setInteractive({ useHandCursor: true });
      const acceptTxt = this.add.text(-60, 0, 'ACCEPT', {
        fontSize: '13px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      acceptBtn.on('pointerdown', () => { mp.acceptTrade(data.tradeId); container.destroy(true); });

      const declineBtn = this.add.rectangle(60, 0, 100, 36, 0xcc3333, 0.9).setInteractive({ useHandCursor: true });
      const declineTxt = this.add.text(60, 0, 'DECLINE', {
        fontSize: '13px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      declineBtn.on('pointerdown', () => { mp.declineTrade(data.tradeId); container.destroy(true); });

      container.add([acceptBtn, acceptTxt, declineBtn, declineTxt]);

      this.time.delayedCall(25000, () => { try { container.destroy(true); } catch {} });
    });
  }

  private cleanupMultiplayer(): void {
    // Remove only THIS scene's listeners (connection stays alive). offAll()
    // would also wipe the HUD ChatOverlay's subscriptions — chat log went
    // permanently dead after the first zone transition.
    for (const [event, fn] of this.mpHandlers) mp.off(event, fn);
    this.mpHandlers = [];
    this.mpBound = false;
  }

  // -----------------------------------------------------------------------
  // Mobile detection
  // -----------------------------------------------------------------------
  private detectMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (typeof window !== 'undefined' && window.innerWidth < 768);
  }

  // -----------------------------------------------------------------------
  // Mobile touch controls — virtual joystick + action buttons
  // -----------------------------------------------------------------------
  private setupMobileControls(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    this.touchControls = this.add.container(0, 0);
    this.touchControls.setDepth(5000);
    this.touchControls.setScrollFactor(0);

    // ── Virtual Joystick (floating, bottom-left) ──
    const joyR = 65;   // joystick radius (increased for better reach)
    const thumbR = 24; // thumb radius (increased for easier grabbing)
    const deadzone = 20; // deadzone radius (increased for precision)
    const joyX = 100;
    const joyY = H - 110;
    this.joystickDefaultX = joyX;
    this.joystickDefaultY = joyY;
    this.joystickBaseX = joyX;
    this.joystickBaseY = joyY;

    // Base circle (semi-transparent)
    this.joystickBase = this.add.graphics();
    this.joystickBase.setScrollFactor(0);
    this.joystickBase.setDepth(5001);
    this.joystickBase.fillStyle(0x222233, 0.4);
    this.joystickBase.fillCircle(joyX, joyY, joyR + 10);
    this.joystickBase.lineStyle(2, 0x00ccee, 0.3);
    this.joystickBase.strokeCircle(joyX, joyY, joyR + 10);
    // Direction indicators
    this.joystickBase.fillStyle(0x00ccee, 0.15);
    this.joystickBase.fillTriangle(joyX, joyY - joyR + 5, joyX - 8, joyY - joyR + 18, joyX + 8, joyY - joyR + 18); // up
    this.joystickBase.fillTriangle(joyX, joyY + joyR - 5, joyX - 8, joyY + joyR - 18, joyX + 8, joyY + joyR - 18); // down
    this.joystickBase.fillTriangle(joyX - joyR + 5, joyY, joyX - joyR + 18, joyY - 8, joyX - joyR + 18, joyY + 8); // left
    this.joystickBase.fillTriangle(joyX + joyR - 5, joyY, joyX + joyR - 18, joyY - 8, joyX + joyR - 18, joyY + 8); // right
    this.touchControls.add(this.joystickBase);

    // Thumb (draggable knob) — larger for easier grabbing
    this.joystickThumb = this.add.graphics();
    this.joystickThumb.setScrollFactor(0);
    this.joystickThumb.setDepth(5002);
    this.joystickThumb.fillStyle(0x00ccee, 0.5);
    this.joystickThumb.fillCircle(joyX, joyY, thumbR);
    this.joystickThumb.lineStyle(2, 0x00ccee, 0.7);
    this.joystickThumb.strokeCircle(joyX, joyY, thumbR);
    this.touchControls.add(this.joystickThumb);

    // Floating joystick hit area — covers the entire left half of the screen
    this.joystickHit = this.add.rectangle(W / 4, H / 2, W / 2, H)
      .setAlpha(0.001).setScrollFactor(0).setDepth(5003).setInteractive();

    // Helper: redraw joystick base at a position
    const drawJoystickBase = (cx: number, cy: number) => {
      this.joystickBase!.clear();
      this.joystickBase!.fillStyle(0x222233, 0.4);
      this.joystickBase!.fillCircle(cx, cy, joyR + 10);
      this.joystickBase!.lineStyle(2, 0x00ccee, 0.3);
      this.joystickBase!.strokeCircle(cx, cy, joyR + 10);
      this.joystickBase!.fillStyle(0x00ccee, 0.15);
      this.joystickBase!.fillTriangle(cx, cy - joyR + 5, cx - 8, cy - joyR + 18, cx + 8, cy - joyR + 18);
      this.joystickBase!.fillTriangle(cx, cy + joyR - 5, cx - 8, cy + joyR - 18, cx + 8, cy + joyR - 18);
      this.joystickBase!.fillTriangle(cx - joyR + 5, cy, cx - joyR + 18, cy - 8, cx - joyR + 18, cy + 8);
      this.joystickBase!.fillTriangle(cx + joyR - 5, cy, cx + joyR - 18, cy - 8, cx + joyR - 18, cy + 8);
    };

    this.joystickHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.joystickPointer = pointer;
      // Floating: move joystick base to where the player touched
      const clampedX = Phaser.Math.Clamp(pointer.x, joyR + 20, W / 2 - joyR - 10);
      const clampedY = Phaser.Math.Clamp(pointer.y, joyR + 20, H - joyR - 20);
      this.joystickBaseX = clampedX;
      this.joystickBaseY = clampedY;
      drawJoystickBase(clampedX, clampedY);
      // Draw thumb at touch point with glow
      this.joystickThumb!.clear();
      this.joystickThumb!.fillStyle(0x00ccee, 0.5);
      this.joystickThumb!.fillCircle(clampedX, clampedY, thumbR);
      this.joystickThumb!.lineStyle(2, 0x00ccee, 0.7);
      this.joystickThumb!.strokeCircle(clampedX, clampedY, thumbR);
    });
    this.touchControls.add(this.joystickHit);

    // Listen for pointermove and pointerup globally for joystick
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.joystickPointer || pointer.id !== this.joystickPointer.id) return;
      // Get position relative to canvas (not world)
      const dx = pointer.x - this.joystickBaseX;
      const dy = pointer.y - this.joystickBaseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = joyR;

      // Clamp thumb position
      const clampedDist = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);
      const thumbX = this.joystickBaseX + Math.cos(angle) * clampedDist;
      const thumbY = this.joystickBaseY + Math.sin(angle) * clampedDist;

      // Redraw thumb at new position with glow effect when active
      const isActive = dist >= deadzone;
      this.joystickThumb!.clear();
      if (isActive) {
        // Glow: outer soft circle
        this.joystickThumb!.fillStyle(0x00ccee, 0.15);
        this.joystickThumb!.fillCircle(thumbX, thumbY, thumbR + 8);
      }
      this.joystickThumb!.fillStyle(0x00ccee, isActive ? 0.75 : 0.5);
      this.joystickThumb!.fillCircle(thumbX, thumbY, thumbR);
      this.joystickThumb!.lineStyle(isActive ? 3 : 2, 0x00ccee, isActive ? 1.0 : 0.7);
      this.joystickThumb!.strokeCircle(thumbX, thumbY, thumbR);

      // Determine direction from angle (deadzone)
      if (dist < deadzone) {
        this.joystickDir = null;
        return;
      }

      // Map angle to 8 directions (isometric)
      const deg = ((angle * 180 / Math.PI) + 360) % 360;
      // Iso mapping: screen angles → grid directions
      if (deg >= 337.5 || deg < 22.5)        this.joystickDir = 'right';      // →  = iso east (D)
      else if (deg >= 22.5 && deg < 67.5)    this.joystickDir = 'down_right'; // ↘ = S+D
      else if (deg >= 67.5 && deg < 112.5)   this.joystickDir = 'down';       // ↓  = iso south (S)
      else if (deg >= 112.5 && deg < 157.5)  this.joystickDir = 'down_left';  // ↙ = S+A
      else if (deg >= 157.5 && deg < 202.5)  this.joystickDir = 'left';       // ←  = iso west (A)
      else if (deg >= 202.5 && deg < 247.5)  this.joystickDir = 'up_left';    // ↖ = W+A
      else if (deg >= 247.5 && deg < 292.5)  this.joystickDir = 'up';         // ↑  = iso north (W)
      else                                    this.joystickDir = 'up_right';   // ↗ = W+D
    };

    const onUp = (pointer: Phaser.Input.Pointer) => {
      if (!this.joystickPointer || pointer.id !== this.joystickPointer.id) return;
      this.joystickPointer = null;
      this.joystickDir = null;
      // Reset joystick to default position
      this.joystickBaseX = this.joystickDefaultX;
      this.joystickBaseY = this.joystickDefaultY;
      drawJoystickBase(this.joystickDefaultX, this.joystickDefaultY);
      // Reset thumb to center (no glow)
      this.joystickThumb!.clear();
      this.joystickThumb!.fillStyle(0x00ccee, 0.5);
      this.joystickThumb!.fillCircle(this.joystickDefaultX, this.joystickDefaultY, thumbR);
      this.joystickThumb!.lineStyle(2, 0x00ccee, 0.7);
      this.joystickThumb!.strokeCircle(this.joystickDefaultX, this.joystickDefaultY, thumbR);
    };

    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.boundHandlers.push({ target: this.input, event: 'pointermove', fn: onMove });
    this.boundHandlers.push({ target: this.input, event: 'pointerup', fn: onUp });

    // ── Action Buttons (bottom-right) ──
    const btnSize = 52;
    const btnGap = 12;
    const btnBaseX = W - 80;
    const btnBaseY = H - 100;

    // Interact button (E) — center
    this.addMobileBtn(btnBaseX, btnBaseY - btnSize - btnGap, btnSize, 'E', 0x00aacc, () => {
      if (this.frozen) return;
      // Simulate E key press — trigger interaction
      if (this.inBounds(this.playerTx, this.playerTy)) {
        const standTile = this.tiles[this.playerTy][this.playerTx];
        if (standTile.interact && !standTile.interact.startsWith('exit_')) {
          this.dispatchInteract(standTile, this.playerTx, this.playerTy);
          return;
        }
      }
      const neighbors = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
      ];
      for (const n of neighbors) {
        const ntx = this.playerTx + n.dx;
        const nty = this.playerTy + n.dy;
        if (this.inBounds(ntx, nty)) {
          const tile = this.tiles[nty][ntx];
          if (tile.interact && !tile.interact.startsWith('exit_')) {
            this.dispatchInteract(tile, ntx, nty);
            return;
          }
        }
      }
    });

    // Inventory button (I) — routed through the HUD like the I key; the old
    // 'toggle-inventory' emit had no listener (dead button)
    this.addMobileBtn(btnBaseX + btnSize / 2 + btnGap / 2, btnBaseY, btnSize, 'BAG', 0x336699, () => {
      if (this.frozen) return;
      const hud = this.scene.get('HUD') as any;
      hud?.openInventory?.();
    });

    // Map button (M)
    this.addMobileBtn(btnBaseX - btnSize / 2 - btnGap / 2, btnBaseY, btnSize, 'MAP', 0x669933, () => {
      if (!this.frozen) this.goToWorld();
    });

    // Dialog advance button (shown only during dialog)
    // This is handled by the existing pointerdown in showDialog
  }

  private addMobileBtn(x: number, y: number, size: number, label: string, color: number, cb: () => void): void {
    if (!this.touchControls) return;

    const gfx = this.add.graphics().setScrollFactor(0).setDepth(5001);
    gfx.fillStyle(color, 0.4);
    gfx.fillRoundedRect(x - size / 2, y - size / 2, size, size, 10);
    gfx.lineStyle(1.5, color, 0.6);
    gfx.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 10);
    this.touchControls.add(gfx);

    const txt = this.add.text(x, y, label, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(5002);
    this.touchControls.add(txt);

    const hit = this.add.rectangle(x, y, size, size).setAlpha(0.001).setScrollFactor(0).setDepth(5003)
      .setInteractive();
    hit.on('pointerdown', () => {
      gfx.clear();
      gfx.fillStyle(color, 0.7);
      gfx.fillRoundedRect(x - size / 2, y - size / 2, size, size, 10);
      gfx.lineStyle(2, 0xffffff, 0.5);
      gfx.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 10);
      cb();
      this.time.delayedCall(150, () => {
        gfx.clear();
        gfx.fillStyle(color, 0.4);
        gfx.fillRoundedRect(x - size / 2, y - size / 2, size, size, 10);
        gfx.lineStyle(1.5, color, 0.6);
        gfx.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 10);
      });
    });
    this.touchControls.add(hit);
  }

  // -----------------------------------------------------------------------
  // Ambient particle system
  // -----------------------------------------------------------------------
  private addAmbientParticles(): void {
    const key = this.scene.key;

    // Zone-specific ambience: color + drift direction. Zones not listed fall
    // back to the default white snow drifting downward (vy positive).
    // dir: -1 = rises upward, 1 = settles downward.
    const EMBER = new Set(['Volcano', 'DemonGate', 'Sanctum', 'Forge']);
    const DUST = new Set(['Dungeon', 'Crypt', 'Necropolis']);
    const VOID = new Set(['VoidRealm', 'Eternal']);
    const ambient: { color: number; dir: number; slow: boolean } =
      EMBER.has(key)         ? { color: 0xff7733, dir: -1, slow: false }
      : key === 'Swamp'      ? { color: 0x88cc66, dir: 1,  slow: true }
      : DUST.has(key)        ? { color: 0xaaaaaa, dir: -1, slow: false }
      : VOID.has(key)        ? { color: 0xaa66ff, dir: -1, slow: false }
      : key === 'Forest'     ? { color: 0x88cc44, dir: 1,  slow: false }
      :                        { color: 0xffffff, dir: 1,  slow: false };

    const particles: { x: number; y: number; vx: number; vy: number; alpha: number; size: number; color: number }[] = [];

    const particleGfx = this.add.graphics();
    particleGfx.setDepth(500);
    particleGfx.setScrollFactor(1);

    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        particleGfx.clear();
        const cam = this.cameras.main;
        const cx = cam.scrollX + cam.width / 2;
        const cy = cam.scrollY + cam.height / 2;

        // Spawn new particles if below max
        while (particles.length < 25) {
          particles.push({
            x: cx + (Math.random() - 0.5) * cam.width * 1.5,
            y: cy + (Math.random() - 0.5) * cam.height * 1.5,
            vx: (Math.random() - 0.5) * 0.3,
            vy: ambient.dir * ((ambient.slow ? 0.08 : 0.2) + Math.random() * (ambient.slow ? 0.15 : 0.4)),
            alpha: 0.2 + Math.random() * 0.4,
            size: 1 + Math.random() * 2,
            color: ambient.color,
          });
        }

        // Update and draw
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.002;

          // Remove if faded or too far
          if (p.alpha <= 0 || Math.abs(p.x - cx) > cam.width || Math.abs(p.y - cy) > cam.height) {
            particles.splice(i, 1);
            continue;
          }

          particleGfx.fillStyle(p.color, p.alpha);
          particleGfx.fillCircle(p.x, p.y, p.size);
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // Helper: draw multi-tile building block
  // -----------------------------------------------------------------------
  protected drawBuildingBlock(
    gfx: Phaser.GameObjects.Graphics | null,
    tx: number, ty: number,
    w: number, h: number,
    blockDepth: number,
    roofColor: BiomeColors,
    wallColor: BiomeColors,
  ): Phaser.GameObjects.Graphics {
    const g = gfx || this.add.graphics();
    g.setDepth(isoDepth(tx + w, ty + h) + 1);

    // Draw walls first (bottom to top, back to front)
    for (let by = 0; by < h; by++) {
      for (let bx = 0; bx < w; bx++) {
        const tileH = this.getTileHeight(tx + bx, ty + by);
        const screen = toScreen(tx + bx, ty + by, tileH);

        // Wall levels
        for (let level = 0; level < blockDepth; level++) {
          const wallSy = screen.y - level * ISO_BLOCK_H;
          const nLeft = level + 1;
          const nRight = level + 1;

          // Only draw outer walls
          if (by === h - 1) {
            drawLeftWall(g, screen.x, wallSy - ISO_BLOCK_H, ISO_BLOCK_H, wallColor.left);
          }
          if (bx === w - 1) {
            drawRightWall(g, screen.x, wallSy - ISO_BLOCK_H, ISO_BLOCK_H, wallColor.right);
          }
        }

        // Roof (top face at blockDepth height)
        const roofSy = screen.y - blockDepth * ISO_BLOCK_H;
        drawTopFace(g, screen.x, roofSy, roofColor.top);
      }
    }

    if (!gfx) {
      this.objectGfxList.push(g);
    }
    return g;
  }

  // -----------------------------------------------------------------------
  // Minimap
  // -----------------------------------------------------------------------
  private static readonly MINIMAP_BIOME_COLORS: Record<string, number> = {
    grass: 0x5cb847, dark_grass: 0x3a7a2d, stone: 0x8888aa, stone_dark: 0x444466,
    wood: 0xb08050, sand: 0xe8d878, water: 0x3399cc, snow: 0xd8e4f8,
    lava: 0xdd4422, cobble: 0x888888, dirt: 0xb08050, wall: 0xccbb99,
    ice: 0x88ccee, ice_wall: 0x5577aa, ice_dark: 0x7799bb, ice_crystal: 0xaaddff,
    frozen_water: 0x77bbdd, volcanic: 0x7a4e32, volcanic_rock: 0x3a2418,
    magma: 0x5a3020, obsidian: 0x222233, roof_red: 0xcc4433, roof_blue: 0x4870b0,
  };

  private createMinimap(): void {
    const cam = this.cameras.main;
    const W = cam.width;
    const size = this.minimapSize;
    const pad = this.minimapPad;

    // Minimap position: top-right corner (below HUD buttons)
    const mx = W - size - pad;
    const my = 46; // below HUD top bar

    // Background panel
    this.minimapBg = this.add.graphics();
    this.minimapBg.setScrollFactor(0);
    this.minimapBg.setDepth(4500);
    this.minimapBg.fillStyle(0x0a0e1a, 0.85);
    this.minimapBg.fillRoundedRect(mx - 4, my - 14, size + 8, size + 22, 6);
    this.minimapBg.lineStyle(1, 0x2a3a4a, 0.8);
    this.minimapBg.strokeRoundedRect(mx - 4, my - 14, size + 8, size + 22, 6);

    // Title
    const title = this.add.text(mx + size / 2, my - 6, 'MAP', {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      color: '#00e5ff', align: 'center',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(4502);

    // Tile rendering
    const tileSize = Math.max(1, Math.floor(size / Math.max(this.mapW, this.mapH)));
    const offsetX = mx + Math.floor((size - this.mapW * tileSize) / 2);
    const offsetY = my + 2;

    // Static terrain layer
    const terrainGfx = this.add.graphics();
    terrainGfx.setScrollFactor(0);
    terrainGfx.setDepth(4501);

    for (let r = 0; r < this.mapH; r++) {
      for (let c = 0; c < this.mapW; c++) {
        const tile = this.tiles[r][c];
        let color = IsoBaseScene.MINIMAP_BIOME_COLORS[tile.biome] ?? 0x444444;

        // Collision tiles slightly darker
        if (tile.collision) {
          const cr = ((color >> 16) & 0xff) * 0.5;
          const cg = ((color >> 8) & 0xff) * 0.5;
          const cb = (color & 0xff) * 0.5;
          color = (Math.floor(cr) << 16) | (Math.floor(cg) << 8) | Math.floor(cb);
        }

        // Exit tiles highlighted
        if (tile.interact && tile.interact.startsWith('exit_')) {
          color = 0x44ff44; // green for exits
        }

        terrainGfx.fillStyle(color, 1);
        terrainGfx.fillRect(offsetX + c * tileSize, offsetY + r * tileSize, tileSize, tileSize);
      }
    }

    // Cyan çerçeve + köşe aksan tikleri (stats-panel stiliyle uyumlu)
    const frame = this.add.graphics().setScrollFactor(0).setDepth(4502);
    frame.lineStyle(1.5, 0x00e5ff, 0.35);
    frame.strokeRoundedRect(mx - 4, my - 4, size + 8, size + 8, 6);
    frame.lineStyle(2, 0x00e5ff, 0.7);
    const tick = 8;
    const fx = mx - 4, fy = my - 4, fw = size + 8, fh = size + 8;
    // Sol-üst
    frame.beginPath(); frame.moveTo(fx, fy + tick); frame.lineTo(fx, fy); frame.lineTo(fx + tick, fy); frame.strokePath();
    // Sağ-üst
    frame.beginPath(); frame.moveTo(fx + fw - tick, fy); frame.lineTo(fx + fw, fy); frame.lineTo(fx + fw, fy + tick); frame.strokePath();
    // Sol-alt
    frame.beginPath(); frame.moveTo(fx, fy + fh - tick); frame.lineTo(fx, fy + fh); frame.lineTo(fx + tick, fy + fh); frame.strokePath();
    // Sağ-alt
    frame.beginPath(); frame.moveTo(fx + fw - tick, fy + fh); frame.lineTo(fx + fw, fy + fh); frame.lineTo(fx + fw, fy + fh - tick); frame.strokePath();

    // Player dot overlay (updated each move)
    this.minimapGfx = this.add.graphics();
    this.minimapGfx.setScrollFactor(0);
    this.minimapGfx.setDepth(4503);

    this.updateMinimapPlayer();

    // Toggle key: Tab
    this.input.keyboard?.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.minimapVisible = !this.minimapVisible;
      const vis = this.minimapVisible;
      this.minimapBg?.setVisible(vis);
      this.minimapGfx?.setVisible(vis);
      terrainGfx.setVisible(vis);
      title.setVisible(vis);
      frame.setVisible(vis);
    });
  }

  private updateMinimapPlayer(): void {
    if (!this.minimapGfx || !this.minimapVisible) return;
    this.minimapGfx.clear();

    const cam = this.cameras.main;
    const W = cam.width;
    const size = this.minimapSize;
    const pad = this.minimapPad;
    const mx = W - size - pad;
    const my = 46;

    const tileSize = Math.max(1, Math.floor(size / Math.max(this.mapW, this.mapH)));
    const offsetX = mx + Math.floor((size - this.mapW * tileSize) / 2);
    const offsetY = my + 2;

    // Player position — white dot with glow
    const px = offsetX + this.playerTx * tileSize + tileSize / 2;
    const py = offsetY + this.playerTy * tileSize + tileSize / 2;
    const dotSize = Math.max(3, tileSize);

    this.minimapGfx.fillStyle(0x00e5ff, 0.4);
    this.minimapGfx.fillCircle(px, py, dotSize + 2);
    this.minimapGfx.fillStyle(0xffffff, 1);
    this.minimapGfx.fillCircle(px, py, dotSize);
  }
}
