import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, tileIndex } from '../config';
import { PlayerState } from '../PlayerState';
import { CLASS_MP } from '../skills';
import { CLASS_ELEMENTS, ELEMENT_ICONS } from '../elements';

// ─── Character creation options ───
const CLASSES = [
  { id: 'knight', label: 'Knight', color: 0x4488cc, desc: 'Strong defense, shield bearer', stats: { hp: 140, atk: 13, def: 14, spd: 8, mp: 30 } },
  { id: 'mage', label: 'Mage', color: 0x9944cc, desc: 'Powerful magic, high damage', stats: { hp: 90, atk: 18, def: 6, spd: 12, mp: 50 } },
  { id: 'archer', label: 'Archer', color: 0x44aa44, desc: 'Fast and deadly, ranged attacks', stats: { hp: 110, atk: 14, def: 8, spd: 16, mp: 40 } },
];

const SKIN_COLORS = [0xffddbb, 0xf5c49c, 0xd4a574, 0xa67c52, 0x6b4226, 0xffe0bd];
const HAIR_COLORS = [0x443322, 0x221100, 0xaa6633, 0xddbb66, 0xcc3322, 0xccccdd, 0x222244, 0x44aa66];

function darken(c: number, f: number): number {
  const r = Math.max(0, Math.floor(((c >> 16) & 0xff) * f));
  const g = Math.max(0, Math.floor(((c >> 8) & 0xff) * f));
  const b = Math.max(0, Math.floor((c & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

export class CharacterSelectScene extends Phaser.Scene {
  private selectedClass = 0;
  private selectedSkin = 0;
  private selectedHair = 0;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private animFrame = 0;
  private animTimer!: Phaser.Time.TimerEvent;
  private statsTexts: Phaser.GameObjects.Text[] = [];
  private descText!: Phaser.GameObjects.Text;
  private classCards: Phaser.GameObjects.Rectangle[] = [];

  constructor() { super({ key: 'CharacterSelect' }); }

  create() {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    this.cameras.main.setBackgroundColor('#0a0e1a');

    // Fullscreen
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-F', () => {
        this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen();
      });
    }

    // ── Check for saved game → show Continue screen first ──
    const state = PlayerState.get();
    if (state.hasSave()) {
      this.showContinueScreen(W, H, state);
      return;
    }

    // ── NFT holder without save → auto-create character from NFT data ──
    const walletInfo = (window as any).__frostbiteWallet;
    const heroNft = (window as any).__frostbiteHero;
    if (walletInfo?.authenticated && heroNft) {
      this.autoCreateFromNFT(state, heroNft);
      return;
    }

    this.showCreateScreen(W, H);
  }

  private showContinueScreen(W: number, H: number, state: PlayerState): void {
    // Background
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, 0x00e5ff, 0.03);
    for (let x = 0; x < W; x += 40) { gridGfx.lineBetween(x, 0, x, H); }
    for (let y = 0; y < H; y += 40) { gridGfx.lineBetween(0, y, W, y); }

    // Load save data to show info
    state.load();

    // Sync NFT hero stats into save if wallet connected
    const walletInfo = (window as any).__frostbiteWallet;
    const heroNft = (window as any).__frostbiteHero;
    if (walletInfo?.authenticated && heroNft) {
      state.nftTokenId = heroNft.tokenId;
      state.nftElement = heroNft.element;
      state.nftRarity = heroNft.rarity;
      state.useNftSprite = true;
      state.atk = heroNft.atk;
      state.def = heroNft.def;
      state.spd = heroNft.spd;
      state.level = heroNft.level || 1;
      state.xp = heroNft.xp || 0;
      const rarityBonus = [0, 2, 5, 10, 20][heroNft.rarity] || 0;
      // Compute maxHp absolutely (base 120 + 15/level + rarity) — the old
      // `maxHp += bonus` re-applied the bonus on every load, inflating saves
      // forever. Absolute form also repairs already-inflated saves.
      state.maxHp = 120 + (state.level - 1) * 15 + rarityBonus * 5;
      state.hp = Math.min(state.hp, state.maxHp);
      state.save();
    }

    this.add.text(W / 2, H * 0.2, 'FROSTBITE WORLD', {
      fontSize: '32px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // NFT badge if connected
    if (walletInfo?.authenticated && heroNft) {
      const elementNames = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
      const rarityNames = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
      const rarityColors = ['#aaaaaa', '#44bb44', '#4488ff', '#aa44ff', '#ffaa00'];
      this.add.text(W / 2, H * 0.26, `NFT Hero #${heroNft.tokenId}  ·  ${rarityNames[heroNft.rarity]}  ·  ${elementNames[heroNft.element]}`, {
        fontSize: '12px', color: rarityColors[heroNft.rarity] || '#aaaaaa', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    // Save info panel
    const panelG = this.add.graphics();
    panelG.fillStyle(0x141a28, 0.9);
    panelG.fillRoundedRect(W / 2 - 200, H * 0.32, 400, 140, 12);
    panelG.lineStyle(1, 0x2a3348, 1);
    panelG.strokeRoundedRect(W / 2 - 200, H * 0.32, 400, 140, 12);

    this.add.text(W / 2, H * 0.35, `${state.name}  —  ${state.playerClass.charAt(0).toUpperCase() + state.playerClass.slice(1)}`, {
      fontSize: '18px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.40, `Level ${state.level}  |  HP ${state.hp}/${state.maxHp}  |  Gold ${state.gold}`, {
      fontSize: '14px', color: '#8899aa', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.44, `ATK ${state.atk}  DEF ${state.def}  SPD ${state.spd}`, {
      fontSize: '13px', color: '#667788', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.48, `Zone: ${state.lastZone}  |  Quests: ${state.quests.filter(q => !q.turnedIn).length} active`, {
      fontSize: '12px', color: '#556677', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // Continue button
    const contBtn = this.add.rectangle(W / 2, H * 0.6, 300, 50, 0x0077aa, 1)
      .setStrokeStyle(1.5, 0x0099cc).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H * 0.6, 'CONTINUE', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    contBtn.on('pointerdown', () => {
      this.scene.start('IsoWorld');
    });
    contBtn.on('pointerover', () => contBtn.setFillStyle(0x0099cc));
    contBtn.on('pointerout', () => contBtn.setFillStyle(0x0077aa));

    // New Game button
    const newBtn = this.add.rectangle(W / 2, H * 0.7, 300, 42, 0x333344, 1)
      .setStrokeStyle(1, 0x444455).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H * 0.7, 'NEW GAME', {
      fontSize: '14px', color: '#8899aa', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    newBtn.on('pointerdown', () => {
      state.deleteSave();
      // Reset state
      PlayerState['instance'] = new PlayerState();
      // Clear screen and show create
      this.scene.restart();
    });
    newBtn.on('pointerover', () => newBtn.setFillStyle(0x444455));
    newBtn.on('pointerout', () => newBtn.setFillStyle(0x333344));
  }

  private showCreateScreen(W: number, H: number): void {
    // ── Background grid ──
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, 0x00e5ff, 0.03);
    for (let x = 0; x < W; x += 40) { gridGfx.lineBetween(x, 0, x, H); }
    for (let y = 0; y < H; y += 40) { gridGfx.lineBetween(0, y, W, y); }

    // ── Title ──
    this.add.text(W / 2, 36, 'CREATE YOUR HERO', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.add.text(W / 2, 64, 'Choose your class, appearance, and enter the world', {
      fontSize: '13px', color: '#556677', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // ── Left panel: Character preview (large pixel character) ──
    const previewX = W * 0.28;
    const previewY = H * 0.48;

    // Preview background circle
    const prevBg = this.add.graphics();
    prevBg.fillStyle(0x141a28, 1);
    prevBg.fillCircle(previewX, previewY, 100);
    prevBg.lineStyle(2, 0x2a3348, 1);
    prevBg.strokeCircle(previewX, previewY, 100);

    // Floor shadow
    prevBg.fillStyle(0x000000, 0.2);
    prevBg.fillEllipse(previewX, previewY + 75, 120, 24);

    this.previewGfx = this.add.graphics();

    // Animated preview
    this.animTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        this.animFrame = (this.animFrame + 1) % 4;
        this.drawPreview(previewX, previewY);
      },
    });
    this.drawPreview(previewX, previewY);

    // Preview label
    this.add.text(previewX, previewY + 110, 'PREVIEW', {
      fontSize: '11px', color: '#445566', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // ── Right panel: Options ──
    const rightX = W * 0.62;

    // --- CLASS SELECTION ---
    this.add.text(rightX, 100, 'CLASS', {
      fontSize: '14px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    });

    CLASSES.forEach((cls, i) => {
      const cy = 135 + i * 62;
      const card = this.add.rectangle(rightX + 170, cy, 340, 54, 0x1a2030, 1).setStrokeStyle(1, 0x2a3348)
        .setInteractive({ useHandCursor: true });
      this.classCards.push(card);

      // Class color dot
      this.add.circle(rightX + 24, cy, 8, cls.color);

      // Class name
      this.add.text(rightX + 44, cy - 12, cls.label, {
        fontSize: '16px', color: '#e0e4ee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      });

      // Class desc
      this.add.text(rightX + 44, cy + 8, cls.desc, {
        fontSize: '11px', color: '#667788', fontFamily: 'Arial, sans-serif',
      });

      // Stats mini
      const s = cls.stats;
      const elem = CLASS_ELEMENTS[cls.id] || 'earth';
      const elemIcon = ELEMENT_ICONS[elem];
      this.add.text(rightX + 280, cy, `${elemIcon} HP${s.hp} A${s.atk} D${s.def} S${s.spd} MP${s.mp}`, {
        fontSize: '9px', color: '#556677', fontFamily: 'Arial, sans-serif',
      }).setOrigin(1, 0.5);

      card.on('pointerdown', () => {
        this.selectedClass = i;
        this.updateClassHighlight();
        this.drawPreview(previewX, previewY);
      });
      card.on('pointerover', () => { if (i !== this.selectedClass) card.setFillStyle(0x222840); });
      card.on('pointerout', () => { if (i !== this.selectedClass) card.setFillStyle(0x1a2030); });
    });

    // --- SKIN COLOR ---
    this.add.text(rightX, 330, 'SKIN', {
      fontSize: '14px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    });

    SKIN_COLORS.forEach((color, i) => {
      const sx = rightX + 10 + i * 44;
      const circle = this.add.circle(sx + 14, 362, 16, color).setStrokeStyle(2, 0x2a3348)
        .setInteractive({ useHandCursor: true });
      circle.on('pointerdown', () => {
        this.selectedSkin = i;
        this.drawPreview(previewX, previewY);
        // Highlight
        this.children.each((child: any) => {
          if (child.type === 'Arc' && child.y === 362 && child.radius === 16) {
            child.setStrokeStyle(2, 0x2a3348);
          }
        });
        circle.setStrokeStyle(2, 0x00ccff);
      });
      if (i === 0) circle.setStrokeStyle(2, 0x00ccff);
    });

    // --- HAIR COLOR ---
    this.add.text(rightX, 398, 'HAIR', {
      fontSize: '14px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    });

    HAIR_COLORS.forEach((color, i) => {
      const hx = rightX + 10 + (i % 8) * 44;
      const hy = 430;
      const circle = this.add.circle(hx + 14, hy, 16, color).setStrokeStyle(2, 0x2a3348)
        .setInteractive({ useHandCursor: true });
      circle.on('pointerdown', () => {
        this.selectedHair = i;
        this.drawPreview(previewX, previewY);
        this.children.each((child: any) => {
          if (child.type === 'Arc' && child.y === hy && child.radius === 16) {
            child.setStrokeStyle(2, 0x2a3348);
          }
        });
        circle.setStrokeStyle(2, 0x00ccff);
      });
      if (i === 0) circle.setStrokeStyle(2, 0x00ccff);
    });

    // --- STATS DISPLAY ---
    this.add.text(rightX, 470, 'STATS', {
      fontSize: '14px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    });

    const statLabels = ['HP', 'ATK', 'DEF', 'SPD'];
    const statColors = ['#44dd66', '#ff6644', '#4488dd', '#ddaa22'];
    statLabels.forEach((label, i) => {
      this.add.text(rightX + i * 85, 495, label, {
        fontSize: '11px', color: statColors[i], fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      });
      const val = this.add.text(rightX + i * 85, 512, '', {
        fontSize: '20px', color: '#e0e4ee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      });
      this.statsTexts.push(val);
    });

    // Description
    this.descText = this.add.text(rightX, 545, '', {
      fontSize: '12px', color: '#667788', fontFamily: 'Arial, sans-serif',
    });

    this.updateClassHighlight();

    // ── Bottom buttons ──
    // Enter World (primary)
    const enterBtn = this.add.rectangle(W / 2, H - 55, 300, 48, 0x0077aa, 1)
      .setStrokeStyle(1.5, 0x0099cc).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H - 55, 'ENTER THE WORLD', {
      fontSize: '17px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    enterBtn.on('pointerdown', () => this.startGame());
    enterBtn.on('pointerover', () => enterBtn.setFillStyle(0x0099cc));
    enterBtn.on('pointerout', () => enterBtn.setFillStyle(0x0077aa));

    // Wallet connect hint
    const walletInfo = (window as any).__frostbiteWallet;
    if (walletInfo?.authenticated) {
      this.add.text(W / 2, H - 26, `Wallet: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`, {
        fontSize: '11px', color: '#44dd66', fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);
    }
  }

  private updateClassHighlight(): void {
    this.classCards.forEach((card, i) => {
      if (i === this.selectedClass) {
        card.setFillStyle(0x222844);
        card.setStrokeStyle(1.5, CLASSES[i].color);
      } else {
        card.setFillStyle(0x1a2030);
        card.setStrokeStyle(1, 0x2a3348);
      }
    });

    const cls = CLASSES[this.selectedClass];
    const s = cls.stats;
    [s.hp, s.atk, s.def, s.spd].forEach((v, i) => {
      if (this.statsTexts[i]) this.statsTexts[i].setText(`${v}`);
    });
    this.descText.setText(cls.desc);
  }

  // ── Draw large pixel character preview ──
  private drawPreview(cx: number, cy: number): void {
    const gfx = this.previewGfx;
    gfx.clear();

    const cls = CLASSES[this.selectedClass];
    const bodyColor = cls.color;
    const skinColor = SKIN_COLORS[this.selectedSkin];
    const hairColor = HAIR_COLORS[this.selectedHair];
    const S = 3.5; // pixel scale (each "pixel" = 3.5 real pixels)

    const f = this.animFrame % 4;
    const legL = [0, -3, 0, 3][f] * S;
    const legR = [0, 3, 0, -3][f] * S;
    const armF = [0, -2, 0, 2][f] * S;
    const armB = [0, 2, 0, -2][f] * S;
    const bob = [0, -1, 0, -1][f] * S;

    const legC = darken(bodyColor, 0.65);
    const bootC = darken(bodyColor, 0.45);
    const beltC = darken(bodyColor, 0.5);

    const px = (x: number, y: number, w: number, h: number, color: number) => {
      gfx.fillStyle(color, 1);
      gfx.fillRect(cx + x * S, cy + y * S + bob, w * S, h * S);
    };

    const pc = (x: number, y: number, r: number, color: number) => {
      gfx.fillStyle(color, 1);
      gfx.fillCircle(cx + x * S, cy + y * S + bob, r * S);
    };

    // ─ Shadow ─
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(cx, cy + 24 * S, 20 * S, 6 * S);

    // ─ Back arm ─
    px(-7, -10 + armB / S, 3, 8, darken(bodyColor, 0.8));
    pc(-6, -2 + armB / S, 1.8, skinColor); // hand

    // ─ Left leg ─
    gfx.fillStyle(legC, 1);
    gfx.fillRect(cx - 3 * S, cy - 1 * S + legL + bob, 3 * S, 7 * S);
    gfx.fillStyle(bootC, 1);
    gfx.fillRect(cx - 3.5 * S, cy + 5.5 * S + legL + bob, 4 * S, 2.5 * S);

    // ─ Right leg ─
    gfx.fillStyle(legC, 1);
    gfx.fillRect(cx + 0 * S, cy - 1 * S + legR + bob, 3 * S, 7 * S);
    gfx.fillStyle(bootC, 1);
    gfx.fillRect(cx - 0.5 * S, cy + 5.5 * S + legR + bob, 4 * S, 2.5 * S);

    // ─ Body ─
    gfx.fillStyle(bodyColor, 1);
    gfx.fillRoundedRect(cx - 5 * S, cy - 14 * S + bob, 10 * S, 13 * S, 2 * S);

    // Body highlight
    gfx.fillStyle(0xffffff, 0.1);
    gfx.fillRoundedRect(cx - 4 * S, cy - 12 * S + bob, 4 * S, 8 * S, S);

    // ─ Belt ─
    px(-5, -2, 10, 1.5, beltC);
    px(-1, -2, 2, 1.5, 0xccaa44); // buckle

    // ─ Armor detail ─
    if (cls.id === 'knight') {
      // Chest plate lines
      gfx.lineStyle(S * 0.8, 0xffffff, 0.15);
      for (let i = 0; i < 3; i++) {
        const ly = cy + (-11 + i * 3) * S + bob;
        gfx.beginPath(); gfx.moveTo(cx - 4 * S, ly); gfx.lineTo(cx + 4 * S, ly); gfx.strokePath();
      }
    } else if (cls.id === 'mage') {
      // Robe sash
      gfx.fillStyle(darken(bodyColor, 0.6), 0.7);
      gfx.fillRect(cx - 1 * S, cy - 12 * S + bob, 2 * S, 11 * S);
    }

    // ─ Front arm ─
    px(4, -10 + armF / S, 3, 8, darken(bodyColor, 0.85));
    pc(5, -2 + armF / S, 1.8, skinColor); // hand

    // ─ Weapon in hand ─
    if (cls.id === 'knight') {
      // Sword
      gfx.fillStyle(0xbbccdd, 1);
      gfx.fillRect(cx + 5 * S, cy - 6 * S + armF + bob, 1.2 * S, -8 * S);
      gfx.fillStyle(0x886644, 1);
      gfx.fillRect(cx + 3.5 * S, cy - 5.5 * S + armF + bob, 4 * S, 1.2 * S);
    } else if (cls.id === 'mage') {
      // Staff
      gfx.fillStyle(0x886644, 1);
      gfx.fillRect(cx + 5.2 * S, cy - 18 * S + armF + bob, 1 * S, 16 * S);
      // Orb on top
      pc(5.7, -18 + armF / S, 1.8, 0x8844ff);
      gfx.fillStyle(0xbb88ff, 0.4);
      gfx.fillCircle(cx + 5.7 * S, cy - 18 * S + armF + bob, 3 * S);
    } else if (cls.id === 'archer') {
      // Bow
      gfx.lineStyle(1.5 * S, 0x886644, 1);
      gfx.beginPath();
      gfx.arc(cx + 8 * S, cy - 8 * S + armF + bob, 6 * S, -1.2, 1.2, false);
      gfx.strokePath();
      // Bowstring
      gfx.lineStyle(0.5 * S, 0xccccaa, 0.8);
      gfx.beginPath();
      const bTop = cy - 8 * S + armF + bob - 6 * S * Math.sin(1.2);
      const bBot = cy - 8 * S + armF + bob + 6 * S * Math.sin(1.2);
      gfx.moveTo(cx + 8 * S + 6 * S * Math.cos(1.2), bTop);
      gfx.lineTo(cx + 6 * S, cy - 8 * S + armF + bob);
      gfx.lineTo(cx + 8 * S + 6 * S * Math.cos(1.2), bBot);
      gfx.strokePath();
    }

    // ─ Head ─
    pc(0, -18, 5, skinColor);

    // ─ Hair ─
    gfx.fillStyle(hairColor, 1);
    gfx.beginPath();
    gfx.arc(cx, cy - 19.5 * S + bob, 5 * S, Math.PI, 0, false);
    gfx.closePath();
    gfx.fillPath();

    // ─ Eyes ─
    gfx.fillStyle(0xffffff, 1);
    pc(-2, -18.5, 1.3, 0xffffff);
    pc(2, -18.5, 1.3, 0xffffff);
    gfx.fillStyle(0x222222, 1);
    pc(-2, -18.5, 0.7, 0x222222);
    pc(2, -18.5, 0.7, 0x222222);

    // ─ Mouth ─
    gfx.lineStyle(0.6 * S, darken(skinColor, 0.7), 1);
    gfx.beginPath();
    gfx.arc(cx, cy - 16 * S + bob, 1.2 * S, 0.3, Math.PI - 0.3, false);
    gfx.strokePath();

    // ─ Headgear ─
    if (cls.id === 'knight') {
      gfx.fillStyle(0x88aacc, 1);
      gfx.fillRoundedRect(cx - 4 * S, cy - 24 * S + bob, 8 * S, 3 * S, S);
      gfx.fillStyle(0x6699bb, 1);
      gfx.fillRoundedRect(cx - 3 * S, cy - 26 * S + bob, 6 * S, 2.5 * S, S);
    } else if (cls.id === 'mage') {
      gfx.fillStyle(bodyColor, 1);
      gfx.fillTriangle(
        cx, cy - 32 * S + bob,
        cx - 5 * S, cy - 21 * S + bob,
        cx + 5 * S, cy - 21 * S + bob,
      );
      gfx.fillStyle(darken(bodyColor, 0.7), 1);
      gfx.fillEllipse(cx, cy - 21 * S + bob, 12 * S, 3.5 * S);
      gfx.fillStyle(0xffdd44, 0.9);
      gfx.fillCircle(cx, cy - 31.5 * S + bob, 1.5 * S);
    } else if (cls.id === 'archer') {
      gfx.fillStyle(darken(bodyColor, 0.7), 1);
      gfx.beginPath();
      gfx.arc(cx, cy - 20 * S + bob, 6 * S, Math.PI + 0.2, -0.2, false);
      gfx.closePath();
      gfx.fillPath();
    }
  }

  // ── Auto-create character from NFT (skip character creation) ──
  private autoCreateFromNFT(state: PlayerState, heroNft: any): void {
    // Map NFT element to a class: Fire/Thunder/Shadow → Mage, Earth/Ice → Knight, rest → Archer
    const elementToClass: Record<number, number> = { 0: 1, 1: 2, 2: 2, 3: 0, 4: 0, 5: 1, 6: 1, 7: 2 };
    const classIdx = elementToClass[heroNft.element] ?? 1;
    const cls = CLASSES[classIdx];

    state.playerClass = cls.id as any;
    state.name = cls.label;
    state.maxHp = cls.stats.hp;
    state.hp = cls.stats.hp;
    state.gold = 50;
    state.level = heroNft.level || 1;
    state.xp = heroNft.xp || 0;
    state.xpToNext = 100;
    state.nftTokenId = heroNft.tokenId;
    state.nftElement = heroNft.element;
    state.nftRarity = heroNft.rarity;
    state.useNftSprite = true;
    state.atk = heroNft.atk;
    state.def = heroNft.def;
    state.spd = heroNft.spd;
    state.baseAtk = cls.stats.atk;
    state.baseDef = cls.stats.def;
    state.baseSpd = cls.stats.spd;
    state.mp = cls.stats.mp;
    state.maxMp = cls.stats.mp;

    // Rarity HP bonus
    const rarityBonus = [0, 2, 5, 10, 20][heroNft.rarity] || 0;
    state.maxHp += rarityBonus * 5;
    state.hp = state.maxHp;

    // Default appearance
    state.skinColor = SKIN_COLORS[0];
    state.hairColor = HAIR_COLORS[0];

    state.save();
    this.scene.start('IsoWorld');
  }

  // ── Start the game ──
  private startGame(): void {
    const state = PlayerState.get();
    const cls = CLASSES[this.selectedClass];

    state.playerClass = cls.id as any;
    state.name = cls.label;
    state.maxHp = cls.stats.hp;
    state.hp = cls.stats.hp;
    state.atk = cls.stats.atk;
    state.def = cls.stats.def;
    state.spd = cls.stats.spd;
    state.gold = 50;
    state.level = 1;
    state.xp = 0;
    state.xpToNext = 100;

    // Store appearance choices
    state.skinColor = SKIN_COLORS[this.selectedSkin];
    state.hairColor = HAIR_COLORS[this.selectedHair];

    // Check if wallet connected (Privy) + load NFT hero stats
    const walletInfo = (window as any).__frostbiteWallet;
    const heroNft = (window as any).__frostbiteHero;
    if (walletInfo?.authenticated && heroNft) {
      state.nftTokenId = heroNft.tokenId;
      state.nftElement = heroNft.element;
      state.nftRarity = heroNft.rarity;
      state.useNftSprite = true;
      state.atk = heroNft.atk;
      state.def = heroNft.def;
      state.spd = heroNft.spd;
      state.level = heroNft.level || 1;
      state.xp = heroNft.xp || 0;
      const rarityBonus = [0, 2, 5, 10, 20][heroNft.rarity] || 0;
      state.maxHp += rarityBonus * 5;
      state.hp = state.maxHp;
    }

    state.baseAtk = cls.stats.atk;
    state.baseDef = cls.stats.def;
    state.baseSpd = cls.stats.spd;
    state.mp = cls.stats.mp;
    state.maxMp = cls.stats.mp;
    state.save(); // save new character

    this.animTimer?.destroy();
    this.scene.start('IsoWorld');
  }
}
