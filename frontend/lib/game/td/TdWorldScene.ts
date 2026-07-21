// frontend/lib/game/td/TdWorldScene.ts
// ─── Açık dünya sahnesi: chunk streaming + chibi kahraman ───
// Client-only (Phaser sahnesi). Su animasyonu yalnız su içeren chunk'ları tazeler.
import * as Phaser from 'phaser';
import { TILE, CHUNK, MAP_W, MAP_H, VIEW_W, VIEW_H, chunksInView, depth, hash2d } from './tdCore';
import { getTile, regionAt, TOWN_SPAWN } from './worldMap';
import { renderChunk, chunkHasWater, biomeTopColor } from './tiles';
import { chibiHumanoid, CHIBI_H } from './sprites/chibi';
import { propsForChunk, type TdProp } from './worldProps';
import { mkTree, mkRock, mkBush, mkFireFrames, mkBuilding, mkDungeonDoor } from './sprites/props';
import { atmoForRegion } from './atmosphere';
import { REGION_MONSTERS, type MonsterEntry } from './monsterData';
import { mkMonsterChibi } from './sprites/monsterChibi';

const WALK_FRAMES = [0, 1, 0, 2] as const; // faz dizisi (spec §4)

/** Dünyada gezinen tek bir canavar referansı (chunk başına Map'te tutulur). */
interface MonRef {
  entry: MonsterEntry;
  img: Phaser.GameObjects.Image;
  x: number; y: number;
  tx0: number; ty0: number;      // spawn merkezi (gezinme yarıçapı buradan ölçülür)
  tgtX: number; tgtY: number;    // şu anki gezinme hedefi
  pause: number;                 // hedefte bekleme süresi (s)
  f: number; ft: number;         // 2-kare anim + zamanlayıcı
  isElite: boolean;
  downUntil: number;             // knockback/stun süresi (ms, this.time.now bazlı)
}

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
  // ── Faz 2: prop render/collision + etkileşim + atmosfer + minimap ──
  private propMeta = new Map<string, { ox: number; oy: number }>();
  private chunkProps = new Map<string, { objs: Phaser.GameObjects.GameObject[]; solids: NonNullable<TdProp['solid']>[]; interactives: TdProp[] }>();
  private fires: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private nearProp: TdProp | null = null;
  private hintText!: Phaser.GameObjects.Text;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private fogRect!: Phaser.GameObjects.Rectangle;
  private minimapImg?: Phaser.GameObjects.Image;
  private minimapDot?: Phaser.GameObjects.Rectangle;
  private minimapX = VIEW_W - 100; private minimapY = 4;
  // ── Faz 3: overworld canavarları ──
  private chunkMonsters = new Map<string, MonRef[]>();
  private battleActive = false;
  private monTexCache = new Set<string>();

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

    // prop texture'ları (bir kez)
    const reg = (key: string, m: { img: HTMLCanvasElement }) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, m.img); };
    for (let v = 0; v < 4; v++) { const m = mkTree(v); reg(`td-tree-${v}`, m); this.propMeta.set(`tree-${v}`, { ox: m.ox, oy: m.oy }); }
    for (let v = 0; v < 2; v++) { const m = mkRock(v); reg(`td-rock-${v}`, m); this.propMeta.set(`rock-${v}`, { ox: m.ox, oy: m.oy }); }
    for (let v = 0; v < 2; v++) { const m = mkBush(v); reg(`td-bush-${v}`, m); this.propMeta.set(`bush-${v}`, { ox: m.ox, oy: m.oy }); }
    mkFireFrames().forEach((c, f) => { if (!this.textures.exists(`td-fire-${f}`)) this.textures.addCanvas(`td-fire-${f}`, c); });
    const dd = mkDungeonDoor(); reg('td-door-dungeon', dd); this.propMeta.set('door', { ox: dd.ox, oy: dd.oy });

    // etkileşim ipucu (alt-orta, HUD)
    this.hintText = this.add.text(VIEW_W / 2, VIEW_H - 14, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // atmosfer: tam-ekran tint + alt fog bandı (scrollFactor 0, düşük alpha, lerp update()'te)
    this.tintRect = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x88bbff, 0.04)
      .setScrollFactor(0).setDepth(1500);
    this.fogRect = this.add.rectangle(VIEW_W / 2, VIEW_H - 24, VIEW_W, 48, 0xbbddff, 0.10)
      .setScrollFactor(0).setDepth(1501);

    // E: en yakın hub binasına gir (dünya değişimi Faz 5'te — şimdilik CustomEvent + toast)
    kb.on('keydown-E', () => {
      const p = this.nearProp;
      if (p?.kind === 'building') {
        window.dispatchEvent(new CustomEvent('td-hub-open', { detail: { url: p.data!.url, name: p.data!.name, accent: p.data!.accent } }));
      }
    });
    // M: minimap toggle
    kb.on('keydown-M', () => this.toggleMinimap());

    this.streamChunks();
  }

  /** Minimap: ilk çağrıda 96×96 canvas üretir (4 tile/px, biyom üst rengi), sonrakiler visible toggle. */
  private toggleMinimap(): void {
    if (this.minimapImg) {
      const vis = !this.minimapImg.visible;
      this.minimapImg.setVisible(vis);
      this.minimapDot?.setVisible(vis);
      return;
    }
    const SIZE = 96, STEP = Math.floor(MAP_W / SIZE);
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const g = c.getContext('2d')!;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = getTile(x * STEP, y * STEP);
      g.fillStyle = biomeTopColor(t.biome);
      g.fillRect(x, y, 1, 1);
    }
    this.textures.addCanvas('td-minimap', c);
    this.minimapImg = this.add.image(this.minimapX, this.minimapY, 'td-minimap')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1e9).setAlpha(0.92);
    this.minimapDot = this.add.rectangle(this.minimapX, this.minimapY, 2, 2, 0xff3b3b)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1e9 + 1);
  }

  private canMove(nx: number, ny: number): boolean {
    for (const [ox, oy] of [[-4, 0], [4, 0], [-4, 3], [4, 3], [0, 3]] as const) {
      const t = getTile(Math.floor((nx + ox) / TILE), Math.floor((ny + oy) / TILE));
      if (t.collision) return false;
    }
    for (const cp of this.chunkProps.values()) {
      for (const s of cp.solids) {
        if (nx + 4 > s.x && nx - 4 < s.x + s.w && ny + 3 > s.y && ny < s.y + s.h) return false;
      }
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
    const cp = this.chunkProps.get(key);
    if (cp) {
      cp.objs.forEach(o => o.destroy());
      this.chunkProps.delete(key);
      this.fires = this.fires.filter(f => f.img.active);
    }
    const mons = this.chunkMonsters.get(key);
    if (mons) {
      mons.forEach(m => m.img.destroy());
      this.chunkMonsters.delete(key);
    }
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
      // NOT: su-tazeleme yolunda chunkProps'a DOKUNMA (statik dünya, prop'lar chunk başına bir kez kurulur)
      if (!this.chunkProps.has(key)) {
        const list = propsForChunk(c.cx, c.cy);
        const objs: Phaser.GameObjects.GameObject[] = [];
        const solids: NonNullable<TdProp['solid']>[] = [];
        const interactives: TdProp[] = [];
        for (const p of list) {
          if (p.solid) solids.push(p.solid);
          if (p.kind === 'building' || p.kind === 'door_dungeon') interactives.push(p);
          let texKey2 = '', meta = { ox: 8, oy: 14 };
          if (p.kind === 'tree') { texKey2 = `td-tree-${p.v ?? 0}`; meta = this.propMeta.get(`tree-${p.v ?? 0}`)!; }
          else if (p.kind === 'rock') { texKey2 = `td-rock-${p.v ?? 0}`; meta = this.propMeta.get(`rock-${p.v ?? 0}`)!; }
          else if (p.kind === 'bush') { texKey2 = `td-bush-${p.v ?? 0}`; meta = this.propMeta.get(`bush-${p.v ?? 0}`)!; }
          else if (p.kind === 'door_dungeon') { texKey2 = 'td-door-dungeon'; meta = this.propMeta.get('door')!; }
          else if (p.kind === 'campfire') {
            const fimg = this.add.image(p.x, p.y, 'td-fire-0').setOrigin(0.5, 0.9).setDepth(depth(p.x, p.y));
            this.fires.push({ img: fimg, x: p.x, y: p.y }); objs.push(fimg); continue;
          } else if (p.kind === 'building') {
            const bk = `td-bld-${p.data!.id}`;
            if (!this.textures.exists(bk)) {
              const bm = mkBuilding(p.data!.wTiles!, p.data!.hTiles!, p.data!.accent!, p.data!.icon!);
              this.textures.addCanvas(bk, bm.img);
            }
            const bimg = this.add.image(p.x, p.y, bk).setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
            const label = this.add.text(p.x, p.y - p.data!.hTiles! * 16 - 18, p.data!.name!, {
              fontSize: '8px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
            }).setOrigin(0.5, 1).setDepth(depth(p.x, p.y) + 1);
            objs.push(bimg, label); continue;
          }
          void meta; // (ox/oy şu an yalnız gölge-hizalama notu; origin(0.5,1) çizim tabanlıdır)
          const pimg = this.add.image(p.x, p.y, texKey2).setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
          objs.push(pimg);
        }
        this.chunkProps.set(key, { objs, solids, interactives });
      }
      if (!this.chunkMonsters.has(key)) this.spawnChunkMonsters(c.cx, c.cy, key);
    }
    this.perf.chunkMs = performance.now() - t0;
    this.perf.visible = this.chunks.size;
  }

  /** Canavar texture'larını bir kez üretir/kaydeder (2 kare). */
  private monTexture(type: string, isElite: boolean): string {
    const key = `td-mon-${type}`;
    if (!this.monTexCache.has(key)) {
      const m = mkMonsterChibi(type, false);
      this.textures.addCanvas(key, m.frames[0]);
      this.textures.addCanvas(`${key}-1`, m.frames[1]);
      this.monTexCache.add(key);
    }
    void isElite;
    return key;
  }

  /** Chunk yüklenirken bölge havuzundan canavar spawn eder (town hariç). */
  private spawnChunkMonsters(cx: number, cy: number, key: string): void {
    const centerTx = cx * CHUNK + CHUNK / 2, centerTy = cy * CHUNK + CHUNK / 2;
    const region = regionAt(centerTx, centerTy);
    const list: MonRef[] = [];
    this.chunkMonsters.set(key, list);
    if (region.key === 'town') return;
    const pool = REGION_MONSTERS[region.key];
    if (!pool || pool.length === 0) return;
    const count = hash2d(cx, cy, 7) % 3 + 2;
    for (let i = 0; i < count; i++) {
      const entry = pool[hash2d(cx * 7 + i, cy * 13 + i, 7) % pool.length];
      let px = -1, py = -1, ptx = 0, pty = 0;
      for (let tr = 0; tr < 20; tr++) {
        const lx = hash2d(cx * 31 + i * 7 + tr, cy * 17 + tr, 7) % CHUNK;
        const ly = hash2d(cx * 17 + tr, cy * 31 + i * 7 + tr, 7) % CHUNK;
        const tx = cx * CHUNK + lx, ty = cy * CHUNK + ly;
        const sx = tx * TILE + 8, sy = ty * TILE + 8;
        if (getTile(tx, ty).collision) continue;
        if (Math.hypot(sx - (TOWN_SPAWN.tx * TILE + 8), sy - (TOWN_SPAWN.ty * TILE + 8)) <= 64) continue;
        let blocked = false;
        for (const cp of this.chunkProps.values()) {
          for (const s of cp.solids) {
            if (sx > s.x - 48 && sx < s.x + s.w + 48 && sy > s.y - 48 && sy < s.y + s.h + 48) { blocked = true; break; }
          }
          if (blocked) break;
        }
        if (blocked) continue;
        px = sx; py = sy; ptx = tx; pty = ty; break;
      }
      if (px < 0) continue;
      const isElite = hash2d(ptx, pty, 7) % 10 === 0;
      let finalEntry = entry;
      if (isElite) {
        finalEntry = {
          ...entry,
          name: `Elite ${entry.name}`,
          hp: Math.round(entry.hp * 2),
          atk: Math.round(entry.atk * 1.5),
          def: Math.round(entry.def * 1.3),
        };
      }
      const texKey = this.monTexture(entry.type, isElite);
      const img = this.add.image(px, py, texKey).setOrigin(0.5, 1).setDepth(depth(px, py));
      if (isElite) img.setScale(1.15);
      const ref: MonRef = {
        entry: finalEntry, img, x: px, y: py, tx0: px, ty0: py,
        tgtX: px, tgtY: py, pause: Math.random() * 2, f: 0, ft: 0, isElite, downUntil: 0,
      };
      list.push(ref);
    }
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
    if (this.perfText) {
      let monCount = 0;
      for (const list of this.chunkMonsters.values()) monCount += list.length;
      this.perfText.setText(
        `chunks:${this.perf.visible} stream:${this.perf.chunkMs.toFixed(1)}ms fps:${this.game.loop.actualFps | 0} mon:${monCount}`);
    }

    // kamp ateşi 4-kare (130ms)
    const ff = Math.floor(t / 130) % 4;
    for (const f of this.fires) f.img.setTexture(`td-fire-${ff}`);
    // canavar gezinme + temas
    const WANDER_SPEED = 18; // px/s
    for (const list of this.chunkMonsters.values()) {
      for (const m of list) {
        if (m.downUntil > t) { continue; } // knockback/stun süresi
        if (m.pause > 0) {
          m.pause -= dt;
        } else {
          const dmx = m.tgtX - m.x, dmy = m.tgtY - m.y;
          const dist = Math.hypot(dmx, dmy);
          if (dist < 2) {
            // yeni hedef: spawn merkezinin 40px yarıçapında
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.random() * 40;
            m.tgtX = m.tx0 + Math.cos(ang) * rad;
            m.tgtY = m.ty0 + Math.sin(ang) * rad;
            m.pause = 2 + Math.random() * 2;
          } else {
            const nx = m.x + (dmx / dist) * WANDER_SPEED * dt;
            const ny = m.y + (dmy / dist) * WANDER_SPEED * dt;
            m.img.setFlipX(dmx < 0);
            m.x = nx; m.y = ny;
          }
        }
        m.ft += dt;
        if (m.ft > 0.3) { m.ft = 0; m.f = m.f === 0 ? 1 : 0; }
        const baseKey = `td-mon-${m.entry.type}`;
        m.img.setTexture(m.f === 0 ? baseKey : `${baseKey}-1`);
        m.img.setPosition(Math.round(m.x), Math.round(m.y));
        m.img.setDepth(depth(m.x, m.y));
        // temas
        if (!this.battleActive && m.downUntil <= t) {
          const hd = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
          if (hd < 12) this.startBattle(m);
        }
      }
    }
    // etkileşim: en yakın interaktif ≤ 28px
    let near: TdProp | null = null; let nd = 28;
    for (const cp of this.chunkProps.values()) for (const p of cp.interactives) {
      const d = Math.hypot(this.heroPos.x - p.x, this.heroPos.y - p.y);
      if (d < nd) { nd = d; near = p; }
    }
    if (near !== this.nearProp) {
      this.nearProp = near;
      this.hintText.setText(near
        ? (near.kind === 'building' ? `E — ${near.data!.name}` : `⛓ ${near.data!.name} — sealed (Phase 3)`)
        : '').setVisible(!!near);
    }
    // atmosfer lerp
    const atmo = atmoForRegion(regionAt(Math.floor(this.heroPos.x / 16), Math.floor(this.heroPos.y / 16)).key);
    this.tintRect.fillColor = atmo.tint; this.tintRect.fillAlpha += (atmo.tintAlpha - this.tintRect.fillAlpha) * 0.05;
    this.fogRect.fillColor = atmo.fogColor; this.fogRect.fillAlpha += (atmo.fogAlpha - this.fogRect.fillAlpha) * 0.05;
    // minimap hero noktası
    if (this.minimapDot?.visible) this.minimapDot.setPosition(this.minimapX + this.heroPos.x / (MAP_W * TILE) * 96, this.minimapY + this.heroPos.y / (MAP_H * TILE) * 96);
  }

  /**
   * Temas encounter'ı. GEÇİCİ (Task 4'te gerçek TdBattle launch'a dönüşecek):
   * canavarı kahramandan 24px iter (knockback + 1.5s stun) + hint metninde yanıp söner.
   */
  private startBattle(m: MonRef): void {
    const now = this.time.now;
    m.downUntil = now + 1500;
    const dx = m.x - this.heroPos.x, dy = m.y - this.heroPos.y;
    const dist = Math.hypot(dx, dy) || 1;
    let nx = m.x + (dx / dist) * 24, ny = m.y + (dy / dist) * 24;
    if (getTile(Math.floor(nx / TILE), Math.floor(ny / TILE)).collision) { nx = m.x; ny = m.y; }
    m.x = nx; m.y = ny;
    m.img.setPosition(Math.round(nx), Math.round(ny));
    const label = `⚔ ${m.entry.name} Lv${m.entry.level}`;
    const prevVisible = this.hintText.visible;
    const prevText = this.hintText.text;
    this.hintText.setText(label).setVisible(true);
    this.time.delayedCall(1500, () => {
      if (this.hintText.text === label) this.hintText.setText(prevVisible ? prevText : '').setVisible(prevVisible);
    });
  }
}
