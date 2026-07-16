import * as Phaser from 'phaser';
import { DISPLAY_TILE, TILE_SIZE, SCALE } from '../config';
import { generateDungeonGround, getDungeonObjects, DUNGEON_MONSTERS, DUNGEON_SIZE, DUNGEON_SPAWN, BOSS_DATA } from '../maps/dungeonMap';
import { Player } from '../Player';
import { PlayerState } from '../PlayerState';
import { Monster } from '../Monster';
import { DialogManager } from '../ui/DialogManager';
import { getObjectTint } from '../tints';

export class DungeonScene extends Phaser.Scene {
  player!: Player;
  colliders!: Phaser.Physics.Arcade.StaticGroup;
  monsters: Monster[] = [];
  interactables: any[] = [];
  dialog!: DialogManager;

  constructor() {
    super({ key: 'Dungeon' });
  }

  create() {
    const state = PlayerState.get();
    state.lastZone = 'Dungeon';

    const groundData = generateDungeonGround();
    const groundMap = this.make.tilemap({
      data: this.to2D(groundData, DUNGEON_SIZE),
      tileWidth: TILE_SIZE, tileHeight: TILE_SIZE,
    });
    const tileset = groundMap.addTilesetImage('ninja-interior', 'ninja-interior', TILE_SIZE, TILE_SIZE, 0, 0);
    if (tileset) {
      const layer = groundMap.createLayer(0, tileset, 0, 0);
      if (layer) {
        layer.setScale(SCALE);
      }
    }

    const worldW = DUNGEON_SIZE * DISPLAY_TILE;
    const worldH = DUNGEON_SIZE * DISPLAY_TILE;
    this.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, 0x000000, 0.3).setDepth(0.5);

    this.colliders = this.physics.add.staticGroup();
    const objects = getDungeonObjects();
    this.interactables = objects.filter(o => o.interact);

    for (const obj of objects) {
      const px = obj.x * DISPLAY_TILE + DISPLAY_TILE / 2;
      const py = obj.y * DISPLAY_TILE + DISPLAY_TILE / 2;
      const isBoss = obj.interact === 'boss';
      const objScale = isBoss ? SCALE * 1.5 : SCALE;
      const spriteSheet = obj.sheet || 'tiles';
      const spr = this.add.sprite(px, py, spriteSheet, obj.tile).setScale(objScale).setDepth(obj.y);

      // Apply tints to Kenney sprites
      const tint = getObjectTint(obj.tile);
      if (tint) spr.setTint(tint);

      // Torch flickering animation
      if (obj.data?.torch) {
        const torchGlow = this.add.circle(px, py, DISPLAY_TILE * 0.8, 0xff6600, 0.25).setDepth(obj.y - 0.5);
        this.tweens.add({
          targets: torchGlow,
          alpha: { from: 0.15, to: 0.35 },
          scaleX: { from: 0.85, to: 1.15 },
          scaleY: { from: 0.85, to: 1.15 },
          duration: 350 + Math.random() * 250,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: spr,
          alpha: { from: 0.8, to: 1 },
          duration: 250 + Math.random() * 200,
          yoyo: true, repeat: -1,
        });
      }

      // Boss: bigger, red glow, pulsing, name label
      if (isBoss && obj.data?.name) {
        const glow = this.add.circle(px, py, DISPLAY_TILE * 0.8, 0xff3333, 0.2).setDepth(obj.y - 0.5);
        this.tweens.add({
          targets: glow, alpha: { from: 0.1, to: 0.3 }, scaleX: { from: 1, to: 1.2 }, scaleY: { from: 1, to: 1.2 },
          duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: spr, y: py - 3,
          duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.add.text(px, py - DISPLAY_TILE * 0.9 - 8, obj.data.name, {
          fontSize: '12px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(obj.y + 1);
        this.add.text(px, py + DISPLAY_TILE * 0.8, '[E] Challenge', {
          fontSize: '8px', color: '#ff8888', fontFamily: 'monospace',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(obj.y + 1);
      }

      if (obj.collision) {
        const b = this.colliders.create(px, py, undefined) as Phaser.Physics.Arcade.Sprite;
        b.setVisible(false);
        b.body?.setSize(DISPLAY_TILE - 4, DISPLAY_TILE - 4);
        (b.body as Phaser.Physics.Arcade.StaticBody).setOffset(-(DISPLAY_TILE - 4) / 2, -(DISPLAY_TILE - 4) / 2);
      }
    }

    // Spawn player first
    const spawnX = state.spawnX || DUNGEON_SPAWN.x;
    const spawnY = state.spawnY || DUNGEON_SPAWN.y;
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, this.colliders);

    // Monsters
    for (const mData of DUNGEON_MONSTERS) {
      const monster = new Monster(this, mData.x, mData.y, mData.tile, mData.type, mData.level);
      this.monsters.push(monster);
      this.physics.add.overlap(this.player.sprite, monster.sprite, () => this.startBattle(monster));
    }

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.player.sprite.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.dialog = new DialogManager(this);
    this.events.emit('zone-change', 'Frost Dungeon');
  }

  update(time: number) {
    this.player.update();
    this.dialog.update();
    this.monsters.forEach(m => m.update(time));

    if (this.player.isInteracting() && !this.dialog.isActive()) this.checkInteraction();
    this.checkExits();
  }

  private checkInteraction() {
    const facing = this.player.getFacingTile();
    const obj = this.interactables.find((o: any) => o.x === facing.x && o.y === facing.y);
    if (!obj) return;

    const state = PlayerState.get();

    if (obj.interact === 'boss') {
      if (state.flags.has('boss_defeated')) {
        this.dialog.show('Frost Dragon', ['The dragon lies defeated...']);
        this.player.freeze(); // DialogManager.close() calls player.unfreeze()
        return;
      } else {
        this.player.freeze();
        this.dialog.show('Frost Dragon', [
          'YOU DARE ENTER MY DOMAIN?',
          'I am the guardian of the Frost Key.',
          'Prepare yourself, mortal!',
        ]);
        const checkDialog = () => {
          if (!this.dialog.isActive()) {
            this.startBossFight();
          } else {
            this.time.delayedCall(100, checkDialog);
          }
        };
        this.time.delayedCall(500, checkDialog);
      }
    } else if (obj.interact === 'chest') {
      if (!state.flags.has(obj.data.id)) {
        state.flags.add(obj.data.id);
        state.addItem({
          id: 'potion_hp', name: 'Health Potion', sprite: 'potion',
          type: 'potion', stat: { hp: 40 }, stackable: true, count: 2,
        });
        state.gold += 25;
        this.dialog.show('Chest', ['Found: 2x Health Potion, 25 Gold!']);
        this.player.freeze();
        try { this.sound.play('coins', { volume: 0.5 }); } catch {}
      } else {
        this.dialog.show('Chest', ['Already opened.']);
        this.player.freeze();
      }
    }
  }

  private startBossFight() {
    this.player.freeze();
    this.scene.launch('Battle', { monster: { ...BOSS_DATA }, returnScene: 'Dungeon' });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.player.unfreeze();
      if (result.won) {
        const state = PlayerState.get();
        state.flags.add('boss_defeated');
        state.addKill('boss_frost');
        state.addItem({
          id: 'frost_key', name: 'Frost Key', sprite: 'key',
          type: 'quest', stackable: false, count: 1,
        });
        this.dialog.show('Victory!', [
          'The Frost Dragon has been defeated!',
          'You found the Frost Key!',
          'Return to Elder Frost in town.',
        ]);
        this.player.freeze();
        this.events.emit('quest-update');
        this.events.emit('hp-change');
      }
    });
  }

  private startBattle(monster: Monster) {
    if (!monster.alive || this.dialog.isActive()) return;
    this.player.freeze();
    this.scene.launch('Battle', { monster: monster.data, returnScene: 'Dungeon' });
    this.scene.pause();

    this.scene.get('Battle').events.once('battle-end', (result: { won: boolean }) => {
      this.scene.resume();
      this.player.unfreeze();
      if (result.won) {
        monster.destroy();
        this.monsters = this.monsters.filter(m => m !== monster);
        PlayerState.get().addKill(monster.data.type);
        this.events.emit('quest-update');
        this.events.emit('hp-change');
      }
    });
  }

  private checkExits() {
    const ty = this.player.tileY;
    const tx = this.player.tileX;
    if (ty >= 19 && tx >= 8 && tx <= 11) {
      const state = PlayerState.get();
      state.spawnX = 19;
      state.spawnY = 3;
      this.scene.start('Forest');
    }
  }

  private to2D(flat: number[], width: number): number[][] {
    const result: number[][] = [];
    for (let y = 0; y < flat.length / width; y++) {
      result.push(flat.slice(y * width, (y + 1) * width));
    }
    return result;
  }
}
