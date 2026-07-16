import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

export class DialogManager {
  private scene: Phaser.Scene;
  private bg: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private lineIndex = 0;
  private active = false;
  private advanceKey: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.bg = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 70, GAME_WIDTH - 40, 120, 0x0a0a1a, 0.92)
      .setStrokeStyle(2, 0x00e5ff).setScrollFactor(0).setDepth(100).setVisible(false);

    this.nameText = scene.add.text(40, GAME_HEIGHT - 125, '', {
      fontSize: '14px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(101).setVisible(false);

    this.bodyText = scene.add.text(40, GAME_HEIGHT - 105, '', {
      fontSize: '13px', color: '#e0e0e0', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 80 },
    }).setScrollFactor(0).setDepth(101).setVisible(false);

    this.hint = scene.add.text(GAME_WIDTH - 60, GAME_HEIGHT - 25, '[E]', {
      fontSize: '11px', color: '#00e5ff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(101).setVisible(false);

    this.advanceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  show(speaker: string, lines: string[]) {
    this.lines = lines;
    this.lineIndex = 0;
    this.active = true;
    this.nameText.setText(speaker);
    this.bodyText.setText(lines[0]);
    this.bg.setVisible(true);
    this.nameText.setVisible(true);
    this.bodyText.setVisible(true);
    this.hint.setVisible(true);
    this.advanceKey.reset();
  }

  update() {
    if (!this.active) return;
    if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) {
      this.lineIndex++;
      if (this.lineIndex >= this.lines.length) {
        this.close();
      } else {
        this.bodyText.setText(this.lines[this.lineIndex]);
      }
    }
  }

  close() {
    this.active = false;
    this.bg.setVisible(false);
    this.nameText.setVisible(false);
    this.bodyText.setVisible(false);
    this.hint.setVisible(false);
    const s = this.scene as any;
    if (s.player) s.player.unfreeze();
  }

  isActive(): boolean { return this.active; }
}
