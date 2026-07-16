// ─── Chat Overlay for HUD Scene ───
// Zone-based chat log + input, rendered via Phaser DOM elements
import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { mp } from './socket';

interface ChatMessage {
  name: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

export class ChatOverlay {
  private scene: Phaser.Scene;
  private messages: ChatMessage[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];
  private inputOpen = false;
  private inputText = '';
  private inputGfx: Phaser.GameObjects.Graphics | null = null;
  private inputLabel: Phaser.GameObjects.Text | null = null;
  private cursorBlink: Phaser.Time.TimerEvent | null = null;
  private showCursor = true;
  private chatBtnGfx: Phaser.GameObjects.Graphics | null = null;

  private readonly MAX_LOG = 5;
  private readonly LOG_X = 12;
  private readonly LOG_Y: number;
  private readonly LOG_FADE_MS = 8000;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.LOG_Y = GAME_HEIGHT - 120;

    // Chat button (bottom area)
    this.createChatButton();

    // Listen for chat messages
    mp.on('chat-message', (data: { id?: string; name: string; message: string; timestamp: number }) => {
      // Server broadcasts to the whole room including the sender; we already
      // echo our own message locally in sendMessage() — skip the duplicate.
      if (data.id && data.id === mp.id) return;
      this.addMessage(data.name, data.message);
    });

    mp.on('player-emote', (data: { name: string; emote: string }) => {
      this.addMessage(data.name, `*${data.emote}*`, true);
    });

    mp.on('player-joined', (data: { name: string }) => {
      this.addMessage('', `${data.name} joined`, true);
    });

    mp.on('player-left', (data: { id: string }) => {
      this.addMessage('', `A player left`, true);
    });

    // Listen for keyboard
    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown-ENTER', () => {
        if (this.inputOpen) {
          this.sendMessage();
        } else {
          this.openInput();
        }
      });

      scene.input.keyboard.on('keydown-ESC', () => {
        if (this.inputOpen) this.closeInput();
      });

      scene.input.keyboard.on('keydown', (event: KeyboardEvent) => {
        if (!this.inputOpen) return;
        if (event.key === 'Backspace') {
          this.inputText = this.inputText.slice(0, -1);
          this.updateInputDisplay();
        } else if (event.key.length === 1 && this.inputText.length < 150) {
          this.inputText += event.key;
          this.updateInputDisplay();
        }
      });
    }
  }

  private createChatButton(): void {
    const x = 12;
    const y = GAME_HEIGHT - 52;

    this.chatBtnGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(310);
    this.chatBtnGfx.fillStyle(0x222233, 0.5);
    this.chatBtnGfx.fillRoundedRect(x, y, 70, 28, 6);
    this.chatBtnGfx.lineStyle(1, 0x00ccee, 0.3);
    this.chatBtnGfx.strokeRoundedRect(x, y, 70, 28, 6);

    this.scene.add.text(x + 35, y + 14, 'CHAT', {
      fontSize: '11px', color: '#00ccee', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(311);

    const hit = this.scene.add.rectangle(x + 35, y + 14, 70, 28)
      .setAlpha(0.001).setScrollFactor(0).setDepth(312).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.inputOpen) this.closeInput();
      else this.openInput();
    });
  }

  addMessage(name: string, message: string, isSystem = false): void {
    this.messages.push({ name, message, timestamp: Date.now(), isSystem });
    if (this.messages.length > 20) this.messages.shift();
    this.refreshLog();
  }

  private refreshLog(): void {
    // Clear old texts
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];

    const recent = this.messages.slice(-this.MAX_LOG);
    recent.forEach((msg, i) => {
      const y = this.LOG_Y + i * 16;
      const color = msg.isSystem ? '#666688' : '#aabbcc';
      const prefix = msg.name ? `${msg.name}: ` : '';
      const txt = this.scene.add.text(this.LOG_X, y, `${prefix}${msg.message}`, {
        fontSize: '11px', color, fontFamily: 'Arial, sans-serif',
        stroke: '#000000', strokeThickness: 2,
      }).setScrollFactor(0).setDepth(305);
      this.logTexts.push(txt);

      // Fade out after LOG_FADE_MS
      const age = Date.now() - msg.timestamp;
      const remaining = Math.max(0, this.LOG_FADE_MS - age);
      this.scene.time.delayedCall(remaining, () => {
        this.scene.tweens.add({
          targets: txt, alpha: 0, duration: 2000,
          onComplete: () => txt.destroy(),
        });
      });
    });
  }

  private openInput(): void {
    if (this.inputOpen) return;
    this.inputOpen = true;
    // Game-wide flag: zone scenes suppress WASD/M/I/E while the player is
    // typing (otherwise "im coming" walks the player and M opens the world map)
    this.scene.registry.set('chatInputOpen', true);
    this.inputText = '';
    this.showCursor = true;

    const y = GAME_HEIGHT - 36;
    this.inputGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(320);
    this.inputGfx.fillStyle(0x111122, 0.9);
    this.inputGfx.fillRoundedRect(10, y, GAME_WIDTH - 20, 28, 6);
    this.inputGfx.lineStyle(1, 0x00ccee, 0.5);
    this.inputGfx.strokeRoundedRect(10, y, GAME_WIDTH - 20, 28, 6);

    this.inputLabel = this.scene.add.text(18, y + 14, '> _', {
      fontSize: '12px', color: '#e0e4ee', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(321);

    // Cursor blink
    this.cursorBlink = this.scene.time.addEvent({
      delay: 500, loop: true,
      callback: () => {
        this.showCursor = !this.showCursor;
        this.updateInputDisplay();
      },
    });
  }

  private closeInput(): void {
    this.inputOpen = false;
    this.scene.registry.set('chatInputOpen', false);
    this.inputText = '';
    if (this.inputGfx) { this.inputGfx.destroy(); this.inputGfx = null; }
    if (this.inputLabel) { this.inputLabel.destroy(); this.inputLabel = null; }
    if (this.cursorBlink) { this.cursorBlink.destroy(); this.cursorBlink = null; }
  }

  private updateInputDisplay(): void {
    if (this.inputLabel) {
      const cursor = this.showCursor ? '|' : '';
      this.inputLabel.setText(`> ${this.inputText}${cursor}`);
    }
  }

  private sendMessage(): void {
    const msg = this.inputText.trim();
    if (msg.length === 0) { this.closeInput(); return; }

    mp.sendChat(msg);

    // Show own message locally
    const state = (window as any).__frostbitePlayerName || 'You';
    this.addMessage(state, msg);

    this.closeInput();
  }

  destroy(): void {
    this.closeInput();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
  }
}
