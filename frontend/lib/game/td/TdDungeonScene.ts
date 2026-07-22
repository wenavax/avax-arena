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
import { chibiHumanoid, CHIBI_H } from './sprites/chibi';
import { mkMonsterChibi } from './sprites/monsterChibi';
import { mkOreVein } from './sprites/props';
import { DUNGEON_ROSTERS, type MonsterEntry } from './monsterData';
import { genDungeon, type DungeonGen } from './dungeonGen';
import { PER_HIT } from './cozy/rules';
import type { TdWorldScene } from './TdWorldScene';
import { PlayerState } from '../PlayerState';
import { heroHit, mobHit, killRewards, ATTACK_RANGE, ATTACK_CD_MS, AGGRO_RANGE, CHASE_SPEED, CONTACT_RANGE, HERO_IFRAME_MS } from './combat';

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
  // Faz 5.6: cevher damarları (SPACE ile kazılır; her girişte deterministik yeniden doğar)
  private veins: { x: number; y: number; img: Phaser.GameObjects.Image; hits: number; alive: boolean }[] = [];
  private touchSpacePrev = false;
  private hintLockUntil = 0; // '👑 Dungeon cleared!' gibi mesajlar kazı istemiyle ezilmesin

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
    // Faz 5.6/5.7: SPACE — önce savaş (trash mob), yoksa cevher kazma
    kb.on('keydown-SPACE', () => this.onSpaceAction());

    // Faz 5.2: HUD/tint konum+boyutları layoutHud()'da (kamera-zoom dönüşümü)
    this.hintText = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: TD_FONT, color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
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

  private heroAttackMob(m: DMonRef): void {
    if (this.time.now < this.atkCdUntil) return;
    this.atkCdUntil = this.time.now + ATTACK_CD_MS;
    const ps = PlayerState.get();
    const { dmg, crit } = heroHit(ps.atk, m.entry.def ?? 0);
    m.hp -= dmg;
    const ddx = m.x - this.heroPos.x, ddy = m.y - this.heroPos.y;
    const len = Math.hypot(ddx, ddy) || 1;
    const slash = this.add.rectangle(this.heroPos.x + (ddx / len) * 12, this.heroPos.y - 6 + (ddy / len) * 12,
      14, 3, 0xffffff, 0.9).setRotation(Math.atan2(ddy, ddx)).setDepth(1e7);
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.5, duration: 110, onComplete: () => slash.destroy() });
    m.img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (m.img.active) m.img.clearTint(); });
    m.x += (ddx / len) * 10; m.y += (ddy / len) * 10;
    m.downUntil = this.time.now + 200;
    this.veinFloat(m.x, m.y - 4, crit ? `💥${dmg}` : `${dmg}`, crit ? '#ffd23f' : '#ffffff');
    if (!m.hpBg) {
      m.hpBg = this.add.rectangle(m.x, m.y, 18, 3, 0x1a2028, 0.9).setOrigin(0.5, 1).setDepth(1e7);
      m.hpFill = this.add.rectangle(m.x, m.y, 16, 1.6, 0xe84142, 1).setOrigin(0, 1).setDepth(1e7 + 1);
    }
    this.updateMobHpBar(m);
    if (m.hp <= 0) {
      const { xp, gold } = killRewards(m.entry.level ?? 1, false);
      ps.addXp(xp); ps.gold += gold;
      if ((this.registry.get('tdMode') as string) === 'live') ps.save();
      this.veinFloat(m.x, m.y - 16, `+${xp} XP`, '#7f7fff');
      this.veinFloat(m.x, m.y - 6, `+${gold}g 💰`, '#ffd23f');
      m.hpBg?.destroy(); m.hpFill?.destroy(); m.hpBg = undefined; m.hpFill = undefined;
      this.despawnMonster(m);
    }
  }

  private updateMobHpBar(m: DMonRef): void {
    if (!m.hpBg || !m.hpFill) return;
    const yy = m.y - m.img.displayHeight - 3;
    m.hpBg.setPosition(m.x, yy);
    m.hpFill.setPosition(m.x - 8, yy - 0.7);
    m.hpFill.width = 16 * Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1);
  }

  private mobHitsHero(m: DMonRef): void {
    const ps = PlayerState.get();
    const dmg = mobHit(m.entry.atk ?? 5, ps.def);
    ps.hp = Math.max(0, ps.hp - dmg);
    this.heroInvulnUntil = this.time.now + HERO_IFRAME_MS;
    const ddx = this.heroPos.x - m.x, ddy = this.heroPos.y - m.y;
    const len = Math.hypot(ddx, ddy) || 1;
    const kx = this.heroPos.x + (ddx / len) * 12, ky = this.heroPos.y + (ddy / len) * 12;
    if (this.canMove(kx, ky)) { this.heroPos.x = kx; this.heroPos.y = ky; }
    this.hero.setTintFill(0xff5c5c);
    this.time.delayedCall(120, () => this.hero.clearTint());
    this.cameras.main.shake(70, 0.004);
    this.veinFloat(this.heroPos.x, this.heroPos.y - 8, `-${dmg}`, '#ff5c5c');
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

  /** Yükselen juice metni (TdWorldScene.floatText'in zindan eşleniği). */
  private veinFloat(x: number, y: number, msg: string, color: string): void {
    const t = this.add.text(x, y - 14, msg, {
      fontSize: '10px', fontFamily: TD_FONT, color, backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(1e8).setResolution(this.uiZoom);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** Bir DMonRef'i listeden çıkarıp görüntüsünü yok eder (kazanılan savaş). */
  private despawnMonster(m: DMonRef): void {
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
      // Faz 5.6/5.7: dokunmatik SPACE one-shot → savaş/kazma
      if (touch.space && !this.touchSpacePrev) this.onSpaceAction();
      this.touchSpacePrev = !!touch.space;
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
      else if (this.hintText.text === '[SPACE] mine ⛏️' || this.hintText.text === '[SPACE] attack ⚔️') this.hintText.setVisible(false);
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
