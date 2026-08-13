// frontend/lib/game/td/TdInteriorScene.ts
// ─── Faz 11.1: bina iç mekân sahnesi (TdDungeonScene şablonundan uyarlama) ───
// Kapı akışı zindanla birebir simetrik: TdWorldScene pause+launch → burada gezin →
// leave() = stop + resume('TdWorld'). Oda tek canvas'a pre-render edilir (mobilya dahil;
// oda küçük, chunk streaming gerekmez). Müziğe DOKUNULMAZ (dünya resume'da toparlar);
// save/achievements YAZILMAZ (11.1'de kalıcı state yok).
import * as Phaser from 'phaser';
import { TILE, computeTdView, userTdZoom, depth, TD_FONT } from './tdCore';
import { chibiHumanoid, CHIBI_H, REMOTE_PALETTE_VARIANTS } from './sprites/chibi';
import {
  INTERIORS, interiorWalkable, INN_SLEEP_COST, applySleep, innkeeperGreeting,
  type InteriorDef, type InteriorBook,
} from './interiors';
import { LORE_ENTRIES } from '../lore';
import { INTERIOR_FURN_SPEC } from './sprites/interiorProps';
import { isNight, DEFAULT_DAY_TIME } from './dayNight';
import { TdState } from './tdState';
import { PlayerState } from '../PlayerState';
import type { TdWorldScene } from './TdWorldScene';

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
  // ── Faz 11.2: iç-mekân NPC + diyalog paneli + uyku ──
  private npcPos: { x: number; y: number } | null = null;
  private npcName = '';
  private npcLabel: Phaser.GameObjects.Text | null = null;
  private panelC: Phaser.GameObjects.Container | null = null;
  private panelErr: Phaser.GameObjects.Text | null = null;
  private sleeping = false;
  private hintMode: 'exit' | 'talk' | 'read' = 'exit';
  // ── Faz 11.3: okunabilir lore kitapları (arşiv) ──
  private bookIcons: { book: InteriorBook; icon: Phaser.GameObjects.Image; x: number; y: number }[] = [];

  constructor() { super({ key: 'TdInterior' }); }

  /** Sahne örneği yeniden kullanılır (Dungeon dersi) — TÜM mutable alanlar burada sıfırlanır. */
  init(data: InteriorInitData): void {
    this.interiorId = data.interiorId;
    this.leaving = false;
    this.timeIn = 0;
    this.touchEPrev = false;
    this.heroDir = 0; this.heroFlip = false;
    this.walkIdx = 0; this.walkT = 0;
    this.npcPos = null; this.npcName = '';
    this.npcLabel = null; this.panelC = null; this.panelErr = null;
    this.sleeping = false;                      // 🔴 fade yarıda kalırsa bile kilit taşınmasın
    this.hintMode = 'exit';
    this.bookIcons = [];                        // sahne örneği yeniden kullanılır (Dungeon dersi)
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

    // ── Faz 11.2: iç-mekân NPC (dünya NPC listesine GİRMEZ — npcs.ts'e dokunulmaz).
    // Dünya emsalinin çizim dili: ayak-hizası origin + gölge + isim etiketi. Çarpışma
    // YOK (dekoratif duruş, counter arkasında) — hücresi interiorWalkable'da açık kalır.
    const npcDef = this.def.npc;
    if (npcDef) {
      const nKey = `td-int-npc-${npcDef.id}`;
      if (!this.textures.exists(nKey)) {
        const pal = REMOTE_PALETTE_VARIANTS[npcDef.palette % REMOTE_PALETTE_VARIANTS.length];
        this.textures.addCanvas(nKey, chibiHumanoid(0, 0, pal));
      }
      const nx = (npcDef.tx + 1) * TILE + 8, ny = (npcDef.ty + 1) * TILE + 8;  // +1: duvar halkası
      this.npcPos = { x: nx, y: ny };
      this.npcName = npcDef.name;
      this.add.ellipse(nx, ny + 1, 14, 4, 0x000000, 0.28).setDepth(depth(nx, ny) - 1);
      this.add.image(nx, ny, nKey).setOrigin(0.5, (CHIBI_H - 3) / CHIBI_H).setDepth(depth(nx, ny));
      this.npcLabel = this.add.text(nx, ny - CHIBI_H + 1, npcDef.name, {
        fontSize: '7px', fontFamily: TD_FONT, color: '#e9f4ff', backgroundColor: '#141c24cc', padding: { x: 3, y: 1 },
      }).setOrigin(0.5, 1).setDepth(depth(nx, ny) + 1);
    }

    // ── Faz 11.3: kitap ikonları — ODA VERİSİNDEN (def.books), mobilya hücresine
    // sabitlenmez: spot lectern/masa/raf ÜSTÜ bir hücredir (td-interior-test yürünebilir
    // komşuluğunu çapalar). Okunmuş kitap soluk + nabızsız (flags: lore_read_<key>).
    if (this.def.books?.length) {
      const bKey = 'td-int-book';
      if (!this.textures.exists(bKey)) this.textures.addCanvas(bKey, bookIconCanvas());
      const flags = PlayerState.get().flags;
      for (const book of this.def.books) {
        const bx = (book.spot.tx + 1) * TILE + 8, by = (book.spot.ty + 1) * TILE + 6;  // +1: duvar halkası
        const icon = this.add.image(bx, by, bKey).setDepth(depth(bx, by));
        if (flags.has(`lore_read_${book.loreKey}`)) icon.setAlpha(0.5);
        else this.tweens.add({ targets: icon, alpha: 0.6, duration: 700, yoyo: true, repeat: -1 });
        this.bookIcons.push({ book, icon, x: bx, y: by });
      }
    }

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as typeof this.keys;
    this.cursors = kb.createCursorKeys();
    // ESC: panel açıksa paneli kapat (dünya questPanel deseni), değilse sahneden çık.
    kb.on('keydown-ESC', () => {
      if (this.sleeping) return;
      if (this.panelC) { this.closePanel(); return; }
      this.leave();
    });
    kb.on('keydown-E', () => this.onE());

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
    if (this.npcLabel && this.npcLabel.style.resolution !== k) this.npcLabel.setResolution(k);
    this.panelC?.setPosition(x0 + w / 2, y0 + h / 2);   // panel ekran-merkezli kalır (resize dahil)
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

  /** E tuşu yönlendirici: pad = çıkış ÖNCELİĞİ (mevcut davranış), sonra NPC, sonra kitap. */
  private onE(): void {
    if (this.sleeping || this.panelC) return;    // panel açıkken ikinci E diyalog tetiklemez
    this.tryExit();
    if (this.leaving) return;
    if (this.npcPos && Math.hypot(this.heroPos.x - this.npcPos.x, this.heroPos.y - this.npcPos.y) <= 24) {
      this.openInnPanel();
      return;
    }
    const near = this.nearestBook();
    if (near) this.openBookPanel(near);
  }

  /** Menzildeki (≤24px) en yakın kitap — hint + E yönlendirmesi aynı ölçütü okur. */
  private nearestBook(): { book: InteriorBook; icon: Phaser.GameObjects.Image } | null {
    let best: { book: InteriorBook; icon: Phaser.GameObjects.Image } | null = null;
    let bestD = 24;
    for (const b of this.bookIcons) {
      const d = Math.hypot(this.heroPos.x - b.x, this.heroPos.y - b.y);
      if (d <= bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** Dünya sahnesinin tdState'i — enerji/saat TEK doğruluk kaynağı (TdDungeonScene emsali). */
  private worldTd(): TdState | null {
    return (this.scene.get('TdWorld') as TdWorldScene | null)?.tdState ?? null;
  }

  /**
   * Hancı diyaloğu — TdWorldScene.buildPanel görsel dilinin sahne-yerel kopyası
   * (gölge + gövde 0x121a23@0.97 + kenar 0x3a4e63 + üst parlama). Dünya panel koduna
   * DOKUNULMAZ (plan kısıtı). 🔴 Faz 7 dersi: container ÇOCUKLARINA da setScrollFactor(0).
   */
  private openInnPanel(): void {
    this.closePanel();
    const k = this.uiZoom, w = 168, h = 96, r = 8;   // r << h/2 (Faz 5.10 kıskacı)
    const g = this.add.graphics().setScrollFactor(0);
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, r);
    g.fillStyle(0x121a23, 0.97); g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(1, 0x3a4e63, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.05); g.fillRect(-w / 2 + 3, -h / 2 + 1, w - 6, 1);
    const T = (x: number, y: number, msg: string, color: string, size = 8, ox = 0, oy = 0) =>
      this.add.text(x, y, msg, { fontSize: `${size}px`, fontFamily: TD_FONT, color })
        .setOrigin(ox, oy).setResolution(k).setScrollFactor(0);
    const night = isNight(this.worldTd()?.dayTime ?? DEFAULT_DAY_TIME);
    const sleepBtn = this.btn(T(0, 6, `[ SLEEP — ${INN_SLEEP_COST}g ]`, '#ffd23f', 10, 0.5, 0.5), () => this.doSleep());
    this.panelErr = T(0, 27, 'Not enough coin.', '#ff7a6e', 8, 0.5, 0.5).setVisible(false);
    this.panelC = this.add.container(0, 0, [g,
      T(0, -h / 2 + 7, this.npcName, '#9fe8ff', 11, 0.5),
      this.btn(T(w / 2 - 14, -h / 2 + 6, '✕', '#8fa6bd', 11), () => this.closePanel()),
      T(0, -h / 2 + 24, innkeeperGreeting(night), '#e9f4ff', 8, 0.5)
        .setWordWrapWidth(w - 20).setAlign('center'),
      sleepBtn,
      T(0, 17, 'until morning · full HP & energy', '#8fa6bd', 7, 0.5, 0.5),
      this.panelErr,
      this.btn(T(0, h / 2 - 11, '[ LEAVE ]', '#8fa6bd', 9, 0.5, 0.5), () => this.closePanel()),
    ]).setScrollFactor(0).setDepth(1e9 + 3);
    this.layoutHud();                                  // konumla (ekran merkezi)
  }

  /** Tıklanabilir buton metni — TdWorldScene.panelBtn'in yerel ikizi. */
  private btn(t: Phaser.GameObjects.Text, onClick: () => void): Phaser.GameObjects.Text {
    return t.setInteractive({ useHandCursor: true })
      .on('pointerover', () => t.setAlpha(0.75))
      .on('pointerout', () => t.setAlpha(1))
      .on('pointerdown', onClick);
  }

  private closePanel(): void {
    this.panelC?.destroy();                            // Container.destroy çocukları da yok eder
    this.panelC = null;
    this.panelErr = null;
  }

  /** Word-wrap sonrası metin yüksekliği — TdWorldScene.textH'nin sahne-yerel ikizi
   * (ölçüm nesnesi aynı karede yok edilir; panel içeriğe göre boyutlanır, '…' kesme YOK). */
  private textH(msg: string, size: number, wrapW: number): number {
    const t = this.add.text(0, 0, msg, { fontSize: `${size}px`, fontFamily: TD_FONT, color: '#fff' })
      .setWordWrapWidth(wrapW);
    const h = t.height;
    t.destroy();
    return h;
  }

  /**
   * Faz 11.3: kitap paneli — openInnPanel'in görsel dili (gölge+gövde+kenar+parlama),
   * yükseklik lore metnine göre ölçülür (textH; uzun metinde panel BÜYÜR, metin kesilmez;
   * gövde fontu 8px — en uzun girdi bile varsayılan zoom viewport'una sığar).
   * Açmak = okumak: flags'e lore_read_<key> yazılır (markVisit deseni; live'da ps.save()).
   */
  private openBookPanel(near: { book: InteriorBook; icon: Phaser.GameObjects.Image }): void {
    const entry = LORE_ENTRIES.find(e => e.id === near.book.loreKey);
    if (!entry) return;                                // test kırık anahtarı zaten yakalar
    this.closePanel();
    // ── okundu işareti (bir kez): flag + ikon soluk + nabız durur ──
    const ps = PlayerState.get();
    const flag = `lore_read_${near.book.loreKey}`;
    if (!ps.flags.has(flag)) {
      ps.flags.add(flag);
      // 🔴 sandbox kuralı (Faz 3 Critical): canlı save YALNIZ live modda yazılır.
      if ((this.registry.get('tdMode') as string) === 'live') ps.save();
      this.tweens.killTweensOf(near.icon);
      near.icon.setAlpha(0.5);
    }
    // ── panel: genişlik sabit, yükseklik içerikten ──
    const k = this.uiZoom, w = 200, r = 8;             // r << h/2 (Faz 5.10 kıskacı)
    const wrapW = w - 24;
    const bodyH = this.textH(entry.text, 8, wrapW);
    const headH = 34;                                  // başlık + lore alt-başlığı
    const h = headH + bodyH + 26;                      // 26: alt boşluk + [ CLOSE ]
    const g = this.add.graphics().setScrollFactor(0);
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, r);
    g.fillStyle(0x121a23, 0.97); g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(1, 0x3a4e63, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.05); g.fillRect(-w / 2 + 3, -h / 2 + 1, w - 6, 1);
    const T = (x: number, y: number, msg: string, color: string, size = 8, ox = 0, oy = 0) =>
      this.add.text(x, y, msg, { fontSize: `${size}px`, fontFamily: TD_FONT, color })
        .setOrigin(ox, oy).setResolution(k).setScrollFactor(0);
    this.panelC = this.add.container(0, 0, [g,
      T(0, -h / 2 + 7, near.book.title, '#ffd23f', 10, 0.5),
      this.btn(T(w / 2 - 14, -h / 2 + 6, '✕', '#8fa6bd', 11), () => this.closePanel()),
      T(0, -h / 2 + 21, `— ${entry.title} —`, '#8fa6bd', 7, 0.5),
      T(-w / 2 + 12, -h / 2 + headH, entry.text, '#e9f4ff', 8)
        .setWordWrapWidth(wrapW),                      // lineSpacing YOK — textH ölçümüyle birebir
      this.btn(T(0, h / 2 - 11, '[ CLOSE ]', '#8fa6bd', 9, 0.5, 0.5), () => this.closePanel()),
    ]).setScrollFactor(0).setDepth(1e9 + 3);
    this.layoutHud();                                  // konumla (ekran merkezi)
  }

  /**
   * Uyku: applySleep SAF fonksiyonu karar verir (test aynı fonksiyonu çapalar).
   * Yetersiz altın → panel içi kızıl satır, HİÇBİR state yazılmaz. Yeterliyse
   * siyah fade (~600ms) → tam karanlıkta state BİR KEZ yazılır → "☀ morning" → fade-out.
   */
  private doSleep(): void {
    if (this.sleeping) return;                         // 🔴 kısa devre: fade sırasında ikinci tık
    const ps = PlayerState.get();
    const st = this.worldTd();
    const next = applySleep(
      { gold: ps.gold, hp: ps.hp, maxHp: ps.maxHp, energy: st?.energy ?? TdState.ENERGY_MAX, dayTime: st?.dayTime ?? DEFAULT_DAY_TIME },
      TdState.ENERGY_MAX,
    );
    if (!next) { this.panelErr?.setVisible(true); return; }
    this.closePanel();
    this.sleeping = true;                              // hareket + E/ESC + pad-çıkışı kilitli
    const k = this.uiZoom, sw = this.scale.width, sh = this.scale.height;
    const x0 = sw / 2 - (sw / 2) / k, y0 = sh / 2 - (sh / 2) / k;
    const vw = sw / k, vh = sh / k;
    const fade = this.add.rectangle(x0 + vw / 2, y0 + vh / 2, vw + 16, vh + 16, 0x000000)
      .setScrollFactor(0).setDepth(1e9 + 8).setAlpha(0);
    const sun = this.add.text(x0 + vw / 2, y0 + vh / 2, '☀ morning', {
      fontSize: '12px', fontFamily: TD_FONT, color: '#ffe9c9',
    }).setOrigin(0.5).setResolution(k).setScrollFactor(0).setDepth(1e9 + 9).setAlpha(0);
    this.tweens.add({
      targets: fade, alpha: 1, duration: 600,
      onComplete: () => {
        // ── state, tam karanlıkta BİR kez ──
        ps.gold = next.gold;
        ps.hp = next.hp;
        if (st) { st.energy = next.energy; st.dayTime = next.dayTime; st.save(); }
        // 🔴 sandbox kuralı (Faz 3 Critical): canlı save YALNIZ live modda yazılır.
        if ((this.registry.get('tdMode') as string) === 'live') ps.save();
        this.tweens.add({ targets: sun, alpha: 1, duration: 250 });
        this.time.delayedCall(650, () => {
          this.tweens.add({
            targets: [fade, sun], alpha: 0, duration: 300,
            onComplete: () => { fade.destroy(); sun.destroy(); this.sleeping = false; },
          });
        });
      },
    });
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
    // Faz 11.2: panel açıkken/uyurken hareket kilitli (visible guard) — E yönlendirmesi
    // onE()'nin kendi guard'ında (kenar tetiği burada canlı kalır, stale edge kalmaz).
    const uiLock = this.sleeping || !!this.panelC;
    let dx = 0, dy = 0;
    if (!uiLock) {
      if (this.keys.W.isDown || this.cursors.up.isDown) dy -= 1;
      if (this.keys.S.isDown || this.cursors.down.isDown) dy += 1;
      if (this.keys.A.isDown || this.cursors.left.isDown) dx -= 1;
      if (this.keys.D.isDown || this.cursors.right.isDown) dx += 1;
    }
    if (touch) {
      if (!uiLock && dx === 0 && touch.dx) dx = touch.dx;
      if (!uiLock && dy === 0 && touch.dy) dy = touch.dy;
      if (touch.e && !this.touchEPrev) this.onE();   // mobil E — one-shot (kenar tetik)
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

    // Faz 11.2/11.3: yakın NPC → '[E] talk', yakın kitap → '[E] read'; uzakta eski metin.
    // (NPC yalnız handa, kitaplar yalnız arşivde — öncelik çatışması pratikte yok.)
    const nearNpc = !uiLock && !!this.npcPos &&
      Math.hypot(this.heroPos.x - this.npcPos.x, this.heroPos.y - this.npcPos.y) <= 24;
    const nearBook = !uiLock && !nearNpc && this.nearestBook();
    const mode: 'exit' | 'talk' | 'read' = nearNpc ? 'talk' : nearBook ? 'read' : 'exit';
    if (mode !== this.hintMode) {
      this.hintMode = mode;
      this.hintText.setText(
        mode === 'talk' ? `[E] talk to ${this.npcName}`
        : mode === 'read' ? '[E] read'
        : '[E] exit · [ESC] leave');
    }

    // pad'e basınca çık (zindan giriş-pad deseni; spawn pad'in 1 tile üstünde → kaza yok)
    const pad = this.def.exitPad;
    const px = (pad.tx + 1) * TILE + 8, py = (pad.ty + 1) * TILE + 8;
    if (!this.leaving && !uiLock && this.timeIn > 1 && Math.hypot(this.heroPos.x - px, this.heroPos.y - py) < 10) this.leave();
  }
}

/** Faz 11.3: küçük açık-kitap ikonu (10×8) — parşömen yapraklar + sırt + altın parıltı. */
function bookIconCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a2a18'; g.fillRect(0, 5, 10, 3);        // koyu cilt kapağı
  g.fillStyle = '#f0e6c8'; g.fillRect(0, 1, 4, 5);          // sol yaprak
  g.fillRect(6, 1, 4, 5);                                   // sağ yaprak
  g.fillStyle = '#d8cba6'; g.fillRect(4, 2, 2, 5);          // sırt gölgesi
  g.fillStyle = '#b9a97f';                                  // satır çizgileri
  g.fillRect(1, 2, 2, 1); g.fillRect(7, 2, 2, 1);
  g.fillRect(1, 4, 2, 1); g.fillRect(7, 4, 2, 1);
  g.fillStyle = '#ffd23f'; g.globalAlpha = 0.9;             // parıltı noktası
  g.fillRect(4, 0, 2, 1);
  g.globalAlpha = 1;
  return c;
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
