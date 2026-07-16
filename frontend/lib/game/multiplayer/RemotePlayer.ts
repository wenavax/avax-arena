// ─── Remote Player Rendering ───
// Renders other players in the isometric world as simplified avatars
import * as Phaser from 'phaser';
import { toScreen, isoDepth, ISO_TILE_H } from '../iso/core';

const CLASS_COLORS: Record<string, number> = {
  knight: 0x4488cc,
  mage: 0x9944cc,
  archer: 0x44aa44,
};

function darken(c: number, f: number): number {
  return (Math.max(0, Math.floor(((c >> 16) & 0xff) * f)) << 16) |
         (Math.max(0, Math.floor(((c >> 8) & 0xff) * f)) << 8) |
          Math.max(0, Math.floor((c & 0xff) * f));
}

export interface RemotePlayerData {
  id: string;
  wallet: string;
  name: string;
  playerClass: string;
  level: number;
  skinColor: number;
  hairColor: number;
  tx: number;
  ty: number;
  facing: string;
}

export class RemotePlayer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bodyGfx: Phaser.GameObjects.Graphics;
  private nameLabel: Phaser.GameObjects.Text;
  private chatBubble: Phaser.GameObjects.Container | null = null;

  data: RemotePlayerData;
  private currentTx: number;
  private currentTy: number;

  constructor(scene: Phaser.Scene, data: RemotePlayerData, getTileHeight: (tx: number, ty: number) => number) {
    this.scene = scene;
    this.data = data;
    this.currentTx = data.tx;
    this.currentTy = data.ty;

    const h = getTileHeight(data.tx, data.ty);
    const pos = toScreen(data.tx, data.ty, h);

    this.container = scene.add.container(pos.x, pos.y);
    this.container.setDepth(isoDepth(data.tx, data.ty) + 4);

    // Body graphics
    this.bodyGfx = scene.add.graphics();
    this.drawBody();
    this.container.add(this.bodyGfx);

    // Name label
    this.nameLabel = scene.add.text(0, 14, `${data.name} Lv${data.level}`, {
      fontSize: '10px',
      color: '#aaddff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.nameLabel);

    // Small online indicator
    const dot = scene.add.graphics();
    dot.fillStyle(0x44dd44, 1);
    dot.fillCircle(this.nameLabel.width / 2 + 8, 18, 3);
    this.container.add(dot);

    // Make clickable — opens player menu
    const hitArea = scene.add.rectangle(0, -5, 30, 40).setAlpha(0.001).setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      const baseScene = scene as any;
      if (baseScene.showPlayerMenu) baseScene.showPlayerMenu(this);
    });
    this.container.add(hitArea);
  }

  private drawBody(): void {
    const gfx = this.bodyGfx;
    gfx.clear();

    const bodyColor = CLASS_COLORS[this.data.playerClass] || 0x888888;
    const skinColor = this.data.skinColor || 0xffddbb;
    const S = 1.6; // Smaller than local player

    // Shadow
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(0, 5, 16 * S, 5 * S);

    // Legs
    gfx.fillStyle(darken(bodyColor, 0.65), 1);
    gfx.fillRect(-2 * S, -1 * S, 2 * S, 5 * S);
    gfx.fillRect(0, -1 * S, 2 * S, 5 * S);

    // Body
    gfx.fillStyle(bodyColor, 0.85);
    gfx.fillRoundedRect(-4 * S, -10 * S, 8 * S, 9 * S, 1.5 * S);

    // Head
    gfx.fillStyle(skinColor, 1);
    gfx.fillCircle(0, -13 * S, 4 * S);

    // Hair
    gfx.fillStyle(this.data.hairColor || 0x443322, 1);
    gfx.beginPath();
    gfx.arc(0, -14 * S, 4 * S, Math.PI, 0, false);
    gfx.closePath();
    gfx.fillPath();

    // Eyes
    gfx.fillStyle(0x222222, 1);
    gfx.fillCircle(1.5 * S, -13 * S, 0.6 * S);
    gfx.fillCircle(3.5 * S, -13 * S, 0.6 * S);

    // Class indicator (small colored circle)
    gfx.fillStyle(bodyColor, 0.6);
    gfx.fillCircle(0, -10 * S, 8 * S);
    gfx.fillStyle(bodyColor, 0);
  }

  moveTo(tx: number, ty: number, facing: string, getTileHeight: (tx: number, ty: number) => number): void {
    this.data.tx = tx;
    this.data.ty = ty;
    this.data.facing = facing;

    const h = getTileHeight(tx, ty);
    const pos = toScreen(tx, ty, h);

    this.scene.tweens.add({
      targets: this.container,
      x: pos.x,
      y: pos.y,
      duration: 150,
      ease: 'Power1',
      onComplete: () => {
        this.currentTx = tx;
        this.currentTy = ty;
        this.container.setDepth(isoDepth(tx, ty) + 4);
      },
    });
  }

  showChatBubble(message: string): void {
    this.hideChatBubble();

    this.chatBubble = this.scene.add.container(0, -40);
    this.container.add(this.chatBubble);

    const text = this.scene.add.text(0, 0, message.slice(0, 60), {
      fontSize: '10px',
      color: '#e0e4ee',
      fontFamily: 'Arial, sans-serif',
      wordWrap: { width: 120 },
      align: 'center',
    }).setOrigin(0.5, 1);

    const padX = 8;
    const padY = 4;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a2030, 0.9);
    bg.fillRoundedRect(-text.width / 2 - padX, -text.height - padY, text.width + padX * 2, text.height + padY * 2, 6);
    bg.lineStyle(1, 0x3388aa, 0.5);
    bg.strokeRoundedRect(-text.width / 2 - padX, -text.height - padY, text.width + padX * 2, text.height + padY * 2, 6);

    this.chatBubble.add(bg);
    this.chatBubble.add(text);

    // Auto-hide after 4 seconds
    this.scene.time.delayedCall(4000, () => this.hideChatBubble());
  }

  showEmote(emote: string): void {
    const emoteMap: Record<string, string> = {
      wave: '👋', dance: '💃', laugh: '😄', angry: '😡',
      sad: '😢', love: '❤️', gg: '🏆', hi: '👋',
    };
    const emoji = emoteMap[emote] || `[${emote}]`;

    const txt = this.scene.add.text(0, -50, emoji, {
      fontSize: '24px',
    }).setOrigin(0.5).setDepth(this.container.depth + 1);

    this.container.add(txt);

    this.scene.tweens.add({
      targets: txt,
      y: -80,
      alpha: 0,
      duration: 2000,
      ease: 'Power1',
      onComplete: () => txt.destroy(),
    });
  }

  private hideChatBubble(): void {
    if (this.chatBubble) {
      this.chatBubble.destroy(true);
      this.chatBubble = null;
    }
  }

  destroy(): void {
    this.hideChatBubble();
    this.container.destroy(true);
  }
}
