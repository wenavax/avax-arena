import * as Phaser from 'phaser';
import { DISPLAY_TILE, TILE_SIZE, SCALE, tileIndex } from './config';
import { PlayerState } from './PlayerState';
import { PLAYER_TINTS } from './tints';

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  interactKey!: Phaser.Input.Keyboard.Key;
  speed = 160;
  facing: 'up' | 'down' | 'left' | 'right' = 'down';
  canMove = true;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const state = PlayerState.get();
    const px = x * DISPLAY_TILE + DISPLAY_TILE / 2;
    const py = y * DISPLAY_TILE + DISPLAY_TILE / 2;

    if (state.useNftSprite && state.nftTextureKey && scene.textures.exists(state.nftTextureKey)) {
      // Use NFT image as player sprite
      this.sprite = scene.physics.add.sprite(px, py, state.nftTextureKey);
      this.sprite.setDisplaySize(DISPLAY_TILE, DISPLAY_TILE);
    } else {
      // Fallback to Kenney sprite
      const frameIndex = this.getFrameIndex(state.playerClass);
      this.sprite = scene.physics.add.sprite(px, py, 'tiles', frameIndex);
      this.sprite.setScale(SCALE);
      const playerTint = PLAYER_TINTS[state.playerClass];
      if (playerTint) this.sprite.setTint(playerTint);
    }
    this.sprite.setSize(TILE_SIZE - 4, TILE_SIZE - 4);
    this.sprite.setDepth(10);

    scene.cameras.main.startFollow(this.sprite, true, 0.1, 0.1);
    scene.cameras.main.setZoom(1);

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.interactKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

      // I key = open inventory via HUD
      scene.input.keyboard.on('keydown-I', () => {
        const hud = scene.scene.get('HUD') as any;
        if (hud?.openInventory) hud.openInventory();
      });
    }
  }

  private getFrameIndex(cls: string): number {
    switch (cls) {
      case 'knight': return tileIndex(42, 0);
      case 'mage':   return tileIndex(43, 0);
      case 'archer': return tileIndex(44, 0);
      default:       return tileIndex(42, 0);
    }
  }

  update() {
    if (!this.canMove) {
      this.sprite.setVelocity(0);
      return;
    }

    const up = this.cursors?.up.isDown || this.wasd?.W.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.S.isDown;
    const left = this.cursors?.left.isDown || this.wasd?.A.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.D.isDown;

    let vx = 0;
    let vy = 0;

    if (left) { vx = -this.speed; this.facing = 'left'; }
    else if (right) { vx = this.speed; this.facing = 'right'; }

    if (up) { vy = -this.speed; this.facing = 'up'; }
    else if (down) { vy = this.speed; this.facing = 'down'; }

    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    this.sprite.setVelocity(vx, vy);
    this.sprite.setFlipX(this.facing === 'left');
  }

  get tileX(): number {
    return Math.floor(this.sprite.x / DISPLAY_TILE);
  }

  get tileY(): number {
    return Math.floor(this.sprite.y / DISPLAY_TILE);
  }

  isInteracting(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.interactKey);
  }

  getFacingTile(): { x: number; y: number } {
    let dx = 0, dy = 0;
    switch (this.facing) {
      case 'up': dy = -1; break;
      case 'down': dy = 1; break;
      case 'left': dx = -1; break;
      case 'right': dx = 1; break;
    }
    return { x: this.tileX + dx, y: this.tileY + dy };
  }

  freeze() { this.canMove = false; this.sprite.setVelocity(0); }
  unfreeze() { this.canMove = true; }
}
