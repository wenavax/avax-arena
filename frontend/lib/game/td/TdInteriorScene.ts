// frontend/lib/game/td/TdInteriorScene.ts
// ─── Faz 11.1: bina iç mekân sahnesi (TdDungeonScene şablonundan uyarlama) ───
// Kapı akışı zindanla birebir simetrik: TdWorldScene pause+launch → burada gezin →
// leave() = stop + resume('TdWorld'). Oda tek canvas'a pre-render edilir (mobilya dahil;
// oda küçük, chunk streaming gerekmez). Müziğe DOKUNULMAZ (dünya resume'da toparlar);
// save/achievements YAZILMAZ (11.1'de kalıcı state yok).
import * as Phaser from 'phaser';
import { TILE, computeTdView, userTdZoom, depth, TD_FONT } from './tdCore';
import { chibiHumanoid, CHIBI_H } from './sprites/chibi';
import { INTERIORS, interiorWalkable, type InteriorDef } from './interiors';
import { INTERIOR_FURN_SPEC } from './sprites/interiorProps';

const WALK_FRAMES = [0, 1, 0, 2] as const;

interface InteriorInitData { interiorId: string }

export class TdInteriorScene extends Phaser.Scene {
  private interiorId = 'inn';
  private def!: InteriorDef;
  private hero!: Phaser.GameObjects.Image;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private heroPos = { x: 0, y: 0 };
  private heroDir: 0 | 1 | 2 = 0; private heroFlip = false;
  private walkIdx = 0; private walkT = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private hintText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private leaving = false;
  private timeIn = 0;
  private uiZoom = 3;
  private touchEPrev = false;

  constructor() { super({ key: 'TdInterior' }); }

  /** Sahne örneği yeniden kullanılır (Dungeon dersi) — TÜM mutable alanlar burada sıfırlanır. */
  init(data: InteriorInitData): void {
    this.interiorId = data.interiorId;
    this.leaving = false;
    this.timeIn = 0;
    this.touchEPrev = false;
    this.heroDir = 0; this.heroFlip = false;
    this.walkIdx = 0; this.walkT = 0;
  }

  create(): void {
    // 🔴 boss-donma dersi (TdBattleScene:201): launch edilen sahne "aktif ≠ görünür" —
    // display list sırası ayrı; İLK iş en üste al.
    this.scene.bringToTop();
    this.def = INTERIORS[this.interiorId] ?? INTERIORS.inn;
    const { w, h } = this.def.room;
    // duvar halkası 1 tile: canvas (w+2)×(h+2) tile, oda içi (1,1) ofsetli
    const W = (w + 2) * TILE, H = (h + 2) * TILE;

    // ── kahraman kareleri (TdWorldScene/TdDungeonScene ile birebir — reload guard'ı) ──
    for (let d = 0; d < 3; d++) for (let p = 0; p < 3; p++) {
      const key = `td-hero-${d}-${p}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, chibiHumanoid(d as 0 | 1 | 2, p as 0 | 1 | 2));
    }

    // ── oda pre-render: duvar halkası + zemin daması + mobilya + çıkış pad'i ──
    const texKey = `td-interior-${this.def.id}`;
    if (!this.textures.exists(texKey)) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d')!;
      const floorHex = cssHex(this.def.room.floor);
      const wallHex = cssHex(this.def.room.wall);
      g.fillStyle = wallHex; g.fillRect(0, 0, W, H);
      g.fillStyle = shade(wallHex, 1.25); g.fillRect(0, 0, W, 4);   // duvar üst-kenar ışığı
      for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
        g.fillStyle = ((tx + ty) & 1) ? floorHex : shade(floorHex, 0.9);
        g.fillRect((tx + 1) * TILE, (ty + 1) * TILE, TILE, TILE);
      }
      // güney duvarda kapı ağzı (pad'in hemen altı) + pad işareti (zindan giriş pad'i dili)
      const pad = this.def.exitPad;
      g.fillStyle = '#1a1208';
      g.fillRect((pad.tx + 1) * TILE + 2, (h + 1) * TILE, TILE - 4, TILE - 4);
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.28;
      g.fillRect((pad.tx + 1) * TILE + 2, (pad.ty + 1) * TILE + 2, TILE - 4, TILE - 4);
      g.globalAlpha = 1;
      // mobilya: halı/bitki gibi zemin süsleri ÖNCE (mobilyalar üstüne oturur)
      const furn = [...this.def.furniture].sort((a, b) =>
        (a.kind === 'rug' ? 0 : 1) - (b.kind === 'rug' ? 0 : 1));
      for (const f of furn) {
        INTERIOR_FURN_SPEC[f.kind].draw(g, (f.tx + 1) * TILE, (f.ty + 1) * TILE);
      }
      this.textures.addCanvas(texKey, c);
    }
    this.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(-1000);
    this.cameras.main.setRoundPixels(true);
    // 🔴 Opak kamera bg (TdBattleScene:127 dersi): oda görünür alandan KÜÇÜK — şeffaf
    // bırakılırsa duraklamış dünya (minimap/stat paneli/hint) odanın etrafından sızar.
    this.cameras.main.setBackgroundColor('#0d1319');

    // ── hero spawn: pad'in 1 tile üstü (pad üstünde doğsaydı ≥1sn guard'ına rağmen
    // hareketsiz oyuncu anında geri atılırdı — zindanın giriş-idle tuzağının önlemi) ──
    const pad = this.def.exitPad;
    this.heroPos = { x: (pad.tx + 1) * TILE + 8, y: pad.ty * TILE + 8 };
    this.heroShadow = this.add.ellipse(this.heroPos.x, this.heroPos.y + 1, 14, 4, 0x000000, 0.28);
    this.hero = this.add.image(this.heroPos.x, this.heroPos.y, 'td-hero-0-0').setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H);
    // Oda çoğu ekranda görünür alandan küçük — bounds'suz follow odayı karanlık fonda
    // ortalar, dar mobil ekranda da kahramanı merkezde tutar (bounds+küçük-oda kombinasyonu
    // Phaser clamp'inde odayı köşeye yapıştırırdı).
    this.cameras.main.startFollow(this.hero, true, 1, 1);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    this.cursors = kb.createCursorKeys();
    kb.on('keydown-ESC', () => this.leave());
    kb.on('keydown-E', () => this.tryExit());

    // ── HUD: oda adı + çıkış ipucu (layoutHud konumlar; Faz 5.2 setResolution kuralı) ──
    this.titleText = this.add.text(0, 0, this.def.name, {
      fontSize: '11px', fontFamily: TD_FONT, color: '#ffe9c9', backgroundColor: '#141c24cc', padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1e9);
    this.hintText = this.add.text(0, 0, '[E] exit · [ESC] leave', {
      fontSize: '10px', fontFamily: TD_FONT, color: '#ffffff', backgroundColor: '#141c24cc', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1e9);

    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    // sahne stop edilir — global scale emitter'dan çıkmak ŞART (Dungeon sızıntı dersi)
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
    this.events.once('destroy', () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
  }

  /** Faz 5.2/5.5 ikizi: kullanıcı zoom tercihi ([-]/[+], world'de ayarlanır) veya default. */
  private applyZoom(): void {
    this.uiZoom = userTdZoom() ?? computeTdView(this.scale.width, this.scale.height).k;
    this.cameras.main.setZoom(this.uiZoom);
    this.layoutHud();
  }

  /** HUD yerleşimi — kamera zoom altında screen→logical dönüşümü (TdDungeonScene ikizi). */
  private layoutHud(): void {
    const k = this.uiZoom, sw = this.scale.width, sh = this.scale.height;
    const cx = sw / 2, cy = sh / 2;
    const x0 = cx - cx / k, y0 = cy - cy / k;
    const w = sw / k, h = sh / k;
    this.titleText.setPosition(x0 + w / 2, y0 + 8);
    this.hintText.setPosition(x0 + w / 2, y0 + h - 16);
    if (this.titleText.style.resolution !== k) this.titleText.setResolution(k);
    if (this.hintText.style.resolution !== k) this.hintText.setResolution(k);
  }

  /** Ayak-noktası çarpışması — interiorWalkable testle AYNI sözleşme (tek doğruluk kaynağı). */
  private canMove(nx: number, ny: number): boolean {
    for (const [ox, oy] of [[-4, 0], [4, 0], [-4, 3], [4, 3], [0, 3]] as const) {
      const tx = Math.floor((nx + ox) / TILE) - 1;   // -1: duvar halkası ofseti
      const ty = Math.floor((ny + oy) / TILE) - 1;
      if (!interiorWalkable(this.def, tx, ty)) return false;
    }
    return true;
  }

  /** E: pad üstünde/yakınında ise çık (girişten ≥1sn sonra — anında geri fırlama olmasın). */
  private tryExit(): void {
    if (this.timeIn < 1) return;
    const pad = this.def.exitPad;
    const px = (pad.tx + 1) * TILE + 8, py = (pad.ty + 1) * TILE + 8;
    if (Math.hypot(this.heroPos.x - px, this.heroPos.y - py) < 20) this.leave();
  }

  /** Çıkış: bu sahne durur, TdWorld devam eder (zindan/kapı akışıyla simetrik). */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.stop();
    this.scene.resume('TdWorld');
  }

  update(t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.timeIn += dt;
    const touch = this.registry.get('tdTouch') as { dx: number; dy: number; e: boolean; space: boolean } | undefined;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown || this.cursors.up.isDown) dy -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) dy += 1;
    if (this.keys.A.isDown || this.cursors.left.isDown) dx -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) dx += 1;
    if (touch) {
      if (dx === 0 && touch.dx) dx = touch.dx;
      if (dy === 0 && touch.dy) dy = touch.dy;
      if (touch.e && !this.touchEPrev) this.tryExit();   // mobil E — one-shot (kenar tetik)
      this.touchEPrev = !!touch.e;
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
    // bob görsel origin'e (pozisyona DEĞİL) — kamera follow hedefi sabit kalır (22 Tem dersi)
    this.hero.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y));
    this.hero.setDisplayOrigin(this.hero.displayOriginX, this.hero.height - 3 + bob);
    this.heroShadow.setPosition(Math.round(this.heroPos.x), Math.round(this.heroPos.y) + 1)
      .setDepth(depth(this.heroPos.x, this.heroPos.y) - 1);
    this.hero.setDepth(depth(this.heroPos.x, this.heroPos.y));

    // pad'e basınca çık (zindan giriş-pad deseni; spawn pad'in 1 tile üstünde → kaza yok)
    const pad = this.def.exitPad;
    const px = (pad.tx + 1) * TILE + 8, py = (pad.ty + 1) * TILE + 8;
    if (!this.leaving && this.timeIn > 1 && Math.hypot(this.heroPos.x - px, this.heroPos.y - py) < 10) this.leave();
  }
}

function cssHex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
