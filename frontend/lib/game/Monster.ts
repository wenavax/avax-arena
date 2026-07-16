import * as Phaser from 'phaser';
import { DISPLAY_TILE, SCALE } from './config';
import { getObjectTint } from './tints';

export interface MonsterData {
  type: string;
  tile: number;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  xpReward: number;
  goldReward: number;
  element?: string;
  /** Set by iso zone scenes for the 15% elite variants */
  isElite?: boolean;
}

export class Monster {
  sprite: Phaser.Physics.Arcade.Sprite;
  data: MonsterData;
  private nameLabel: Phaser.GameObjects.Text;
  private moveTimer: number = 0;
  private targetX: number;
  private targetY: number;
  alive = true;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, tile: number, type: string, level: number) {
    const px = tileX * DISPLAY_TILE + DISPLAY_TILE / 2;
    const py = tileY * DISPLAY_TILE + DISPLAY_TILE / 2;
    this.targetX = px;
    this.targetY = py;

    this.sprite = scene.physics.add.sprite(px, py, 'tiles', tile);
    this.sprite.setScale(SCALE);
    this.sprite.setDepth(5);
    this.sprite.setImmovable(true);
    const tint = getObjectTint(tile);
    if (tint) this.sprite.setTint(tint);

    // Name label above monster
    this.nameLabel = scene.add.text(px, py - DISPLAY_TILE / 2 - 4, `${type} Lv.${level}`, {
      fontSize: '8px', color: '#ff8888', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(6);

    const baseHp = 30 + level * 12;
    const baseAtk = 5 + level * 2.5;
    const baseDef = 3 + level * 1.5;
    const baseSpd = 3 + level * 1;
    const variance = () => 0.85 + Math.random() * 0.3;

    this.data = {
      type, tile, level,
      maxHp: Math.floor(baseHp * variance()),
      hp: 0,
      atk: Math.floor(baseAtk * variance()),
      def: Math.floor(baseDef * variance()),
      spd: Math.floor(baseSpd * variance()),
      xpReward: 10 + level * 5,
      goldReward: 2 + Math.floor(Math.random() * level * 3),
    };
    this.data.hp = this.data.maxHp;
  }

  update(time: number) {
    if (!this.alive) return;

    if (time > this.moveTimer) {
      this.moveTimer = time + 2000 + Math.random() * 2000;
      const dx = (Math.random() - 0.5) * DISPLAY_TILE * 2;
      const dy = (Math.random() - 0.5) * DISPLAY_TILE * 2;
      this.targetX = this.sprite.x + dx;
      this.targetY = this.sprite.y + dy;
    }

    const speed = 20;
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 4) {
      this.sprite.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      this.sprite.setFlipX(dx < 0);
    } else {
      this.sprite.setVelocity(0);
    }

    // Move label with sprite
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - DISPLAY_TILE / 2 - 4);
  }

  destroy() {
    this.alive = false;
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
