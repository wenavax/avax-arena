// frontend/lib/game/td/TdWorldScene.ts
// ─── Açık dünya sahnesi: chunk streaming + chibi kahraman ───
// Client-only (Phaser sahnesi). Su animasyonu yalnız su içeren chunk'ları tazeler.
import * as Phaser from 'phaser';
import { TILE, CHUNK, MAP_W, MAP_H, chunksInView, depth } from './tdCore';
import { getTile, TOWN_SPAWN } from './worldMap';
import { renderChunk, chunkHasWater } from './tiles';
import { chibiHumanoid, CHIBI_H } from './sprites/chibi';

const WALK_FRAMES = [0, 1, 0, 2] as const; // faz dizisi (spec §4)

export class TdWorldScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Image;
  private heroPos = { x: TOWN_SPAWN.tx * TILE + 8, y: TOWN_SPAWN.ty * TILE + 8 };
  private heroDir: 0 | 1 | 2 = 0; private heroFlip = false;
  private walkIdx = 0; private walkT = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private chunks = new Map<string, Phaser.GameObjects.Image>();   // "cx,cy" → image
  private hasWaterCache = new Map<string, boolean>();             // chunk su önbelleği (statik dünya)
  private waterFrame: 0 | 1 | 2 = 0; private waterT = 0;
  private perf = { chunkMs: 0, visible: 0 }; private perfText?: Phaser.GameObjects.Text;

  constructor() { super({ key: 'TdWorld' }); }

  create(): void {
    // kahraman kareleri: 3 yön × 3 faz → texture'lar
    for (let d = 0; d < 3; d++) for (let p = 0; p < 3; p++) {
      const key = `td-hero-${d}-${p}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, chibiHumanoid(d as 0 | 1 | 2, p as 0 | 1 | 2));
    }
    this.hero = this.add.image(this.heroPos.x, this.heroPos.y, 'td-hero-0-0').setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.startFollow(this.hero, true, 1, 1);
    this.cameras.main.setRoundPixels(true);
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    this.cursors = kb.createCursorKeys();
    // F3: perf overlay (Faz 1 doğrulama aracı)
    kb.on('keydown-F3', () => {
      if (this.perfText) { this.perfText.destroy(); this.perfText = undefined; }
      else this.perfText = this.add.text(4, 4, '', { fontSize: '10px', color: '#9fe8ff', backgroundColor: '#000000aa' })
        .setScrollFactor(0).setDepth(1e9);
    });
    this.streamChunks();
  }

  private canMove(nx: number, ny: number): boolean {
    for (const [ox, oy] of [[-4, 0], [4, 0], [-4, 3], [4, 3], [0, 3]] as const) {
      const t = getTile(Math.floor((nx + ox) / TILE), Math.floor((ny + oy) / TILE));
      if (t.collision) return false;
    }
    return true;
  }

  private chunkHasWaterCached(cx: number, cy: number): boolean {
    const key = `${cx},${cy}`;
    let v = this.hasWaterCache.get(key);
    if (v === undefined) { v = chunkHasWater(cx, cy); this.hasWaterCache.set(key, v); }
    return v;
  }

  /** Chunk'ı sahneden ve TÜM su-frame texture'larından temizle (birikim önleyici). */
  private evictChunk(key: string): void {
    this.chunks.get(key)?.destroy();
    this.chunks.delete(key);
    for (let f = 0; f < 3; f++) if (this.textures.exists(`td-chunk-${key}-${f}`)) this.textures.remove(`td-chunk-${key}-${f}`);
  }

  /** refreshWater: true → görünür SU chunk'larını aktif frame ile yeniden bas. */
  private streamChunks(refreshWater = false): void {
    const t0 = performance.now();
    const want = chunksInView(this.heroPos.x, this.heroPos.y);
    const wantKeys = new Set(want.map(c => `${c.cx},${c.cy}`));
    for (const key of [...this.chunks.keys()]) if (!wantKeys.has(key)) this.evictChunk(key);
    for (const c of want) {
      const key = `${c.cx},${c.cy}`;
      const exists = this.chunks.has(key);
      if (exists && !(refreshWater && this.chunkHasWaterCached(c.cx, c.cy))) continue;
      if (exists) { this.chunks.get(key)!.destroy(); this.chunks.delete(key); }
      const texKey = `td-chunk-${key}-${this.waterFrame}`;
      if (!this.textures.exists(texKey)) this.textures.addCanvas(texKey, renderChunk(c.cx, c.cy, this.waterFrame));
      const img = this.add.image(c.cx * CHUNK * TILE, c.cy * CHUNK * TILE, texKey).setOrigin(0, 0).setDepth(-1000);
      this.chunks.set(key, img);
    }
    this.perf.chunkMs = performance.now() - t0;
    this.perf.visible = this.chunks.size;
  }

  update(t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown || this.cursors.up.isDown) dy -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) dy += 1;
    if (this.keys.A.isDown || this.cursors.left.isDown) dx -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) dx += 1;
    const moving = !!(dx || dy);
    if (moving) {
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const sp = 88 * dt;
      const nx = this.heroPos.x + dx * sp, ny = this.heroPos.y + dy * sp;
      if (this.canMove(nx, this.heroPos.y)) this.heroPos.x = nx;
      if (this.canMove(this.heroPos.x, ny)) this.heroPos.y = ny;
      if (Math.abs(dx) > Math.abs(dy)) { this.heroDir = 2; this.heroFlip = dx > 0; }
      else this.heroDir = dy < 0 ? 1 : 0;
      this.walkT += dt;
      if (this.walkT > 0.13) { this.walkT = 0; this.walkIdx = (this.walkIdx + 1) % 4; }
    } else { this.walkIdx = 0; this.walkT = 0; }
    const phase = moving ? WALK_FRAMES[this.walkIdx] : 0;
    const bob = moving ? (this.walkIdx % 2) : (Math.floor(t / 520) % 2); // adım dalması / idle nefes
    this.hero.setTexture(`td-hero-${this.heroDir}-${phase}`);
    this.hero.setFlipX(this.heroFlip);
    this.hero.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y) + bob);
    this.hero.setDepth(depth(this.heroPos.x, this.heroPos.y));
    // su animasyonu: 400ms'de bir yalnız su içeren chunk'lar tazelenir
    this.waterT += dt;
    if (this.waterT > 0.4) {
      this.waterT = 0; this.waterFrame = ((this.waterFrame + 1) % 3) as 0 | 1 | 2;
      this.streamChunks(true);
    } else {
      this.streamChunks();
    }
    if (this.perfText) this.perfText.setText(
      `chunks:${this.perf.visible} stream:${this.perf.chunkMs.toFixed(1)}ms fps:${this.game.loop.actualFps | 0}`);
  }
}
