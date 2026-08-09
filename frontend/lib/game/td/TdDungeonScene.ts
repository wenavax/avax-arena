// frontend/lib/game/td/TdDungeonScene.ts
// ─── Parametrik zindan sahnesi: seed'li prosedürel layout + birebir roster ───
// dungeonGen (saf) ile üretilen 48×40 tile grid'i tek canvas'a pre-render eder
// (chunk streaming gerekmez — zindan küçük). Kapı akışı: TdWorldScene pause+launch,
// bu sahne stop+resume (battle akışıyla simetrik).
import * as Phaser from 'phaser';
import { TILE, computeTdView, userTdZoom, depth, hash2d, TD_FONT } from './tdCore';
import { REGIONS } from './worldMap';
import { biomeTopColor } from './tiles';
import { atmoForRegion } from './atmosphere';
import { musicForDungeon, isAudioUnlocked, markAudioUnlocked } from './zoneMusic';
import { music, type ZoneMusic } from '../musicSystem';
import { chibiHumanoid, CHIBI_H } from './sprites/chibi';
import { mkMonsterChibi } from './sprites/monsterChibi';
import { mkOreVein } from './sprites/props';
import { mkGroundItem } from './sprites/groundItems';
import {
  rollGroundLoot, groundSpriteKind, nearestGround, takeGround, groundOverflow, dropOffset,
  rarityHex, pickupLabel, RARITY_FX, GROUND_SPRITE_KINDS, GROUND_CAP, PICKUP_RADIUS,
  BAG_HINT_COOLDOWN_MS, BAG_FULL_HINT,
} from './groundLoot';
import { RARITY_COLORS, type LootResult, type Rarity } from '../lootTables';
import type { InventoryItem } from '../PlayerState';
import { DUNGEON_ROSTERS, type MonsterEntry } from './monsterData';
import { genDungeon, type DungeonGen } from './dungeonGen';
import { PER_HIT } from './cozy/rules';
import type { TdWorldScene } from './TdWorldScene';
import { PlayerState } from '../PlayerState';
import { pushQuestEvent, objectiveKey } from './quests';
import { heroHit, mobHit, killRewards, ATTACK_RANGE, ATTACK_CD_MS, AGGRO_RANGE, CHASE_SPEED, CONTACT_RANGE, HERO_IFRAME_MS } from './combat';
import {
  tdSkills, mpRegenPerSec, canCast, skillCdMs, skillAtk, isBuffSkill, turnsToMs,
  dotPlan, dotTickDamage, effectiveDef, dodgeChance, skillBarKey,
  CAST_GCD_MS, MULTIHIT_DELAY_MS, STUN_MS,
} from './abilities';
import {
  heroElemFx, mobElemFx, damageHex, elementHex, ELEM_FLOAT_COOLDOWN_MS, type ElemFx,
} from './elemental';
import { recordKillStats } from './killStats';
import { incrementStat, buildStats, checkAndUnlock } from '../achievements';
import { rollBark, BarkStack, BARK_HOLD_MS, BARK_FADE_MS } from './barks';
import type { Skill } from '../skills';
import type { Element } from '../elements';

const WALK_FRAMES = [0, 1, 0, 2] as const;


interface DungeonInitData { dungeonId: string; exitPos: { x: number; y: number } }

/** Zindan içi gezinen bir canavar referansı (overworld MonRef'in küçültülmüş eşleniği). */
interface DMonRef {
  entry: MonsterEntry;
  img: Phaser.GameObjects.Image;
  x: number; y: number;
  tx0: number; ty0: number;
  tgtX: number; tgtY: number;
  pause: number;
  f: number; ft: number;
  downUntil: number;
  isBoss: boolean;
  // Faz 5.7: trash moblar haritada dövüşülür (boss TdBattle'da kalır)
  hp: number; maxHp: number;
  hpBg?: Phaser.GameObjects.Rectangle; hpFill?: Phaser.GameObjects.Rectangle;
  // Faz 9A.2: DoT (zehir/yanma) — TdWorldScene.MonRef.dots ile birebir sözleşme.
  // RAM'de, DMonRef ile birlikte ölür (despawn → referans gider, ayrı temizlik gerekmez).
  dots?: Array<{ type: 'poison' | 'burn'; left: number; nextAt: number; pct: number }>;
  // Faz 9A.6: replik kilidi (barks.ts BarkLock) — mob başına ÖMÜR BOYU tek deneme.
  barked?: boolean;
}

/** Faz 9A.1: zindanda yerde duran loot (TdWorldScene.GroundItem'in zindan eşleniği; RAM-yerel). */
interface DGroundItem {
  item: InventoryItem;
  rarity: Rarity;
  x: number; y: number;
  bornAt: number;
  objs: Phaser.GameObjects.GameObject[];
}

export class TdDungeonScene extends Phaser.Scene {
  private dungeonId = 'swamp';
  private exitPos = { x: 0, y: 0 };
  private gen!: DungeonGen;
  private hero!: Phaser.GameObjects.Image;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private heroPos = { x: 0, y: 0 };
  private heroDir: 0 | 1 | 2 = 0; private heroFlip = false;
  private walkIdx = 0; private walkT = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private mons: DMonRef[] = [];
  private boss: DMonRef | null = null;
  private battleActive = false;
  private hintText!: Phaser.GameObjects.Text;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private timeInDungeon = 0;
  private leaving = false;
  private uiZoom = 3; // Faz 5.2: aktif tam-sayı kamera zoom'u (applyZoom)
  // Faz 5.6: cevher damarları (SPACE ile kazılır; her girişte deterministik yeniden doğar)
  private veins: { x: number; y: number; img: Phaser.GameObjects.Image; hits: number; alive: boolean }[] = [];
  private touchSpacePrev = false;
  private hintLockUntil = 0; // '👑 Dungeon cleared!' gibi mesajlar kazı istemiyle ezilmesin
  // Faz 9A.1: yerdeki loot — zindan küçük, tek düz liste yeter (sahne kapanınca yok olur)
  private ground: DGroundItem[] = [];
  private bagHintUntil = 0;
  // ── Faz 9A.2: yetenekler + MP (dünya sahnesiyle aynı sözleşme, zindan HUD deyimiyle) ──
  private skillBar!: Phaser.GameObjects.Container;
  private skillGfx!: Phaser.GameObjects.Graphics;
  private hudTexts: Phaser.GameObjects.Text[] = [];  // slot başına 3'lü (ikon/numara/maliyet) + sonda mp/buff
  private mpText!: Phaser.GameObjects.Text;
  private buffText!: Phaser.GameObjects.Text;
  private skillBarCache = '';
  private skills: Skill[] = [];
  private skillCdUntil: number[] = [];   // yuva başına CD bitişi (ms, time.now)
  private castGcdUntil = 0;              // yetenekler + SPACE ortak salınım ritmi
  private defBuffPct = 0; private defBuffUntil = 0;
  private dodgeBuffPct = 0; private dodgeBuffUntil = 0;
  private elemFloatUntil = 0;            // Faz 9A.3: etkililik float'ı kapısı (ekran dolmasın)
  // Yetenek geri bildirimi hintText'i ödünç alır; update()'in gizleme dalı yalnız KENDİ
  // metinlerini tanıyordu → keyfi bir mesaj ekranda asılı kalırdı (9A.1'in BAG_FULL_HINT dersi).
  private tempHintUntil = 0;
  // Faz 9A.4: en son ÇALINAN ambiyans (dünya sahnesiyle aynı sözleşme). Boss savaşı
  // müziği 'boss'a çevirir ve geri döndürmez → 'resume'da null'lanır, update() tazeler.
  private playedZone: ZoneMusic | null = null;
  // ── Faz 9A.6: ekranda duran replik baloncukları (defter barks.ts'te, saf) ──
  // 🔴 `destroy()` TEK BAŞINA YETMEZ: Phaser tween'i hedefi yok edilse de listede tutar
  // (9A.1'in yerdeki-loot sızıntısı) → sökme çifti TEK yerde, dünya sahnesiyle birebir.
  private barks = new BarkStack<Phaser.GameObjects.Text>((t) => {
    this.tweens.killTweensOf(t);
    t.destroy();
  });

  constructor() { super({ key: 'TdDungeon' }); }

  init(data: DungeonInitData): void {
    this.dungeonId = data.dungeonId;
    this.exitPos = { ...data.exitPos };
    this.battleActive = false;
    this.timeInDungeon = 0;
    this.leaving = false;
    this.mons = [];
    this.boss = null;
    this.veins = [];
    this.touchSpacePrev = false;
    // Faz 9A.1: yeni girişte taze başla (görseller sahne stop'unda zaten yok edildi)
    this.ground = [];
    this.bagHintUntil = 0;
    // Faz 9A.2: buff'lar zindan girişleri arasında TAŞINMAZ (sahne örneği yeniden kullanılır).
    // CD/GCD sıfırlanmaz: time.now global ve monoton — eski değerler zaten geçmişte kalır.
    this.defBuffPct = 0; this.defBuffUntil = 0;
    this.dodgeBuffPct = 0; this.dodgeBuffUntil = 0;
    this.tempHintUntil = 0;
    this.skillBarCache = '';
    // Faz 9A.4: sahne örneği yeniden kullanılıyor — bayat playedZone yeni girişte
    // müziği bastırırdı (dünya bu arada kendi ambiyansına dönmüş oluyor).
    this.playedZone = null;
  }

  create(): void {
    this.gen = genDungeon(this.dungeonId);
    const { w, h, tiles, entry, boss, spawns } = this.gen;

    // ── kahraman kareleri (TdWorldScene.create ile birebir — reload sonrası guard) ──
    for (let d = 0; d < 3; d++) for (let p = 0; p < 3; p++) {
      const key = `td-hero-${d}-${p}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, chibiHumanoid(d as 0 | 1 | 2, p as 0 | 1 | 2));
    }

    // ── tek canvas pre-render: bölge biyom paletiyle duvar/zemin ──
    const region = REGIONS.find(r => r.key === this.dungeonId);
    const biome = region?.biome ?? 'ruins';
    const floorLight = biomeTopColor(biome);
    const texKey = `td-dungeon-${this.dungeonId}`;
    if (!this.textures.exists(texKey)) {
      const c = document.createElement('canvas');
      c.width = w * TILE; c.height = h * TILE;
      const g = c.getContext('2d')!;
      const WALL = '#1a2028';
      for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
        const px = tx * TILE, py = ty * TILE;
        const t = tiles[ty * w + tx];
        if (t === 0) {
          g.fillStyle = WALL;
          g.fillRect(px, py, TILE, TILE);
          g.fillStyle = floorLight;
          g.globalAlpha = 0.35;
          g.fillRect(px, py, TILE, 2); // duvar üst-kenar biyom tonu şeridi
          g.globalAlpha = 1;
        } else {
          g.fillStyle = ((tx + ty) & 1) ? floorLight : shade(floorLight, 0.9);
          g.fillRect(px, py, TILE, TILE);
        }
      }
      // giriş tile'ı: aydınlık pad
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.28;
      g.fillRect(entry.x * TILE + 2, entry.y * TILE + 2, TILE - 4, TILE - 4);
      g.globalAlpha = 1;
      this.textures.addCanvas(texKey, c);
    }
    this.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(-1000);

    this.cameras.main.setBounds(0, 0, w * TILE, h * TILE);
    this.cameras.main.setRoundPixels(true);

    // ── hero spawn: giriş tile merkezi ──
    this.heroPos = { x: entry.x * TILE + 8, y: entry.y * TILE + 8 };
    this.heroShadow = this.add.ellipse(this.heroPos.x, this.heroPos.y + 1, 14, 4, 0x000000, 0.28);
    this.hero = this.add.image(this.heroPos.x, this.heroPos.y, 'td-hero-0-0').setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H);
    this.cameras.main.startFollow(this.hero, true, 1, 1);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    this.cursors = kb.createCursorKeys();
    kb.on('keydown-ESC', () => this.leave());
    // Faz 5.6/5.7: SPACE — önce savaş (trash mob), yoksa cevher kazma
    kb.on('keydown-SPACE', () => this.onSpaceAction());
    // Faz 5.11: Q — hızlı iksir (dünya sahnesinin ortak yolu; float zindanda basılır)
    kb.on('keydown-Q', () => this.drinkPotionD());
    const onUiPotion = () => this.drinkPotionD();
    window.addEventListener('td-ui-potion', onUiPotion);
    this.events.once('shutdown', () => window.removeEventListener('td-ui-potion', onUiPotion));
    // Faz 9A.2: 1-4 yetenek yuvaları. SPACE (savaş > kazma) zinciri AYNI KALIR.
    // Mobil: 'td-ui-skill' CustomEvent (detail.slot 1-4) — iksirle aynı kayıt/temizlik kalıbı.
    const SLOT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;
    SLOT_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.useSkillSlot(i)));
    const onUiSkill = (ev: Event) => {
      if (this.scene.isActive('TdBattle')) return; // savaş üstteyken dünya/zindan sessiz
      const slot = Number((ev as CustomEvent<{ slot?: number }>).detail?.slot ?? 0) - 1;
      if (slot >= 0) this.useSkillSlot(slot);
    };
    window.addEventListener('td-ui-skill', onUiSkill);
    this.events.once('shutdown', () => window.removeEventListener('td-ui-skill', onUiSkill));
    // ── Faz 9A.4: bölge müziği ──
    // create()'te music.play() YOK (autoplay tuzağı — bkz. zoneMusic.ts). Kilit OTURUM
    // kapsamlı: oyuncu buraya dünyadan yürüyerek geldiyse zaten açıktır ve zindan
    // ambiyansı ilk karede başlar; doğrudan açılışta ilk jesti bekler.
    kb.once('keydown', markAudioUnlocked);
    this.input.once('pointerdown', markAudioUnlocked);
    // 🔊 sessize alma: mobil buton dünya/zindan için TEK olay yayınlar — savaş üstteyken
    // sus (dünya dinleyicisi zaten zindan aktifken kendini kapatıyor → çift toggle olmaz).
    const onUiMusic = () => { if (!this.scene.isActive('TdBattle')) music.toggleMute(); };
    window.addEventListener('td-ui-music', onUiMusic);
    const offMusic = () => window.removeEventListener('td-ui-music', onUiMusic);
    this.events.once('shutdown', offMusic);
    this.events.once('destroy', offMusic);
    // Boss savaşından dönüş: TdBattleScene müziği 'boss'a çevirdi, geri döndürmüyor.
    this.events.on('resume', () => { this.playedZone = null; });
    // 🔇 Bu sahne shutdown'da music.stop() ÇAĞIRMAZ: zindandan çıkış her zaman
    // TdWorld'ü resume eder ve dünya bir sonraki karede kendi ambiyansını basar. Burada
    // durdurmak, bölge müziği de 'dungeon' olduğunda (maden/harabe/mezar...) aynı parçayı
    // gereksizce kesip baştan başlatırdı. Oturum kökündeki stop TdWorldScene'de.

    // Faz 5.2: HUD/tint konum+boyutları layoutHud()'da (kamera-zoom dönüşümü)
    this.hintText = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: TD_FONT, color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // Faz 9A.2: MP barı + yetenek çubuğu (layoutHud konumlar; applyZoom'dan ÖNCE kurulmalı)
    this.buildSkillBar();

    // atmosfer: bölgenin atmo'su koyulaştırılmış (tintAlpha ×1.6)
    const atmo = atmoForRegion(this.dungeonId);
    this.tintRect = this.add.rectangle(0, 0, 8, 8, atmo.tint, Math.min(0.9, atmo.tintAlpha * 1.6))
      .setScrollFactor(0).setDepth(1500);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    // Zindan sahnesi stop edilir — global scale emitter'dan çıkmak ŞART (sızıntı/stale ref)
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
    this.events.once('destroy', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
    // Faz 9A.6: replik baloncukları — İKİSİNDE de temizlenir (tween + metin birlikte).
    this.events.once('shutdown', () => this.barks.clear());
    this.events.once('destroy', () => this.barks.clear());

    // ── canavarlar: roster havuzunu spawn noktalarına döngüsel dağıt ──
    const roster = DUNGEON_ROSTERS[this.dungeonId];
    if (roster && roster.pool.length > 0) {
      spawns.forEach((sp, i) => {
        const entryMon = roster.pool[i % roster.pool.length];
        const px = sp.x * TILE + 8, py = sp.y * TILE + 8;
        const texBase = this.monTexture(entryMon.type, false);
        const img = this.add.image(px, py, texBase).setOrigin(0.5, 1).setDepth(depth(px, py));
        this.mons.push({
          entry: entryMon, img, x: px, y: py, tx0: px, ty0: py,
          tgtX: px, tgtY: py, pause: Math.random() * 2, f: 0, ft: 0, downUntil: 0, isBoss: false,
          hp: entryMon.hp, maxHp: entryMon.hp,
        });
      });
    }

    // ── Faz 5.6: cevher damarları — zemin tile'larına deterministik (salt 10) serpilir;
    // girişten uzak (>8 tile), 6-9 damar. Derin zindanlarda (bölge level ≥35) çift verim. ──
    if (!this.textures.exists('td-orevein')) {
      const m = mkOreVein();
      this.textures.addCanvas('td-orevein', m.img);
    }
    // Faz 9A.1: yer-eşyası texture'ları — dünya sahnesi de aynı anahtarları kurar,
    // exists guard'ı ikisini de güvenli kılar (hero kareleriyle aynı kalıp).
    for (const k of GROUND_SPRITE_KINDS) {
      const key = `td-item-${k}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, mkGroundItem(k).img);
    }
    const veinTarget = 6 + hash2d(w, h, 10) % 4;
    for (let ty = 2; ty < h - 2 && this.veins.length < veinTarget; ty++) {
      for (let tx = 2; tx < w - 2 && this.veins.length < veinTarget; tx++) {
        if (tiles[ty * w + tx] !== 1) continue;
        if (Math.hypot(tx - entry.x, ty - entry.y) < 8) continue;
        if (hash2d(tx, ty, 10) % 1000 >= 14) continue;
        const px2 = tx * TILE + 8, py2 = ty * TILE + 12;
        const vimg = this.add.image(px2, py2, 'td-orevein').setOrigin(0.5, 1).setDepth(depth(px2, py2));
        this.veins.push({ x: px2, y: py2, img: vimg, hits: 3, alive: true });
      }
    }

    // ── boss: sabit, büyük chibi, boss noktasında ──
    if (roster?.boss) {
      const bx = boss.x * TILE + 8, by = boss.y * TILE + 8;
      const bKeyBase = `td-bmon-${roster.boss.type}`;
      // instance-cache yerine textures.exists: sahne yeniden girişte texture'lar global
      // kalır, cache sıfırlanır → "Texture key already in use" hataları akardı
      if (!this.textures.exists(bKeyBase) || !this.textures.exists(`${bKeyBase}-1`)) {
        const m = mkMonsterChibi(roster.boss.type, true);
        if (!this.textures.exists(bKeyBase)) this.textures.addCanvas(bKeyBase, m.frames[0]);
        if (!this.textures.exists(`${bKeyBase}-1`)) this.textures.addCanvas(`${bKeyBase}-1`, m.frames[1]);
      }
      const bimg = this.add.image(bx, by, bKeyBase).setOrigin(0.5, 1).setDepth(depth(bx, by)).setScale(1.2);
      this.boss = {
        entry: roster.boss, img: bimg, x: bx, y: by, tx0: bx, ty0: by,
        tgtX: bx, tgtY: by, pause: 0, f: 0, ft: 0, downUntil: 0, isBoss: true,
        hp: roster.boss.hp, maxHp: roster.boss.hp, // boss HARİTADA dövüşülmez — TdBattle açılır
      };
    }
  }

  /** Faz 5.2/5.5: kamera zoom'u — kullanıcı tercihi ([-]/[+], world'de ayarlanır) veya default. */
  private applyZoom(): void {
    this.uiZoom = userTdZoom() ?? computeTdView(this.scale.width, this.scale.height).k;
    this.cameras.main.setZoom(this.uiZoom);
    this.layoutHud();
  }

  /** HUD/tint yerleşimi — kamera zoom altında screen→logical dönüşümü (TdWorldScene.layoutHud notu). */
  private layoutHud(): void {
    const k = this.uiZoom, sw = this.scale.width, sh = this.scale.height;
    const cx = sw / 2, cy = sh / 2;
    const x0 = cx - cx / k, y0 = cy - cy / k;
    const w = sw / k, h = sh / k;
    this.hintText.setPosition(x0 + w / 2, y0 + h - 16);
    if (this.hintText.style.resolution !== k) this.hintText.setResolution(k);
    // Faz 9A.2: MP barı + yetenek çubuğu sol-üstte (zindanda stat paneli yok — köşe boş).
    this.skillBar?.setPosition(x0 + 6, y0 + 6);
    for (const t of this.hudTexts) if (t.style.resolution !== k) t.setResolution(k);
    this.tintRect.setPosition(x0 + w / 2, y0 + h / 2).setSize(w, h);
  }

  /** Canavar texture'larını bir kez üretir/kaydeder (2 kare, küçük boy — overworld ile aynı kalıp). */
  private monTexture(type: string, big: boolean): string {
    const key = big ? `td-bmon-${type}` : `td-mon-${type}`;
    if (!this.textures.exists(key) || !this.textures.exists(`${key}-1`)) {
      const m = mkMonsterChibi(type, big);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, m.frames[0]);
      if (!this.textures.exists(`${key}-1`)) this.textures.addCanvas(`${key}-1`, m.frames[1]);
    }
    return key;
  }

  private canMove(nx: number, ny: number): boolean {
    const { w, h, tiles } = this.gen;
    for (const [ox, oy] of [[-4, 0], [4, 0], [-4, 3], [4, 3], [0, 3]] as const) {
      const tx = Math.floor((nx + ox) / TILE), ty = Math.floor((ny + oy) / TILE);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
      if (tiles[ty * w + tx] === 0) return false;
    }
    return true;
  }

  // ── Faz 5.7: zindan trash savaşı (boss hariç — o TdBattle'da) ──
  private atkCdUntil = 0;
  private heroInvulnUntil = 0;

  /** SPACE: önce menzildeki trash moba saldır, yoksa cevher kaz. */
  private onSpaceAction(): void {
    if (this.battleActive || this.leaving) return;
    let best: DMonRef | null = null; let bd = ATTACK_RANGE;
    for (const m of this.mons) {
      const d = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) { this.heroAttackMob(best); return; }
    this.mineNearestVein();
  }

  /**
   * Temel vuruş — Faz 9A.2: `atkOverride`/`icon` YALNIZ yeteneklerden gelir. SPACE yolu
   * (tek argüman) davranış olarak DEĞİŞMEDİ: kendi ATTACK_CD_MS kapısını kullanır.
   * Faz 9A.3: `skillElem` de yalnız yetenekten gelir; yoksa sınıf elementi kullanılır.
   */
  private heroAttackMob(m: DMonRef, atkOverride?: number, icon?: string, skillElem?: Element): void {
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
    const slash = this.add.rectangle(this.heroPos.x + (ddx / len) * 12, this.heroPos.y - 6 + (ddy / len) * 12,
      14, 3, 0xffffff, 0.9).setRotation(Math.atan2(ddy, ddx)).setDepth(1e7);
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.5, duration: 110, onComplete: () => slash.destroy() });
    m.img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (m.img.active) m.img.clearTint(); });
    m.x += (ddx / len) * 10; m.y += (ddy / len) * 10;
    // Faz 9A.2: max — çok-vuruşlu yeteneğin 2. vuruşu STUN'u KISALTMASIN (knockback 200ms < stun 2s)
    m.downUntil = Math.max(m.downUntil, this.time.now + 200);
    this.veinFloat(m.x, m.y - 4, `${icon ?? ''}${crit ? '💥' : ''}${dmg}`, damageHex(fx, crit ? '#ffd23f' : '#ffffff'));
    this.elemFloat(m.x, m.y - 20, fx);
    if (!m.hpBg) {
      m.hpBg = this.add.rectangle(m.x, m.y, 18, 3, 0x1a2028, 0.9).setOrigin(0.5, 1).setDepth(1e7);
      m.hpFill = this.add.rectangle(m.x, m.y, 16, 1.6, 0xe84142, 1).setOrigin(0, 1).setDepth(1e7 + 1);
    }
    this.updateMobHpBar(m);
    if (m.hp <= 0) this.killMobD(m);
  }

  /**
   * 🔒 ZİNDAN TRASH ölüm boğazı — XP/altın/loot/despawn'ın TEK evi. Faz 9A.2'de
   * heroAttackMob'un içinden çıkarıldı: DoT hasarı da öldürebiliyor ve ikinci bir ödül
   * yolu açmak 9A.1'in tek-boğaz çapasını (ve loot dengesini) kırardı. Çağıranlar:
   * heroAttackMob (SPACE + yetenek vuruşu) ve tickAbilities (DoT tiki) — BAŞKASI YOK.
   */
  private killMobD(m: DMonRef): void {
    const ps = PlayerState.get();
    const { xp, gold } = killRewards(m.entry.level ?? 1, false);
    ps.addXp(xp); ps.gold += gold;
    // Faz 9A.1: bu sahnedeki TEK rollGroundLoot çağrısı.
    // 🔒 despawnMonster'a KOYMA: orası çoklu-giriş (haritada dövülen trash + TdBattle'da
    // yenilen BOSS ikisi de düşer). TdBattleScene boss loot'unu kendi rollLoot'uyla
    // veriyor → oraya koymak boss'ta ÇİFT LOOT olurdu. Trash asla elit değil (elit
    // ayrımı overworld'e ait; boss ayrı funnel'da).
    this.dropGroundLoot(m.x, m.y, rollGroundLoot(m.entry.type, false));
    // Faz 9A.5: achievement sayımı — aynı tek boğazdan. Kip kapısı killStats.ts'te
    // (önizlemede inc/unlock HİÇ çağrılmaz; `frostbite_achievements` canlı veri).
    recordKillStats(this.registry.get('tdMode') as string | undefined, { type: m.entry.type, gold }, {
      inc: incrementStat,
      unlock: () => this.unlockAchievements(),
      toast: (title, i) => this.veinFloat(this.heroPos.x, this.heroPos.y - 30 - i * 12, `🏆 ${title}`, '#ffd23f'),
    });
    if ((this.registry.get('tdMode') as string) === 'live') ps.save();
    this.veinFloat(m.x, m.y - 16, `+${xp} XP`, '#7f7fff');
    this.veinFloat(m.x, m.y - 6, `+${gold}g 💰`, '#ffd23f');
    m.hpBg?.destroy(); m.hpFill?.destroy(); m.hpBg = undefined; m.hpFill = undefined;
    this.despawnMonster(m);
  }

  /**
   * Faz 9A.5: kalıcı sayaçlar + canlı PlayerState alanlarıyla başarım denetimi —
   * TdWorldScene.unlockAchievements ile birebir aynı sözleşme (aynı dosyada olmadıkları
   * için ortak bir sarmal PlayerState'i saf killStats.ts'e sokardı).
   * `zonesVisited` boş: gezilen bölge hiçbir yerde tutulmuyor (bkz. TdWorldScene).
   */
  private unlockAchievements(): string[] {
    const ps = PlayerState.get();
    const eq = ps.equipped;
    return checkAndUnlock(buildStats({
      level: ps.level,
      currentGold: ps.gold,
      equipSlotsFilled: [eq.weapon, eq.armor, eq.accessory, eq.ring].filter(Boolean).length,
      questsCompleted: ps.quests.filter(q => q.turnedIn).length,
      zonesVisited: new Set<string>(),
      itemsCollected: ps.inventory.length,
    })).map(a => a.title);
  }

  // -----------------------------------------------------------------------
  // Faz 9A.6: canavar replikleri — dünya sahnesiyle birebir sözleşme, zindan deyimiyle
  // (daha alçak baloncuk + veinFloat'ın 1e8 derinliği).
  // -----------------------------------------------------------------------
  /** Aggro dalından her karede; kilit `barks.ts`te (mob başına tek DENEME). */
  private tryBark(m: DMonRef): void {
    const line = rollBark(m, m.entry.type);
    if (line) this.showBark(m.x, m.y, line);
  }

  /** Bekle → yukarı süzülerek sol. Tween SONLU; kapasite aşımını defter yönetir. */
  private showBark(x: number, y: number, msg: string): void {
    const t = this.add.text(x, y - 26, msg, {
      fontSize: '8px', fontFamily: TD_FONT, color: '#e8eef4', backgroundColor: '#141c24e0',
      padding: { x: 4, y: 2 }, align: 'center', wordWrap: { width: 132 },
    }).setOrigin(0.5, 1).setDepth(1e8).setResolution(this.uiZoom);
    this.barks.add(t);
    this.tweens.add({
      targets: t, y: y - 34, alpha: 0, delay: BARK_HOLD_MS, duration: BARK_FADE_MS,
      onComplete: () => this.barks.remove(t),
    });
  }

  // -----------------------------------------------------------------------
  // Faz 9A.2: yetenekler. skills.ts TUR-TABANLI (TdBattleScene ile paylaşılıyor) →
  // tur→ms çevrimi ve CD tablosu abilities.ts'te; burada yalnız sahne efekti.
  // Dünya sahnesiyle sözleşme birebir; zindana özgü farklar: hedef taraması yalnız
  // this.mons (boss TdBattle'da dövülür), ipuçları hintText üstünden.
  // -----------------------------------------------------------------------
  private static readonly SLOT = 26;      // yuva kenarı (mantıksal px)
  private static readonly SLOT_GAP = 2;
  private static readonly BAR_Y = 12;     // MP kapsülünün altı → yuva satırı

  /** MP kapsülü + 4 yuva; sınıfa göre create'te bir kez kurulur (sınıf oyun içinde değişmez). */
  private buildSkillBar(): void {
    const S = TdDungeonScene.SLOT, G = TdDungeonScene.SLOT_GAP, BY = TdDungeonScene.BAR_Y;
    this.skills = tdSkills(PlayerState.get().playerClass);
    this.skillCdUntil = this.skills.map(() => 0);
    this.skillBar = this.add.container(0, 0).setScrollFactor(0).setDepth(1e9);
    this.skillGfx = this.add.graphics();
    this.skillBar.add(this.skillGfx);
    this.hudTexts = [];
    this.skills.forEach((sk, i) => {
      const x = i * (S + G);
      const icon = this.add.text(x + S / 2, BY + S / 2 + 1, sk.icon, { fontSize: '11px', fontFamily: TD_FONT })
        .setOrigin(0.5, 0.5);
      const num = this.add.text(x + 3, BY + 2, `${i + 1}`, { fontSize: '6px', fontFamily: TD_FONT, color: '#8fa6bd' })
        .setOrigin(0, 0);
      // temel vuruş 0 MP → maliyet etiketi basılmaz (gürültü olmasın)
      const cost = this.add.text(x + S - 3, BY + S - 2, sk.mpCost ? `${sk.mpCost}` : '',
        { fontSize: '6px', fontFamily: TD_FONT, color: '#6aa8ff' }).setOrigin(1, 1);
      this.hudTexts.push(icon, num, cost);
      this.skillBar.add([icon, num, cost]);
    });
    // MP sayacı kapsülün ortasında; buff okuması çubuğun altında (yalnız buff varken)
    this.mpText = this.add.text(this.barW() / 2, 1, '', { fontSize: '7px', fontFamily: TD_FONT, color: '#d8e8ff' })
      .setOrigin(0.5, 0);
    this.buffText = this.add.text(0, BY + S + 3, '', { fontSize: '7px', fontFamily: TD_FONT, color: '#9fe8ff' })
      .setOrigin(0, 0).setVisible(false);
    this.hudTexts.push(this.mpText, this.buffText);
    this.skillBar.add([this.mpText, this.buffText]);
    const ps = PlayerState.get();
    this.redrawSkillBar(0, ps.mp, ps.maxMp);
  }

  /** Yetenek çubuğunun toplam genişliği (MP kapsülü de bu genişlikte). */
  private barW(): number {
    const S = TdDungeonScene.SLOT, G = TdDungeonScene.SLOT_GAP;
    return this.skills.length * S + Math.max(0, this.skills.length - 1) * G;
  }

  /**
   * MP kapsülü + yuva görselleri: CD süpürmesi (üstten aşağı karartma) + MP yetersizse
   * soluk ikon. update() cache anahtarıyla çağırır — her kare Graphics çizilmez.
   */
  private redrawSkillBar(now: number, mp: number, maxMp: number): void {
    const S = TdDungeonScene.SLOT, G = TdDungeonScene.SLOT_GAP, BY = TdDungeonScene.BAR_Y;
    const W = this.barW();
    const g = this.skillGfx;
    g.clear();
    // MP kapsülü (TdBattleScene/TdWorldScene'in 0x3366cc mavisi — ekranlar arası renk paritesi)
    const mpR = Phaser.Math.Clamp(maxMp ? mp / maxMp : 0, 0, 1);
    g.fillStyle(0x000000, 0.28); g.fillRoundedRect(1, 1, W, 9, 4);
    g.fillStyle(0x121a23, 0.95); g.fillRoundedRect(0, 0, W, 9, 4);
    g.fillStyle(0x3366cc, 1); if (mpR > 0) g.fillRoundedRect(1, 1, Math.max(2, (W - 2) * mpR), 7, 3);
    g.lineStyle(1, 0x3a4e63, 1); g.strokeRoundedRect(0, 0, W, 9, 4);
    this.mpText.setText(`${Math.round(mp)}/${maxMp}`);
    this.skills.forEach((sk, i) => {
      const x = i * (S + G);
      const cdLeft = Math.max(0, this.skillCdUntil[i] - now);
      const cdTotal = skillCdMs(sk.id);
      const poor = mp < sk.mpCost;
      g.fillStyle(0x000000, 0.28); g.fillRoundedRect(x + 1, BY + 2, S, S, 5);
      g.fillStyle(0x121a23, 0.95); g.fillRoundedRect(x, BY, S, S, 5);
      // CD süpürmesi: kalan oranı kadar üstten karartma
      if (cdLeft > 0 && cdTotal > 0) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x + 1, BY + 1, S - 2, Math.round((S - 2) * (cdLeft / cdTotal)));
      }
      const ready = cdLeft === 0 && !poor;
      g.lineStyle(1, ready ? 0x6aa8ff : poor ? 0x553333 : 0x3a4e63, ready ? 1 : 0.8);
      g.strokeRoundedRect(x, BY, S, S, 5);
      // ikon/maliyet alfası: kullanılamaz durumda soluk (metinler hudTexts'te 3'erli)
      const a = ready ? 1 : 0.42;
      this.hudTexts[i * 3].setAlpha(a);
      this.hudTexts[i * 3 + 2].setAlpha(a);
    });
  }

  /** 1-4 tuşu / mobil buton → yuvadaki yeteneği kullan. */
  private useSkillSlot(i: number): void {
    const sk = this.skills[i];
    if (!sk || this.battleActive || this.leaving) return;  // onSpaceAction ile aynı kapı
    const ps = PlayerState.get();
    const now = this.time.now;
    const block = canCast(sk, ps.mp, now, this.skillCdUntil[i] ?? 0, this.castGcdUntil);
    if (block === 'gcd') return;                                    // 350ms — mesaj basmaya değmez
    if (block === 'cd') { this.skillHint(`${sk.icon} ${sk.name} on cooldown`); return; }
    if (block === 'mp') { this.skillHint(`Not enough MP (${sk.mpCost})`); return; }
    // hasar yetenekleri hedef ister; buff yetenekleri hedefsiz kullanılabilir
    const target = isBuffSkill(sk) ? null : this.nearestTrash(ATTACK_RANGE);
    if (!isBuffSkill(sk) && !target) { this.skillHint('No target in range'); return; }

    ps.mp = Math.max(0, ps.mp - sk.mpCost);
    this.castGcdUntil = now + CAST_GCD_MS;
    this.skillCdUntil[i] = now + skillCdMs(sk.id);
    this.atkCdUntil = Math.max(this.atkCdUntil, now + CAST_GCD_MS); // SPACE ile ortak ritim

    if (isBuffSkill(sk)) { this.applySelfBuff(sk); return; }
    this.castDamageSkill(sk, target!);
  }

  /** Menzildeki en yakın trash mob — onSpaceAction ile aynı havuz (boss TdBattle'da dövülür). */
  private nearestTrash(range: number): DMonRef | null {
    let best: DMonRef | null = null; let bd = range;
    for (const m of this.mons) {
      const d = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Kendine buff (fortify / arcane_barrier / evasion) — süre tur→ms. */
  private applySelfBuff(sk: Skill): void {
    const b = sk.selfBuff!;
    const until = this.time.now + turnsToMs(b.turns);
    if (b.stat === 'def') { this.defBuffPct = b.amount; this.defBuffUntil = until; }
    else { this.dodgeBuffPct = b.amount; this.dodgeBuffUntil = until; }
    this.veinFloat(this.heroPos.x, this.heroPos.y - 12, `${sk.icon} ${sk.name}!`, '#9fe8ff');
  }

  /**
   * Hasar yeteneği: `hits` kez vur (MULTIHIT_DELAY_MS aralıkla), ilk vuruşta DoT/stun uygula.
   * Gecikmeli vuruşlarda hedef ölmüş/despawn olmuş olabilir → her tikte canlılık kontrolü.
   */
  private castDamageSkill(sk: Skill, m: DMonRef): void {
    const ps = PlayerState.get();
    let n = 0;
    const hit = () => {
      if (this.leaving || m.hp <= 0 || !m.img.active) return;   // hedef bu arada öldü/despawn oldu
      this.heroAttackMob(m, skillAtk(ps.atk, sk), sk.icon, sk.element);
      if (n === 0) {
        if (sk.dot && m.hp > 0) {
          const p = dotPlan(sk.dot);
          (m.dots ??= []).push({ type: sk.dot.type, left: p.ticks, nextAt: this.time.now + p.everyMs, pct: p.pct });
          this.veinFloat(m.x, m.y - 24, sk.dot.type === 'burn' ? '🔥 Burn!' : '☠️ Poison!', '#ff6644');
        }
        if (sk.stunChance && Math.random() < sk.stunChance && m.hp > 0) {
          m.downUntil = Math.max(m.downUntil, this.time.now + STUN_MS);
          this.veinFloat(m.x, m.y - 28, '💫 Stunned!', '#ffd23f');
        }
      }
      if (++n < sk.hits) this.time.delayedCall(MULTIHIT_DELAY_MS, hit);
    };
    hit();
  }

  /**
   * Her karede: MP regen (sınıfa göre, tur→sn), buff süre bitişi, canavar DoT tikleri.
   * DoT hasarı ölüme yol açarsa `killMobD` normal ödül yolundan geçer (loot dâhil) —
   * ayrı bir ölüm yolu AÇILMAZ (9A.1'in tek-boğaz çapası korunur). Liste GERİYE gezilir:
   * killMobD → despawnMonster this.mons'tan splice ediyor.
   */
  private tickAbilities(dt: number, now: number, ps: PlayerState): void {
    if (ps.mp < ps.maxMp) ps.mp = Math.min(ps.maxMp, ps.mp + mpRegenPerSec(ps.playerClass) * dt);
    if (this.defBuffPct && now >= this.defBuffUntil) this.defBuffPct = 0;
    if (this.dodgeBuffPct && now >= this.dodgeBuffUntil) this.dodgeBuffPct = 0;
    const parts: string[] = [];
    if (this.defBuffPct) parts.push(`🛡+${this.defBuffPct}% ${Math.ceil((this.defBuffUntil - now) / 1000)}s`);
    if (this.dodgeBuffPct) parts.push(`💨+${this.dodgeBuffPct}% ${Math.ceil((this.dodgeBuffUntil - now) / 1000)}s`);
    this.buffText.setText(parts.join('  ')).setVisible(parts.length > 0);
    for (let mi = this.mons.length - 1; mi >= 0; mi--) {
      const m = this.mons[mi];
      if (!m.dots?.length || m.hp <= 0) continue;
      for (let i = m.dots.length - 1; i >= 0; i--) {
        const d = m.dots[i];
        if (now < d.nextAt) continue;
        const dmg = dotTickDamage(m.maxHp, d.pct);
        m.hp -= dmg;
        this.veinFloat(m.x, m.y - 14, `${d.type === 'burn' ? '🔥' : '☠️'}${dmg}`, '#ff8866');
        d.left--; d.nextAt = now + dotPlan({ type: d.type, turns: 1, pctPerTurn: d.pct }).everyMs;
        if (d.left <= 0) m.dots.splice(i, 1);
        if (m.hp <= 0) { this.killMobD(m); break; }
        this.updateMobHpBar(m);
      }
    }
  }

  /**
   * Yetenek geri bildirimi — hintText'i ödünç alır. `tempHintUntil` ŞART: update()'in
   * gizleme dalı yalnız kendi bildiği metinleri tanır, keyfi mesaj orada asılı kalırdı.
   */
  private skillHint(msg: string): void {
    const t = this.time.now;
    this.hintText.setText(msg).setVisible(true);
    this.hintLockUntil = t + 1000;
    this.tempHintUntil = t + 1000;
  }

  // ── Faz 9A.1: yerdeki loot (dünya sahnesinin zindan eşleniği; görsel dil birebir) ──
  /** Ölüm noktasına loot serper; kapasite aşımında en eski eşyalar silinir. */
  private dropGroundLoot(x: number, y: number, drops: LootResult[]): void {
    if (!drops.length) return;
    drops.forEach((drop, i) => {
      const { dx, dy } = dropOffset(i);
      const gx = x + dx, gy = y + dy;
      const fx = RARITY_FX[drop.rarity];
      const color = RARITY_COLORS[drop.rarity];
      const d = depth(gx, gy);
      const objs: Phaser.GameObjects.GameObject[] = [];
      const glow = this.add.ellipse(gx, gy - 1, fx.glowR * 2.4, fx.glowR * 1.4, color, fx.glowAlpha).setDepth(d - 1);
      this.tweens.add({ targets: glow, alpha: fx.glowAlpha * 0.45, scale: 1.18, duration: fx.bobMs, yoyo: true, repeat: -1 });
      objs.push(glow);
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
      this.veinFloat(gx, gy - 2, drop.item.name, rarityHex(drop.rarity));
      this.ground.push({ item: drop.item, rarity: drop.rarity, x: gx, y: gy, bornAt: this.time.now, objs });
    });
    for (const victim of groundOverflow(this.ground, GROUND_CAP)) {
      this.destroyGround(victim);
      const i = this.ground.indexOf(victim);
      if (i >= 0) this.ground.splice(i, 1);
    }
  }

  /**
   * 🔒 Yer eşyası yok etmenin TEK yolu — TdWorldScene.destroyGround ile aynı sözleşme:
   * Phaser'ın destroy()'u objeyi hedefleyen tween'leri öldürmez, sonsuz (`repeat: -1`)
   * tween'ler ölü objelere çakılı kalır. Bu sahnede sızıntı SINIRLI (leave() → scene.stop()
   * tween manager'ı temizler), ama iki sahne aynı deseni izlesin diye burada da yapılıyor.
   */
  private destroyGround(g: DGroundItem): void {
    g.objs.forEach(o => { this.tweens.killTweensOf(o); o.destroy(); });
  }

  /** Otomatik toplama: üstüne yürü. Çanta doluysa eşya YERDE KALIR + kırmızı ipucu. */
  private scanGroundPickup(): void {
    if (!this.ground.length) return;
    const g = nearestGround(this.ground, this.heroPos.x, this.heroPos.y, PICKUP_RADIUS);
    if (!g) return;
    const ps = PlayerState.get();
    if (!takeGround(ps, g, this.ground)) {
      // 🔒 hintLockUntil'e SAYGI (9A.1 review'ı): despawnMonster boss ölümünde
      // '👑 Dungeon cleared!' için 2.5sn kilit koyar; alınamayan bir eşyanın üstünden
      // geçmek o mesajı EZİYORDU. Ayrıca gösterim kilidi = yeniden-gösterim beklemesi
      // olmalı, yoksa uyarı 1.2sn'de kaybolup 2.5sn'de geri gelir → yanıp söner.
      const t = this.time.now;
      if (t > this.bagHintUntil && t > this.hintLockUntil) {
        this.bagHintUntil = t + BAG_HINT_COOLDOWN_MS;
        this.hintText.setText(BAG_FULL_HINT).setVisible(true);
        this.hintLockUntil = t + BAG_HINT_COOLDOWN_MS;
      }
      return; // eşya yerde kalır
    }
    this.destroyGround(g);
    this.veinFloat(g.x, g.y + 4, pickupLabel(g.item), rarityHex(g.rarity));
    if ((this.registry.get('tdMode') as string) === 'live') ps.save();
  }

  private updateMobHpBar(m: DMonRef): void {
    if (!m.hpBg || !m.hpFill) return;
    const yy = m.y - m.img.displayHeight - 3;
    m.hpBg.setPosition(m.x, yy);
    m.hpFill.setPosition(m.x - 8, yy - 0.7);
    m.hpFill.width = 16 * Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1);
  }

  /**
   * Canavarın temas vuruşu. Faz 9A.2: `evasion` buff'ı tam kaçınma şansı,
   * `fortify`/`arcane_barrier` DEF çarpanı verir (dünya sahnesiyle birebir).
   * Faz 9A.3: element TERS yönde de keser — canavarın elementi sınıfınkine üstünse hasar ×1.5.
   */
  private mobHitsHero(m: DMonRef): void {
    const ps = PlayerState.get();
    // kaçınma: zindanda da TABAN kaçınma yok — yalnız buff (abilities.dodgeChance, tavan %20)
    if (this.dodgeBuffPct && Math.random() < dodgeChance(this.dodgeBuffPct)) {
      this.heroInvulnUntil = this.time.now + HERO_IFRAME_MS;
      this.veinFloat(this.heroPos.x, this.heroPos.y - 8, '💨 DODGE', '#44ddff');
      return;
    }
    const fx = mobElemFx(m.entry.type, ps.playerClass);
    const dmg = mobHit(m.entry.atk ?? 5, effectiveDef(ps.def, this.defBuffPct), fx.mult);
    ps.hp = Math.max(0, ps.hp - dmg);
    this.heroInvulnUntil = this.time.now + HERO_IFRAME_MS;
    const ddx = this.heroPos.x - m.x, ddy = this.heroPos.y - m.y;
    const len = Math.hypot(ddx, ddy) || 1;
    const kx = this.heroPos.x + (ddx / len) * 12, ky = this.heroPos.y + (ddy / len) * 12;
    if (this.canMove(kx, ky)) { this.heroPos.x = kx; this.heroPos.y = ky; }
    this.hero.setTintFill(0xff5c5c);
    this.time.delayedCall(120, () => this.hero.clearTint());
    this.cameras.main.shake(70, 0.004);
    this.veinFloat(this.heroPos.x, this.heroPos.y - 8, `-${dmg}`, damageHex(fx, '#ff5c5c'));
    this.elemFloat(this.heroPos.x, this.heroPos.y - 22, fx);
    if ((this.registry.get('tdMode') as string) === 'live') ps.save();
    if (ps.hp <= 0) {
      // düşüş: zindandan çık, kasabada yarım canla uyan (dünya sahnesi toparlar)
      ps.hp = Math.ceil(ps.maxHp / 2);
      const world = this.scene.get('TdWorld') as TdWorldScene | null;
      if (world) world.respawnAtTown();
      this.leaving = true;
      this.scene.stop();
      this.scene.resume('TdWorld');
    }
  }

  /** Faz 5.6: en yakın canlı damarı kaz (≤26px) — enerji/kaynak dünya tdState'inde. */
  private mineNearestVein(): void {
    if (this.battleActive || this.leaving) return;
    const world = this.scene.get('TdWorld') as TdWorldScene | null;
    const st = world?.tdState;
    if (!st) return;
    let nearest: typeof this.veins[number] | null = null; let nd = 26;
    for (const v of this.veins) {
      if (!v.alive) continue;
      const d = Math.hypot(this.heroPos.x - v.x, this.heroPos.y - v.y);
      if (d < nd) { nd = d; nearest = v; }
    }
    if (!nearest) return;
    if (st.energy < PER_HIT.mine) { this.veinFloat(nearest.x, nearest.y, 'Not enough energy ⚡', '#ff5c5c'); return; }
    st.energy -= PER_HIT.mine;
    nearest.hits -= 1;
    if (nearest.hits > 0) { this.veinFloat(nearest.x, nearest.y, '⛏️', '#cfd8df'); st.save(); return; }
    // son vuruş: derin zindan (bölge level ≥35) çift cevher — risk = ödül
    const region = REGIONS.find(r => r.key === this.dungeonId);
    const yieldN = (region?.level[0] ?? 0) >= 35 ? 2 : 1;
    st.resources.ore += yieldN;
    nearest.alive = false;
    nearest.img.setVisible(false);
    this.veinFloat(nearest.x, nearest.y, `+${yieldN} ⛏️`, '#ffd884');
    st.save();
  }

  /** Faz 5.11: Q iksir — mantık PlayerState'te, float bu sahnede. */
  private drinkPotionD(): void {
    const ps = PlayerState.get();
    const pot = ps.inventory.find(i => i.type === 'potion' && (i.count ?? 1) > 0);
    if (!pot || ps.hp >= ps.maxHp) return;
    pot.count = (pot.count ?? 1) - 1;
    if (pot.count <= 0) ps.inventory.splice(ps.inventory.indexOf(pot), 1);
    const heal = pot.stat?.hp ?? 40;
    ps.hp = Math.min(ps.maxHp, ps.hp + heal);
    if ((this.registry.get('tdMode') as string) === 'live') ps.save();
    this.veinFloat(this.heroPos.x, this.heroPos.y - 8, `+${heal} ❤ 🧪`, '#5aef8a');
  }

  /**
   * Faz 9A.3: etkililik metni (dünya sahnesinin elemFloat'ının zindan eşleniği).
   * Nötr vuruşta basılmaz; ELEM_FLOAT_COOLDOWN_MS kapısı vuruş ritminde ekranı korur.
   */
  private elemFloat(x: number, y: number, fx: ElemFx): void {
    if (!fx.text || this.time.now < this.elemFloatUntil) return;
    this.elemFloatUntil = this.time.now + ELEM_FLOAT_COOLDOWN_MS;
    this.veinFloat(x, y, fx.text, elementHex(fx.elem));
  }

  /** Yükselen juice metni (TdWorldScene.floatText'in zindan eşleniği). */
  private veinFloat(x: number, y: number, msg: string, color: string): void {
    const t = this.add.text(x, y - 14, msg, {
      fontSize: '10px', fontFamily: TD_FONT, color, backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(1e8).setResolution(this.uiZoom);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** Bir DMonRef'i listeden çıkarıp görüntüsünü yok eder (kazanılan savaş). */
  private despawnMonster(m: DMonRef): void {
    // Faz 7: zindan ölümleri de görev sayar — TEK çoklu-giriş noktası (haritada dövülen
    // trash + TdBattle'da yenilen boss ikisi de buraya düşer, çift sayım yok).
    pushQuestEvent(objectiveKey('kill', m.entry.type));
    if (m.isBoss) pushQuestEvent(objectiveKey('boss', m.entry.type));
    if ((this.registry.get('tdMode') as string) === 'live') PlayerState.get().save();
    if (m.isBoss) {
      this.boss = null;
      this.openBossExitGlow(m.x, m.y);
      this.hintText.setText('👑 Dungeon cleared!').setVisible(true);
      this.hintLockUntil = this.time.now + 2500;
      this.time.delayedCall(2500, () => { if (!this.leaving) this.hintText.setVisible(false); });
    } else {
      const i = this.mons.indexOf(m);
      if (i >= 0) this.mons.splice(i, 1);
    }
    m.img.destroy();
  }

  /** Kozmetik: boss odasında zemine parıldayan bir çıkış lekesi bırakır. */
  private openBossExitGlow(x: number, y: number): void {
    const glow = this.add.circle(x, y, 10, 0xffe08a, 0.35).setDepth(depth(x, y) - 1);
    this.tweens.add({ targets: glow, alpha: 0.15, scale: 1.4, duration: 900, yoyo: true, repeat: -1 });
  }

  private startBattle(m: DMonRef): void {
    if (this.battleActive) return;
    this.battleActive = true;
    m.downUntil = this.time.now + 1e9;
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
        isElite: !!m.entry.isBoss,
      },
      region: this.dungeonId,
      returnScene: 'TdDungeon',
      sandbox: (this.registry.get('tdMode') as 'preview' | 'live' | undefined) !== 'live',
    });
    this.scene.pause();
    this.scene.get('TdBattle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.battleActive = false;
      if (result?.won) this.despawnMonster(m);
      else m.downUntil = this.time.now + 3000;
    });
  }

  /** Zindandan çıkış: TdDungeon durur, TdWorld devam eder (kapı akışıyla simetrik). */
  private leave(): void {
    if (this.leaving) return;
    if (this.battleActive) return; // savaş sırasında ESC → çift-aktif-sahne kilidini önle
    this.leaving = true;
    this.scene.stop();
    this.scene.resume('TdWorld');
  }

  /**
   * Faz 9A.4: yer altı her zaman 'dungeon' çalar (bkz. musicForDungeon). Ucuz: zone
   * değişmediyse hiçbir şey yapmaz; kilit kapalıyken çalmaz ama açılınca ilk karede yakalar.
   */
  private syncZoneMusic(): void {
    const zone = musicForDungeon();
    if (!isAudioUnlocked() || zone === this.playedZone) return;
    this.playedZone = zone;
    music.play(zone);
  }

  update(t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.timeInDungeon += dt;
    // ── Faz 9A.2: MP yenilenmesi + buff süreleri + DoT tikleri ──
    const psu = PlayerState.get();
    this.tickAbilities(dt, t, psu);
    // 🔒 Yeniden-çizim anahtarı abilities.skillBarKey'de (SAF → Node'da davranışı test edilir);
    // MP anahtarın içinde olmak ZORUNDA, yoksa bar donuk kalır (planın uyardığı tuzak).
    const sbKey = skillBarKey(psu.mp, psu.maxMp, this.skillCdUntil, this.skills, t);
    if (sbKey !== this.skillBarCache) {
      this.skillBarCache = sbKey;
      this.redrawSkillBar(t, psu.mp, psu.maxMp);
    }
    const touch = this.registry.get('tdTouch') as { dx: number; dy: number; e: boolean; space: boolean } | undefined;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown || this.cursors.up.isDown) dy -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) dy += 1;
    if (this.keys.A.isDown || this.cursors.left.isDown) dx -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) dx += 1;
    // Mobil sanal joystick: klavye o eksende sessizse dokunmatik ekleyerek birleştir.
    if (touch) {
      if (dx === 0 && touch.dx) dx = touch.dx;
      if (dy === 0 && touch.dy) dy = touch.dy;
      // Faz 5.6/5.7: dokunmatik SPACE one-shot → savaş/kazma
      if (touch.space && !this.touchSpacePrev) this.onSpaceAction();
      this.touchSpacePrev = !!touch.space;
      // Faz 9A.4: joystick Phaser pointer/keyboard olayı üretmez — kilit burada da açılır
      if (!isAudioUnlocked() && (touch.dx || touch.dy || touch.e || touch.space)) markAudioUnlocked();
    }
    // Faz 9A.4: yer altı ambiyansı (kilit kapalıysa sessiz bekler, jestte başlar)
    this.syncZoneMusic();
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
    const bob = moving ? (this.walkIdx % 2) : (Math.floor(t / 520) % 2);
    this.hero.setTexture(`td-hero-${this.heroDir}-${phase}`);
    this.hero.setFlipX(this.heroFlip);
    // bob görsel origin'e uygulanır (pozisyona DEĞİL) — kamera follow hedefi sabit kalır,
    // aksi halde tam ekranda tüm sahne 1px aşağı-yukarı titrer (22 Tem canlı bulgusu).
    this.hero.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y));
    this.hero.setDisplayOrigin(this.hero.displayOriginX, this.hero.height - 3 + bob);
    this.heroShadow.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y) + 1)
      .setDepth(depth(this.heroPos.x, this.heroPos.y) - 1);
    this.hero.setDepth(depth(this.heroPos.x, this.heroPos.y));

    // canavar gezinme + temas — Faz 5.7: trash HARİTADA dövüşülür (aggro/kovalama +
    // temas hasarı); BOSS teması TdBattle'ı açar (dramatik dövüş korunur)
    const WANDER_SPEED = 10, WANDER_R = 24;
    const allMons = this.boss ? [...this.mons, this.boss] : this.mons;
    for (const m of allMons) {
      if (m.downUntil > t) { this.updateMobHpBar(m); continue; }
      const hd = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
      if (!m.isBoss) {
        if (hd < AGGRO_RANGE && hd > CONTACT_RANGE - 4) {
          const cxm = (this.heroPos.x - m.x) / hd, cym = (this.heroPos.y - m.y) / hd;
          m.x += cxm * CHASE_SPEED * dt; m.y += cym * CHASE_SPEED * dt;
          m.img.setFlipX(cxm < 0);
          this.tryBark(m); // Faz 9A.6: kilit mob'un kendi bayrağında → tek deneme
        } else if (m.pause > 0) {
          m.pause -= dt;
        } else {
          const dmx = m.tgtX - m.x, dmy = m.tgtY - m.y;
          const dist = Math.hypot(dmx, dmy);
          if (dist < 2) {
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.random() * WANDER_R;
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
      }
      m.img.setPosition(Math.round(m.x), Math.round(m.y));
      m.img.setDepth(depth(m.x, m.y));
      this.updateMobHpBar(m);
      if (!this.battleActive && m.downUntil <= t) {
        if (m.isBoss) {
          if (hd < 16) this.startBattle(m);
        } else if (hd < CONTACT_RANGE && t > this.heroInvulnUntil) {
          this.mobHitsHero(m);
        }
      }
    }

    // Faz 9A.1: yerdeki loot otomatik toplama (üstüne yürü; SPACE zinciri değişmedi)
    if (!this.battleActive && !this.leaving) this.scanGroundPickup();

    // Faz 5.6/5.7: istem — önce savaş (menzilde trash), sonra kazı (kilitli mesajı ezme)
    if (!this.battleActive && t > this.hintLockUntil) {
      let nearMob = false;
      for (const m of this.mons) {
        if (Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y) < ATTACK_RANGE) { nearMob = true; break; }
      }
      let nearVein = false;
      if (!nearMob) for (const v of this.veins) {
        if (v.alive && Math.hypot(this.heroPos.x - v.x, this.heroPos.y - v.y) < 26) { nearVein = true; break; }
      }
      if (nearMob) this.hintText.setText('[SPACE] attack ⚔️').setVisible(true);
      else if (nearVein) this.hintText.setText('[SPACE] mine ⛏️').setVisible(true);
      // Faz 9A.1: 'bag is full' uyarısı da bu blokta temizlenir — yoksa kilidi dolunca
      // ekranda kalıcı olarak asılı kalırdı (istem yalnız kendi metinlerini gizliyordu).
      // Faz 9A.2: yetenek ipuçları KEYFİ metin → metin eşleştirmesi yetmez, süre damgası
      // (tempHintUntil) ile temizlenir; blok zaten hintLockUntil dolduktan sonra koşuyor.
      else if (this.tempHintUntil || this.hintText.text === '[SPACE] mine ⛏️'
        || this.hintText.text === '[SPACE] attack ⚔️' || this.hintText.text === BAG_FULL_HINT) {
        this.hintText.setVisible(false);
        this.tempHintUntil = 0;
      }
    }

    // atmosfer lerp
    const atmo = atmoForRegion(this.dungeonId);
    const targetAlpha = Math.min(0.9, atmo.tintAlpha * 1.6);
    this.tintRect.fillColor = atmo.tint;
    this.tintRect.fillAlpha += (targetAlpha - this.tintRect.fillAlpha) * 0.05;

    // çıkış: giriş tile'ına yakın + >2s zindanda geçirilmiş
    const entryPx = this.gen.entry.x * TILE + 8, entryPy = this.gen.entry.y * TILE + 8;
    const dEntry = Math.hypot(this.heroPos.x - entryPx, this.heroPos.y - entryPy);
    if (!this.battleActive && this.timeInDungeon > 2 && dEntry < 10) this.leave();
  }
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
