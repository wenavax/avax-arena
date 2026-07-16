import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { music } from '../musicSystem';
import { PlayerState } from '../PlayerState';

export class SettingsScene extends Phaser.Scene {
  private elements: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'Settings' });
  }

  create() {
    this.elements = [];
    this.render();

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', () => this.close());
    }
  }

  private render() {
    this.elements.forEach(e => e.destroy());
    this.elements = [];

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panelW = 400;
    const panelH = 420;
    const panelTop = cy - panelH / 2;
    const panelLeft = cx - panelW / 2;

    // Dimmed background
    const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(400);
    dim.setInteractive();
    dim.on('pointerdown', () => this.close());
    this.elements.push(dim);

    // Panel
    const panel = this.add.rectangle(cx, cy, panelW, panelH, 0x141a28, 1)
      .setStrokeStyle(2, 0x2a3348).setDepth(401);
    this.elements.push(panel);

    // Prevent clicks on panel from closing
    panel.setInteractive();

    // Title bar
    const titleBar = this.add.rectangle(cx, panelTop + 20, panelW, 40, 0x1a2840, 1)
      .setStrokeStyle(1, 0x334466).setDepth(402);
    const titleText = this.add.text(cx, panelTop + 20, 'SETTINGS', {
      fontSize: '15px', color: '#00ccee', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(403);
    this.elements.push(titleBar, titleText);

    // Close button (X)
    const closeBtn = this.add.rectangle(cx + panelW / 2 - 22, panelTop + 20, 36, 36, 0xcc3333, 1)
      .setStrokeStyle(1, 0xff4444).setDepth(404).setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(cx + panelW / 2 - 22, panelTop + 20, 'X', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(405);
    closeBtn.on('pointerdown', () => this.close());
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(0xff4444));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(0xcc3333));
    this.elements.push(closeBtn, closeTxt);

    let y = panelTop + 55;

    // ═══ AUDIO SECTION ═══
    y = this.addSectionHeader(cx, panelLeft, y, 'AUDIO');

    // Music ON/OFF
    y = this.addToggleRow(cx, panelLeft, panelW, y, 'Music', !music.muted, () => {
      music.toggleMute();
      this.render();
    });

    // Volume presets
    y += 4;
    const volLabel = this.add.text(panelLeft + 16, y, 'Volume', {
      fontSize: '11px', color: '#e0e4ee', fontFamily: 'monospace',
    }).setDepth(403);
    this.elements.push(volLabel);

    const volumes = [
      { label: 'Low', value: 0.15 },
      { label: 'Med', value: 0.3 },
      { label: 'High', value: 0.6 },
    ];
    const btnStartX = panelLeft + panelW - 16 - (70 * 3 + 8 * 2);
    volumes.forEach((v, i) => {
      const bx = btnStartX + i * 78 + 32;
      const isActive = Math.abs(music.volume - v.value) < 0.05;
      const bg = this.add.rectangle(bx, y + 8, 66, 24, isActive ? 0x224466 : 0x1a2840, 1)
        .setStrokeStyle(1, isActive ? 0x00ccee : 0x334466).setDepth(403)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(bx, y + 8, v.label, {
        fontSize: '10px', color: isActive ? '#00ccee' : '#667788', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(404);
      bg.on('pointerdown', () => {
        music.setVolume(v.value);
        this.render();
      });
      bg.on('pointerover', () => bg.setFillStyle(0x223355));
      bg.on('pointerout', () => bg.setFillStyle(isActive ? 0x224466 : 0x1a2840));
      this.elements.push(bg, txt);
    });
    y += 28;

    // SFX ON/OFF
    const sfxEnabled = localStorage.getItem('frostbite_sfx') !== 'off';
    y = this.addToggleRow(cx, panelLeft, panelW, y, 'SFX', sfxEnabled, () => {
      localStorage.setItem('frostbite_sfx', sfxEnabled ? 'off' : 'on');
      this.render();
    });

    // ═══ DISPLAY SECTION ═══
    y += 8;
    y = this.addSectionHeader(cx, panelLeft, y, 'DISPLAY');

    const isFs = this.scale.isFullscreen;
    y = this.addToggleRow(cx, panelLeft, panelW, y, 'Fullscreen', isFs, () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
      this.time.delayedCall(200, () => this.render());
    });

    // ═══ GAME SECTION ═══
    y += 8;
    y = this.addSectionHeader(cx, panelLeft, y, 'GAME');

    // Reset Tutorial
    y = this.addActionButton(cx, panelLeft, panelW, y, 'Reset Tutorial', '#e0e4ee', () => {
      try {
        localStorage.removeItem('frostbite_tutorial_done');
        localStorage.removeItem('frostbite_tutorial');
      } catch {}
      this.showConfirmation('Tutorial reset! Will show on next zone load.');
    });

    // Delete Save
    y = this.addActionButton(cx, panelLeft, panelW, y, 'Delete Save', '#ff6666', () => {
      this.showDeleteConfirm();
    });

    // ═══ INFO SECTION ═══
    y += 8;
    y = this.addSectionHeader(cx, panelLeft, y, 'INFO');

    const version = this.add.text(panelLeft + 16, y, 'Frostbite World v1.0', {
      fontSize: '10px', color: '#667788', fontFamily: 'monospace',
    }).setDepth(403);
    this.elements.push(version);
    y += 16;

    const chain = this.add.text(panelLeft + 16, y, 'Avalanche C-Chain', {
      fontSize: '10px', color: '#667788', fontFamily: 'monospace',
    }).setDepth(403);
    this.elements.push(chain);

    // Close hint
    const hint = this.add.text(cx, panelTop + panelH - 14, 'ESC to close', {
      fontSize: '9px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(403);
    this.elements.push(hint);
  }

  private addSectionHeader(_cx: number, panelLeft: number, y: number, title: string): number {
    const header = this.add.text(panelLeft + 16, y, title, {
      fontSize: '12px', color: '#00ccee', fontFamily: 'monospace', fontStyle: 'bold',
    }).setDepth(403);
    this.elements.push(header);

    const lineX = panelLeft + 16;
    const line = this.add.rectangle(lineX + 175, y + 16, 350, 1, 0x2a3348, 1)
      .setDepth(403);
    this.elements.push(line);

    return y + 24;
  }

  private addToggleRow(_cx: number, panelLeft: number, panelW: number, y: number, label: string, isOn: boolean, onClick: () => void): number {
    const lbl = this.add.text(panelLeft + 16, y + 4, label, {
      fontSize: '11px', color: '#e0e4ee', fontFamily: 'monospace',
    }).setDepth(403);
    this.elements.push(lbl);

    const btnX = panelLeft + panelW - 56;
    const bgColor = isOn ? 0x338844 : 0x553333;
    const bg = this.add.rectangle(btnX, y + 10, 70, 24, bgColor, 1)
      .setStrokeStyle(1, isOn ? 0x44aa55 : 0x884444).setDepth(403)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(btnX, y + 10, isOn ? 'ON' : 'OFF', {
      fontSize: '11px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(404);

    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
    this.elements.push(bg, txt);

    return y + 30;
  }

  private addActionButton(_cx: number, panelLeft: number, panelW: number, y: number, label: string, color: string, onClick: () => void): number {
    const btnW = panelW - 32;
    const btnX = panelLeft + panelW / 2;

    const bg = this.add.rectangle(btnX, y + 14, btnW, 28, 0x1a2840, 1)
      .setStrokeStyle(1, 0x334466).setDepth(403)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(btnX, y + 14, label, {
      fontSize: '11px', color, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(404);

    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setFillStyle(0x223355));
    bg.on('pointerout', () => bg.setFillStyle(0x1a2840));
    this.elements.push(bg, txt);

    return y + 34;
  }

  private showConfirmation(msg: string) {
    // Show a brief confirmation text that fades
    const cx = GAME_WIDTH / 2;
    const txt = this.add.text(cx, GAME_HEIGHT / 2 + 160, msg, {
      fontSize: '12px', color: '#44dd66', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(500);
    this.elements.push(txt);

    this.tweens.add({
      targets: txt, alpha: 0, y: txt.y - 20, delay: 2000, duration: 500,
      onComplete: () => txt.destroy(),
    });
  }

  private showDeleteConfirm() {
    // Overlay confirmation dialog
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5).setDepth(500);
    overlay.setInteractive();
    this.elements.push(overlay);

    const dialogBg = this.add.rectangle(cx, cy, 300, 140, 0x141a28, 1)
      .setStrokeStyle(2, 0xcc3333).setDepth(501);
    this.elements.push(dialogBg);

    const warn = this.add.text(cx, cy - 40, 'DELETE SAVE?', {
      fontSize: '14px', color: '#ff6666', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    this.elements.push(warn);

    const desc = this.add.text(cx, cy - 15, 'This cannot be undone!\nAll progress will be lost.', {
      fontSize: '10px', color: '#e0e4ee', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setDepth(502);
    this.elements.push(desc);

    // Confirm button
    const confirmBg = this.add.rectangle(cx - 60, cy + 30, 100, 30, 0x553333, 1)
      .setStrokeStyle(1, 0xcc3333).setDepth(502)
      .setInteractive({ useHandCursor: true });
    const confirmTxt = this.add.text(cx - 60, cy + 30, 'DELETE', {
      fontSize: '11px', color: '#ff6666', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(503);
    this.elements.push(confirmBg, confirmTxt);

    confirmBg.on('pointerdown', () => {
      PlayerState.get().deleteSave();
      this.showConfirmation('Save deleted! Restart to begin fresh.');
      // Remove dialog elements
      overlay.destroy();
      dialogBg.destroy();
      warn.destroy();
      desc.destroy();
      confirmBg.destroy();
      confirmTxt.destroy();
      cancelBg.destroy();
      cancelTxt.destroy();
    });
    confirmBg.on('pointerover', () => confirmBg.setFillStyle(0x773333));
    confirmBg.on('pointerout', () => confirmBg.setFillStyle(0x553333));

    // Cancel button
    const cancelBg = this.add.rectangle(cx + 60, cy + 30, 100, 30, 0x1a2840, 1)
      .setStrokeStyle(1, 0x334466).setDepth(502)
      .setInteractive({ useHandCursor: true });
    const cancelTxt = this.add.text(cx + 60, cy + 30, 'CANCEL', {
      fontSize: '11px', color: '#e0e4ee', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(503);
    this.elements.push(cancelBg, cancelTxt);

    cancelBg.on('pointerdown', () => {
      overlay.destroy();
      dialogBg.destroy();
      warn.destroy();
      desc.destroy();
      confirmBg.destroy();
      confirmTxt.destroy();
      cancelBg.destroy();
      cancelTxt.destroy();
    });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0x223355));
    cancelBg.on('pointerout', () => cancelBg.setFillStyle(0x1a2840));
  }

  private close() {
    this.events.emit('settings-closed');
    this.scene.stop();
  }
}
