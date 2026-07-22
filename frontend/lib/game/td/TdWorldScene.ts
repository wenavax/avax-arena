// frontend/lib/game/td/TdWorldScene.ts
// ─── Açık dünya sahnesi: chunk streaming + chibi kahraman ───
// Client-only (Phaser sahnesi). Su animasyonu yalnız su içeren chunk'ları tazeler.
import * as Phaser from 'phaser';
import { TILE, CHUNK, MAP_W, MAP_H, VIEW_W, VIEW_H, chunksInView, depth, hash2d } from './tdCore';
import { getTile, regionAt, TOWN_SPAWN } from './worldMap';
import { renderChunk, chunkHasWater, biomeTopColor } from './tiles';
import { chibiHumanoid, CHIBI_H, paletteForId, hashId } from './sprites/chibi';
import { propsForChunk, type TdProp } from './worldProps';
import { mkTree, mkRock, mkBush, mkFireFrames, mkBuilding, mkDungeonDoor, mkStump, mkFarmPlot } from './sprites/props';
import { atmoForRegion } from './atmosphere';
import { REGION_MONSTERS, type MonsterEntry } from './monsterData';
import { mkMonsterChibi } from './sprites/monsterChibi';
import { TdState, migrateV1 } from './tdState';
import { COSTS, PER_HIT } from './cozy/rules';
import { mp } from '../multiplayer/socket';

/** Faz 5: TdPhaserGame registry'ye yazdığı basit dokunmatik input state'i (bkz. TdPhaserGame.tsx). */
interface TdTouchInput { dx: number; dy: number; e: boolean; space: boolean }

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

/** Toplanabilir kaynak node'u (chunk-yerel RAM'de; kalıcı değil — chunk yeniden yüklenince tazelenir). */
interface Gatherable {
  kind: 'tree' | 'rock' | 'bush';
  img: Phaser.GameObjects.Image;
  x: number; y: number;
  tx: number; ty: number;      // tile koordinatı (ore şansı hash'i için)
  hits: number;                 // kalan vuruş sayısı (tree/rock=3, bush=1)
  alive: boolean;
  respawnAt: number;            // this.time.now bazlı; alive=false iken geçerli
  origTexKey: string;           // respawn'da geri dönülecek texture
  bushVariant?: number;         // bush ise orijinal v (0/1)
}

/** MP presence (Faz 5 Task 2): iso'daki RemotePlayer'ın TD-sadeleştirilmiş karşılığı —
 *  chibi sprite + isim etiketi, hedefe lerp (tween yerine basit per-frame lerp — TD update()
 *  zaten her karede pozisyon/derinlik güncelliyor, aynı desene uyar). */
class TdRemotePlayer {
  x: number; y: number;
  targetX: number; targetY: number;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, id: string, name: string, x: number, y: number) {
    this.x = x; this.y = y; this.targetX = x; this.targetY = y;
    const palette = paletteForId(id);
    const key = remoteTexKey(id);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, chibiHumanoid(0, 0, palette));
    this.img = scene.add.image(x, y, key).setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H).setDepth(depth(x, y));
    this.label = scene.add.text(x, y - CHIBI_H - 2, name || 'traveler', {
      fontSize: '8px', fontFamily: 'monospace', color: '#aaddff',
      backgroundColor: '#141c24cc', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(depth(x, y) + 1);
  }

  setTarget(x: number, y: number): void {
    this.targetX = x; this.targetY = y;
  }

  /** Per-frame lerp doğru hedefe — tween yerine (TD update() zaten her kare depth/pozisyon basıyor). */
  update(dt: number): void {
    const rate = Math.min(1, dt * 8); // ~8/s yaklaşma — hafif gecikme, snap yok
    this.x += (this.targetX - this.x) * rate;
    this.y += (this.targetY - this.y) * rate;
    this.img.setPosition(Math.round(this.x), Math.round(this.y));
    this.img.setDepth(depth(this.x, this.y));
    this.label.setPosition(Math.round(this.x), Math.round(this.y) - CHIBI_H - 2);
    this.label.setDepth(depth(this.x, this.y) + 1);
  }

  destroy(): void {
    this.img.destroy();
    this.label.destroy();
  }
}

/** id başına sabit texture key (palet id'den deterministik türediği için id yeterli — cache-friendly). */
function remoteTexKey(id: string): string {
  return `td-remote-${hashId(id) % 6}`;
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
  // ── Faz 4: cozy toplama (SPACE) + enerji HUD ──
  tdState = new TdState();
  private chunkGatherables = new Map<string, Map<string, Gatherable>>();
  private saveT = 0; // enerji tick save biriktirici (≤ 5sn'de bir yaz)
  private energyBarBg!: Phaser.GameObjects.Rectangle;
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private energyText!: Phaser.GameObjects.Text;
  private fireBoostText!: Phaser.GameObjects.Text;
  private gatherHint!: Phaser.GameObjects.Text;
  private fishing = false; private fishT = 0;
  private farmImgs = new Map<number, Phaser.GameObjects.Image>(); // plotIndex → img (kalıcı: kasaba her zaman yüklü chunk'ta)
  private goldText!: Phaser.GameObjects.Text;

  private tdMode: 'preview' | 'live' = 'preview';
  // one-shot tüketim: dokunmatik E/SPACE'in bir önceki karede zaten işlenmiş olup olmadığını izler
  private touchEPrev = false; private touchSpacePrev = false;

  // ── Faz 5 Task 2: MP presence (yalnız LIVE) — tek düzlem 'td' zone, graceful skip ──
  private mpEnabled = false; // socket kurulumu başarılıysa true; her yerde try/catch korumalı
  private remoteTd = new Map<string, TdRemotePlayer>();
  /** [event, handler] — cleanup'ta mp.off için (offAll kullanma: HUD/diğer sahneler etkilenmesin) */
  private mpTdHandlers: Array<[string, (data?: any) => void]> = [];
  private mpMoveT = 0; // pozisyon yayını biriktiricisi (spam önleyici)

  constructor() { super({ key: 'TdWorld' }); }

  create(): void {
    this.tdMode = (this.registry.get('tdMode') as 'preview' | 'live' | undefined) ?? 'preview';
    this.tdState.load();
    // LIVE mod: tdState'te kayıtlı TD pozisyonu öncelikli; yoksa canlı v1 (izo) save'inden
    // migrateV1 ile TÜRETİLEN worldPos (salt okuma — frostbite_save'e asla yazılmaz);
    // o da yoksa TOWN_SPAWN (heroPos zaten TOWN_SPAWN ile başlatıldı, dokunma).
    if (this.tdMode === 'live') {
      if (this.tdState.worldPos) {
        this.heroPos = { x: this.tdState.worldPos.x, y: this.tdState.worldPos.y };
      } else if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('frostbite_save');
          if (raw) {
            const v1 = JSON.parse(raw);
            if (v1 && typeof v1 === 'object') {
              const migrated = migrateV1(v1 as Record<string, unknown>);
              const wp = migrated.worldPos as { x: number; y: number } | undefined;
              if (wp) this.heroPos = { x: wp.x, y: wp.y };
            }
          }
        } catch { /* malformed v1 save — TOWN_SPAWN kalır */ }
      }
    }
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
    const stump = mkStump(); reg('td-stump', stump); this.propMeta.set('stump', { ox: stump.ox, oy: stump.oy });
    for (let s = 0; s < 4; s++) { const m = mkFarmPlot(s as 0 | 1 | 2 | 3); reg(`td-farm-${s}`, m); this.propMeta.set(`farm-${s}`, { ox: m.ox, oy: m.oy }); }

    // etkileşim ipucu (alt-orta, HUD)
    this.hintText = this.add.text(VIEW_W / 2, VIEW_H - 14, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // enerji HUD: sol-üst 60×6 bar + ⚡sayı; kamp ateşi yakınında 🔥×4 rozeti
    this.energyBarBg = this.add.rectangle(6, 6, 60, 6, 0x1a2028, 0.85).setOrigin(0, 0).setScrollFactor(0).setDepth(1e9);
    this.energyBarFill = this.add.rectangle(6, 6, 60, 6, 0x57b8d8, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(1e9);
    this.energyText = this.add.text(70, 3, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#9fe8ff', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(1e9);
    this.fireBoostText = this.add.text(6, 14, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ff9d3f',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(1e9).setVisible(false);
    this.goldText = this.add.text(6, 24, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffd23f', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(1e9);
    this.gatherHint = this.add.text(VIEW_W / 2, VIEW_H - 26, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // atmosfer: tam-ekran tint + alt fog bandı (scrollFactor 0, düşük alpha, lerp update()'te)
    this.tintRect = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x88bbff, 0.04)
      .setScrollFactor(0).setDepth(1500);
    this.fogRect = this.add.rectangle(VIEW_W / 2, VIEW_H - 24, VIEW_W, 48, 0xbbddff, 0.10)
      .setScrollFactor(0).setDepth(1501);

    // E: en yakın hub binasına gir (LIVE: gerçek overlay / PREVIEW: toast) veya en yakın
    // zindan kapısına gir (TdDungeon launch+pause — battle akışıyla simetrik).
    // Klavye VE dokunmatik (td-touch-e, update()'te one-shot emit) aynı metodu çağırır.
    kb.on('keydown-E', () => this.handleInteract());
    this.events.on('td-touch-e', () => this.handleInteract());
    // M: minimap toggle
    kb.on('keydown-M', () => this.toggleMinimap());
    // SPACE: en yakın toplanabilir kes/kaz/topla, yoksa kıyıda balık tut
    kb.on('keydown-SPACE', () => this.onSpaceGather());

    this.streamChunks();

    // MP presence: yalnız LIVE modda, tamamen izole+graceful (bkz. setupMultiplayerTd doc).
    if (this.tdMode === 'live') this.setupMultiplayerTd();
    this.events.once('shutdown', () => this.cleanupMultiplayerTd());
    this.events.once('destroy', () => this.cleanupMultiplayerTd());
  }

  /** E etkileşimi: en yakın interaktif prop'a göre dallanır (klavye + dokunmatik ortak yol). */
  private handleInteract(): void {
    const p = this.nearProp;
    if (this.battleActive) return;
    // paused-input sızıntısına karşı savunma: alt sahne aktifken yeniden-launch yok
    if (this.scene.isActive('TdDungeon') || this.scene.isActive('TdBattle')) return;
    if (p?.kind === 'building' && p.data!.id === 'marketplace') {
      const gold = this.tdState.sellAll();
      this.tdState.save();
      if (gold > 0) {
        window.dispatchEvent(new CustomEvent('td-sell', { detail: { gold, total: gold } }));
        this.floatText(this.heroPos.x, this.heroPos.y - 16, `+${gold}g 💰`, '#ffd23f');
      } else {
        this.showRedHint('nothing to sell');
      }
    } else if (p?.kind === 'building') {
      if (this.tdMode === 'live') {
        // Gerçek same-origin iframe overlay (GameOverlay.tsx) — izo'nun 'hub_' akışıyla
        // birebir aynı sözleşme: HUB_GAMES id'si + hub-overlay-opened/closed ack çifti.
        this.scene.pause();
        let acked = false;
        const onAck = () => { acked = true; };
        window.addEventListener('hub-overlay-opened', onAck, { once: true });
        window.dispatchEvent(new CustomEvent('hub-open-game', { detail: { gameId: p.data!.id } }));
        const onClosed = () => {
          window.removeEventListener('hub-overlay-closed', onClosed);
          clearTimeout(rollbackTimer);
          this.scene.resume();
        };
        window.addEventListener('hub-overlay-closed', onClosed);
        const rollbackTimer = window.setTimeout(() => {
          if (acked) return;
          window.removeEventListener('hub-overlay-closed', onClosed);
          if (this.scene.isPaused()) this.scene.resume();
        }, 1500);
      } else {
        window.dispatchEvent(new CustomEvent('td-hub-open', { detail: { url: p.data!.url, name: p.data!.name, accent: p.data!.accent } }));
      }
    } else if (p?.kind === 'door_dungeon') {
      this.scene.pause();
      this.scene.launch('TdDungeon', { dungeonId: p.data!.id, exitPos: { x: this.heroPos.x, y: this.heroPos.y } });
    } else if (p?.kind === 'farm_plot') {
      const i = p.data!.plotIndex!;
      const plot = this.tdState.farm[i];
      if (plot?.stage === 0) {
        if (this.tdState.plant(i)) { this.tdState.save(); this.floatText(p.x, p.y - 14, 'planted 🌱', '#5aa06a'); }
        else this.showRedHint('Not enough energy ⚡');
      } else if (plot?.stage === 3) {
        if (this.tdState.harvest(i)) { this.tdState.save(); this.floatText(p.x, p.y - 14, '+1 🍒'); }
        else this.showRedHint('Not enough energy ⚡');
      } else {
        this.showRedHint('growing…');
      }
    }
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
      for (const [idx, img] of this.farmImgs) if (!img.active) this.farmImgs.delete(idx);
    }
    this.chunkGatherables.delete(key); // node'lar chunk-yerel RAM'de; evict'te bilinçli tazelenir (determinizm bozulmaz)
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
        const gatherables = new Map<string, Gatherable>();
        for (const p of list) {
          if (p.solid) solids.push(p.solid);
          if (p.kind === 'building' || p.kind === 'door_dungeon' || p.kind === 'farm_plot') interactives.push(p);
          if (p.kind === 'farm_plot') {
            const stage = this.tdState.farm[p.data!.plotIndex!]?.stage ?? 0;
            const fimg = this.add.image(p.x, p.y, `td-farm-${stage}`).setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
            this.farmImgs.set(p.data!.plotIndex!, fimg);
            objs.push(fimg);
            continue;
          }
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
          // toplanabilir kayıt: tree/rock her zaman; bush yalnız berry-full varyant (v===1)
          if (p.kind === 'tree' || p.kind === 'rock' || (p.kind === 'bush' && (p.v ?? 0) === 1)) {
            const gkey = `${p.x},${p.y}`;
            gatherables.set(gkey, {
              kind: p.kind, img: pimg, x: p.x, y: p.y,
              tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE),
              hits: p.kind === 'bush' ? 1 : 3, alive: true, respawnAt: 0,
              origTexKey: texKey2, bushVariant: p.kind === 'bush' ? p.v : undefined,
            });
          }
        }
        this.chunkProps.set(key, { objs, solids, interactives });
        this.chunkGatherables.set(key, gatherables);
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
    const touch = this.readTouchInput();
    let dx = 0, dy = 0;
    if (!this.fishing) {
      if (this.keys.W.isDown || this.cursors.up.isDown) dy -= 1;
      if (this.keys.S.isDown || this.cursors.down.isDown) dy += 1;
      if (this.keys.A.isDown || this.cursors.left.isDown) dx -= 1;
      if (this.keys.D.isDown || this.cursors.right.isDown) dx += 1;
      // Mobil sanal joystick: klavye zaten bir eksende hareket vermediyse dokunmatik ekleyerek birleştir.
      if (dx === 0 && touch.dx) dx = touch.dx;
      if (dy === 0 && touch.dy) dy = touch.dy;
    }
    // Dokunmatik E/SPACE: one-shot (kenar-tetikli — basılı tutmak spam etmez).
    if (touch.e && !this.touchEPrev) this.events.emit('td-touch-e');
    if (touch.space && !this.touchSpacePrev) this.onSpaceGather();
    this.touchEPrev = touch.e; this.touchSpacePrev = touch.space;
    const moving = !!(dx || dy);
    if (moving && this.fishing) { this.fishing = false; this.gatherHint.setVisible(false); } // hareket iptal eder
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
        ? (near.kind === 'building' ? `E — ${near.data!.name}`
          : near.kind === 'farm_plot' ? (() => {
              const st = this.tdState.farm[near!.data!.plotIndex!]?.stage ?? 0;
              return `E — ${st === 0 ? 'plant' : st === 3 ? 'harvest' : 'growing…'}`;
            })()
          : `E — enter ${near.data!.name}`)
        : '').setVisible(!!near);
    }
    // atmosfer lerp
    const atmo = atmoForRegion(regionAt(Math.floor(this.heroPos.x / 16), Math.floor(this.heroPos.y / 16)).key);
    this.tintRect.fillColor = atmo.tint; this.tintRect.fillAlpha += (atmo.tintAlpha - this.tintRect.fillAlpha) * 0.05;
    this.fogRect.fillColor = atmo.fogColor; this.fogRect.fillAlpha += (atmo.fogAlpha - this.fogRect.fillAlpha) * 0.05;
    // minimap hero noktası
    if (this.minimapDot?.visible) this.minimapDot.setPosition(this.minimapX + this.heroPos.x / (MAP_W * TILE) * 96, this.minimapY + this.heroPos.y / (MAP_H * TILE) * 96);

    // ── Faz 4: kamp ateşi yakınlığı + enerji tick + HUD ──
    let nearFire = false;
    for (const f of this.fires) {
      if (Math.hypot(this.heroPos.x - f.x, this.heroPos.y - f.y) <= 48) { nearFire = true; break; }
    }
    this.tdState.tick(dt, nearFire);
    this.fireBoostText.setVisible(nearFire).setText(nearFire ? '🔥×4' : '');
    const pct = Phaser.Math.Clamp(this.tdState.energy / TdState.ENERGY_MAX, 0, 1);
    this.energyBarFill.width = 60 * pct;
    this.energyBarFill.fillColor = pct < 0.2 ? 0xe84142 : 0x57b8d8;
    this.energyText.setText(`⚡${Math.round(this.tdState.energy)}`);
    this.goldText.setText(`💰${this.tdState.gold}`);

    // tarla parsel görselleri: tdState.farm[i].stage ile senkron (texture swap)
    for (const [idx, img] of this.farmImgs) {
      const stage = this.tdState.farm[idx]?.stage ?? 0;
      const key = `td-farm-${stage}`;
      if (img.texture.key !== key) img.setTexture(key);
    }

    // MP presence: uzak oyuncu lerp'i her kare + pozisyon yayını ~150ms'de bir (spam önleyici).
    if (this.mpEnabled) {
      for (const rp of this.remoteTd.values()) rp.update(dt);
      this.mpMoveT += dt;
      if (this.mpMoveT >= 0.15) { this.mpMoveT = 0; this.broadcastTdMove(); }
    }

    // periyodik kaydet (per-frame yazma yerine ≤5sn'de bir — tick kaynaklı sürekli enerji değişimi için)
    // LIVE modda hero konumu da bu biriktiriciyle yazılır (aynı 5sn penceresi paylaşılır).
    this.saveT += dt;
    if (this.saveT >= 5) {
      this.saveT = 0;
      if (this.tdMode === 'live') this.tdState.worldPos = { x: this.heroPos.x, y: this.heroPos.y };
      this.tdState.save();
    }

    // toplanabilir respawn: süresi geçmişleri geri getir
    for (const g of this.chunkGatherables.values()) for (const gv of g.values()) {
      if (!gv.alive && gv.respawnAt > 0 && t >= gv.respawnAt) {
        gv.alive = true; gv.respawnAt = 0;
        gv.hits = gv.kind === 'bush' ? 1 : 3;
        if (gv.kind === 'bush') gv.img.setTexture(`td-bush-${gv.bushVariant ?? 1}`);
        else if (gv.kind === 'tree') gv.img.setTexture(gv.origTexKey);
        else { gv.img.setVisible(true); gv.img.setTexture(gv.origTexKey); }
      }
    }

    // balık tutma sayacı (2.5sn) — hareket iptal eder (üstte), tamamlanınca +1 balık
    if (this.fishing) {
      this.fishT += dt;
      if (this.fishT >= 2.5) {
        this.fishing = false; this.fishT = 0;
        if (this.tdState.gather('fish')) {
          this.floatText(this.heroPos.x, this.heroPos.y - 16, '+1 🐟');
          this.tdState.save();
        } else {
          this.showRedHint('Not enough energy ⚡');
        }
        this.gatherHint.setVisible(false);
      }
    }
  }

  /** Yükselen '+1 🪵' vb. juice metni: 900ms'de 20px yukarı süzülüp yok olur. */
  private floatText(x: number, y: number, msg: string, color = '#e8eef4'): void {
    const t = this.add.text(x, y, msg, {
      fontSize: '10px', fontFamily: 'monospace', color, backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(1e9);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** Geçici kırmızı ipucu (ör. 'Not enough energy ⚡'), 1.2sn sonra gatherHint temizlenir. */
  private showRedHint(msg: string): void {
    this.gatherHint.setText(msg).setColor('#ff5c5c').setVisible(true);
    this.time.delayedCall(1200, () => { if (this.gatherHint.text === msg) this.gatherHint.setVisible(false); });
  }

  /**
   * SPACE: en yakın toplanabilir (≤22px) → kes/kaz/topla; yoksa kıyıda balık tutmayı dener.
   * NOT (API notu): tdState.gather(kind) TOPLAM aksiyon maliyetini (COSTS.chop=15 vb.) TEK seferde
   * düşürür — vuruş-başına harcama modeline uymuyor. Bu yüzden çok-vuruşlu kesme/kazma için enerji
   * PER_HIT'ten manuel düşülür (gather ile birebir aynı "yetersizse hiçbir şey değişmez" kuralına
   * uyularak) ve yalnız SON vuruşta kaynak +1 edilir — böylece toplam harcanan enerji COSTS ile
   * birebir eşleşir. Tek-vuruşluk bush/fish için gather() doğrudan kullanılır (API tam uyumlu).
   */
  private onSpaceGather(): void {
    if (this.battleActive) return;
    if (this.scene.isActive('TdDungeon') || this.scene.isActive('TdBattle')) return;
    if (this.fishing) return;

    let nearest: Gatherable | null = null; let nd = 22;
    for (const g of this.chunkGatherables.values()) for (const gv of g.values()) {
      if (!gv.alive) continue;
      const d = Math.hypot(this.heroPos.x - gv.x, this.heroPos.y - gv.y);
      if (d < nd) { nd = d; nearest = gv; }
    }

    if (nearest) {
      const g = nearest as Gatherable;
      if (g.kind === 'bush') {
        if (!this.tdState.gather('frostberry')) { this.showRedHint('Not enough energy ⚡'); return; }
        g.alive = false; g.respawnAt = this.time.now + 20000;
        g.img.setTexture('td-bush-0');
        this.floatText(g.x, g.y - 14, '+1 🍒');
        this.tdState.save();
        return;
      }
      const perHit = g.kind === 'tree' ? PER_HIT.chop : PER_HIT.mine;
      if (this.tdState.energy < perHit) { this.showRedHint('Not enough energy ⚡'); return; }
      this.tdState.energy -= perHit;
      g.hits -= 1;
      if (g.hits > 0) {
        this.floatText(g.x, g.y - 14, g.kind === 'tree' ? '🪵' : '⛏️', '#cfd8df');
        this.tdState.save();
        return;
      }
      // son vuruş: kaynak +1, despawn/respawn
      if (g.kind === 'tree') {
        this.tdState.resources.wood += 1;
        g.alive = false; g.respawnAt = this.time.now + 25000;
        g.img.setTexture('td-stump');
        this.floatText(g.x, g.y - 14, '+1 🪵');
      } else {
        const isOre = hash2d(g.tx, g.ty, 4) % 4 === 0;
        if (isOre) this.tdState.resources.ore += 1; else this.tdState.resources.stone += 1;
        g.alive = false; g.respawnAt = this.time.now + 30000;
        g.img.setVisible(false);
        this.floatText(g.x, g.y - 14, isOre ? '+1 ⛏️' : '+1 🪨');
      }
      this.tdState.save();
      return;
    }

    // toplanabilir yok: kıyı kontrolü → balık tutma
    if (this.isNearWater()) this.startFishing();
  }

  /** 4 komşu tile'dan biri su mu? (kıyı testi) */
  private isNearWater(): boolean {
    const tx = Math.floor(this.heroPos.x / TILE), ty = Math.floor(this.heroPos.y / TILE);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (getTile(tx + dx, ty + dy).biome === 'water') return true;
    }
    return false;
  }

  private startFishing(): void {
    if (this.fishing) return;
    if (this.tdState.energy < COSTS.fish) { this.showRedHint('Not enough energy ⚡'); return; }
    this.fishing = true; this.fishT = 0;
    this.gatherHint.setText('fishing… 🎣').setColor('#9fe8ff').setVisible(true);
  }

  /** Bir MonRef'i chunkMonsters'ta bulup listesinden çıkarır + görüntüsünü yok eder (kazanılan savaş). */
  private despawnMonster(m: MonRef): void {
    for (const list of this.chunkMonsters.values()) {
      const i = list.indexOf(m);
      if (i >= 0) { list.splice(i, 1); break; }
    }
    m.img.destroy();
  }

  /**
   * Temas encounter'ı: TdBattle'ı launch edip TdWorld'ü duraklatır (IsoNecropolis
   * kalıbıyla birebir — launch→pause→battle-end once→resume). Kazanılırsa canavar
   * kalıcı despawn olur; kaybedilirse ışınlama YOK — yalnız 3sn grace (downUntil).
   */
  private startBattle(m: MonRef): void {
    if (this.battleActive) return;
    this.battleActive = true;
    m.downUntil = this.time.now + 1e9; // savaş boyunca donuk (gezinme/temas durur)
    const region = regionAt(Math.floor(m.x / TILE), Math.floor(m.y / TILE));
    this.scene.launch('TdBattle', {
      monster: {
        type: m.entry.type,
        tile: 0,
        name: m.entry.name,
        level: m.entry.level,
        hp: m.entry.hp,
        maxHp: m.entry.hp,
        atk: m.entry.atk,
        def: m.entry.def,
        isElite: m.isElite,
      },
      region: region.key,
      returnScene: 'TdWorld',
      sandbox: this.tdMode !== 'live',
    });
    this.scene.pause();
    this.scene.get('TdBattle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.battleActive = false;
      if (result?.won) {
        this.despawnMonster(m);
      } else {
        m.downUntil = this.time.now + 3000; // yenilgi: ışınlama yok, kısa dokunulmazlık
      }
    });
  }

  /** Faz 5: registry'deki 'tdTouch' input state'ini okur (yoksa nötr). E/SPACE one-shot tüketilir. */
  private readTouchInput(): TdTouchInput {
    const t = this.registry.get('tdTouch') as TdTouchInput | undefined;
    return t ?? { dx: 0, dy: 0, e: false, space: false };
  }

  // -----------------------------------------------------------------------
  // Faz 5 Task 2: MP presence — tek düzlem 'td' zone, graceful skip
  // -----------------------------------------------------------------------
  /** izo'nun IsoBaseScene.setupMultiplayer() ile AYNI sözleşme: mp.connect/register/joinZone,
   *  event adları (zone-players/player-joined/player-left/player-moved) birebir. Tek fark:
   *  zone SABİT 'td' (bölgeden türetilmez) — TD oyuncuları tek ortak odada, izo bölgelerinden ayrı.
   *  Socket modülü/sunucu yoksa/hata verirse tamamen sessiz devre dışı kalır — oyunu ASLA bozmaz. */
  private setupMultiplayerTd(): void {
    try {
      if (!mp.connected) {
        mp.connect();
        this.mpTdOn('_connected', () => this.mpRegisterAndJoinTd());
      } else {
        this.mpRegisterAndJoinTd();
      }

      this.mpTdOn('zone-players', (players: Array<{ id: string; name: string; tx: number; ty: number }>) => {
        try {
          for (const p of players ?? []) {
            if (p.id === mp.id || this.remoteTd.has(p.id)) continue;
            const rp = new TdRemotePlayer(this, p.id, p.name, p.tx * TILE + 8, p.ty * TILE + 8);
            this.remoteTd.set(p.id, rp);
          }
        } catch { /* graceful: render hatası MP'yi kapatmaz */ }
      });

      this.mpTdOn('player-joined', (p: { id: string; name: string; tx: number; ty: number }) => {
        try {
          if (!p || p.id === mp.id || this.remoteTd.has(p.id)) return;
          const rp = new TdRemotePlayer(this, p.id, p.name, p.tx * TILE + 8, p.ty * TILE + 8);
          this.remoteTd.set(p.id, rp);
        } catch { /* no-op */ }
      });

      this.mpTdOn('player-left', (data: { id: string }) => {
        try {
          const rp = this.remoteTd.get(data?.id);
          if (rp) { rp.destroy(); this.remoteTd.delete(data.id); }
        } catch { /* no-op */ }
      });

      this.mpTdOn('player-moved', (data: { id: string; tx: number; ty: number }) => {
        try {
          const rp = this.remoteTd.get(data?.id);
          if (rp) rp.setTarget(data.tx * TILE + 8, data.ty * TILE + 8);
        } catch { /* no-op */ }
      });

      this.mpEnabled = true;
    } catch {
      // Socket modülü yok/başlatılamadı — MP presence sessizce kapalı, oyun normal devam eder.
      this.mpEnabled = false;
    }
  }

  private mpRegisterAndJoinTd(): void {
    try {
      const s = this.tdState;
      const wallet = (window as any).__frostbiteWallet?.address || `guest_${Date.now()}`;
      mp.register({
        wallet, name: wallet.slice(0, 10), playerClass: 'td', level: 1,
        skinColor: 0xf2c99a, hairColor: 0x5b3a24,
      });
      // zone 'td' SABİT — TdWorld oyuncuları tek ortak odada, izo bölgelerinden bağımsız.
      const tx = Math.floor(this.heroPos.x / TILE), ty = Math.floor(this.heroPos.y / TILE);
      mp.joinZone('td', tx, ty);
      void s;
    } catch { /* graceful: register/join başarısız olsa da oyun akışı bozulmaz */ }
  }

  private mpTdOn(event: string, fn: (data?: any) => void): void {
    this.mpTdHandlers.push([event, fn]);
    mp.on(event, fn);
  }

  /** Oyuncu hareketini yayınla (LIVE + mp bağlıysa). Update() içinden ~150ms'de bir çağrılır. */
  private broadcastTdMove(): void {
    if (!this.mpEnabled) return;
    try {
      if (!mp.connected) return;
      const tx = Math.floor(this.heroPos.x / TILE), ty = Math.floor(this.heroPos.y / TILE);
      mp.sendMove(tx, ty, this.heroDir === 2 ? (this.heroFlip ? 'right' : 'left') : this.heroDir === 1 ? 'up' : 'down');
    } catch { /* no-op — MP yayın hatası oyunu etkilemez */ }
  }

  /** Sahne shutdown/destroy'da: tüm uzak oyuncuları yok et + bu sahnenin mp dinleyicilerini kaldır.
   *  izo'daki gibi socket BAĞLANTISI kapatılmaz (başka sahne/HUD kullanıyor olabilir) — yalnız
   *  bu sahnenin event handler'ları sökülür (mp.off), remoteTd map temizlenir. */
  private cleanupMultiplayerTd(): void {
    try {
      for (const rp of this.remoteTd.values()) rp.destroy();
    } catch { /* no-op */ }
    this.remoteTd.clear();
    try {
      for (const [event, fn] of this.mpTdHandlers) mp.off(event, fn);
    } catch { /* no-op */ }
    this.mpTdHandlers = [];
    this.mpEnabled = false;
  }
}
