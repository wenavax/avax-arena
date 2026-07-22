// frontend/lib/game/td/TdDungeonScene.ts
// ─── Parametrik zindan sahnesi: seed'li prosedürel layout + birebir roster ───
// dungeonGen (saf) ile üretilen 48×40 tile grid'i tek canvas'a pre-render eder
// (chunk streaming gerekmez — zindan küçük). Kapı akışı: TdWorldScene pause+launch,
// bu sahne stop+resume (battle akışıyla simetrik).
import * as Phaser from 'phaser';
import { TILE, computeTdView, userTdZoom, depth } from './tdCore';
import { REGIONS } from './worldMap';
import { biomeTopColor } from './tiles';
import { atmoForRegion } from './atmosphere';
import { chibiHumanoid, CHIBI_H } from './sprites/chibi';
import { mkMonsterChibi } from './sprites/monsterChibi';
import { DUNGEON_ROSTERS, type MonsterEntry } from './monsterData';
import { genDungeon, type DungeonGen } from './dungeonGen';

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
}

export class TdDungeonScene extends Phaser.Scene {
  private dungeonId = 'swamp';
  private exitPos = { x: 0, y: 0 };
  private gen!: DungeonGen;
  private hero!: Phaser.GameObjects.Image;
  private heroPos = { x: 0, y: 0 };
  private heroDir: 0 | 1 | 2 = 0; private heroFlip = false;
  private walkIdx = 0; private walkT = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private monTexCache = new Set<string>();
  private mons: DMonRef[] = [];
  private boss: DMonRef | null = null;
  private battleActive = false;
  private hintText!: Phaser.GameObjects.Text;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private timeInDungeon = 0;
  private leaving = false;
  private uiZoom = 3; // Faz 5.2: aktif tam-sayı kamera zoom'u (applyZoom)

  constructor() { super({ key: 'TdDungeon' }); }

  init(data: DungeonInitData): void {
    this.dungeonId = data.dungeonId;
    this.exitPos = { ...data.exitPos };
    this.battleActive = false;
    this.timeInDungeon = 0;
    this.leaving = false;
    this.mons = [];
    this.boss = null;
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
    this.hero = this.add.image(this.heroPos.x, this.heroPos.y, 'td-hero-0-0').setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H);
    this.cameras.main.startFollow(this.hero, true, 1, 1);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    this.cursors = kb.createCursorKeys();
    kb.on('keydown-ESC', () => this.leave());

    // Faz 5.2: HUD/tint konum+boyutları layoutHud()'da (kamera-zoom dönüşümü)
    this.hintText = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9).setVisible(false);

    // atmosfer: bölgenin atmo'su koyulaştırılmış (tintAlpha ×1.6)
    const atmo = atmoForRegion(this.dungeonId);
    this.tintRect = this.add.rectangle(0, 0, 8, 8, atmo.tint, Math.min(0.9, atmo.tintAlpha * 1.6))
      .setScrollFactor(0).setDepth(1500);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    // Zindan sahnesi stop edilir — global scale emitter'dan çıkmak ŞART (sızıntı/stale ref)
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
    this.events.once('destroy', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));

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
        });
      });
    }

    // ── boss: sabit, büyük chibi, boss noktasında ──
    if (roster?.boss) {
      const bx = boss.x * TILE + 8, by = boss.y * TILE + 8;
      const bKeyBase = `td-bmon-${roster.boss.type}`;
      if (!this.monTexCache.has(bKeyBase)) {
        const m = mkMonsterChibi(roster.boss.type, true);
        this.textures.addCanvas(bKeyBase, m.frames[0]);
        this.textures.addCanvas(`${bKeyBase}-1`, m.frames[1]);
        this.monTexCache.add(bKeyBase);
      }
      const bimg = this.add.image(bx, by, bKeyBase).setOrigin(0.5, 1).setDepth(depth(bx, by)).setScale(1.2);
      this.boss = {
        entry: roster.boss, img: bimg, x: bx, y: by, tx0: bx, ty0: by,
        tgtX: bx, tgtY: by, pause: 0, f: 0, ft: 0, downUntil: 0, isBoss: true,
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
    this.tintRect.setPosition(x0 + w / 2, y0 + h / 2).setSize(w, h);
  }

  /** Canavar texture'larını bir kez üretir/kaydeder (2 kare, küçük boy — overworld ile aynı kalıp). */
  private monTexture(type: string, big: boolean): string {
    const key = big ? `td-bmon-${type}` : `td-mon-${type}`;
    if (!this.monTexCache.has(key)) {
      const m = mkMonsterChibi(type, big);
      this.textures.addCanvas(key, m.frames[0]);
      this.textures.addCanvas(`${key}-1`, m.frames[1]);
      this.monTexCache.add(key);
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

  /** Bir DMonRef'i listeden çıkarıp görüntüsünü yok eder (kazanılan savaş). */
  private despawnMonster(m: DMonRef): void {
    if (m.isBoss) {
      this.boss = null;
      this.openBossExitGlow(m.x, m.y);
      this.hintText.setText('👑 Dungeon cleared!').setVisible(true);
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

  update(t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.timeInDungeon += dt;
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
    }
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
    this.hero.setDepth(depth(this.heroPos.x, this.heroPos.y));

    // canavar gezinme + temas (overworld ile aynı kalıp, dar yarıçap)
    const WANDER_SPEED = 10, WANDER_R = 24;
    const allMons = this.boss ? [...this.mons, this.boss] : this.mons;
    for (const m of allMons) {
      if (m.downUntil > t) continue;
      if (!m.isBoss) {
        if (m.pause > 0) {
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
      if (!this.battleActive && m.downUntil <= t) {
        const hd = Math.hypot(this.heroPos.x - m.x, this.heroPos.y - m.y);
        const contactR = m.isBoss ? 16 : 12;
        if (hd < contactR) this.startBattle(m);
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
