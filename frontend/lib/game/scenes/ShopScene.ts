import * as Phaser from 'phaser';
import { SCALE, tileIndex } from '../config';
import { PlayerState, InventoryItem } from '../PlayerState';
import { getObjectTint } from '../tints';
import { generateItemTraits, drawItem } from '../nft/itemGenerator';
import { SELL_PRICES } from '../lootTables';
import type { ItemCategory } from '../nft/itemGenerator';

const POTION_SHOP_CONTRACT = '0xFe8c04Fb8E06FfDB892fFc17427AA786aAB11B28';
const POTION_SHOP_ABI = [
  { inputs: [{ name: 'potionId', type: 'uint8' }, { name: 'quantity', type: 'uint256' }], name: 'buyPotion', outputs: [], stateMutability: 'payable', type: 'function' },
];

interface ShopItem {
  id: string;
  name: string;
  tile: number;
  type: 'weapon' | 'armor' | 'accessory' | 'ring' | 'potion' | 'key';
  price: number;        // gold price (0 for AVAX-only items)
  sellPrice: number;
  stat?: { atk?: number; def?: number; hp?: number; mp?: number; spd?: number };
  description: string;
  stackable: boolean;
  sprite: string;
  rarity: number;
  avaxPrice?: string;   // AVAX price (e.g., '0.001')
  potionId?: number;    // on-chain potion ID for contract call
}

const RARITY_COLORS = [0x667788, 0x44aa55, 0x4488dd];
const RARITY_NAMES = ['Common', 'Uncommon', 'Rare'];

// All items priced in AVAX — sorted by category, then rarity
const SHOP_ITEMS: ShopItem[] = [
  // ── Potions (on-chain PotionShop contract) ──
  { id: 'potion_hp',       name: 'Health Potion',    tile: tileIndex(46, 1), type: 'potion',    price: 0, sellPrice: 10, stat: { hp: 40 },  description: 'Restores 40 HP',             stackable: true,  sprite: 'potion',    rarity: 0, avaxPrice: '0.001',  potionId: 0 },
  { id: 'potion_mp',       name: 'Mana Potion',      tile: tileIndex(46, 1), type: 'potion',    price: 0, sellPrice: 10, stat: { mp: 20 },  description: 'Restores 20 MP',             stackable: true,  sprite: 'potion',    rarity: 0, avaxPrice: '0.001',  potionId: 2 },
  { id: 'potion_hp_large', name: 'Greater Potion',   tile: tileIndex(46, 1), type: 'potion',    price: 0, sellPrice: 20, stat: { hp: 100 }, description: 'Restores 100 HP',            stackable: true,  sprite: 'potion',    rarity: 1, avaxPrice: '0.002',  potionId: 1 },
  { id: 'speed_tonic',     name: 'Speed Tonic',      tile: tileIndex(46, 1), type: 'potion',    price: 0, sellPrice: 15, stat: { spd: 3 },  description: 'Temporarily boosts SPD +3',   stackable: true,  sprite: 'potion',    rarity: 1, avaxPrice: '0.0015', potionId: 3 },
  // ── Weapons ──
  { id: 'iron_sword',      name: 'Iron Sword',       tile: tileIndex(46, 0), type: 'weapon',    price: 0, sellPrice: 25, stat: { atk: 5 },  description: 'A sturdy blade forged in iron',    stackable: false, sprite: 'sword',     rarity: 0, avaxPrice: '0.005' },
  { id: 'steel_sword',     name: 'Steel Sword',      tile: tileIndex(46, 0), type: 'weapon',    price: 0, sellPrice: 60, stat: { atk: 12 }, description: 'Tempered steel, sharp and deadly',  stackable: false, sprite: 'sword',     rarity: 1, avaxPrice: '0.012' },
  // ── Armor ──
  { id: 'iron_shield',     name: 'Iron Shield',      tile: tileIndex(47, 0), type: 'armor',     price: 0, sellPrice: 20, stat: { def: 4 },  description: 'Basic protection against attacks',  stackable: false, sprite: 'shield',    rarity: 0, avaxPrice: '0.004' },
  { id: 'chain_armor',     name: 'Chain Armor',      tile: tileIndex(47, 0), type: 'armor',     price: 0, sellPrice: 50, stat: { def: 8 },  description: 'Heavy chain links, solid defense',  stackable: false, sprite: 'shield',    rarity: 1, avaxPrice: '0.01' },
  // ── Accessories ──
  { id: 'fire_amulet',     name: 'Fire Amulet',      tile: tileIndex(47, 1), type: 'accessory', price: 0, sellPrice: 75, stat: { atk: 3 },  description: 'Imbued with fire essence',          stackable: false, sprite: 'accessory', rarity: 1, avaxPrice: '0.015' },
  { id: 'ghost_cloak',     name: 'Ghost Cloak',      tile: tileIndex(47, 1), type: 'accessory', price: 0, sellPrice: 90, stat: { spd: 5 },  description: 'Spectral cloak, enhances agility',  stackable: false, sprite: 'accessory', rarity: 1, avaxPrice: '0.018' },
  // ── Rings ──
  { id: 'ring_vitality',   name: 'Ring of Vitality', tile: tileIndex(47, 1), type: 'ring',      price: 0, sellPrice: 90, stat: { hp: 30 },  description: 'Grants extra vitality',             stackable: false, sprite: 'ring',      rarity: 1, avaxPrice: '0.018' },
  { id: 'ring_speed',      name: 'Ring of Speed',    tile: tileIndex(47, 1), type: 'ring',      price: 0, sellPrice: 100, stat: { spd: 5 },  description: 'Quickens reflexes',                 stackable: false, sprite: 'ring',      rarity: 1, avaxPrice: '0.02' },
  { id: 'ring_power',      name: 'Ring of Power',    tile: tileIndex(47, 1), type: 'ring',      price: 0, sellPrice: 100, stat: { atk: 5 },  description: 'Raw power flows through this ring',  stackable: false, sprite: 'ring',      rarity: 2, avaxPrice: '0.025' },
];

export class ShopScene extends Phaser.Scene {
  private tab: 'buy' | 'sell' = 'buy';
  private selectedIndex = 0;
  private itemBgs: Phaser.GameObjects.Rectangle[] = [];
  private goldText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;
  private descStatText!: Phaser.GameObjects.Text;
  private actionBtn!: Phaser.GameObjects.Rectangle;
  private actionBtnText!: Phaser.GameObjects.Text;
  private tabBuyBg!: Phaser.GameObjects.Rectangle;
  private tabSellBg!: Phaser.GameObjects.Rectangle;
  private tabBuyText!: Phaser.GameObjects.Text;
  private tabSellText!: Phaser.GameObjects.Text;
  // Computed layout
  private L = { px: 0, py: 0, pw: 0, ph: 0, pad: 0, headerH: 0, tabH: 0, footerH: 0, itemH: 0, itemGap: 0, listTop: 0 };

  constructor() { super({ key: 'Shop' }); }

  create() {
    // ── Compute responsive layout ──
    const W = this.scale.width;
    const H = this.scale.height;
    const pw = Math.min(W * 0.85, 700);
    const ph = Math.min(H * 0.9, H - 40);
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const pad = 20;
    const headerH = 52;
    const tabH = 40;
    const footerH = 100;
    const listAreaH = ph - headerH - tabH - footerH - 16;
    const maxItems = Math.max(SHOP_ITEMS.length, 6);
    const itemGap = 4;
    const itemH = Math.min(66, Math.floor((listAreaH - itemGap * (maxItems - 1)) / maxItems));
    const listTop = py + headerH + tabH + 8;

    this.L = { px, py, pw, ph, pad, headerH, tabH, footerH, itemH, itemGap, listTop };

    // ── Dim overlay ──
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(200).setInteractive();

    // ── Panel shadow + background ──
    this.add.rectangle(px + pw / 2 + 3, py + ph / 2 + 3, pw, ph, 0x000000, 0.4).setDepth(200);
    const panelBg = this.add.graphics().setDepth(201);
    panelBg.fillStyle(0x171c2a, 1);
    panelBg.fillRoundedRect(px, py, pw, ph, 12);
    panelBg.lineStyle(1, 0x2a3348, 1);
    panelBg.strokeRoundedRect(px, py, pw, ph, 12);

    // ── Header ──
    const hg = this.add.graphics().setDepth(202);
    hg.fillStyle(0x1e2438, 1);
    hg.fillRoundedRect(px, py, pw, headerH, { tl: 12, tr: 12, bl: 0, br: 0 });
    hg.fillStyle(0x00bbee, 1);
    hg.fillRect(px + pad, py + headerH - 2, pw - pad * 2, 2);

    this.add.text(px + pad + 4, py + headerH / 2, 'MERCHANT BJORN', {
      fontSize: '17px', color: '#d0d4e0', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(203);

    // AVAX logo indicator
    this.goldText = this.add.text(px + pw - pad - 10, py + headerH / 2, 'AVAX', {
      fontSize: '12px', color: '#ff6644', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(203);

    // Close X
    const closeBtn = this.add.text(px + pw - 14, py + 14, 'X', {
      fontSize: '18px', color: '#445566', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(203).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeShop());
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff4444'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#445566'));

    // ── Tabs ──
    const tabY = py + headerH;
    const tabW = pw / 2;
    this.tabBuyBg = this.add.rectangle(px + tabW / 2, tabY + tabH / 2, tabW, tabH, 0x1e2844, 1)
      .setStrokeStyle(2, 0x00ccee).setDepth(202).setInteractive({ useHandCursor: true });
    this.tabSellBg = this.add.rectangle(px + tabW + tabW / 2, tabY + tabH / 2, tabW, tabH, 0x171c2a, 1)
      .setStrokeStyle(0).setDepth(202).setInteractive({ useHandCursor: true });
    this.tabBuyText = this.add.text(px + tabW / 2, tabY + tabH / 2, 'BUY', {
      fontSize: '13px', color: '#00ccff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(203);
    this.tabSellText = this.add.text(px + tabW + tabW / 2, tabY + tabH / 2, 'SELL', {
      fontSize: '13px', color: '#556677', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(203);
    this.tabBuyBg.on('pointerdown', () => this.switchTab('buy'));
    this.tabSellBg.on('pointerdown', () => this.switchTab('sell'));

    // ── Item list ──
    this.renderItems();

    // ── Footer ──
    const footerY = py + ph - footerH;
    const fg = this.add.graphics().setDepth(202);
    fg.fillStyle(0x131825, 1);
    fg.fillRoundedRect(px, footerY, pw, footerH, { tl: 0, tr: 0, bl: 12, br: 12 });
    fg.lineStyle(1, 0x222840, 0.6);
    fg.lineBetween(px + pad, footerY + 1, px + pw - pad, footerY + 1);

    this.descText = this.add.text(px + pad, footerY + 10, '', {
      fontSize: '13px', color: '#8899aa', fontFamily: 'Arial, sans-serif',
    }).setDepth(203);
    this.descStatText = this.add.text(px + pad, footerY + 30, '', {
      fontSize: '12px', color: '#44ccaa', fontFamily: 'Arial, sans-serif',
    }).setDepth(203);

    const btnW = Math.min(260, pw * 0.45);
    this.actionBtn = this.add.rectangle(px + pw / 2, footerY + footerH - 28, btnW, 38, 0x0077aa, 1)
      .setDepth(203).setInteractive({ useHandCursor: true });
    this.actionBtn.setStrokeStyle(1, 0x0099cc, 0.5);
    this.actionBtnText = this.add.text(px + pw / 2, footerY + footerH - 28, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(204);
    this.actionBtn.on('pointerdown', () => this.doAction());
    this.actionBtn.on('pointerover', () => this.actionBtn.setFillStyle(0x0099cc));
    this.actionBtn.on('pointerout', () => this.actionBtn.setFillStyle(0x0077aa));

    // ESC
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', () => this.closeShop());
    }

    this.updateSelection();
    try { this.sound.play('ui-click', { volume: 0.3 }); } catch {}
  }

  private renderItems() {
    // Clear old item elements
    this.itemBgs = [];
    this.children.each((child: any) => {
      if (child.depth >= 205 && child.depth <= 209) child.destroy();
    });

    const { px, pw, pad, itemH, itemGap, listTop } = this.L;
    const items = this.tab === 'buy' ? SHOP_ITEMS : this.getSellableItems();
    const cardW = pw - pad * 2;
    const cx = px + pw / 2;

    if (items.length === 0) {
      this.add.text(cx, listTop + 40, this.tab === 'sell' ? 'Nothing to sell.' : 'No items.', {
        fontSize: '14px', color: '#445566', fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5).setDepth(207);
      return;
    }

    items.forEach((item, i) => {
      const y = listTop + i * (itemH + itemGap) + itemH / 2;

      // Card
      const bg = this.add.rectangle(cx, y, cardW, itemH, 0x1c2236, 1).setDepth(205)
        .setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(1, 0x252d42);
      this.itemBgs.push(bg);

      // Rarity accent bar (left edge)
      const rarity = (item as any).rarity ?? 0;
      const accent = RARITY_COLORS[rarity];
      this.add.rectangle(cx - cardW / 2 + 3.5, y, 5, itemH - 6, accent, 1).setDepth(206);

      // Icon — pixel art from itemGenerator
      const iconX = cx - cardW / 2 + 34;
      this.add.circle(iconX, y, 18, 0x252d42, 1).setStrokeStyle(2, accent, 0.6).setDepth(206);

      const itemTexKey = `shop_item_${item.id}`;
      if (!this.textures.exists(itemTexKey)) {
        try {
          const catMap: Record<string, ItemCategory> = {
            weapon: 'weapon', sword: 'weapon', armor: 'armor', shield: 'shield',
            accessory: 'ring', ring: 'ring', potion: 'weapon', key: 'weapon',
          };
          const cat = catMap[item.type] || 'weapon';
          const elemMap: Record<string, string> = {
            fire_amulet: 'fire', ghost_cloak: 'shadow', frost_pendant: 'ice',
            shadow_dagger: 'shadow', flame_sword: 'fire', ice_blade: 'ice',
          };
          const elem = (elemMap[item.id] || 'ice') as any;
          const seed = item.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
          const traits = generateItemTraits(seed, cat, elem);
          const canvas = document.createElement('canvas');
          drawItem(canvas, traits);
          this.textures.addCanvas(itemTexKey, canvas);
        } catch { /* fallback to sprite */ }
      }

      if (this.textures.exists(itemTexKey)) {
        const icon = this.add.image(iconX, y, itemTexKey).setDisplaySize(28, 28).setDepth(207);
      } else {
        const tileIdx = (item as any).tile || tileIndex(46, 1);
        const icon = this.add.sprite(iconX, y, 'tiles', tileIdx).setScale(SCALE * 0.8).setDepth(207);
        const tint = getObjectTint(tileIdx);
        if (tint) icon.setTint(tint);
      }

      // Name (clean, no overlap)
      const nameX = cx - cardW / 2 + 60;
      this.add.text(nameX, y - 12, item.name, {
        fontSize: '13px', color: '#d0d4e8', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setDepth(207);

      // Type + stat line
      const statParts: string[] = [];
      if (item.stat?.atk) statParts.push(`ATK+${item.stat.atk}`);
      if (item.stat?.def) statParts.push(`DEF+${item.stat.def}`);
      if (item.stat?.hp) statParts.push(`HP+${item.stat.hp}`);
      if (item.stat?.spd) statParts.push(`SPD+${item.stat.spd}`);
      if (item.stat?.mp) statParts.push(`MP+${item.stat.mp}`);
      const typeTag = item.type.toUpperCase();
      this.add.text(nameX, y + 5, `${typeTag}  ${statParts.join('  ')}`, {
        fontSize: '10px', color: '#' + accent.toString(16).padStart(6, '0'), fontFamily: 'Arial, sans-serif',
      }).setDepth(207);

      // Price (right side — all AVAX) with dark badge background
      const si = item as ShopItem;
      const priceStr = si.avaxPrice || '0';
      const priceBadge = this.add.graphics().setDepth(206);
      priceBadge.fillStyle(0x0d1118, 0.8);
      priceBadge.fillRoundedRect(cx + cardW / 2 - pad - 58, y - 16, 60, 32, 6);
      this.add.text(cx + cardW / 2 - pad - 2, y - 6, priceStr, {
        fontSize: '14px', color: '#ff6644', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(207);
      this.add.text(cx + cardW / 2 - pad - 2, y + 8, 'AVAX', {
        fontSize: '9px', color: '#885533', fontFamily: 'Arial, sans-serif',
      }).setOrigin(1, 0.5).setDepth(207);

      if (this.tab === 'sell' && (item as any).count > 1) {
        this.add.text(cx + cardW / 2 - pad, y + 14, `x${(item as any).count}`, {
          fontSize: '10px', color: '#556677', fontFamily: 'Arial, sans-serif',
        }).setOrigin(1, 0.5).setDepth(207);
      }

      bg.on('pointerdown', () => { this.selectedIndex = i; this.updateSelection(); try { this.sound.play('ui-click', { volume: 0.2 }); } catch {} });
      bg.on('pointerover', () => { if (i !== this.selectedIndex) bg.setFillStyle(0x242c44); });
      bg.on('pointerout', () => { if (i !== this.selectedIndex) bg.setFillStyle(0x1c2236); });
    });

    this.selectedIndex = 0;
  }

  private getSellableItems(): (InventoryItem & { sellPrice: number; tile: number; rarity: number })[] {
    return PlayerState.get().inventory
      .filter(item => item.type !== 'quest' && item.type !== 'key')
      .map(item => {
        const ref = SHOP_ITEMS.find(s => s.id === item.id);
        // Loot drops aren't shop items — price them from the canonical table
        const sellPrice = ref?.sellPrice || SELL_PRICES[item.id] || 5;
        return { ...item, sellPrice, tile: ref?.tile ?? tileIndex(46, 1), rarity: ref?.rarity ?? 0 };
      });
  }

  private updateSelection() {
    const items = this.tab === 'buy' ? SHOP_ITEMS : this.getSellableItems();
    if (items.length === 0) {
      this.descText.setText(this.tab === 'sell' ? 'No items to sell.' : '');
      this.descStatText.setText('');
      this.actionBtnText.setText(this.tab === 'buy' ? 'BUY' : 'SELL');
      return;
    }

    this.itemBgs.forEach((bg, i) => {
      if (i === this.selectedIndex) {
        bg.setFillStyle(0x263050); bg.setStrokeStyle(2, 0x00ccee);
      } else {
        bg.setFillStyle(0x1c2236); bg.setStrokeStyle(1, 0x252d42);
      }
    });

    const item = items[this.selectedIndex];
    if (!item) return;
    const state = PlayerState.get();

    if (this.tab === 'buy') {
      const si = item as ShopItem;
      this.descText.setText(si.description).setColor('#8899aa');
      const stats: string[] = [];
      if (si.stat?.atk) stats.push(`ATK +${si.stat.atk}`);
      if (si.stat?.def) stats.push(`DEF +${si.stat.def}`);
      if (si.stat?.hp) stats.push(`Heals ${si.stat.hp} HP`);
      if (si.stat?.spd) stats.push(`SPD +${si.stat.spd}`);
      if (si.stat?.mp) stats.push(`Restores ${si.stat.mp} MP`);
      this.descStatText.setText(stats.join('   '));

      const hasWallet = !!(window as any).__frostbiteWallet?.authenticated;
      this.actionBtnText.setText(hasWallet ? `BUY — ${si.avaxPrice} AVAX` : 'CONNECT WALLET');
      this.actionBtn.setFillStyle(hasWallet ? 0xcc4400 : 0x553333);
    } else {
      const si = item as any;
      this.descText.setText(`Sell ${si.name}`).setColor('#8899aa');
      this.descStatText.setText(`+${si.sellPrice} gold`);
      this.actionBtnText.setText(`SELL — +${si.sellPrice}g`);
      this.actionBtn.setFillStyle(0x117733);
    }
  }

  private doAction() {
    const state = PlayerState.get();
    const items = this.tab === 'buy' ? SHOP_ITEMS : this.getSellableItems();
    if (!items.length) return;
    const item = items[this.selectedIndex];
    if (!item) return;

    if (this.tab === 'buy') {
      const si = item as ShopItem;
      // All items purchased with AVAX
      if (si.avaxPrice) {
        this.buyWithAvax(si);
        return;
      }
    } else {
      const si = item as any;
      state.removeItem(si.id, 1);
      state.gold += si.sellPrice;
      this.descText.setText(`Sold ${si.name} for ${si.sellPrice}g`).setColor('#44ccaa');
      this.descStatText.setText('');
      try { this.sound.play('coins', { volume: 0.4 }); } catch {}
      this.renderItems();
    }
    this.updateGold();
    this.updateSelection();
    PlayerState.get().save(); // auto-save after shop transaction
  }

  private switchTab(tab: 'buy' | 'sell') {
    this.tab = tab;
    this.tabBuyBg.setFillStyle(tab === 'buy' ? 0x222e4a : 0x171c2a);
    this.tabBuyBg.setStrokeStyle(tab === 'buy' ? 2 : 0, 0x00ccee);
    this.tabSellBg.setFillStyle(tab === 'sell' ? 0x222e4a : 0x171c2a);
    this.tabSellBg.setStrokeStyle(tab === 'sell' ? 2 : 0, 0x00ccee);
    this.tabBuyText.setColor(tab === 'buy' ? '#00ccff' : '#556677').setFontStyle(tab === 'buy' ? 'bold' : '');
    this.tabSellText.setColor(tab === 'sell' ? '#00ccff' : '#556677').setFontStyle(tab === 'sell' ? 'bold' : '');
    this.renderItems();
    this.updateSelection();
  }

  private updateGold() { this.goldText.setText(`${PlayerState.get().gold}`); }
  private closeShop() { this.events.emit('shop-closed'); this.scene.stop(); }

  private avaxBuyBusy = false;

  // ── Buy any item with AVAX ──
  private async buyWithAvax(si: ShopItem): Promise<void> {
    const wallet = (window as any).__frostbiteWallet;
    if (!wallet?.authenticated) {
      this.descText.setText('Connect wallet first!').setColor('#aa4444');
      return;
    }
    // Real money leaves the wallet in this flow: refuse before the tx if the
    // item can't be granted (full inventory), and block double-taps.
    if (this.avaxBuyBusy) return;
    const preState = PlayerState.get();
    const canHold = si.stackable
      ? preState.inventory.some(i => i.id === si.id) || preState.inventory.length < 12
      : preState.inventory.length < 12;
    if (!canHold) {
      this.descText.setText('Inventory full! Make room first.').setColor('#aa4444');
      return;
    }
    this.avaxBuyBusy = true;

    this.descText.setText('Confirm transaction...').setColor('#ffaa00');
    this.descStatText.setText(`${si.avaxPrice} AVAX`);

    try {
      const provider = (window as any).ethereum;
      if (!provider) {
        this.descText.setText('No wallet provider!').setColor('#aa4444');
        return;
      }

      const { ethers } = await import('ethers');
      const web3Provider = new ethers.BrowserProvider(provider);
      const signer = await web3Provider.getSigner();

      // Potions use PotionShop contract, other items use direct AVAX transfer to treasury
      if (si.potionId !== undefined) {
        const contract = new ethers.Contract(POTION_SHOP_CONTRACT, POTION_SHOP_ABI, signer);
        const tx = await contract.buyPotion(si.potionId, 1, {
          value: ethers.parseEther(si.avaxPrice!),
        });
        this.descText.setText('Processing...').setColor('#ffaa00');
        await tx.wait();
      } else {
        // Direct AVAX payment to treasury for equipment
        const TREASURY = '0x301b013280317a75f808a3c0d23e82e9027a6b77';
        const tx = await signer.sendTransaction({
          to: TREASURY,
          value: ethers.parseEther(si.avaxPrice!),
        });
        this.descText.setText('Processing...').setColor('#ffaa00');
        await tx.wait();
      }

      // Add item to inventory
      const state = PlayerState.get();
      const added = state.addItem({
        id: si.id, name: si.name, sprite: si.sprite,
        type: si.type, stat: si.stat, stackable: si.stackable, count: 1,
      });

      if (added) {
        this.descText.setText(`Purchased ${si.name}!`).setColor('#44ccaa');
        try { this.sound.play('coins', { volume: 0.4 }); } catch {}
        state.save();
      } else {
        this.descText.setText('Inventory full!').setColor('#aa4444');
      }
    } catch (e: any) {
      const msg = e.shortMessage || e.message || 'Transaction failed';
      this.descText.setText(`Error: ${msg.slice(0, 40)}`).setColor('#aa4444');
    } finally {
      this.avaxBuyBusy = false;
    }

    this.descStatText.setText('');
    this.updateSelection();
  }
}
