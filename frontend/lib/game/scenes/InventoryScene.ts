import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, SCALE, tileIndex } from '../config';
import { PlayerState, InventoryItem } from '../PlayerState';
import { getObjectTint } from '../tints';

const ITEM_TILES: Record<string, number> = {
  potion_hp: tileIndex(46, 1),
  potion_hp_large: tileIndex(46, 1),
  potion_mp: tileIndex(46, 1),
  iron_sword: tileIndex(46, 0),
  steel_sword: tileIndex(46, 0),
  iron_shield: tileIndex(47, 0),
  chain_armor: tileIndex(47, 0),
  frost_key: tileIndex(47, 1),
  ghost_cloak: tileIndex(47, 1),
  fire_amulet: tileIndex(47, 1),
  ring_vitality: tileIndex(47, 1),
  ring_power: tileIndex(47, 1),
  ring_speed: tileIndex(47, 1),
};

export class InventoryScene extends Phaser.Scene {
  private elements: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Inventory' });
  }

  create() {
    this.elements = [];
    this.render();

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-I', () => this.close());
      this.input.keyboard.on('keydown-ESC', () => this.close());
    }
    // Close on clicking dimmed background (touch-friendly)
    // Also handled by close button added in render()
  }

  private render() {
    // Clear previous
    this.elements.forEach(e => e.destroy());
    this.elements = [];

    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;
    const state = PlayerState.get();
    const cx = w / 2;
    const panelW = 540;
    const panelH = 460;
    const panelTop = h / 2 - panelH / 2;

    // Dimmed bg
    const dim = this.add.rectangle(cx, h / 2, w, h, 0x000000, 0.7).setDepth(400);
    this.elements.push(dim);

    // Panel
    const panel = this.add.rectangle(cx, h / 2, panelW, panelH, 0x141a28, 1)
      .setStrokeStyle(3, 0x2a3a4a).setDepth(401);
    this.elements.push(panel);

    // Inner highlight (1px line at top inside, subtle glow)
    const innerHL = this.add.rectangle(cx, h / 2 - panelH / 2 + 2, panelW - 6, 1, 0x2a4a5a, 0.3).setDepth(402);
    this.elements.push(innerHL);

    // Title bar
    const titleBar = this.add.rectangle(cx, panelTop + 20, panelW, 40, 0x1e2438, 1).setDepth(402);
    const titleAccent = this.add.rectangle(cx, panelTop + 40, panelW - 30, 2, 0x00ccee, 1).setDepth(402);
    const titleText = this.add.text(cx, panelTop + 20, 'INVENTORY', {
      fontSize: '15px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(403);
    this.elements.push(titleBar, titleAccent, titleText);

    // Close button (X) — touch-friendly
    const closeBtn = this.add.rectangle(cx + panelW / 2 - 22, panelTop + 20, 36, 36, 0x2a2a3a, 1)
      .setStrokeStyle(1, 0x3a3a4a).setDepth(404).setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(cx + panelW / 2 - 22, panelTop + 20, 'X', {
      fontSize: '16px', color: '#ff4444', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(405);
    closeBtn.on('pointerdown', () => this.close());
    closeBtn.on('pointerover', () => { closeBtn.setFillStyle(0xff4444); closeTxt.setColor('#ffffff'); });
    closeBtn.on('pointerout', () => { closeBtn.setFillStyle(0x2a2a3a); closeTxt.setColor('#ff4444'); });
    this.elements.push(closeBtn, closeTxt);

    // Also close on clicking dimmed background
    dim.setInteractive();
    dim.on('pointerdown', () => this.close());

    // ═══ Equipment Section ═══
    const eqY = panelTop + 58;
    const eqLabel = this.add.text(cx - panelW / 2 + 15, eqY, 'EQUIPPED', {
      fontSize: '10px', color: '#8899aa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setDepth(402);
    this.elements.push(eqLabel);

    // Equipment slots — 4 slots in a row
    const slotW = 120;
    const slotGap = 8;
    const totalSlotsW = slotW * 4 + slotGap * 3;
    const slotStartX = cx - totalSlotsW / 2 + slotW / 2;
    this.createEquipSlot(slotStartX, eqY + 30, 'Weapon', state.equipped.weapon, 'weapon');
    this.createEquipSlot(slotStartX + slotW + slotGap, eqY + 30, 'Armor', state.equipped.armor, 'armor');
    this.createEquipSlot(slotStartX + (slotW + slotGap) * 2, eqY + 30, 'Accessory', state.equipped.accessory, 'accessory');
    this.createEquipSlot(slotStartX + (slotW + slotGap) * 3, eqY + 30, 'Ring', state.equipped.ring, 'ring');

    // ═══ Stats line ═══
    const statsY = eqY + 70;
    const statsLine = this.add.text(cx, statsY, '', {
      fontSize: '10px', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(402);
    const statStr = `Lv.${state.level}  HP ${state.hp}/${state.maxHp}  ATK ${state.atk}  DEF ${state.def}  SPD ${state.spd}  Gold ${state.gold}`;
    statsLine.setText(statStr).setColor('#8899aa');
    this.elements.push(statsLine);

    // ═══ Bag Section ═══
    const bagY = statsY + 25;
    const bagLabel = this.add.text(cx - panelW / 2 + 15, bagY, 'BAG', {
      fontSize: '10px', color: '#8899aa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setDepth(402);
    this.elements.push(bagLabel);

    // Divider
    const divider = this.add.rectangle(cx, bagY + 10, panelW - 30, 1, 0x2a3a4a, 1).setDepth(402);
    this.elements.push(divider);

    // Item grid 4 cols × 3 rows
    const gridStartX = cx - panelW / 2 + 20;
    const gridStartY = bagY + 22;
    const cellW = 125;
    const cellH = 60;

    for (let slot = 0; slot < 12; slot++) {
      const col = slot % 4;
      const row = Math.floor(slot / 4);
      const slotX = gridStartX + col * cellW + cellW / 2;
      const slotY = gridStartY + row * cellH + cellH / 2;
      const item = state.inventory[slot];

      // Cell bg
      const cellBg = this.add.rectangle(slotX, slotY, cellW - 4, cellH - 4,
        item ? 0x1a2030 : 0x131825, 1)
        .setStrokeStyle(1, 0x2a3a4a).setDepth(402);
      this.elements.push(cellBg);

      if (item) {
        cellBg.setInteractive({ useHandCursor: true });

        // Icon
        const tileIdx = ITEM_TILES[item.id] || tileIndex(46, 1);
        const icon = this.add.sprite(slotX - 35, slotY, 'tiles', tileIdx)
          .setScale(SCALE * 0.7).setDepth(403);
        const tint = getObjectTint(tileIdx);
        if (tint) icon.setTint(tint);
        this.elements.push(icon);

        // Name
        const nameText = this.add.text(slotX - 12, slotY - 14, item.name, {
          fontSize: '9px', color: '#d0d4e8', fontFamily: 'monospace', fontStyle: 'bold',
        }).setDepth(403);
        this.elements.push(nameText);

        // Stat + count
        const parts: string[] = [];
        if (item.stat?.atk) parts.push(`ATK+${item.stat.atk}`);
        if (item.stat?.def) parts.push(`DEF+${item.stat.def}`);
        if (item.stat?.hp) parts.push(`HP+${item.stat.hp}`);
        if (item.stat?.spd) parts.push(`SPD+${item.stat.spd}`);
        if (item.stat?.mp) parts.push(`MP+${item.stat.mp}`);
        if (item.count > 1) parts.push(`x${item.count}`);
        const statText = this.add.text(slotX - 12, slotY + 2, parts.join(' '), {
          fontSize: '8px', color: '#8899aa', fontFamily: 'monospace',
        }).setDepth(403);
        this.elements.push(statText);

        // Action label
        let actionLabel = '';
        if (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory' || item.type === 'ring') actionLabel = 'Click: Equip';
        else if (item.type === 'potion') actionLabel = 'Click: Use';

        if (actionLabel) {
          const action = this.add.text(slotX - 12, slotY + 14, actionLabel, {
            fontSize: '7px', color: '#00ccee', fontFamily: 'monospace',
          }).setDepth(403);
          this.elements.push(action);
        }

        // Click handler
        cellBg.on('pointerdown', () => this.handleItemClick(item, slot));
        cellBg.on('pointerover', () => cellBg.setFillStyle(0x222a3a, 1));
        cellBg.on('pointerout', () => cellBg.setFillStyle(0x1a2030, 1));
      } else {
        const dash = this.add.text(slotX, slotY, '—', {
          fontSize: '14px', color: '#2a3a4a', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(403);
        this.elements.push(dash);
      }
    }

    // Status message
    this.statusText = this.add.text(cx, panelTop + panelH - 30, '', {
      fontSize: '10px', color: '#00ccee', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(403);
    this.elements.push(this.statusText);

    // Close hint
    const hint = this.add.text(cx, panelTop + panelH - 12, 'I or ESC to close', {
      fontSize: '9px', color: '#8899aa', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(403);
    this.elements.push(hint);
  }

  private createEquipSlot(x: number, y: number, label: string, item: InventoryItem | null, slot: 'weapon' | 'armor' | 'accessory' | 'ring') {
    const slotW = 120;
    const slotH = 42;

    const bg = this.add.rectangle(x, y, slotW, slotH, 0x1a2030, 1)
      .setStrokeStyle(1.5, item ? 0x00ccee : 0x2a3a4a).setDepth(402);
    this.elements.push(bg);

    const labelText = this.add.text(x - slotW / 2 + 8, y - 16, label, {
      fontSize: '8px', color: '#8899aa', fontFamily: 'monospace',
    }).setDepth(403);
    this.elements.push(labelText);

    if (item) {
      bg.setInteractive({ useHandCursor: true });

      const tileIdx = ITEM_TILES[item.id] || tileIndex(46, 0);
      const icon = this.add.sprite(x - slotW / 2 + 25, y + 2, 'tiles', tileIdx)
        .setScale(SCALE * 0.65).setDepth(403);
      const tint = getObjectTint(tileIdx);
      if (tint) icon.setTint(tint);
      this.elements.push(icon);

      const nameText = this.add.text(x - slotW / 2 + 45, y - 6, item.name, {
        fontSize: '9px', color: '#d0d4e8', fontFamily: 'monospace', fontStyle: 'bold',
      }).setDepth(403);
      this.elements.push(nameText);

      const parts: string[] = [];
      if (item.stat?.atk) parts.push(`ATK+${item.stat.atk}`);
      if (item.stat?.def) parts.push(`DEF+${item.stat.def}`);
      if (item.stat?.spd) parts.push(`SPD+${item.stat.spd}`);
      if (item.stat?.hp) parts.push(`HP+${item.stat.hp}`);
      const statText = this.add.text(x - slotW / 2 + 45, y + 6, parts.join(' '), {
        fontSize: '8px', color: '#8899aa', fontFamily: 'monospace',
      }).setDepth(403);
      this.elements.push(statText);

      // Click to unequip
      bg.on('pointerdown', () => {
        const state = PlayerState.get();
        if (state.unequip(slot)) {
          // render() first — it rebuilds statusText, so a message set before it
          // is destroyed instantly and never seen
          this.render();
          this.statusText.setText(`Unequipped ${item.name}`);
        } else {
          this.statusText.setText('Inventory full!');
        }
      });
      bg.on('pointerover', () => bg.setFillStyle(0x222a3a, 1));
      bg.on('pointerout', () => bg.setFillStyle(0x1a2030, 1));
    } else {
      const empty = this.add.text(x, y + 2, `No ${label}`, {
        fontSize: '9px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(403);
      this.elements.push(empty);
    }
  }

  private handleItemClick(item: InventoryItem, _slot: number) {
    const state = PlayerState.get();

    if (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory' || item.type === 'ring') {
      const result = state.equip(item);
      if (result) {
        try { this.sound.play('metal-click', { volume: 0.4 }); } catch {}
        this.render();
        this.statusText.setText(`Equipped ${item.name}!`);
      } else {
        this.statusText.setText('No room to swap — inventory full!');
      }
    } else if (item.type === 'potion') {
      // Apply what the potion actually grants — the old code healed 40 HP for
      // every potion, so MP potions restored no MP and were still consumed.
      const effects: string[] = [];
      if (item.stat?.hp) {
        if (state.hp >= state.maxHp) {
          this.statusText.setText('HP already full!');
          return;
        }
        state.heal(item.stat.hp);
        effects.push(`+${item.stat.hp} HP`);
      }
      if (item.stat?.mp) {
        if (state.mp >= state.maxMp && effects.length === 0) {
          this.statusText.setText('MP already full!');
          return;
        }
        state.mp = Math.min(state.maxMp, state.mp + item.stat.mp);
        effects.push(`+${item.stat.mp} MP`);
      }
      if (effects.length === 0) {
        // No usable stat outside battle (e.g. speed tonic) — don't waste it
        this.statusText.setText('No effect outside battle.');
        return;
      }
      state.removeItem(item.id, 1);
      try { this.sound.play('coins', { volume: 0.3 }); } catch {}
      this.render();
      this.statusText.setText(`Used ${item.name}! ${effects.join(' ')}`);
    }
  }

  private close() {
    this.events.emit('inventory-closed');
    this.scene.stop();
  }
}
