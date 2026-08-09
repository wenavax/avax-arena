// frontend/lib/game/td/TdWorldScene.ts
// ─── Açık dünya sahnesi: chunk streaming + chibi kahraman ───
// Client-only (Phaser sahnesi). Su animasyonu yalnız su içeren chunk'ları tazeler.
import * as Phaser from 'phaser';
import { TILE, CHUNK, MAP_W, MAP_H, chunksInView, computeTdView, userTdZoom, setUserTdZoom, depth, hash2d, TD_FONT } from './tdCore';
import { getTile, regionAt, TOWN_SPAWN } from './worldMap';
import { renderChunk, chunkHasWater, biomeTopColor } from './tiles';
import { chibiHumanoid, CHIBI_H, paletteForId, hashId } from './sprites/chibi';
import { propsForChunk, dungeonDoors, townPortals, TOWN_ORIGIN, DECO_KINDS, type TdProp } from './worldProps';
import { NPCS, NPC_BY_ID } from './npcs';
import {
  QUEST_BY_ID, questsForGiver, offerState, makeRow, grantReward, rolloverRepeatables,
  pushQuestEvent, objectiveKey, REWARD_ITEMS, DAILY_MS, type QuestDef, type OfferState,
} from './quests';
import { mkTree, mkRock, mkBush, mkFireFrames, mkBuilding, mkDungeonDoor, mkStump, mkFarmPlot, mkPortal, mkSignpost } from './sprites/props';
import { mkDeco } from './sprites/decoProps';
import { mkGroundItem } from './sprites/groundItems';
import {
  rollGroundLoot, groundSpriteKind, nearestGround, takeGround, groundOverflow, dropOffset,
  rarityHex, pickupLabel, RARITY_FX, GROUND_SPRITE_KINDS, GROUND_CAP, PICKUP_RADIUS,
  BAG_HINT_COOLDOWN_MS, BAG_FULL_HINT,
} from './groundLoot';
import type { InventoryItem } from '../PlayerState';
import { RARITY_COLORS, type LootResult, type Rarity } from '../lootTables';
import { atmoForRegion } from './atmosphere';
import { REGION_MONSTERS, type MonsterEntry } from './monsterData';
import { mkMonsterChibi } from './sprites/monsterChibi';
import { TdState, migrateV1 } from './tdState';
import { COSTS, PER_HIT } from './cozy/rules';
import { mp } from '../multiplayer/socket';
import { PlayerState } from '../PlayerState';
import { heroHit, mobHit, killRewards, ATTACK_RANGE, ATTACK_CD_MS, AGGRO_RANGE, CHASE_SPEED, CONTACT_RANGE, HERO_IFRAME_MS } from './combat';
import {
  tdSkills, mpRegenPerSec, canCast, skillCdMs, skillAtk, isBuffSkill, turnsToMs,
  dotPlan, dotTickDamage, effectiveDef, dodgeChance, CAST_GCD_MS, MULTIHIT_DELAY_MS, STUN_MS,
} from './abilities';
import {
  heroElemFx, mobElemFx, damageHex, elementHex, ELEM_FLOAT_COOLDOWN_MS, type ElemFx,
} from './elemental';
import type { Skill } from '../skills';
import type { Element } from '../elements';

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
  // Faz 9A.2: DoT (zehir/yanma) — tur-tabanlı `{turns,pctPerTurn}`ın gerçek-zamanlı hâli.
  // RAM'de, MonRef ile birlikte ölür (despawn → referans gider, ayrı temizlik gerekmez).
  dots?: Array<{ type: 'poison' | 'burn'; left: number; nextAt: number; pct: number }>;
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

/**
 * Faz 9A.1: yerde duran loot. Kaynak node'ları gibi TAMAMEN RAM'de (chunk-yerel) —
 * save şeması DEĞİŞMEZ (`frostbite_save` v1 kalır). Chunk cull'ında temizlenir.
 */
interface GroundItem {
  item: InventoryItem;
  rarity: Rarity;
  x: number; y: number;
  bornAt: number;                                   // this.time.now — kapasite aşımında en eski gider
  objs: Phaser.GameObjects.GameObject[];            // sprite + ışıma + huzme + kıvılcımlar
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
      fontSize: '8px', fontFamily: TD_FONT, color: '#aaddff',
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

/** RGB kanallarını cur→target arası t oranında yumuşatır; 0xRRGGBB döner (atmosfer geçişi). */
function lerpColor(cur: number, target: number, t: number): number {
  const r = ((cur >> 16) & 0xff) + (((target >> 16) & 0xff) - ((cur >> 16) & 0xff)) * t;
  const g = ((cur >> 8) & 0xff) + (((target >> 8) & 0xff) - ((cur >> 8) & 0xff)) * t;
  const b = (cur & 0xff) + ((target & 0xff) - (cur & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export class TdWorldScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Image;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private heroPos = { x: TOWN_SPAWN.tx * TILE + 8, y: TOWN_SPAWN.ty * TILE + 8 };
  private heroDir: 0 | 1 | 2 = 0; private heroFlip = false;
  private walkIdx = 0; private walkT = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private chunks = new Map<string, Phaser.GameObjects.Image>();   // "cx,cy" → image
  private hasWaterCache = new Map<string, boolean>();             // chunk su önbelleği (statik dünya)
  private waterFrame: 0 | 1 | 2 = 0; private waterT = 0;
  // Cila: streamChunks yalnız kahraman chunk sınırını geçince (veya su tick'inde) koşar
  // — her karede want/evict tarama + koleksiyon ayırma yerine. Sentinel: ilk update tazeler.
  private lastChunkCx = NaN; private lastChunkCy = NaN;
  private perf = { chunkMs: 0, visible: 0 }; private perfText?: Phaser.GameObjects.Text;
  // ── Faz 2: prop render/collision + etkileşim + atmosfer + minimap ──
  private propMeta = new Map<string, { ox: number; oy: number }>();
  private chunkProps = new Map<string, { objs: Phaser.GameObjects.GameObject[]; solids: NonNullable<TdProp['solid']>[]; interactives: TdProp[] }>();
  private fires: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private nearProp: TdProp | null = null;
  private hintText!: Phaser.GameObjects.Text;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private fogRect!: Phaser.GameObjects.Rectangle;
  // Cila: atmosfer geçişinde RENK de yumuşasın (alpha zaten lerp'liydi, renk snap yapıyordu).
  // İnterpole edilen mevcut renkler burada tutulur; hedefe her kare %5 yaklaşır.
  private tintCur = 0x88bbff;
  private fogCur = 0xbbddff;
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
  // ── Faz 9A.1: yerdeki loot (chunk-yerel RAM; evictChunk temizler) ──
  private chunkGround = new Map<string, GroundItem[]>();
  private bagHintUntil = 0; // dolu çantayla eşyanın üstünde beklemek ipucu spam etmesin
  private battleActive = false;
  // Faz 5.7: gerçek-zamanlı savaş durumu
  private atkCdUntil = 0;
  private heroInvulnUntil = 0;
  // ── Faz 4: cozy toplama (SPACE) + enerji HUD ──
  tdState = new TdState();
  private chunkGatherables = new Map<string, Map<string, Gatherable>>();
  private saveT = 0; // enerji tick save biriktirici (≤ 5sn'de bir yaz)
  private energyText!: Phaser.GameObjects.Text;
  private fireBoostText!: Phaser.GameObjects.Text;
  // ── Faz 5.4/5.10: stat paneli + çanta + tuş ipucu ──
  private statsPanel!: Phaser.GameObjects.Container;
  private statsGfx!: Phaser.GameObjects.Graphics;
  private levelLabel!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private hpIcon!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private bagPanel!: Phaser.GameObjects.Container;
  // Faz 7: NPC diyaloğu + görev günlüğü. İkisi de bagPanel emsali (removeAll(true) ile
  // her açılışta taze kurulur — panel içi state tutulmaz, tek doğruluk kaynağı ps.quests).
  private questPanel!: Phaser.GameObjects.Container;
  private dialogNpc: string | null = null;
  private npcMarkers = new Map<string, Phaser.GameObjects.Text>(); // npcId → baş üstü ! / ? / …
  private markersDirty = true;                                     // true → update() işaretçi metinlerini tazeler
  private keysHint!: Phaser.GameObjects.Text;
  // redrawStats değişim algılama önbelleği (her kare Graphics çizmemek için)
  private statsCache = '';
  // ── Faz 9A.2: yetenekler + MP ──
  private mpText!: Phaser.GameObjects.Text;
  private skillBar!: Phaser.GameObjects.Container;
  private skillGfx!: Phaser.GameObjects.Graphics;
  private skillTexts: Phaser.GameObjects.Text[] = [];
  private skillBarCache = '';
  private skills: Skill[] = [];
  private skillCdUntil: number[] = [];   // yuva başına CD bitişi (ms, time.now)
  private castGcdUntil = 0;              // yetenekler + SPACE ortak salınım ritmi
  private defBuffPct = 0; private defBuffUntil = 0;
  private dodgeBuffPct = 0; private dodgeBuffUntil = 0;
  private elemFloatUntil = 0;            // Faz 9A.3: etkililik float'ı kapısı (ekran dolmasın)
  private buffText!: Phaser.GameObjects.Text;
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
    // Faz 6+ altın birleşimi: tek cüzdan PlayerState.gold. Eski kayıtlarda biriken
    // cozy altını (tdState.gold) bir kez ps.gold'a taşınır ve sıfırlanır (sellAll artık
    // yazmadığından bu geçiş idempotent — sonraki açılışlarda tdState.gold zaten 0).
    if (this.tdMode === 'live' && this.tdState.gold > 0) {
      const ps = PlayerState.get();
      ps.gold += this.tdState.gold;
      this.tdState.gold = 0;
      ps.save();
      this.tdState.save();
    }
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
    // Faz 5.9: zemin gölgesi — karakteri yere oturtur (bob'dan bağımsız, heroPos takip eder)
    this.heroShadow = this.add.ellipse(this.heroPos.x, this.heroPos.y + 1, 14, 4, 0x000000, 0.22);
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
    reg('td-signpost', mkSignpost()); // Faz 5.11
    const stump = mkStump(); reg('td-stump', stump); this.propMeta.set('stump', { ox: stump.ox, oy: stump.oy });
    // Faz 7: NPC portreleri — kahramanla aynı chibi çizici, NPC başına sabit palet/yön
    // (tek kare: NPC'ler yürümez). 8 texture, sahne başına bir kez.
    for (const n of NPCS) {
      const nk = `td-npc-${n.id}`;
      if (!this.textures.exists(nk)) this.textures.addCanvas(nk, chibiHumanoid(n.dir, 0, n.palette));
    }
    for (let s = 0; s < 4; s++) { const m = mkFarmPlot(s as 0 | 1 | 2 | 3); reg(`td-farm-${s}`, m); this.propMeta.set(`farm-${s}`, { ox: m.ox, oy: m.oy }); }
    // Faz 8: süs prop'ları — biyom kimliği + kasaba sokak mobilyası. Tek `deco` kind,
    // alt-tip data.deco'da; texture anahtarı `td-deco-<tip>`. Toplanabilir DEĞİL
    // (gatherable kaydı yalnız tree/rock/bush'a bakar) → enerji/kaynak dengesi değişmez.
    for (const k of DECO_KINDS) { const m = mkDeco(k); reg(`td-deco-${k}`, m); this.propMeta.set(`deco-${k}`, { ox: m.ox, oy: m.oy }); }
    // Faz 9A.1: yerdeki loot sprite'ları — 6 texture (rarity ışıması sahnede basılır,
    // sprite başına varyant YOK). Zindan sahnesi de aynı anahtarları kullanır.
    for (const k of GROUND_SPRITE_KINDS) reg(`td-item-${k}`, mkGroundItem(k));

    // etkileşim ipucu (alt-orta, HUD) — konumlar layoutHud()'da (adaptif çözünürlük)
    this.hintText = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: TD_FONT, color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // ── Faz 5.10: sol-üst STAT PANELİ (pro redesign) — yuvarlatılmış gölgeli panel,
    // Lv madalyonu, kapsül barlar (iç-gölgeli track + üst-parlamalı dolgu), ikon
    // satırları, altın/ateş pill çipleri. Bar geometrisi TEK Graphics'te; update()
    // değerler değişince redrawStats() ile yeniden çizer (her kare değil). ──
    this.statsPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9);
    this.statsGfx = this.add.graphics();
    this.levelLabel = this.add.text(17, 8, 'LV', { fontSize: '6px', fontFamily: TD_FONT, color: '#8fa6bd' }).setOrigin(0.5, 0);
    this.levelText = this.add.text(17, 14, '1', { fontSize: '11px', fontFamily: TD_FONT, color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.hpIcon = this.add.text(31, 6, '❤', { fontSize: '8px', fontFamily: TD_FONT, color: '#ff7a7a' }).setOrigin(0, 0);
    this.hpText = this.add.text(89, 7, '', { fontSize: '7px', fontFamily: TD_FONT, color: '#eaffef' }).setOrigin(0.5, 0);
    // '⚡' emoji'si Text canvas'ında koyu kutulu render oluyor (glyph artefaktı) —
    // şimşek redrawStats'ta poligon olarak çizilir; buradaki obje boş yer tutucu değil, YOK.
    this.energyText = this.add.text(89, 26, '', { fontSize: '7px', fontFamily: TD_FONT, color: '#eaffff' }).setOrigin(0.5, 0);
    // Faz 9A.2: MP sayacı (bar 36-44 → metin 37'de)
    this.mpText = this.add.text(89, 37, '', { fontSize: '7px', fontFamily: TD_FONT, color: '#d8e8ff' }).setOrigin(0.5, 0);
    this.goldText = this.add.text(24, 51, '', { fontSize: '9px', fontFamily: TD_FONT, color: '#ffd23f' }).setOrigin(0, 0);
    const goldIcon = this.add.text(11, 51, '💰', { fontSize: '8px', fontFamily: TD_FONT, color: '#ffd23f' }).setOrigin(0, 0);
    this.fireBoostText = this.add.text(96, 51, '🔥×4', { fontSize: '8px', fontFamily: TD_FONT, color: '#ff9d3f' })
      .setOrigin(0, 0).setVisible(false);
    this.statsPanel.add([this.statsGfx, this.levelLabel, this.levelText, this.hpIcon, this.hpText,
      this.energyText, this.mpText, goldIcon, this.goldText, this.fireBoostText]);
    this.redrawStats(1, 0x44cc66, 0, 1, 0x57b8d8, false, 1); // ilk çizim (default değerler)
    this.gatherHint = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: TD_FONT, color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);
    this.buildSkillBar();

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
    // Faz 7: J görev günlüğü; ESC açık diyaloğu/günlüğü kapatır (dünya sahnesinde başka
    // ESC tüketicisi yok — zindan/savaş kendi sahnelerinde dinler)
    kb.on('keydown-J', () => this.toggleQuestLog());
    kb.on('keydown-ESC', () => { if (this.questPanel.visible) this.closeQuestPanel(); });
    // Faz 5.5: [-]/[+] kamera mesafesi (PLUS = ana sıra '=' tuşu, Phaser keycode 187)
    kb.on('keydown-MINUS', () => this.nudgeZoom(-1));
    kb.on('keydown-PLUS', () => this.nudgeZoom(1));
    // Faz 5.11: Q — hızlı iksir iç (savaş ekranına girmeden; mobil 🧪 aynı yol)
    kb.on('keydown-Q', () => this.drinkPotion());
    // zindan/battle aktifken dünya dinleyicisi tüketmesin (çift iksir tuzağı)
    const onUiPotion = () => { if (!this.scene.isActive('TdDungeon') && !this.scene.isActive('TdBattle')) this.drinkPotion(); };
    window.addEventListener('td-ui-potion', onUiPotion);
    this.events.once('shutdown', () => window.removeEventListener('td-ui-potion', onUiPotion));
    this.events.once('destroy', () => window.removeEventListener('td-ui-potion', onUiPotion));
    const onUiBag = () => this.toggleBag();
    const onUiMap = () => this.toggleMinimap();
    window.addEventListener('td-ui-bag', onUiBag);
    window.addEventListener('td-ui-map', onUiMap);
    // Faz 9A.2: 1-4 yetenek yuvaları. SPACE temel vuruş AYNI KALIR (kas hafızası).
    // Mobil: 'td-ui-skill' CustomEvent (detail.slot 1-4) — iksirle aynı alt-sahne koruması.
    const SLOT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;
    SLOT_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.useSkillSlot(i)));
    const onUiSkill = (ev: Event) => {
      if (this.scene.isActive('TdDungeon') || this.scene.isActive('TdBattle')) return;
      const slot = Number((ev as CustomEvent<{ slot?: number }>).detail?.slot ?? 0) - 1;
      if (slot >= 0) this.useSkillSlot(slot);
    };
    window.addEventListener('td-ui-skill', onUiSkill);
    const offUi = () => {
      window.removeEventListener('td-ui-bag', onUiBag);
      window.removeEventListener('td-ui-map', onUiMap);
      window.removeEventListener('td-ui-skill', onUiSkill);
    };
    this.events.once('shutdown', offUi);
    this.events.once('destroy', offUi);

    // Faz 5.4: çanta paneli (kapalı başlar; içerik her açılışta tazelenir) + tuş ipucu
    this.bagPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9 + 2).setVisible(false);
    // Faz 7: diyalog/günlük paneli — çantanın bir tık üstünde (ikisi aynı anda açılmaz,
    // openDialog/toggleQuestLog karşılıklı kapatır)
    this.questPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9 + 3).setVisible(false);
    // Faz 7: günlük tekrarların penceresi açıldıysa satırları sıfırla (oturum başında bir kez).
    // Date.now() BURADA okunur — quests.ts saf kalsın diye `now` parametreli.
    {
      const ps = PlayerState.get();
      if (rolloverRepeatables(ps.quests, Date.now()).length && this.tdMode === 'live') ps.save();
    }
    const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
    this.keysHint = this.add.text(0, 0, '[E] interact · [SPACE] gather · [1-4] skills · [Q] potion · [B] bag · [J] quests · [M] map · [-/+] zoom', {
      fontSize: '8px', fontFamily: TD_FONT, color: '#cfe3f2',
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
   * Faz 5.10: stat paneli bar/çip geometrisi — kapsül track (iç gölge) + dolgu
   * (üst gloss şeridi) + Lv madalyonu + altın/ateş pill'leri. update() değerleri
   * cache anahtarıyla karşılaştırır; yalnız değişince çizilir.
   */
  private redrawStats(hpR: number, hpColor: number, xpR: number, enR: number, enColor: number, fire: boolean, mpR: number): void {
    const g = this.statsGfx;
    g.clear();
    // panel: gölge + gövde + kenar + üst iç-parlama
    // Faz 9A.2: MP barı için yükseklik 54 → 64 (altın/ateş çipleri 39 → 49'a indi).
    g.fillStyle(0x000000, 0.28); g.fillRoundedRect(1, 2, 140, 64, 7);
    // gövde ~opak: yarı saydamlıkta arkadaki bina/duvar silüetleri panelde leke gibi sızıyordu
    g.fillStyle(0x121a23, 0.97); g.fillRoundedRect(0, 0, 140, 64, 7);
    g.lineStyle(1, 0x3a4e63, 1); g.strokeRoundedRect(0, 0, 140, 64, 7);
    g.fillStyle(0xffffff, 0.05); g.fillRect(3, 1, 134, 1);
    // Lv madalyonu
    g.fillStyle(0x1d2836, 1); g.fillCircle(17, 17, 12);
    g.lineStyle(1, 0xe8b23f, 0.9); g.strokeCircle(17, 17, 12);
    g.lineStyle(1, 0xffffff, 0.12); g.strokeCircle(17, 17, 10);
    // bar çizici: kapsül track + iç gölge + dolgu + üst gloss.
    // DİKKAT: fillRoundedRect'te yarıçap > yükseklik/2 GEÇERSİZ geometri üretir
    // (bozuk üçgenleme panelde koyu kutu artefaktı olarak render oldu) — gloss/iç-gölge
    // şeritleri DÜZ fillRect (kapsül içine x'ten yarıçap kadar girinti), dolgu yarıçapı kıskaçlı.
    const bar = (x: number, y: number, w: number, h: number, ratio: number, color: number) => {
      const rad = h / 2;
      g.fillStyle(0x0b1117, 1); g.fillRoundedRect(x, y, w, h, rad);
      g.fillStyle(0x000000, 0.35); g.fillRect(x + rad, y + 1, w - 2 * rad, Math.max(1, Math.round(h * 0.3))); // iç gölge
      const fw = Math.max(0, Math.round((w - 2) * ratio));
      if (fw > 1) {
        const fr = Math.min((h - 2) / 2, fw / 2);
        g.fillStyle(color, 1); g.fillRoundedRect(x + 1, y + 1, fw, h - 2, fr);
        const gw = Math.max(0, fw - 2 * fr);
        if (gw > 0) { g.fillStyle(0xffffff, 0.22); g.fillRect(x + 1 + fr, y + 2, gw, Math.max(1, Math.round((h - 2) * 0.35))); } // gloss
      }
      g.lineStyle(1, 0x2a3a4c, 1); g.strokeRoundedRect(x, y, w, h, rad);
    };
    bar(41, 6, 94, 10, hpR, hpColor);
    // XP: ince şerit (etiketsiz — sessiz ilerleme)
    bar(41, 18, 94, 4, xpR, 0x8f7fff);
    bar(41, 25, 94, 9, enR, enColor);
    // şimşek ikonu (poligon — '⚡' emoji'si Text'te koyu kutulu render oluyordu)
    g.fillStyle(0xffd23f, 1);
    g.fillPoints([
      { x: 36, y: 24 }, { x: 31, y: 30 }, { x: 34, y: 30 },
      { x: 32, y: 35 }, { x: 38, y: 28 }, { x: 35, y: 28 },
    ] as Phaser.Geom.Point[], true);
    // Faz 9A.2: MP barı (TdBattleScene'in 0x3366cc mavisi — iki ekran arası renk paritesi)
    bar(41, 36, 94, 8, mpR, 0x3366cc);
    // MP ikonu: baklava (emoji yok — şimşekle aynı gerekçe)
    g.fillStyle(0x6aa8ff, 1);
    g.fillPoints([
      { x: 34, y: 35 }, { x: 38, y: 40 }, { x: 34, y: 45 }, { x: 30, y: 40 },
    ] as Phaser.Geom.Point[], true);
    // altın pill'i + (koşullu) ateş pill'i
    g.fillStyle(0x1a2430, 1); g.fillRoundedRect(7, 49, 62, 13, 6);
    g.lineStyle(1, 0x3a4e63, 0.8); g.strokeRoundedRect(7, 49, 62, 13, 6);
    if (fire) {
      g.fillStyle(0x2a1c12, 1); g.fillRoundedRect(92, 49, 40, 13, 6);
      g.lineStyle(1, 0xff9d3f, 0.6); g.strokeRoundedRect(92, 49, 40, 13, 6);
    }
  }

  // -----------------------------------------------------------------------
  // Faz 9A.2: yetenek çubuğu — stat panelinin ALTINDA (sol-üst). Alt-orta
  // gatherHint/hintText'e ve mobil joystick'e (sol-alt DOM) çarpmasın diye.
  // -----------------------------------------------------------------------
  private static readonly SLOT = 26;      // yuva kenarı (mantıksal px)
  private static readonly SLOT_GAP = 2;

  /** Yuvalar sınıfa göre kurulur (create'te bir kez — sınıf oyun içinde değişmiyor). */
  private buildSkillBar(): void {
    const S = TdWorldScene.SLOT, G = TdWorldScene.SLOT_GAP;
    this.skills = tdSkills(PlayerState.get().playerClass);
    this.skillCdUntil = this.skills.map(() => 0);
    this.skillBar = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9);
    this.skillGfx = this.add.graphics();
    this.skillBar.add(this.skillGfx);
    this.skillTexts = [];
    this.skills.forEach((sk, i) => {
      const x = i * (S + G);
      const icon = this.add.text(x + S / 2, S / 2 + 1, sk.icon, { fontSize: '11px', fontFamily: TD_FONT })
        .setOrigin(0.5, 0.5);
      const num = this.add.text(x + 3, 2, `${i + 1}`, { fontSize: '6px', fontFamily: TD_FONT, color: '#8fa6bd' })
        .setOrigin(0, 0);
      // temel vuruş 0 MP → maliyet etiketi basılmaz (gürültü olmasın)
      const cost = this.add.text(x + S - 3, S - 2, sk.mpCost ? `${sk.mpCost}` : '',
        { fontSize: '6px', fontFamily: TD_FONT, color: '#6aa8ff' }).setOrigin(1, 1);
      this.skillTexts.push(icon, num, cost);
      this.skillBar.add([icon, num, cost]);
    });
    // aktif buff okuması (DEF/dodge) — çubuğun hemen altında, yalnız buff varken görünür
    this.buffText = this.add.text(0, S + 3, '', { fontSize: '7px', fontFamily: TD_FONT, color: '#9fe8ff' })
      .setOrigin(0, 0).setVisible(false);
    this.skillBar.add(this.buffText);
    this.skillTexts.push(this.buffText);
    this.redrawSkillBar(0, PlayerState.get().mp);
  }

  /**
   * Yuva görselleri: CD süpürmesi (üstten aşağı karartma) + MP yetersizse soluk ikon.
   * update() cache anahtarıyla çağırır — her kare Graphics çizilmez (redrawStats deseni).
   */
  private redrawSkillBar(now: number, mp: number): void {
    const S = TdWorldScene.SLOT, G = TdWorldScene.SLOT_GAP;
    const g = this.skillGfx;
    g.clear();
    this.skills.forEach((sk, i) => {
      const x = i * (S + G);
      const cdLeft = Math.max(0, this.skillCdUntil[i] - now);
      const cdTotal = skillCdMs(sk.id);
      const poor = mp < sk.mpCost;
      g.fillStyle(0x000000, 0.28); g.fillRoundedRect(x + 1, 2, S, S, 5);
      g.fillStyle(0x121a23, 0.95); g.fillRoundedRect(x, 0, S, S, 5);
      // CD süpürmesi: kalan oranı kadar üstten karartma
      if (cdLeft > 0 && cdTotal > 0) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x + 1, 1, S - 2, Math.round((S - 2) * (cdLeft / cdTotal)));
      }
      const ready = cdLeft === 0 && !poor;
      g.lineStyle(1, ready ? 0x6aa8ff : poor ? 0x553333 : 0x3a4e63, ready ? 1 : 0.8);
      g.strokeRoundedRect(x, 0, S, S, 5);
      // ikon/maliyet alfası: kullanılamaz durumda soluk (metinler skillTexts'te 3'erli)
      const a = ready ? 1 : 0.42;
      this.skillTexts[i * 3].setAlpha(a);
      this.skillTexts[i * 3 + 2].setAlpha(a);
    });
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
    this.questPanel?.setPosition(x0 + w / 2, y0 + h / 2); // Faz 7: diyalog/günlük — aynı merkez
    this.keysHint?.setPosition(x0 + w - 4, y0 + h - 4);
    this.hintText.setPosition(x0 + w / 2, y0 + h - 14);
    this.gatherHint.setPosition(x0 + w / 2, y0 + h - 26);
    this.tintRect.setPosition(x0 + w / 2, y0 + h / 2).setSize(w, h);
    this.fogRect.setPosition(x0 + w / 2, y0 + h - 24).setSize(w, 48);
    this.updateMinimap();
    this.perfText?.setPosition(x0 + 4, y0 + 4);
    const texts = [this.hintText, this.gatherHint, this.energyText, this.fireBoostText, this.goldText,
      this.levelText, this.levelLabel, this.hpText, this.hpIcon, this.mpText];
    if (this.keysHint) texts.push(this.keysHint);
    // Faz 9A.2: yetenek çubuğu — stat panelinin altı (panel 6..70, +6 boşluk)
    this.skillBar?.setPosition(x0 + 6, y0 + 76);
    for (const t of this.skillTexts) if (t.style.resolution !== k) t.setResolution(k);
    for (const t of texts) if (t.style.resolution !== k) t.setResolution(k);
  }

  /** E etkileşimi: en yakın interaktif prop'a göre dallanır (klavye + dokunmatik ortak yol). */
  private handleInteract(): void {
    const p = this.nearProp;
    if (this.battleActive) return;
    // paused-input sızıntısına karşı savunma: alt sahne aktifken yeniden-launch yok
    if (this.scene.isActive('TdDungeon') || this.scene.isActive('TdBattle')) return;
    // Faz 7: açık diyalog varsa E onu kapatır (aynı tuşla girip çıkma — panel arkasından
    // ikinci bir etkileşim tetiklenmesin)
    if (this.questPanel.visible) { this.closeQuestPanel(); return; }
    if (p?.kind === 'npc') { this.openDialog(p.data!.id!); return; }
    if (p?.kind === 'building' && p.data!.id === 'marketplace') {
      const gold = this.tdState.sellAll();
      this.tdState.save();
      if (gold > 0) {
        // Tek cüzdan: satış geliri PlayerState.gold'a (savaş ödülleriyle aynı yere)
        const ps = PlayerState.get();
        ps.gold += gold;
        this.questEvent(objectiveKey('sell', 'gold'), gold);
        if (this.tdMode === 'live') ps.save();
        window.dispatchEvent(new CustomEvent('td-sell', { detail: { gold, total: gold } }));
        this.floatText(this.heroPos.x, this.heroPos.y - 16, `+${gold}g 💰`, '#ffd23f');
      } else {
        this.showRedHint('nothing to sell');
      }
    } else if (p?.kind === 'building') {
      // Faz 7: hub ziyareti — `visit:<gameId>` TEK SEFER (flags dedupe). `visit:any` sayan
      // q_grand_tour aynı binaya 9 kez girerek tamamlanamaz; dedupe burada, quests.ts'te değil.
      this.markVisit(p.data!.id!);
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
      // Faz 7: `enter:<dungeonId>` — kapıdan her geçişte (giriş sayısı hedefi 1, tekrar zararsız)
      this.questEvent(objectiveKey('enter', p.data!.id!));
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
        if (this.tdState.harvest(i)) {
          this.tdState.save();
          this.questEvent(objectiveKey('harvest', 'crop'));
          this.floatText(p.x, p.y - 14, '+1 🍒');
        } else this.showRedHint('Not enough energy ⚡');
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
    // ── Faz 5.12: KARE KARE slot ızgarası (stat panelinin görsel dili: yuvarlatılmış
    // paneller + iç gölge). 5 sütun × 2 sıra slot + altta kahraman özet şeridi. ──
    const COLS = 5, SLOT = 26, GAP = 5;
    // Faz 6: live modda cüzdan bağlıysa altta ⛓ SAVE ON-CHAIN satırı açılır (panel uzar)
    const chainSave = this.tdMode === 'live' &&
      (window as unknown as { __frostbiteWallet?: { authenticated?: boolean } }).__frostbiteWallet?.authenticated === true;
    const W2 = COLS * SLOT + (COLS - 1) * GAP + 24, H2 = chainSave ? 174 : 158;
    const gx0 = -W2 / 2 + 12, gy0 = -H2 / 2 + 24;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-W2 / 2 + 1, -H2 / 2 + 2, W2, H2, 8);
    g.fillStyle(0x121a23, 0.97); g.fillRoundedRect(-W2 / 2, -H2 / 2, W2, H2, 8);
    g.lineStyle(1, 0x3a4e63, 1); g.strokeRoundedRect(-W2 / 2, -H2 / 2, W2, H2, 8);
    g.fillStyle(0xffffff, 0.05); g.fillRect(-W2 / 2 + 3, -H2 / 2 + 1, W2 - 6, 1);
    // setScrollFactor(0): render'da etkisiz (container matrisi geçerli) ama INPUT için şart —
    // Phaser'ın hitTest'i pointer'ı ÇOCUĞUN scrollFactor'üne göre düzeltir; 1 kalırsa
    // kamera scroll'u kadar kayar ve tıklama hiçbir zaman isabet etmez (Faz 7'de yakalandı).
    const T = (x: number, y: number, msg: string, color: string, size = 9, originX = 0, originY = 0) =>
      this.add.text(x, y, msg, { fontSize: `${size}px`, fontFamily: TD_FONT, color })
        .setOrigin(originX, originY).setResolution(k).setScrollFactor(0);
    const items: Phaser.GameObjects.GameObject[] = [g,
      T(0, -H2 / 2 + 7, 'BAG', '#9fe8ff', 11, 0.5),
      T(W2 / 2 - 14, -H2 / 2 + 6, '✕', '#8fa6bd', 11)
        .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleBag()),
    ];
    // slot çizici: kare yuva (iç gölge + kenar) + ikon + sağ-alt adet rozeti
    const slot = (col: number, row: number, icon: string, count: number | string | null, dim = false) => {
      const sx = gx0 + col * (SLOT + GAP), sy = gy0 + row * (SLOT + GAP + 6);
      g.fillStyle(0x0b1117, 1); g.fillRoundedRect(sx, sy, SLOT, SLOT, 5);
      g.fillStyle(0x000000, 0.35); g.fillRect(sx + 3, sy + 1, SLOT - 6, 3);
      g.lineStyle(1, 0x2a3a4c, 1); g.strokeRoundedRect(sx, sy, SLOT, SLOT, 5);
      items.push(T(sx + SLOT / 2, sy + SLOT / 2 - 1, icon, '#e8eef4', 11, 0.5, 0.5).setAlpha(dim ? 0.35 : 1));
      if (count !== null) items.push(T(sx + SLOT - 2, sy + SLOT - 2, `${count}`, '#ffd23f', 7, 1, 1));
    };
    // sıra 1: cozy kaynaklar
    slot(0, 0, '🪵', res.wood, res.wood === 0);
    slot(1, 0, '🪨', res.stone, res.stone === 0);
    slot(2, 0, '⛏', res.ore, res.ore === 0);
    slot(3, 0, '🐟', res.fish, res.fish === 0);
    slot(4, 0, '🍒', res.frostberry, res.frostberry === 0);
    // sıra 2: iksir + ekipman + altın
    const potions = ps.inventory.filter(i => i.type === 'potion').reduce((n, i) => n + (i.count || 1), 0);
    slot(0, 1, '🧪', potions, potions === 0);
    // Faz 6: NFT ekipman ★ rozetiyle işaretlenir; ★ slotu sahip olunan item NFT sayısı
    const isNft = (i: { id: string } | null) => !!i && i.id.startsWith('nft_item_');
    const nftCount = ps.inventory.filter(isNft).length +
      [ps.equipped.weapon, ps.equipped.armor, ps.equipped.accessory, ps.equipped.ring].filter(isNft).length;
    slot(1, 1, '⚔', ps.equipped.weapon ? (isNft(ps.equipped.weapon) ? '★' : '') : null, !ps.equipped.weapon);
    slot(2, 1, '🛡', ps.equipped.armor ? (isNft(ps.equipped.armor) ? '★' : '') : null, !ps.equipped.armor);
    slot(3, 1, '💰', ps.gold, ps.gold === 0);
    slot(4, 1, '★', nftCount > 0 ? nftCount : null, nftCount === 0); // item NFT'leri (ERC-1155)
    // alt şerit: kahraman özeti
    const by = gy0 + 2 * (SLOT + GAP + 6) + 4;
    g.fillStyle(0x0e151d, 1); g.fillRoundedRect(-W2 / 2 + 8, by, W2 - 16, 30, 6);
    g.lineStyle(1, 0x2a3a4c, 1); g.strokeRoundedRect(-W2 / 2 + 8, by, W2 - 16, 30, 6);
    items.push(
      T(gx0, by + 4, `Lv.${ps.level}  ❤${Math.round(ps.hp)}/${ps.maxHp}`, '#e8eef4', 8),
      T(gx0, by + 16, `ATK ${ps.atk}  DEF ${ps.def}  SPD ${ps.spd}`, '#cfe3f2', 7),
      T(0, H2 / 2 - 4, 'sell at the Marketplace [E] · [Q] potion', '#8fa6bd', 7, 0.5, 1),
    );
    if (chainSave) {
      const btn = T(0, H2 / 2 - 18, this.chainSaving ? 'Saving…' : '⛓ SAVE ON-CHAIN', this.chainSaving ? '#ffd23f' : '#57e8e0', 8, 0.5, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.chainSaveNow(btn));
      items.push(btn);
    }
    this.bagPanel.add(items);
    this.bagPanel.setVisible(true);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Faz 7: NPC diyaloğu + görev günlüğü + olay kancaları
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Görev olayı girişi. TÜM oyun-içi kancalar (kill/gather/harvest/visit/enter) buradan
   * geçer — pushQuestEvent saf mantığı koşar, LIVE kalıcılığı burada yönetilir: yeni
   * tamamlanan varsa HEMEN yaz, yoksa 5sn'lik biriktiriciye bırak (odun kesme gibi
   * saniye-başı olaylarda localStorage yazma amplifikasyonu olmasın).
   */
  private questDirty = false;
  private questEvent(key: string, amount = 1): void {
    const done = pushQuestEvent(key, amount);
    this.markersDirty = true;
    if (done.length) {
      if (this.tdMode === 'live') PlayerState.get().save();
      this.questDirty = false;
    } else {
      this.questDirty = true;
    }
  }

  /** Hub binasına ilk girişte `visit:<id>` — flags dedupe (bkz. handleInteract notu). */
  private markVisit(gameId: string): void {
    const ps = PlayerState.get();
    const flag = `hub_seen_${gameId}`;
    if (ps.flags.has(flag)) return;
    ps.flags.add(flag);
    this.questEvent(objectiveKey('visit', gameId));
    if (this.tdMode === 'live') ps.save(); // flag kalıcı olmalı (dedupe yenilemede de dursun)
  }

  /** Bir NPC'nin baş üstü işaretçisi: teslim > yeni görev > devam eden. */
  private npcMarkerFor(npcId: string): { txt: string; color: string } {
    const rows = PlayerState.get().quests;
    let ready = false, avail = false, active = false;
    for (const q of questsForGiver(npcId)) {
      const st = offerState(rows, q);
      if (st === 'ready') ready = true;
      else if (st === 'available') avail = true;
      else if (st === 'active') active = true;
    }
    if (ready) return { txt: '?', color: '#ffd23f' };
    if (avail) return { txt: '!', color: '#ffd23f' };
    if (active) return { txt: '·', color: '#8fa6bd' };
    return { txt: '', color: '#ffd23f' };
  }

  private refreshNpcMarkers(): void {
    for (const [id, t] of this.npcMarkers) {
      if (!t.active) { this.npcMarkers.delete(id); continue; }
      const m = this.npcMarkerFor(id);
      if (t.text !== m.txt) t.setText(m.txt);
      t.setColor(m.color).setVisible(m.txt !== '');
    }
  }

  /** Ödül satırı metni (diyalog + günlük ortak). */
  private rewardLabel(def: QuestDef): string {
    const r = def.reward;
    if (r.type === 'gold') return `${r.amount}g 💰`;
    if (r.type === 'xp') return `${r.amount} XP ✨`;
    return `${r.amount}× ${REWARD_ITEMS[r.id ?? '']?.name ?? r.id ?? 'item'} 🧪`;
  }

  private closeQuestPanel(): void {
    this.questPanel.removeAll(true);
    this.questPanel.setVisible(false);
    this.dialogNpc = null;
  }

  /**
   * Panel iskeleti (bagPanel'in görsel diliyle birebir: gölge + gövde + kenar + üst
   * parlama). Dönen `T` yardımcısı panel-yerel koordinatta metin ekler.
   */
  private buildPanel(w: number, h: number, title: string): {
    items: Phaser.GameObjects.GameObject[];
    T: (x: number, y: number, msg: string, color: string, size?: number, ox?: number, oy?: number) => Phaser.GameObjects.Text;
  } {
    const k = this.uiZoom;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, 8);
    g.fillStyle(0x121a23, 0.97); g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineStyle(1, 0x3a4e63, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillStyle(0xffffff, 0.05); g.fillRect(-w / 2 + 3, -h / 2 + 1, w - 6, 1);
    // setScrollFactor(0) input için ŞART — bkz. toggleBag()'deki T() notu.
    const T = (x: number, y: number, msg: string, color: string, size = 8, ox = 0, oy = 0) =>
      this.add.text(x, y, msg, { fontSize: `${size}px`, fontFamily: TD_FONT, color })
        .setOrigin(ox, oy).setResolution(k).setScrollFactor(0);
    const items: Phaser.GameObjects.GameObject[] = [g,
      T(0, -h / 2 + 7, title, '#9fe8ff', 11, 0.5),
      T(w / 2 - 14, -h / 2 + 6, '✕', '#8fa6bd', 11).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.closeQuestPanel()),
    ];
    return { items, T };
  }

  /** Tıklanabilir buton metni (panel içi ortak stil). */
  private panelBtn(t: Phaser.GameObjects.Text, onClick: () => void): Phaser.GameObjects.Text {
    return t.setInteractive({ useHandCursor: true })
      .on('pointerover', () => t.setAlpha(0.75))
      .on('pointerout', () => t.setAlpha(1))
      .on('pointerdown', onClick);
  }

  /**
   * NPC diyaloğu. Tek görev gösterir — öncelik teslim > yeni > devam eden > kilitli.
   * Panelde state TUTULMAZ: her aksiyondan sonra openDialog yeniden çizer, tek doğruluk
   * kaynağı PlayerState.quests kalır.
   */
  private openDialog(npcId: string): void {
    const npc = NPC_BY_ID[npcId];
    if (!npc) return;
    this.bagPanel.setVisible(false);
    this.questPanel.removeAll(true);
    this.dialogNpc = npcId;
    const rows = PlayerState.get().quests;
    const rank: Record<OfferState, number> = { ready: 0, available: 1, active: 2, locked: 3, done: 4 };
    let best: QuestDef | null = null, bestState: OfferState = 'done';
    for (const q of questsForGiver(npcId)) {
      const st = offerState(rows, q);
      if (!best || rank[st] < rank[bestState]) { best = q; bestState = st; }
    }

    const W = 236, H = 150;
    const { items, T } = this.buildPanel(W, H, npc.name);
    const x0 = -W / 2 + 12, wrapW = W - 24;

    if (!best || bestState === 'done' || bestState === 'locked') {
      items.push(T(x0, -H / 2 + 26, npc.greeting, '#cfe3f2', 8).setWordWrapWidth(wrapW));
      const pre = best?.requires ? QUEST_BY_ID[best.requires] : undefined;
      items.push(T(x0, H / 2 - 38, pre
        ? `Come back after "${pre.title}".`
        : 'Nothing more for you right now.', '#8fa6bd', 7).setWordWrapWidth(wrapW));
      items.push(this.panelBtn(T(0, H / 2 - 16, '[ OK ]', '#9fe8ff', 9, 0.5), () => this.closeQuestPanel()));
    } else {
      const row = rows.find(r => r.id === best!.id);
      items.push(
        T(x0, -H / 2 + 24, best.title, '#ffd23f', 10),
        T(x0, -H / 2 + 40, best.description, '#cfe3f2', 8).setWordWrapWidth(wrapW),
        T(x0, H / 2 - 52, `Reward: ${this.rewardLabel(best)}${best.repeatable === 'daily' ? '   ⟳ daily' : ''}`, '#9fe8ff', 8),
      );
      if (bestState === 'available') {
        items.push(
          T(x0, H / 2 - 38, `Objective: ${best.count}× ${best.target === 'any' ? best.kind : best.target}`, '#8fa6bd', 7),
          this.panelBtn(T(-W / 2 + 62, H / 2 - 16, '[ ACCEPT ]', '#6ee87a', 9, 0.5), () => this.acceptQuest(best!)),
          this.panelBtn(T(W / 2 - 52, H / 2 - 16, '[ later ]', '#8fa6bd', 9, 0.5), () => this.closeQuestPanel()),
        );
      } else if (bestState === 'ready') {
        items.push(
          T(x0, H / 2 - 38, `Complete — ${row?.progress ?? 0}/${row?.target ?? best.count} ✔`, '#6ee87a', 7),
          this.panelBtn(T(0, H / 2 - 16, '[ TURN IN ]', '#ffd23f', 9, 0.5), () => this.turnInQuest(best!)),
        );
      } else {
        items.push(
          T(x0, H / 2 - 38, `In progress — ${row?.progress ?? 0}/${row?.target ?? best.count}`, '#cfe3f2', 7),
          this.panelBtn(T(0, H / 2 - 16, '[ OK ]', '#9fe8ff', 9, 0.5), () => this.closeQuestPanel()),
        );
      }
    }
    this.questPanel.add(items);
    this.questPanel.setVisible(true);
    this.layoutHud();
  }

  private acceptQuest(def: QuestDef): void {
    const ps = PlayerState.get();
    if (ps.quests.some(r => r.id === def.id)) return; // çift-tık koruması
    ps.quests.push(makeRow(def));
    if (this.tdMode === 'live') ps.save();
    this.markersDirty = true;
    this.floatText(this.heroPos.x, this.heroPos.y - 20, '📜 quest accepted', '#ffd23f');
    if (this.dialogNpc) this.openDialog(this.dialogNpc); // 'active' görünüme yeniden çiz
  }

  private turnInQuest(def: QuestDef): void {
    const ps = PlayerState.get();
    const row = ps.quests.find(r => r.id === def.id);
    if (!row || !row.completed || row.turnedIn) return;
    // grantReward çanta doluysa false döner ve HİÇBİR ŞEYİ değiştirmez — satırı da
    // turnedIn yapmıyoruz; oyuncu yer açıp geri gelebilsin.
    if (!grantReward(ps, def)) { this.showRedHint(BAG_FULL_HINT); return; }
    row.turnedIn = true;
    if (def.repeatable === 'daily') row.resetAt = Date.now() + DAILY_MS;
    if (this.tdMode === 'live') ps.save();
    this.markersDirty = true;
    this.floatText(this.heroPos.x, this.heroPos.y - 20, `+${this.rewardLabel(def)}`, '#ffd23f');
    if (this.dialogNpc) this.openDialog(this.dialogNpc); // sıradaki görev varsa hemen görünsün
  }

  /** J: görev günlüğü — kabul edilmiş, teslim edilmemiş satırlar (hazır olanlar üstte). */
  private toggleQuestLog(): void {
    if (this.questPanel.visible && this.dialogNpc === null) { this.closeQuestPanel(); return; }
    this.bagPanel.setVisible(false);
    this.questPanel.removeAll(true);
    this.dialogNpc = null;
    const rows = PlayerState.get().quests
      .filter(r => !r.turnedIn)
      .sort((a, b) => Number(b.completed) - Number(a.completed));
    const shown = rows.slice(0, 6);
    const W = 236, H = Math.max(92, 40 + Math.max(1, shown.length) * 22 + 14);
    const { items, T } = this.buildPanel(W, H, 'QUEST LOG');
    const x0 = -W / 2 + 12;
    if (!shown.length) {
      items.push(T(x0, -H / 2 + 28, 'No active quests. Townsfolk marked with a ! have work for you.', '#8fa6bd', 8)
        .setWordWrapWidth(W - 24));
    } else {
      shown.forEach((r, i) => {
        const y = -H / 2 + 26 + i * 22;
        const giver = NPC_BY_ID[QUEST_BY_ID[r.id]?.giver ?? '']?.name ?? '';
        items.push(
          T(x0, y, `${r.completed ? '✔' : '•'} ${r.title}`, r.completed ? '#6ee87a' : '#e8eef4', 8),
          T(x0, y + 10, `${r.progress}/${r.target}${giver ? `  ·  ${giver}` : ''}`, '#8fa6bd', 7),
        );
      });
      if (rows.length > shown.length) {
        items.push(T(W / 2 - 12, H / 2 - 6, `+${rows.length - shown.length} more`, '#8fa6bd', 7, 1, 1));
      }
    }
    this.questPanel.add(items);
    this.questPanel.setVisible(true);
    this.layoutHud();
  }

  /**
   * Faz 6: on-chain progress kaydı — izo HUDScene "Save to chain" butonunun TD portu.
   * Kullanıcı tetikler (tx imzası ister; otomatik sync cüzdan popup spam'i olurdu).
   * Sonuç DOM toast'la bildirilir ('td-chain-toast' → TdPhaserGame). Panel toggle'ı
   * butonu yok edebilir (removeAll(true)) — btn.active guard'ı o yüzden.
   */
  private chainSaving = false;
  private async chainSaveNow(btn: Phaser.GameObjects.Text): Promise<void> {
    if (this.chainSaving) return;
    this.chainSaving = true;
    if (btn.active) btn.setText('Saving…').setColor('#ffd23f');
    window.dispatchEvent(new CustomEvent('td-chain-toast', { detail: { msg: 'Saving on-chain…', color: '#ffd23f' } }));
    try {
      const { saveProgressToChain } = await import('../nft/onchain');
      const res = await saveProgressToChain(PlayerState.get());
      window.dispatchEvent(new CustomEvent('td-chain-toast', { detail: { msg: res.message, color: res.ok ? '#6ee87a' : '#ff6b6b' } }));
    } finally {
      this.chainSaving = false;
      if (btn.active) btn.setText('⛓ SAVE ON-CHAIN').setColor('#57e8e0');
    }
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
    // Faz 9A.1: yerdeki loot da chunk-yerel — cull'da görselleri yok et (sızıntı önleyici).
    // Kaynak node'larıyla aynı sözleşme: kalıcı değil, save şemasına girmez.
    const ground = this.chunkGround.get(key);
    if (ground) {
      ground.forEach(g => this.destroyGround(g));
      this.chunkGround.delete(key);
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
      const texKey = `td-chunk-${key}-${this.waterFrame}`;
      if (!this.textures.exists(texKey)) this.textures.addCanvas(texKey, renderChunk(c.cx, c.cy, this.waterFrame));
      if (exists) {
        // Cila: su tick'inde chunk Image'ini yok edip yeniden kurmak yerine yalnız texture'ı
        // değiştir (origin/pos/depth korunur) — GameObject churn'ü kalkar. Frame texture'ları
        // zaten cache'li, tek maliyet swap. chunkProps/gatherables/monsters'a DOKUNULMAZ.
        this.chunks.get(key)!.setTexture(texKey);
        continue;
      }
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
          if (p.kind === 'building' || p.kind === 'door_dungeon' || p.kind === 'farm_plot' || p.kind === 'portal' || p.kind === 'npc') interactives.push(p);
          if (p.kind === 'npc') {
            // Kahramanla aynı origin (ayak hizası) — NPC'ler statik, yürüme fazı yok.
            const nimg = this.add.image(p.x, p.y, `td-npc-${p.data!.id}`)
              .setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H).setDepth(depth(p.x, p.y));
            const nlabel = this.add.text(p.x, p.y - CHIBI_H + 1, p.data!.name!, {
              fontSize: '7px', fontFamily: TD_FONT, color: '#e9f4ff', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
            }).setOrigin(0.5, 1).setDepth(depth(p.x, p.y) + 1).setResolution(this.uiZoom);
            // Baş üstü görev işaretçisi — metni refreshNpcMarkers() basar (burada boş başlar).
            const marker = this.add.text(p.x, p.y - CHIBI_H - 9, '', {
              fontSize: '11px', fontFamily: TD_FONT, color: '#ffd23f', fontStyle: 'bold',
            }).setOrigin(0.5, 1).setDepth(depth(p.x, p.y) + 2).setResolution(this.uiZoom);
            this.npcMarkers.set(p.data!.id!, marker);
            // chunk cull'ında Map'te ölü referans kalmasın (evictChunk objs'i destroy eder)
            marker.once(Phaser.GameObjects.Events.DESTROY, () => {
              if (this.npcMarkers.get(p.data!.id!) === marker) this.npcMarkers.delete(p.data!.id!);
            });
            this.markersDirty = true; // yeni işaretçi doğdu → bir sonraki update() metni bassın
            objs.push(nimg, nlabel, marker); continue;
          }
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
          else if (p.kind === 'deco') { texKey2 = `td-deco-${p.data!.deco}`; meta = this.propMeta.get(`deco-${p.data!.deco}`)!; }
          else if (p.kind === 'door_dungeon') { texKey2 = 'td-door-dungeon'; meta = this.propMeta.get('door')!; }
          else if (p.kind === 'sign') {
            // Faz 5.11: tabela — sprite + üstünde yön/bölge etiketi ("↑ MINES")
            const simg = this.add.image(p.x, p.y, 'td-signpost').setOrigin(0.5, 1).setDepth(depth(p.x, p.y));
            const slabel = this.add.text(p.x, p.y - 18, p.data!.name!, {
              fontSize: '7px', fontFamily: TD_FONT, color: '#ffe9c9', backgroundColor: '#3a2a18dd', padding: { x: 3, y: 1 },
            }).setOrigin(0.5, 1).setDepth(depth(p.x, p.y) + 1).setResolution(this.uiZoom);
            objs.push(simg, slabel); continue;
          }
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
              fontSize: '8px', fontFamily: TD_FONT, color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
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
    if (!this.textures.exists(key) || !this.textures.exists(`${key}-1`)) {
      const m = mkMonsterChibi(type, false);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, m.frames[0]);
      if (!this.textures.exists(`${key}-1`)) this.textures.addCanvas(`${key}-1`, m.frames[1]);
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
    this.heroShadow.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y) + 1)
      .setDepth(depth(this.heroPos.x, this.heroPos.y) - 1);
    this.hero.setDepth(depth(this.heroPos.x, this.heroPos.y));
    // su animasyonu: 400ms'de bir yalnız su içeren chunk'lar tazelenir.
    // Cila (perf): load/evict taraması yalnız kahraman yeni bir chunk'a geçince koşar —
    // chunk 768px, kahraman 88px/s → sınır geçişi ~8sn'de bir; kalan karelerde streamChunks
    // çağrısı (want dizisi + Set + evict tarama ayırması) atlanır. Su tick'i kendi yolunu korur.
    const hcxs = Math.floor(this.heroPos.x / (CHUNK * TILE)), hcys = Math.floor(this.heroPos.y / (CHUNK * TILE));
    this.waterT += dt;
    if (this.waterT > 0.4) {
      this.waterT = 0; this.waterFrame = ((this.waterFrame + 1) % 3) as 0 | 1 | 2;
      this.streamChunks(true);
    } else if (hcxs !== this.lastChunkCx || hcys !== this.lastChunkCy) {
      this.streamChunks();
    }
    this.lastChunkCx = hcxs; this.lastChunkCy = hcys;
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
    // Faz 9A.1: yerdeki loot otomatik toplama (üstüne yürü) — tarama hero chunk'ı ±1 ile
    // sınırlı; SPACE zincirine dokunulmaz (savaş>toplama önceliği aynı kaldı).
    this.scanGroundPickup();
    // etkileşim: en yakın interaktif ≤ 28px
    let near: TdProp | null = null; let nd = 28;
    for (const cp of this.chunkProps.values()) for (const p of cp.interactives) {
      const d = Math.hypot(this.heroPos.x - p.x, this.heroPos.y - p.y);
      if (d < nd) { nd = d; near = p; }
    }
    if (near !== this.nearProp) {
      this.nearProp = near;
      this.hintText.setText(near
        ? (near.kind === 'npc' ? `E — talk to ${near.data!.name}`
          : near.kind === 'building' ? `E — ${near.data!.name}`
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
    // Faz 7: baş üstü görev işaretçileri — yalnız kirliyken (olay/kabul/teslim/yeni chunk)
    if (this.markersDirty) { this.markersDirty = false; this.refreshNpcMarkers(); }
    // atmosfer lerp — hem alpha hem RENK yumuşak (bölge sınırında hue-snap cilası)
    const atmo = atmoForRegion(regionAt(Math.floor(this.heroPos.x / 16), Math.floor(this.heroPos.y / 16)).key);
    this.tintCur = lerpColor(this.tintCur, atmo.tint, 0.05);
    this.fogCur = lerpColor(this.fogCur, atmo.fogColor, 0.05);
    this.tintRect.fillColor = this.tintCur; this.tintRect.fillAlpha += (atmo.tintAlpha - this.tintRect.fillAlpha) * 0.05;
    this.fogRect.fillColor = this.fogCur; this.fogRect.fillAlpha += (atmo.fogAlpha - this.fogRect.fillAlpha) * 0.05;
    // minimap: mod-farkındalıklı konum/crop/nokta (Faz 5.5)
    this.updateMinimap();

    // ── Faz 4: kamp ateşi yakınlığı + enerji tick + HUD ──
    let nearFire = false;
    for (const f of this.fires) {
      if (Math.hypot(this.heroPos.x - f.x, this.heroPos.y - f.y) <= 48) { nearFire = true; break; }
    }
    this.tdState.tick(dt, nearFire);
    // Faz 5.10: stat paneli — metinler + değişim-algılamalı bar redraw'ı
    const ps = PlayerState.get();
    const pct = Phaser.Math.Clamp(this.tdState.energy / TdState.ENERGY_MAX, 0, 1);
    const enColor = pct < 0.2 ? 0xe84142 : 0x57b8d8;
    const hpR = Phaser.Math.Clamp(ps.hp / ps.maxHp, 0, 1);
    const hpColor = hpR < 0.25 ? 0xe84142 : 0x44cc66;
    const xpR = Phaser.Math.Clamp(ps.xp / ps.xpToNext, 0, 1);
    // ── Faz 9A.2: MP yenilenmesi + buff süreleri + DoT tikleri ──
    this.tickAbilities(dt, t, ps);
    const mpR = Phaser.Math.Clamp(ps.maxMp ? ps.mp / ps.maxMp : 0, 0, 1);
    this.levelText.setText(`${ps.level}`);
    this.hpText.setText(`${Math.round(ps.hp)}/${ps.maxHp}`);
    this.energyText.setText(`${Math.round(this.tdState.energy)}`);
    this.mpText.setText(`${Math.round(ps.mp)}`);
    this.goldText.setText(`${PlayerState.get().gold}`);
    this.fireBoostText.setVisible(nearFire);
    // mpR cache anahtarında: yoksa MP barı donuk kalır (planın uyardığı tuzak)
    const key = `${hpR.toFixed(3)}|${hpColor}|${xpR.toFixed(3)}|${pct.toFixed(3)}|${enColor}|${nearFire ? 1 : 0}|${mpR.toFixed(3)}`;
    if (key !== this.statsCache) {
      this.statsCache = key;
      this.redrawStats(hpR, hpColor, xpR, pct, enColor, nearFire, mpR);
    }
    // yetenek çubuğu: CD 100ms kovalarına yuvarlanır → saniyede ~10 çizim, her kare değil
    const sk = this.skills.map((s, i) =>
      `${Math.ceil(Math.max(0, this.skillCdUntil[i] - t) / 100)}${ps.mp < s.mpCost ? 'x' : ''}`).join(',');
    if (sk !== this.skillBarCache) { this.skillBarCache = sk; this.redrawSkillBar(t, ps.mp); }

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
      // Faz 7: tamamlanmamış görev ilerlemesi de aynı pencerede yazılır (yazma amplifikasyonu yok)
      if (this.questDirty && this.tdMode === 'live') { this.questDirty = false; PlayerState.get().save(); }
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
          this.questEvent(objectiveKey('gather', 'fish'));
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
      fontSize: '10px', fontFamily: TD_FONT, color, backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(1e9).setResolution(this.uiZoom);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /**
   * Faz 9A.3: 'Super effective!' / 'Not very effective...' — saldıran elementin renginde.
   * Nötr vuruşta hiç basılmaz; ELEM_FLOAT_COOLDOWN_MS kapısı 350ms'lik vuruş ritminde
   * ekranın metinle dolmasını engeller (hasar sayısının rengi zaten her vuruşta konuşuyor).
   */
  private elemFloat(x: number, y: number, fx: ElemFx): void {
    if (!fx.text || this.time.now < this.elemFloatUntil) return;
    this.elemFloatUntil = this.time.now + ELEM_FLOAT_COOLDOWN_MS;
    this.floatText(x, y, fx.text, elementHex(fx.elem));
  }

  /**
   * Geçici kırmızı ipucu (ör. 'Not enough energy ⚡') — 1.2sn kilit; süre dolunca
   * update()'teki yakınlık istemi gatherHint'i devralır/gizler (Faz 5.5).
   */
  private showRedHint(msg: string, holdMs = 1200): void {
    this.gatherHint.setText(msg).setColor('#ff5c5c').setVisible(true);
    this.redHintUntil = this.time.now + holdMs;
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
        this.questEvent(objectiveKey('gather', 'frostberry'));
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
        this.questEvent(objectiveKey('gather', 'wood'));
        g.alive = false; g.respawnAt = this.time.now + 25000;
        g.img.setTexture('td-stump');
        this.floatText(g.x, g.y - 14, '+1 🪵');
      } else {
        const isOre = hash2d(g.tx, g.ty, 4) % 4 === 0;
        if (isOre) this.tdState.resources.ore += 1; else this.tdState.resources.stone += 1;
        this.questEvent(objectiveKey('gather', isOre ? 'ore' : 'stone'));
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

  // -----------------------------------------------------------------------
  // Faz 9A.2: yetenekler. skills.ts TUR-TABANLI (TdBattleScene ile paylaşılıyor) →
  // tur→ms çevrimi ve CD tablosu abilities.ts'te; burada yalnız sahne efekti.
  // -----------------------------------------------------------------------
  /** 1-4 tuşu / mobil buton → yuvadaki yeteneği kullan. */
  private useSkillSlot(i: number): void {
    const sk = this.skills[i];
    if (!sk || this.battleActive) return;
    if (this.scene.isActive('TdDungeon') || this.scene.isActive('TdBattle')) return;
    if (this.bagPanel?.visible || this.questPanel?.visible) return; // panel açıkken yazı/tuş çakışması
    const ps = PlayerState.get();
    const now = this.time.now;
    const block = canCast(sk, ps.mp, now, this.skillCdUntil[i] ?? 0, this.castGcdUntil);
    if (block === 'gcd') return;                                    // 350ms — mesaj basmaya değmez
    if (block === 'cd') { this.skillHint(`${sk.icon} ${sk.name} on cooldown`); return; }
    if (block === 'mp') { this.skillHint(`Not enough MP (${sk.mpCost})`); return; }
    // hasar yetenekleri hedef ister; buff yetenekleri hedefsiz kullanılabilir
    const target = isBuffSkill(sk) ? null : this.nearestMob(ATTACK_RANGE);
    if (!isBuffSkill(sk) && !target) { this.skillHint('No target in range'); return; }

    ps.mp = Math.max(0, ps.mp - sk.mpCost);
    this.castGcdUntil = now + CAST_GCD_MS;
    this.skillCdUntil[i] = now + skillCdMs(sk.id);
    this.atkCdUntil = Math.max(this.atkCdUntil, now + CAST_GCD_MS); // SPACE ile ortak ritim

    if (isBuffSkill(sk)) { this.applySelfBuff(sk); return; }
    this.castDamageSkill(sk, target!);
  }

  /** Kendine buff (fortify / arcane_barrier / evasion) — süre tur→ms. */
  private applySelfBuff(sk: Skill): void {
    const b = sk.selfBuff!;
    const until = this.time.now + turnsToMs(b.turns);
    if (b.stat === 'def') { this.defBuffPct = b.amount; this.defBuffUntil = until; }
    else { this.dodgeBuffPct = b.amount; this.dodgeBuffUntil = until; }
    this.floatText(this.heroPos.x, this.heroPos.y - 26, `${sk.icon} ${sk.name}!`, '#9fe8ff');
  }

  /**
   * Hasar yeteneği: `hits` kez vur (MULTIHIT_DELAY_MS aralıkla), ilk vuruşta DoT/stun uygula.
   * Gecikmeli vuruşlarda hedef ölmüş/despawn olmuş olabilir → her tikte canlılık kontrolü.
   */
  private castDamageSkill(sk: Skill, m: MonRef): void {
    const ps = PlayerState.get();
    let n = 0;
    const hit = () => {
      if (m.hp <= 0 || !m.img.active) return;   // hedef bu arada öldü/despawn oldu
      this.heroAttack(m, skillAtk(ps.atk, sk), sk.icon, sk.element);
      if (n === 0) {
        if (sk.dot && m.hp > 0) {
          const p = dotPlan(sk.dot);
          (m.dots ??= []).push({ type: sk.dot.type, left: p.ticks, nextAt: this.time.now + p.everyMs, pct: p.pct });
          this.floatText(m.x, m.y - 30, sk.dot.type === 'burn' ? '🔥 Burn!' : '☠️ Poison!', '#ff6644');
        }
        if (sk.stunChance && Math.random() < sk.stunChance && m.hp > 0) {
          m.downUntil = Math.max(m.downUntil, this.time.now + STUN_MS);
          this.floatText(m.x, m.y - 34, '💫 Stunned!', '#ffd23f');
        }
      }
      if (++n < sk.hits) this.time.delayedCall(MULTIHIT_DELAY_MS, hit);
    };
    hit();
  }

  /**
   * Her karede: MP regen (sınıfa göre, tur→sn), buff süre bitişi, canavar DoT tikleri.
   * DoT hasarı ölüme yol açarsa `killMob` normal ödül yolundan geçer (loot dâhil) —
   * ayrı bir ölüm yolu AÇILMAZ (9A.1'in tek-boğaz çapası korunur).
   */
  private tickAbilities(dt: number, now: number, ps: PlayerState): void {
    if (ps.mp < ps.maxMp) ps.mp = Math.min(ps.maxMp, ps.mp + mpRegenPerSec(ps.playerClass) * dt);
    if (this.defBuffPct && now >= this.defBuffUntil) this.defBuffPct = 0;
    if (this.dodgeBuffPct && now >= this.dodgeBuffUntil) this.dodgeBuffPct = 0;
    const parts: string[] = [];
    if (this.defBuffPct) parts.push(`🛡+${this.defBuffPct}% ${Math.ceil((this.defBuffUntil - now) / 1000)}s`);
    if (this.dodgeBuffPct) parts.push(`💨+${this.dodgeBuffPct}% ${Math.ceil((this.dodgeBuffUntil - now) / 1000)}s`);
    this.buffText.setText(parts.join('  ')).setVisible(parts.length > 0);
    // DoT: yalnız dots'u olan canavarlar gezilir (çoğu boş → sıcak döngü ucuz)
    for (const list of this.chunkMonsters.values()) {
      for (const m of list) {
        if (!m.dots?.length || m.hp <= 0) continue;
        for (let i = m.dots.length - 1; i >= 0; i--) {
          const d = m.dots[i];
          if (now < d.nextAt) continue;
          const dmg = dotTickDamage(m.maxHp, d.pct);
          m.hp -= dmg;
          this.floatText(m.x, m.y - 20, `${d.type === 'burn' ? '🔥' : '☠️'}${dmg}`, '#ff8866');
          d.left--; d.nextAt = now + dotPlan({ type: d.type, turns: 1, pctPerTurn: d.pct }).everyMs;
          if (d.left <= 0) m.dots.splice(i, 1);
          if (m.hp <= 0) { this.killMob(m); break; }
          this.updateMobHpBar(m);
        }
      }
    }
  }

  /** Yetenek geri bildirimi — gatherHint'i kırmızı-ipucu penceresiyle ödünç alır. */
  private skillHint(msg: string): void {
    this.gatherHint.setText(msg).setColor('#ff9d9d').setVisible(true);
    this.redHintUntil = this.time.now + 900;
  }

  /**
   * SPACE saldırısı: hasar + beyaz flaş + knockback + hasar sayısı; ölümde ödül.
   * Faz 9A.2: `atkOverride`/`icon` yalnız yeteneklerden gelir — SPACE yolu (tek argüman)
   * DEĞİŞMEDİ, kendi ATTACK_CD_MS kapısını kullanır.
   * Faz 9A.3: `skillElem` de yalnız yetenekten gelir; yoksa sınıf elementi kullanılır.
   */
  private heroAttack(m: MonRef, atkOverride?: number, icon?: string, skillElem?: Element): void {
    const isSkill = atkOverride !== undefined;
    if (!isSkill) {
      if (this.time.now < this.atkCdUntil) return;
      this.atkCdUntil = this.time.now + ATTACK_CD_MS;
    }
    const ps = PlayerState.get();
    const fx = heroElemFx(ps.playerClass, m.entry.type, skillElem);
    const { dmg, crit } = heroHit(atkOverride ?? ps.atk, m.entry.def ?? 0, fx.mult);
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
    // max: çok-vuruşlu yetenek 2. vuruşta önceki STUN'u KISALTMASIN (knockback 200ms < stun 2s)
    m.downUntil = Math.max(m.downUntil, this.time.now + 200);
    this.floatText(m.x, m.y - 18, `${icon ?? ''}${crit ? '💥' : ''}${dmg}`, damageHex(fx, crit ? '#ffd23f' : '#ffffff'));
    this.elemFloat(m.x, m.y - 32, fx);
    this.ensureMobHpBar(m);
    if (m.hp <= 0) this.killMob(m);
  }

  /** Ölüm: ödül (TdBattle formül paritesi) + loot + poof; live modda PlayerState kaydedilir. */
  private killMob(m: MonRef): void {
    const ps = PlayerState.get();
    const { xp, gold } = killRewards(m.entry.level ?? 1, m.isElite);
    ps.addXp(xp); ps.gold += gold;
    // Faz 7: elit'ler `elite_<tip>` anahtarıyla gider — matchEvent taban tipi de ilerletir
    this.questEvent(objectiveKey('kill', m.isElite ? `elite_${m.entry.type}` : m.entry.type));
    // Faz 9A.1: DÜNYA loot boğazı — bu sahnedeki TEK rollGroundLoot çağrısı burada.
    // (despawnMonster'a KOYMA: orası ölüm dışı yollarla da çağrılabilecek ortak temizlik.)
    this.dropGroundLoot(m.x, m.y, rollGroundLoot(m.entry.type, m.isElite));
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

  // -----------------------------------------------------------------------
  // Faz 9A.1: yerdeki loot — düşür / çiz / otomatik topla
  // -----------------------------------------------------------------------
  /**
   * Ölüm noktasına loot serper. Görseller RAM'de + chunk-yerel (save şeması değişmez).
   * Kapasite aşımında EN ESKİ eşyalar silinir (groundOverflow) — yeni düşen asla kurban
   * değil. Sprite `item.sprite`'a göre seçilir (Record çapası: sprites/groundItems.ts).
   *
   * 🔒 ANAHTAR ÖLÜM NOKTASINDAN (9A.1 review'ı): eşyalar eskiden KENDİ serpilmiş
   * konumlarıyla anahtarlanıyordu. dropOffset 9px'e kadar kaydırdığı için ±1 halkasının
   * dış kenarında ölen bir mob, komşu (±2) chunk'ın anahtarına düşebiliyordu; o anahtar
   * `this.chunks`'ta hiç oluşmadığından evictChunk oraya ASLA uğramaz → kalıcı sızıntı.
   * Artık tek anahtar var: ölümün chunk'ı. Görsel serpme aynen korunuyor.
   */
  private dropGroundLoot(x: number, y: number, drops: LootResult[]): void {
    if (!drops.length) return;
    const key = `${Math.floor(x / (CHUNK * TILE))},${Math.floor(y / (CHUNK * TILE))}`;
    drops.forEach((drop, i) => {
      const { dx, dy } = dropOffset(i);
      const gx = x + dx, gy = y + dy;
      const fx = RARITY_FX[drop.rarity];
      const color = RARITY_COLORS[drop.rarity];
      const d = depth(gx, gy);
      const objs: Phaser.GameObjects.GameObject[] = [];
      // ışıma: rarity renginde yumuşak halka (zeminde, sprite'ın ALTINDA)
      const glow = this.add.ellipse(gx, gy - 1, fx.glowR * 2.4, fx.glowR * 1.4, color, fx.glowAlpha).setDepth(d - 1);
      this.tweens.add({ targets: glow, alpha: fx.glowAlpha * 0.45, scale: 1.18, duration: fx.bobMs, yoyo: true, repeat: -1 });
      objs.push(glow);
      // legendary: dikey ışık huzmesi — uzaktan "efsane var" sinyali
      if (fx.beam) {
        const beam = this.add.rectangle(gx, gy - 1, 3, 26, color, 0.32).setOrigin(0.5, 1).setDepth(d - 1);
        this.tweens.add({ targets: beam, alpha: 0.12, scaleX: 1.8, duration: 620, yoyo: true, repeat: -1 });
        objs.push(beam);
      }
      const img = this.add.image(gx, gy, `td-item-${groundSpriteKind(drop.item.sprite)}`)
        .setOrigin(0.5, 1).setDepth(d);
      this.tweens.add({ targets: img, y: gy - 2, duration: fx.bobMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      objs.push(img);
      for (let s = 0; s < fx.sparkles; s++) {
        const sp = this.add.rectangle(gx, gy - 6, 1, 1, 0xffffff, 0.9).setDepth(d + 1);
        this.tweens.add({
          targets: sp, x: gx + (s % 2 ? 5 : -5), y: gy - 12, alpha: 0,
          duration: 700 + s * 160, repeat: -1, delay: s * 220,
        });
        objs.push(sp);
      }
      // düşüş juice'ı: kısa yükselen isim (rarity renginde)
      this.floatText(gx, gy - 14, drop.item.name, rarityHex(drop.rarity));
      const list = this.chunkGround.get(key) ?? [];
      list.push({ item: drop.item, rarity: drop.rarity, x: gx, y: gy, bornAt: this.time.now, objs });
      this.chunkGround.set(key, list);
    });
    this.trimGround();
  }

  /**
   * 🔒 YER EŞYASI YOK ETMENİN TEK YOLU (9A.1 review'ı — HIGH sızıntı).
   * Phaser'ın `GameObject.destroy()`'u o objeyi hedefleyen TWEEN'leri öldürmez; tween'ler
   * yalnız SAHNE yok edilince temizlenir. TdWorldScene bir oturum boyunca hiç durmaz
   * (dünya→zindan/hub `scene.pause()` kullanır), üstelik her düşüşte `repeat: -1` tween'ler
   * kuruluyor → sadece destroy etmek, ölü objelere çakılı SONSUZ tween'ler biriktirirdi
   * (~1 saat farm ≈ yüzlerce). GROUND_CAP eşya sayısını sınırlar, tween'i sınırlamaz.
   * Üç silme yolu da (evictChunk / trimGround / scanGroundPickup) buradan geçmeli.
   */
  private destroyGround(g: GroundItem): void {
    g.objs.forEach(o => { this.tweens.killTweensOf(o); o.destroy(); });
  }

  /** Kapasite bekçisi: GROUND_CAP üstündeki EN ESKİ eşyaları sahneden düşür. */
  private trimGround(): void {
    let total = 0;
    for (const list of this.chunkGround.values()) total += list.length;
    if (total <= GROUND_CAP) return;
    const all: GroundItem[] = [];
    for (const list of this.chunkGround.values()) all.push(...list);
    for (const victim of groundOverflow(all, GROUND_CAP)) {
      this.destroyGround(victim);
      for (const list of this.chunkGround.values()) {
        const i = list.indexOf(victim);
        if (i >= 0) { list.splice(i, 1); break; }
      }
    }
  }

  /**
   * Otomatik toplama: üstüne yürü. SPACE'e DAL EKLENMEZ (savaş>toplama zinciri bozulmasın).
   * Çanta doluysa eşya YERDE KALIR — kırmızı ipucu, sessiz yok etme yok (takeGround çapası).
   */
  private scanGroundPickup(): void {
    if (!this.chunkGround.size) return; // sıcak yol: yerde hiç eşya yokken 9 anahtar kurma
    const hcx = Math.floor(this.heroPos.x / (CHUNK * TILE)), hcy = Math.floor(this.heroPos.y / (CHUNK * TILE));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const list = this.chunkGround.get(`${hcx + dx},${hcy + dy}`);
      if (!list || !list.length) continue;
      const g = nearestGround(list, this.heroPos.x, this.heroPos.y, PICKUP_RADIUS);
      if (!g) continue;
      const ps = PlayerState.get();
      if (!takeGround(ps, g, list)) {
        // Kilit sırası (9A.1 review'ı): kilitli BAŞKA bir kırmızı uyarı varsa onu ezme;
        // bastığımızda gösterim kilidi = yeniden-gösterim beklemesi → uyarı yanıp sönmez.
        const t = this.time.now;
        if (t > this.bagHintUntil && t > this.redHintUntil) {
          this.bagHintUntil = t + BAG_HINT_COOLDOWN_MS;
          this.showRedHint(BAG_FULL_HINT, BAG_HINT_COOLDOWN_MS);
        }
        return; // eşya yerde kalır; oyuncu yer açıp geri gelir
      }
      this.destroyGround(g);
      this.floatText(g.x, g.y - 10, pickupLabel(g.item), rarityHex(g.rarity));
      if (this.tdMode === 'live') ps.save();
      return; // kare başına bir toplama — juice okunabilir kalsın
    }
  }

  /**
   * Canavarın temas vuruşu: kahraman hasarı + i-frame + geri tepme + kırmızı flaş.
   * Faz 9A.2: `evasion` buff'ı tam kaçınma şansı, `fortify`/`arcane_barrier` DEF çarpanı verir.
   * Faz 9A.3: element TERS yönde de keser — canavarın elementi sınıfınkine üstünse hasar ×1.5.
   */
  private mobHitsHero(m: MonRef): void {
    const ps = PlayerState.get();
    // kaçınma: dünyada TABAN kaçınma yok — yalnız buff (abilities.dodgeChance, tavan %20)
    if (this.dodgeBuffPct && Math.random() < dodgeChance(this.dodgeBuffPct)) {
      this.heroInvulnUntil = this.time.now + HERO_IFRAME_MS;
      this.floatText(this.heroPos.x, this.heroPos.y - 20, '💨 DODGE', '#44ddff');
      return;
    }
    const fx = mobElemFx(m.entry.type, ps.playerClass);
    const dmg = mobHit(m.entry.atk ?? 5, effectiveDef(ps.def, this.defBuffPct), fx.mult);
    ps.hp = Math.max(0, ps.hp - dmg);
    this.heroInvulnUntil = this.time.now + HERO_IFRAME_MS;
    const ddx = this.heroPos.x - m.x, ddy = this.heroPos.y - m.y;
    const len = Math.hypot(ddx, ddy) || 1;
    const kx = this.heroPos.x + (ddx / len) * 12, ky = this.heroPos.y + (ddy / len) * 12;
    if (this.canMove(kx, ky)) { this.heroPos.x = kx; this.heroPos.y = ky; } // solid içine itme
    this.hero.setTintFill(0xff5c5c);
    this.time.delayedCall(120, () => this.hero.clearTint());
    this.cameras.main.shake(70, 0.004);
    this.floatText(this.heroPos.x, this.heroPos.y - 20, `-${dmg}`, damageHex(fx, '#ff5c5c'));
    this.elemFloat(this.heroPos.x, this.heroPos.y - 34, fx);
    if (this.tdMode === 'live') ps.save();
    if (ps.hp <= 0) this.heroDown();
  }

  /** Faz 5.11: Q — envanterden ilk iksiri iç (heal; live'da kalıcı). Battle'ın Potion butonundan bağımsız. */
  drinkPotion(): void {
    const ps = PlayerState.get();
    const pot = ps.inventory.find(i => i.type === 'potion' && (i.count ?? 1) > 0);
    if (!pot) { this.showRedHint('no potions 🧪'); return; }
    if (ps.hp >= ps.maxHp) { this.showRedHint('HP already full ❤'); return; }
    pot.count = (pot.count ?? 1) - 1;
    if (pot.count <= 0) ps.inventory.splice(ps.inventory.indexOf(pot), 1);
    const heal = pot.stat?.hp ?? 40;
    ps.hp = Math.min(ps.maxHp, ps.hp + heal);
    if (this.tdMode === 'live') ps.save();
    this.floatText(this.heroPos.x, this.heroPos.y - 18, `+${heal} ❤ 🧪`, '#5aef8a');
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
