// frontend/lib/game/td/TdWorldScene.ts
// ─── Açık dünya sahnesi: chunk streaming + chibi kahraman ───
// Client-only (Phaser sahnesi). Su animasyonu yalnız su içeren chunk'ları tazeler.
import * as Phaser from 'phaser';
import { TILE, CHUNK, MAP_W, MAP_H, chunksInView, computeTdView, userTdZoom, setUserTdZoom, depth, hash2d } from './tdCore';
import { getTile, regionAt, TOWN_SPAWN } from './worldMap';
import { renderChunk, chunkHasWater, biomeTopColor } from './tiles';
import { chibiHumanoid, CHIBI_H, paletteForId, hashId } from './sprites/chibi';
import { propsForChunk, dungeonDoors, townPortals, TOWN_ORIGIN, type TdProp } from './worldProps';
import { mkTree, mkRock, mkBush, mkFireFrames, mkBuilding, mkDungeonDoor, mkStump, mkFarmPlot, mkPortal } from './sprites/props';
import { atmoForRegion } from './atmosphere';
import { REGION_MONSTERS, type MonsterEntry } from './monsterData';
import { mkMonsterChibi } from './sprites/monsterChibi';
import { TdState, migrateV1 } from './tdState';
import { COSTS, PER_HIT } from './cozy/rules';
import { mp } from '../multiplayer/socket';
import { PlayerState } from '../PlayerState';
import { heroHit, mobHit, killRewards, ATTACK_RANGE, ATTACK_CD_MS, AGGRO_RANGE, CHASE_SPEED, CONTACT_RANGE, HERO_IFRAME_MS } from './combat';

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
  // Faz 5.7: haritada gerçek-zamanlı savaş
  hp: number; maxHp: number;
  hpBg?: Phaser.GameObjects.Rectangle; hpFill?: Phaser.GameObjects.Rectangle;
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
    }).setOrigin(0.5, 1).setDepth(depth(x, y) + 1)
      .setResolution((scene as TdWorldScene).uiZoom); // Faz 5.2: kamera zoom altında net metin
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
  private minimapBorder?: Phaser.GameObjects.Rectangle;
  // Faz 5.5/5.6: yerel-pencere minimap — M aç/kapa, tıklama küçük↔büyük
  private minimapOn = false;
  private redHintUntil = 0; // gatherHint'in kırmızı-uyarı/zoom-toast kilidi (istem yazmasın)
  // Faz 5.2: konumlar layoutHud()'da (kamera-zoom dönüşümü); uiZoom = aktif tam-sayı k
  private minimapX = 0; private minimapY = 4;
  uiZoom = 3; // MP remote label / prop label setResolution'ı da okur
  // ── Faz 3: overworld canavarları ──
  private chunkMonsters = new Map<string, MonRef[]>();
  private battleActive = false;
  // Faz 5.7: gerçek-zamanlı savaş durumu
  private atkCdUntil = 0;
  private heroInvulnUntil = 0;
  private monTexCache = new Set<string>();
  // ── Faz 4: cozy toplama (SPACE) + enerji HUD ──
  tdState = new TdState();
  private chunkGatherables = new Map<string, Map<string, Gatherable>>();
  private saveT = 0; // enerji tick save biriktirici (≤ 5sn'de bir yaz)
  private energyBarBg!: Phaser.GameObjects.Rectangle;
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private energyText!: Phaser.GameObjects.Text;
  private fireBoostText!: Phaser.GameObjects.Text;
  // ── Faz 5.4: stat paneli + çanta + tuş ipucu ──
  private statsPanel!: Phaser.GameObjects.Container;
  private levelText!: Phaser.GameObjects.Text;
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private xpBarBg!: Phaser.GameObjects.Rectangle;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private bagPanel!: Phaser.GameObjects.Container;
  private keysHint!: Phaser.GameObjects.Text;
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
      else {
        this.perfText = this.add.text(4, 4, '', { fontSize: '10px', color: '#9fe8ff', backgroundColor: '#000000aa' })
          .setScrollFactor(0).setDepth(1e9).setResolution(this.uiZoom);
        this.layoutHud();
      }
    });

    // prop texture'ları (bir kez)
    const reg = (key: string, m: { img: HTMLCanvasElement }) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, m.img); };
    for (let v = 0; v < 4; v++) { const m = mkTree(v); reg(`td-tree-${v}`, m); this.propMeta.set(`tree-${v}`, { ox: m.ox, oy: m.oy }); }
    for (let v = 0; v < 2; v++) { const m = mkRock(v); reg(`td-rock-${v}`, m); this.propMeta.set(`rock-${v}`, { ox: m.ox, oy: m.oy }); }
    for (let v = 0; v < 2; v++) { const m = mkBush(v); reg(`td-bush-${v}`, m); this.propMeta.set(`bush-${v}`, { ox: m.ox, oy: m.oy }); }
    mkFireFrames().forEach((c, f) => { if (!this.textures.exists(`td-fire-${f}`)) this.textures.addCanvas(`td-fire-${f}`, c); });
    const dd = mkDungeonDoor(); reg('td-door-dungeon', dd); this.propMeta.set('door', { ox: dd.ox, oy: dd.oy });
    reg('td-portal-0', mkPortal(0)); reg('td-portal-1', mkPortal(1)); // Faz 5.6
    const stump = mkStump(); reg('td-stump', stump); this.propMeta.set('stump', { ox: stump.ox, oy: stump.oy });
    for (let s = 0; s < 4; s++) { const m = mkFarmPlot(s as 0 | 1 | 2 | 3); reg(`td-farm-${s}`, m); this.propMeta.set(`farm-${s}`, { ox: m.ox, oy: m.oy }); }

    // etkileşim ipucu (alt-orta, HUD) — konumlar layoutHud()'da (adaptif çözünürlük)
    this.hintText = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // ── Faz 5.4: sol-üst STAT PANELİ (izo HUDScene paritesi, cozy) — tek container:
    // Lv + HP bar + XP bar + enerji bar + altın + 🔥×4. Container scrollFactor(0),
    // çocuklar LOKAL koordinatta; layoutHud yalnız container'ı taşır. ──
    this.statsPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9);
    const pBg = this.add.rectangle(0, 0, 128, 48, 0x141c24, 0.82).setOrigin(0, 0)
      .setStrokeStyle(1, 0x2a3a4c, 0.9);
    this.levelText = this.add.text(5, 4, 'Lv.1', { fontSize: '9px', fontFamily: 'monospace', color: '#ffd23f' }).setOrigin(0, 0);
    this.hpBarBg = this.add.rectangle(38, 5, 84, 8, 0x1a2028, 1).setOrigin(0, 0);
    this.hpBarFill = this.add.rectangle(39, 6, 82, 6, 0x44cc66, 1).setOrigin(0, 0);
    this.hpText = this.add.text(80, 5, '', { fontSize: '7px', fontFamily: 'monospace', color: '#eaffef' }).setOrigin(0.5, 0);
    this.xpBarBg = this.add.rectangle(38, 15, 84, 3, 0x1a2028, 1).setOrigin(0, 0);
    this.xpBarFill = this.add.rectangle(38, 15, 0, 3, 0x7f7fff, 1).setOrigin(0, 0);
    this.energyBarBg = this.add.rectangle(38, 21, 84, 7, 0x1a2028, 1).setOrigin(0, 0);
    this.energyBarFill = this.add.rectangle(39, 22, 82, 5, 0x57b8d8, 1).setOrigin(0, 0);
    this.energyText = this.add.text(5, 20, '⚡', { fontSize: '9px', fontFamily: 'monospace', color: '#9fe8ff' }).setOrigin(0, 0);
    this.goldText = this.add.text(5, 33, '', { fontSize: '9px', fontFamily: 'monospace', color: '#ffd23f' }).setOrigin(0, 0);
    this.fireBoostText = this.add.text(70, 33, '', { fontSize: '9px', fontFamily: 'monospace', color: '#ff9d3f' })
      .setOrigin(0, 0).setVisible(false);
    this.statsPanel.add([pBg, this.levelText, this.hpBarBg, this.hpBarFill, this.hpText,
      this.xpBarBg, this.xpBarFill, this.energyBarBg, this.energyBarFill, this.energyText,
      this.goldText, this.fireBoostText]);
    this.gatherHint = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // atmosfer: tam-ekran tint + alt fog bandı (scrollFactor 0, düşük alpha, lerp update()'te)
    this.tintRect = this.add.rectangle(0, 0, 8, 8, 0x88bbff, 0.04)
      .setScrollFactor(0).setDepth(1500);
    this.fogRect = this.add.rectangle(0, 0, 8, 48, 0xbbddff, 0.10)
      .setScrollFactor(0).setDepth(1501);

    // Faz 5.2: kamera zoom k (tam-sayı, viewport'tan) + HUD yerleşimi; viewport
    // resize'ında yeniden. Scale global emitter — shutdown/destroy'da off ŞART.
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
    this.events.once('destroy', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));

    // E: en yakın hub binasına gir (LIVE: gerçek overlay / PREVIEW: toast) veya en yakın
    // zindan kapısına gir (TdDungeon launch+pause — battle akışıyla simetrik).
    // Klavye VE dokunmatik (td-touch-e, update()'te one-shot emit) aynı metodu çağırır.
    kb.on('keydown-E', () => this.handleInteract());
    this.events.on('td-touch-e', () => this.handleInteract());
    // M: minimap toggle
    kb.on('keydown-M', () => this.toggleMinimap());
    // SPACE: en yakın toplanabilir kes/kaz/topla, yoksa kıyıda balık tut
    kb.on('keydown-SPACE', () => this.onSpaceGather());
    // Faz 5.4: B çanta; mobil 🎒/🗺 butonları window event'iyle gelir (TdPhaserGame)
    kb.on('keydown-B', () => this.toggleBag());
    // Faz 5.5: [-]/[+] kamera mesafesi (PLUS = ana sıra '=' tuşu, Phaser keycode 187)
    kb.on('keydown-MINUS', () => this.nudgeZoom(-1));
    kb.on('keydown-PLUS', () => this.nudgeZoom(1));
    const onUiBag = () => this.toggleBag();
    const onUiMap = () => this.toggleMinimap();
    window.addEventListener('td-ui-bag', onUiBag);
    window.addEventListener('td-ui-map', onUiMap);
    const offUi = () => { window.removeEventListener('td-ui-bag', onUiBag); window.removeEventListener('td-ui-map', onUiMap); };
    this.events.once('shutdown', offUi);
    this.events.once('destroy', offUi);

    // Faz 5.4: çanta paneli (kapalı başlar; içerik her açılışta tazelenir) + tuş ipucu
    this.bagPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9 + 2).setVisible(false);
    const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
    this.keysHint = this.add.text(0, 0, '[E] interact · [SPACE] gather · [B] bag · [M] map · [-/+] zoom', {
      fontSize: '8px', fontFamily: 'monospace', color: '#cfe3f2',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(1e9).setAlpha(0.55).setVisible(!isTouch);

    // Faz 5.4: minimap keşfedilebilir olsun — masaüstünde default AÇIK (M yine kapatır);
    // dokunmatikte kapalı başlar (sağ-üst 🗺 butonu açar — DOM butonlarıyla çakışmasın)
    if (!isTouch) this.toggleMinimap();
    this.layoutHud(); // bagPanel/keysHint applyZoom'dan SONRA yaratıldı — konumlarını bas

    this.streamChunks();

    // MP presence: yalnız LIVE modda, tamamen izole+graceful (bkz. setupMultiplayerTd doc).
    if (this.tdMode === 'live') this.setupMultiplayerTd();
    this.events.once('shutdown', () => this.cleanupMultiplayerTd());
    this.events.once('destroy', () => this.cleanupMultiplayerTd());
  }

  /**
   * Faz 5.2/5.5: kamera zoom'u — kullanıcı tercihi ([-]/[+], kalıcı) varsa o,
   * yoksa computeTdView default'u (masaüstü 3 = Larvy paritesi, dar ekran 2).
   */
  private applyZoom(): void {
    this.uiZoom = userTdZoom() ?? computeTdView(this.scale.width, this.scale.height).k;
    this.cameras.main.setZoom(this.uiZoom);
    this.layoutHud();
  }

  /** Faz 5.5: [-]/[+] zoom ayarı (2..5, localStorage'a kalıcı; zindan girişte devralır). */
  private nudgeZoom(d: number): void {
    const next = Phaser.Math.Clamp(this.uiZoom + d, 2, 5);
    if (next === this.uiZoom) return;
    setUserTdZoom(next);
    this.applyZoom();
    this.gatherHint.setText(`🔍 zoom ${next}×`).setColor('#9fe8ff').setVisible(true);
    this.redHintUntil = this.time.now + 900;
  }

  /**
   * Faz 5.2 HUD yerleşimi (Larvy paritesi): canvas TAM çözünürlükte, dünya kamera
   * zoom'uyla k× — scrollFactor(0) nesneler de kamera MERKEZİ etrafında k× büyür.
   * Ekran hedefi S → nesne koordinatı L = (S - C)/k + C dönüşümüyle yerleştirilir;
   * boyutlar "mantıksal" (384×256-devri) birimde kalır, zoom k× büyütür. Metinler
   * setResolution(k) ile native çözünürlükte örneklenir (netlik paketinin özü).
   */
  private layoutHud(): void {
    const k = this.uiZoom, sw = this.scale.width, sh = this.scale.height;
    const cx = sw / 2, cy = sh / 2;
    const x0 = cx - cx / k, y0 = cy - cy / k;      // mantıksal görünür rect'in sol-üstü
    const w = sw / k, h = sh / k;                   // mantıksal görünür boyut
    this.statsPanel.setPosition(x0 + 6, y0 + 6);
    this.bagPanel?.setPosition(x0 + w / 2, y0 + h / 2);   // create'te applyZoom'dan sonra doğar
    this.keysHint?.setPosition(x0 + w - 4, y0 + h - 4);
    this.hintText.setPosition(x0 + w / 2, y0 + h - 14);
    this.gatherHint.setPosition(x0 + w / 2, y0 + h - 26);
    this.tintRect.setPosition(x0 + w / 2, y0 + h / 2).setSize(w, h);
    this.fogRect.setPosition(x0 + w / 2, y0 + h - 24).setSize(w, 48);
    this.updateMinimap();
    this.perfText?.setPosition(x0 + 4, y0 + 4);
    const texts = [this.hintText, this.gatherHint, this.energyText, this.fireBoostText, this.goldText,
      this.levelText, this.hpText];
    if (this.keysHint) texts.push(this.keysHint);
    for (const t of texts) if (t.style.resolution !== k) t.setResolution(k);
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
    } else if (p?.kind === 'portal') {
      // Faz 5.6: kasabaya ışınlan — pozisyonu hemen kaydet (yenilemede portalda doğmasın)
      this.heroPos = { x: TOWN_SPAWN.tx * 16 + 8, y: TOWN_SPAWN.ty * 16 + 8 };
      if (this.tdMode === 'live') this.tdState.worldPos = { x: this.heroPos.x, y: this.heroPos.y };
      this.tdState.save();
      this.streamChunks();
      this.floatText(this.heroPos.x, this.heroPos.y - 18, '🌀 whoosh!', '#57e8e0');
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

  /**
   * Faz 5.4: çanta paneli — cozy kaynaklar (tdState) + kahraman özeti (PlayerState).
   * İçerik her açılışta yeniden kurulur (removeAll(true)) — değerler hep taze,
   * state-senkron derdi yok. B / mobil 🎒 / ✕ toggle'lar.
   */
  private toggleBag(): void {
    if (this.bagPanel.visible) { this.bagPanel.setVisible(false); return; }
    const k = this.uiZoom;
    const ps = PlayerState.get();
    const res = this.tdState.resources;
    this.bagPanel.removeAll(true);
    const W2 = 208, H2 = 148;
    const T = (x: number, y: number, msg: string, color: string, size = 9, originX = 0) =>
      this.add.text(x, y, msg, { fontSize: `${size}px`, fontFamily: 'monospace', color })
        .setOrigin(originX, 0).setResolution(k);
    const bg = this.add.rectangle(0, 0, W2, H2, 0x141c24, 0.94).setOrigin(0.5).setStrokeStyle(1, 0x3a4e63, 1);
    const x0 = -W2 / 2 + 10, y0 = -H2 / 2 + 8;
    const title = T(0, y0, 'BAG', '#9fe8ff', 11, 0.5);
    const close = T(W2 / 2 - 14, y0, '✕', '#8fa6bd', 11)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleBag());
    const potions = ps.inventory.filter(i => i.type === 'potion').reduce((n, i) => n + (i.count || 1), 0);
    const rows: Phaser.GameObjects.GameObject[] = [
      bg, title, close,
      T(x0, y0 + 18, 'Satchel', '#7fd0a0', 8),
      T(x0, y0 + 30, `🪵 ${res.wood}   🪨 ${res.stone}   ⛏ ${res.ore}`, '#e8eef4'),
      T(x0, y0 + 43, `🐟 ${res.fish}   🍒 ${res.frostberry}   💰 ${this.tdState.gold}g`, '#e8eef4'),
      T(x0, y0 + 60, 'Hero', '#7fd0a0', 8),
      T(x0, y0 + 72, `Lv.${ps.level}  HP ${Math.round(ps.hp)}/${ps.maxHp}  🧪 ×${potions}`, '#e8eef4'),
      T(x0, y0 + 85, `ATK ${ps.atk}  DEF ${ps.def}  SPD ${ps.spd}`, '#cfe3f2'),
      T(x0, y0 + 98, `⚔ ${ps.equipped.weapon?.name || 'Fists'}`, '#cfe3f2'),
      T(x0, y0 + 111, `🛡 ${ps.equipped.armor?.name || 'None'}`, '#cfe3f2'),
      T(0, H2 / 2 - 16, 'sell at the Marketplace [E]', '#8fa6bd', 7, 0.5),
    ];
    this.bagPanel.add(rows);
    this.bagPanel.setVisible(true);
  }

  /**
   * Faz 5.5/5.6 minimap: default KÜÇÜK yerel pencere (64×64 tile, 1px=1tile,
   * hero-merkezli crop); üstüne TIKLAYINCA büyür (tüm dünya haritası). M / mobil 🗺
   * aç-kapa. Taban canvas işaretleri: kasaba (altın), zindan kapıları (kızıl),
   * kasaba portalları (camgöbeği).
   */
  private static MM_SMALL = 64;
  private static MM_BIG = 176;
  private minimapBig = false;

  private toggleMinimap(): void {
    this.minimapOn = !this.minimapOn;
    if (!this.minimapImg) {
      const c = document.createElement('canvas');
      c.width = MAP_W; c.height = MAP_H;
      const g = c.getContext('2d')!;
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        g.fillStyle = biomeTopColor(getTile(x, y).biome);
        g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = '#e8b23f';                                   // kasaba işareti
      g.fillRect(TOWN_ORIGIN.tx - 3, TOWN_ORIGIN.ty - 3, 6, 6);
      g.fillStyle = '#c23b3b';                                   // zindan kapıları
      for (const d of dungeonDoors()) g.fillRect(Math.floor(d.x / TILE) - 1, Math.floor(d.y / TILE) - 1, 3, 3);
      g.fillStyle = '#57e8e0';                                   // kasaba portalları (Faz 5.6)
      for (const p of townPortals()) g.fillRect(Math.floor(p.x / TILE) - 1, Math.floor(p.y / TILE) - 1, 3, 3);
      this.textures.addCanvas('td-minimap-full', c);
      // çerçeve = tıklama hedefi (crop'lu image'ın hit-area'sı tüm frame'i kapsardı)
      this.minimapBorder = this.add.rectangle(0, 0, TdWorldScene.MM_SMALL + 4, TdWorldScene.MM_SMALL + 4, 0x0d1319, 0.35)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(1e9 - 1).setStrokeStyle(1, 0x3a4e63, 1)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.toggleMinimapSize());
      this.minimapImg = this.add.image(0, 0, 'td-minimap-full')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(1e9).setAlpha(0.92);
      this.minimapDot = this.add.rectangle(0, 0, 3, 3, 0xff3b3b)
        .setOrigin(0.5).setScrollFactor(0).setDepth(1e9 + 1);
    }
    this.minimapImg.setVisible(this.minimapOn);
    this.minimapDot?.setVisible(this.minimapOn);
    this.minimapBorder?.setVisible(this.minimapOn);
    this.updateMinimap();
  }

  /** Tıklama: küçük yerel pencere ↔ büyük dünya haritası (çerçeve hit-area yeniden kurulur). */
  private toggleMinimapSize(): void {
    this.minimapBig = !this.minimapBig;
    const size = (this.minimapBig ? TdWorldScene.MM_BIG : TdWorldScene.MM_SMALL) + 4;
    this.minimapBorder?.removeInteractive();
    this.minimapBorder?.setSize(size, size);
    this.minimapBorder?.setInteractive({ useHandCursor: true });
    this.updateMinimap();
  }

  /** Minimap per-frame konum/crop/nokta — sağ-üst slota sabitlenir (boyut moda göre). */
  private updateMinimap(): void {
    if (!this.minimapImg || !this.minimapOn) return;
    const k = this.uiZoom, sw = this.scale.width, sh = this.scale.height;
    const x0 = sw / 2 - sw / (2 * k), y0 = sh / 2 - sh / (2 * k), w = sw / k;
    const size = this.minimapBig ? Math.min(TdWorldScene.MM_BIG, Math.floor(sh / k) - 24) : TdWorldScene.MM_SMALL;
    this.minimapX = x0 + w - size - 4; this.minimapY = y0 + 4;
    const htx = this.heroPos.x / TILE, hty = this.heroPos.y / TILE;
    this.minimapBorder?.setPosition(this.minimapX - 2, this.minimapY - 2);
    if (this.minimapBig) {
      this.minimapImg.setCrop();
      this.minimapImg.setScale(size / MAP_W);
      this.minimapImg.setPosition(this.minimapX, this.minimapY);
      this.minimapDot?.setPosition(this.minimapX + htx * size / MAP_W, this.minimapY + hty * size / MAP_H);
    } else {
      const half = TdWorldScene.MM_SMALL / 2;
      const cx = Phaser.Math.Clamp(Math.floor(htx) - half, 0, MAP_W - TdWorldScene.MM_SMALL);
      const cy = Phaser.Math.Clamp(Math.floor(hty) - half, 0, MAP_H - TdWorldScene.MM_SMALL);
      this.minimapImg.setScale(1);
      this.minimapImg.setCrop(cx, cy, TdWorldScene.MM_SMALL, TdWorldScene.MM_SMALL);
      // crop görüntüyü kendi frame konumunda bırakır — pencereyi slota kaydır
      this.minimapImg.setPosition(this.minimapX - cx, this.minimapY - cy);
      this.minimapDot?.setPosition(this.minimapX + (htx - cx), this.minimapY + (hty - cy));
    }
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
          if (p.kind === 'building' || p.kind === 'door_dungeon' || p.kind === 'farm_plot' || p.kind === 'portal') interactives.push(p);
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
          else if (p.kind === 'portal') {
            // Faz 5.6: kasaba portalı — 2-kare parıltı (700ms flip; obj cull'da tween de ölür)
            const pimg = this.add.image(p.x, p.y, 'td-portal-0').setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
            const flip = this.time.addEvent({
              delay: 700, loop: true,
              callback: () => pimg.setTexture(pimg.texture.key === 'td-portal-0' ? 'td-portal-1' : 'td-portal-0'),
            });
            pimg.once(Phaser.GameObjects.Events.DESTROY, () => flip.remove());
            objs.push(pimg); continue;
          }
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
            }).setOrigin(0.5, 1).setDepth(depth(p.x, p.y) + 1)
              .setResolution(this.uiZoom); // Faz 5.2: 8px-label FIT-blur cilası da kapanır
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
        hp: finalEntry.hp, maxHp: finalEntry.hp, // Faz 5.7: haritada gerçek-zamanlı savaş
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
    // bob görsel origin'e uygulanır (pozisyona DEĞİL) — kamera follow hedefi sabit kalır,
    // aksi halde tam ekranda tüm sahne 1px aşağı-yukarı titrer (22 Tem canlı bulgusu).
    this.hero.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y));
    this.hero.setDisplayOrigin(this.hero.displayOriginX, this.hero.height - 3 + bob);
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
    // canavar gezinme + AGGRO/kovalama + temas HASARI (Faz 5.7: TdBattle'a geçiş yok —
    // savaş haritada; canavar 70px'te kovalar, 12px temas vuruşu, kahraman 800ms i-frame)
    const WANDER_SPEED = 18; // px/s
    for (const list of this.chunkMonsters.values()) {
      for (const m of list) {
        if (m.downUntil > t) { this.updateMobHpBar(m); continue; } // knockback/stun süresi
        const hd = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
        if (hd < AGGRO_RANGE && hd > CONTACT_RANGE - 4) {
          // kovalama: gezinmeyi ez, kahramana yönel
          const cxm = (this.heroPos.x - m.x) / hd, cym = (this.heroPos.y - m.y) / hd;
          m.x += cxm * CHASE_SPEED * dt; m.y += cym * CHASE_SPEED * dt;
          m.img.setFlipX(cxm < 0);
        } else if (m.pause > 0) {
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
        this.updateMobHpBar(m);
        // temas hasarı
        if (hd < CONTACT_RANGE && t > this.heroInvulnUntil) this.mobHitsHero(m);
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
          : near.kind === 'portal' ? 'E — Town Portal 🌀'
          : near.kind === 'farm_plot' ? (() => {
              const st = this.tdState.farm[near!.data!.plotIndex!]?.stage ?? 0;
              return `E — ${st === 0 ? 'plant' : st === 3 ? 'harvest' : 'growing…'}`;
            })()
          : `E — enter ${near.data!.name}`)
        : '').setVisible(!!near);
    }
    // Faz 5.5: SPACE affordance istemi — yakın toplanabilir varsa ne yapılacağını söyle.
    // Tarama hero chunk'ı ±1 ile sınırlı (cila notu: tam-harita per-frame loop'undan kaçın);
    // kırmızı uyarı/zoom-toast kilidi (redHintUntil) ve balıkçılık istemi ezilmez.
    if (!this.fishing && this.time.now > this.redHintUntil) {
      // Faz 5.7: savaş istemi öncelikli (SPACE davranışıyla aynı sıra)
      if (this.nearestMob(ATTACK_RANGE)) {
        this.gatherHint.setText('[SPACE] attack ⚔️').setColor('#ff9d9d').setVisible(true);
      } else {
      let ng: Gatherable | null = null; let ngd = 26;
      const hcx = Math.floor(this.heroPos.x / (CHUNK * TILE)), hcy = Math.floor(this.heroPos.y / (CHUNK * TILE));
      for (let dy2 = -1; dy2 <= 1; dy2++) for (let dx2 = -1; dx2 <= 1; dx2++) {
        const gset = this.chunkGatherables.get(`${hcx + dx2},${hcy + dy2}`);
        if (!gset) continue;
        for (const gv of gset.values()) {
          if (!gv.alive) continue;
          const d = Math.hypot(this.heroPos.x - gv.x, this.heroPos.y - gv.y);
          if (d < ngd) { ngd = d; ng = gv; }
        }
      }
      if (ng) {
        this.gatherHint.setText(ng.kind === 'tree' ? '[SPACE] chop 🪵' : ng.kind === 'rock' ? '[SPACE] mine ⛏️' : '[SPACE] pick 🍒')
          .setColor('#cfe3f2').setVisible(true);
      } else if (this.gatherHint.visible) {
        this.gatherHint.setVisible(false);
      }
      }
    }
    // atmosfer lerp
    const atmo = atmoForRegion(regionAt(Math.floor(this.heroPos.x / 16), Math.floor(this.heroPos.y / 16)).key);
    this.tintRect.fillColor = atmo.tint; this.tintRect.fillAlpha += (atmo.tintAlpha - this.tintRect.fillAlpha) * 0.05;
    this.fogRect.fillColor = atmo.fogColor; this.fogRect.fillAlpha += (atmo.fogAlpha - this.fogRect.fillAlpha) * 0.05;
    // minimap: mod-farkındalıklı konum/crop/nokta (Faz 5.5)
    this.updateMinimap();

    // ── Faz 4: kamp ateşi yakınlığı + enerji tick + HUD ──
    let nearFire = false;
    for (const f of this.fires) {
      if (Math.hypot(this.heroPos.x - f.x, this.heroPos.y - f.y) <= 48) { nearFire = true; break; }
    }
    this.tdState.tick(dt, nearFire);
    this.fireBoostText.setVisible(nearFire).setText(nearFire ? '🔥×4' : '');
    const pct = Phaser.Math.Clamp(this.tdState.energy / TdState.ENERGY_MAX, 0, 1);
    this.energyBarFill.width = 82 * pct;
    this.energyBarFill.fillColor = pct < 0.2 ? 0xe84142 : 0x57b8d8;
    this.energyText.setText(`⚡${Math.round(this.tdState.energy)}`);
    this.goldText.setText(`💰${this.tdState.gold}`);
    // Faz 5.4: stat paneli — Lv/HP/XP (PlayerState; live'da gerçek kayıt, preview'da default)
    const ps = PlayerState.get();
    this.levelText.setText(`Lv.${ps.level}`);
    this.hpBarFill.width = 82 * Phaser.Math.Clamp(ps.hp / ps.maxHp, 0, 1);
    this.hpBarFill.fillColor = ps.hp / ps.maxHp < 0.25 ? 0xe84142 : 0x44cc66;
    this.hpText.setText(`${Math.round(ps.hp)}/${ps.maxHp}`);
    this.xpBarFill.width = 84 * Phaser.Math.Clamp(ps.xp / ps.xpToNext, 0, 1);

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
    }).setOrigin(0.5, 1).setDepth(1e9).setResolution(this.uiZoom);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /**
   * Geçici kırmızı ipucu (ör. 'Not enough energy ⚡') — 1.2sn kilit; süre dolunca
   * update()'teki yakınlık istemi gatherHint'i devralır/gizler (Faz 5.5).
   */
  private showRedHint(msg: string): void {
    this.gatherHint.setText(msg).setColor('#ff5c5c').setVisible(true);
    this.redHintUntil = this.time.now + 1200;
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

    // Faz 5.7: SPACE önceliği SAVAŞ — menzilde canavar varsa saldır (toplama ikincil)
    const mob = this.nearestMob(ATTACK_RANGE);
    if (mob) { this.heroAttack(mob); return; }

    // Faz 5.5: menzil 22→26 (kaya solid'i yandan yaklaşmada 18px'e bırakıyor — pay)
    let nearest: Gatherable | null = null; let nd = 26;
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

    // toplanabilir yok: kıyı kontrolü → balık tutma; o da yoksa SESSİZ KALMA (Faz 5.5 —
    // "madenleri kazamıyoruz" geri bildirimi: menzil dışı SPACE hiçbir şey söylemiyordu)
    if (this.isNearWater()) this.startFishing();
    else this.showRedHint('nothing in reach — stand next to a tree/rock 🌲🪨');
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

  // -----------------------------------------------------------------------
  // Faz 5.7: haritada gerçek-zamanlı savaş (eski startBattle/TdBattle geçişi kalktı —
  // TdBattle yalnız zindan boss'larında; formüller combat.ts'te, TdBattle-parite)
  // -----------------------------------------------------------------------
  /** En yakın canlı canavar (menzil px) — SPACE önceliği + istem için. */
  private nearestMob(range: number): MonRef | null {
    let best: MonRef | null = null; let bd = range;
    for (const list of this.chunkMonsters.values()) for (const m of list) {
      const d = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** SPACE saldırısı: hasar + beyaz flaş + knockback + hasar sayısı; ölümde ödül. */
  private heroAttack(m: MonRef): void {
    if (this.time.now < this.atkCdUntil) return;
    this.atkCdUntil = this.time.now + ATTACK_CD_MS;
    const ps = PlayerState.get();
    const { dmg, crit } = heroHit(ps.atk, m.entry.def ?? 0);
    m.hp -= dmg;
    const ddx = m.x - this.heroPos.x, ddy = m.y - this.heroPos.y;
    const len = Math.hypot(ddx, ddy) || 1;
    // slash juice: kahraman-canavar arasında kısa beyaz çizik
    const slash = this.add.rectangle(this.heroPos.x + (ddx / len) * 12, this.heroPos.y - 6 + (ddy / len) * 12,
      14, 3, 0xffffff, 0.9).setRotation(Math.atan2(ddy, ddx)).setDepth(1e7);
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.5, duration: 110, onComplete: () => slash.destroy() });
    m.img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (m.img.active) m.img.clearTint(); });
    // knockback (canavar kısa süre donar — anında karşı-temas olmasın)
    m.x += (ddx / len) * 10; m.y += (ddy / len) * 10;
    m.downUntil = this.time.now + 200;
    this.floatText(m.x, m.y - 18, crit ? `💥${dmg}` : `${dmg}`, crit ? '#ffd23f' : '#ffffff');
    this.ensureMobHpBar(m);
    if (m.hp <= 0) this.killMob(m);
  }

  /** Ölüm: ödül (TdBattle formül paritesi) + poof; live modda PlayerState kaydedilir. */
  private killMob(m: MonRef): void {
    const ps = PlayerState.get();
    const { xp, gold } = killRewards(m.entry.level ?? 1, m.isElite);
    ps.addXp(xp); ps.gold += gold;
    if (this.tdMode === 'live') ps.save();
    this.floatText(m.x, m.y - 24, `+${xp} XP`, '#7f7fff');
    this.floatText(m.x, m.y - 12, `+${gold}g 💰`, '#ffd23f');
    m.hpBg?.destroy(); m.hpFill?.destroy(); m.hpBg = undefined; m.hpFill = undefined;
    // poof: asıl img despawn'da yok edilir — hayalet kopya üstünde büyü/soldur
    const ghost = this.add.image(m.x, m.y, m.img.texture.key).setOrigin(0.5, 1)
      .setFlipX(m.img.flipX).setScale(m.img.scaleX).setDepth(depth(m.x, m.y));
    this.tweens.add({ targets: ghost, alpha: 0, scale: m.img.scaleX * 1.5, duration: 200, onComplete: () => ghost.destroy() });
    this.despawnMonster(m);
  }

  /** Canavarın temas vuruşu: kahraman hasarı + i-frame + geri tepme + kırmızı flaş. */
  private mobHitsHero(m: MonRef): void {
    const ps = PlayerState.get();
    const dmg = mobHit(m.entry.atk ?? 5, ps.def);
    ps.hp = Math.max(0, ps.hp - dmg);
    this.heroInvulnUntil = this.time.now + HERO_IFRAME_MS;
    const ddx = this.heroPos.x - m.x, ddy = this.heroPos.y - m.y;
    const len = Math.hypot(ddx, ddy) || 1;
    const kx = this.heroPos.x + (ddx / len) * 12, ky = this.heroPos.y + (ddy / len) * 12;
    if (this.canMove(kx, ky)) { this.heroPos.x = kx; this.heroPos.y = ky; } // solid içine itme
    this.hero.setTintFill(0xff5c5c);
    this.time.delayedCall(120, () => this.hero.clearTint());
    this.cameras.main.shake(70, 0.004);
    this.floatText(this.heroPos.x, this.heroPos.y - 20, `-${dmg}`, '#ff5c5c');
    if (this.tdMode === 'live') ps.save();
    if (ps.hp <= 0) this.heroDown();
  }

  /** Kahraman düştü: kasabaya dön, yarım canla uyan (ceza hafif — cozy ton). */
  private heroDown(): void {
    const ps = PlayerState.get();
    ps.hp = Math.ceil(ps.maxHp / 2);
    if (this.tdMode === 'live') ps.save();
    this.respawnAtTown();
  }

  /** Kasabaya dönüş (ölüm/zindan-düşüşü ortak yolu — TdDungeonScene de çağırır). */
  respawnAtTown(): void {
    this.heroPos = { x: TOWN_SPAWN.tx * 16 + 8, y: TOWN_SPAWN.ty * 16 + 8 };
    if (this.tdMode === 'live') { this.tdState.worldPos = { x: this.heroPos.x, y: this.heroPos.y }; this.tdState.save(); }
    this.heroInvulnUntil = this.time.now + 1500;
    this.streamChunks();
    this.cameras.main.flash(300, 20, 0, 0);
    this.showRedHint('You were knocked out — back in town 💤');
  }

  /** Canavar HP barı: ilk hasarda doğar, canavarla gezer; tam canda gizli. */
  private ensureMobHpBar(m: MonRef): void {
    if (!m.hpBg) {
      m.hpBg = this.add.rectangle(m.x, m.y, 18, 3, 0x1a2028, 0.9).setOrigin(0.5, 1).setDepth(1e7);
      m.hpFill = this.add.rectangle(m.x, m.y, 16, 1.6, 0xe84142, 1).setOrigin(0.5, 1).setDepth(1e7 + 1);
    }
    this.updateMobHpBar(m);
  }

  private updateMobHpBar(m: MonRef): void {
    if (!m.hpBg || !m.hpFill) return;
    const yy = m.y - m.img.displayHeight - 3;
    m.hpBg.setPosition(m.x, yy);
    m.hpFill.setOrigin(0, 1).setPosition(m.x - 8, yy - 0.7);
    m.hpFill.width = 16 * Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1);
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
