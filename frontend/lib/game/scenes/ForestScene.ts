import * as Phaser from 'phaser';
import { DISPLAY_TILE, TILE_SIZE, SCALE } from '../config';
import { generateForestGround, getForestObjects, FOREST_SPAWNS, FOREST_SPAWN, SpawnZone } from '../maps/forestMap';
import { Player } from '../Player';
import { PlayerState } from '../PlayerState';
import { Monster } from '../Monster';
import { DialogManager } from '../ui/DialogManager';
import { getObjectTint } from '../tints';

const F_MAP_SIZE = 40;

export class ForestScene extends Phaser.Scene {
  player!: Player;
  colliders!: Phaser.Physics.Arcade.StaticGroup;
  monsters: Monster[] = [];
  interactables: any[] = [];
  dialog!: DialogManager;
  private spawnTimer = 0;

  constructor() {
    super({ key: 'Forest' });
  }

  create() {
    const state = PlayerState.get();
    state.lastZone = 'Forest';

    const groundData = generateForestGround();
    const groundMap = this.make.tilemap({
      data: this.to2D(groundData, F_MAP_SIZE),
      tileWidth: TILE_SIZE, tileHeight: TILE_SIZE,
    });
    const tileset = groundMap.addTilesetImage('ninja-floor', 'ninja-floor', TILE_SIZE, TILE_SIZE, 0, 0);
    if (tileset) {
      const layer = groundMap.createLayer(0, tileset, 0, 0);
      if (layer) {
        layer.setScale(SCALE);
      }
    }

    this.colliders = this.physics.add.staticGroup();
    const objects = getForestObjects();
    this.interactables = objects.filter(o => o.interact);

    for (const obj of objects) {
      const px = obj.x * DISPLAY_TILE + DISPLAY_TILE / 2;
      const py = obj.y * DISPLAY_TILE + DISPLAY_TILE / 2;
      const spriteSheet = obj.sheet || 'tiles';
      const spr = this.add.sprite(px, py, spriteSheet, obj.tile).setScale(SCALE).setDepth(obj.y);

      // Apply tints to Kenney sprites
      const tint = getObjectTint(obj.tile);
      if (tint) spr.setTint(tint);

      if (obj.collision) {
        const b = this.colliders.create(px, py, undefined) as Phaser.Physics.Arcade.Sprite;
        b.setVisible(false);
        b.body?.setSize(DISPLAY_TILE - 4, DISPLAY_TILE - 4);
        (b.body as Phaser.Physics.Arcade.StaticBody).setOffset(-(DISPLAY_TILE - 4) / 2, -(DISPLAY_TILE - 4) / 2);
      }
    }

    const spawnX = state.spawnX || FOREST_SPAWN.x;
    const spawnY = state.spawnY || FOREST_SPAWN.y;
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, this.colliders);

    const worldW = F_MAP_SIZE * DISPLAY_TILE;
    const worldH = F_MAP_SIZE * DISPLAY_TILE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.player.sprite.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.spawnMonsters();

    this.dialog = new DialogManager(this);
    this.events.emit('zone-change', 'Whispering Forest');
  }

  update(time: number) {
    this.player.update();
    this.dialog.update();
    this.monsters.forEach(m => m.update(time));

    if (this.player.isInteracting() && !this.dialog.isActive()) this.checkInteraction();
    this.checkExits();

    if (time > this.spawnTimer) {
      this.spawnTimer = time + 10000;
      this.respawnMonsters();
    }
  }

  private spawnMonsters() {
    for (const zone of FOREST_SPAWNS) {
      for (let i = 0; i < zone.maxActive; i++) {
        this.spawnOneMonster(zone);
      }
    }
  }

  private spawnOneMonster(zone: SpawnZone) {
    const totalWeight = zone.monsters.reduce((s, m) => s + m.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = zone.monsters[0];
    for (const m of zone.monsters) {
      roll -= m.weight;
      if (roll <= 0) { chosen = m; break; }
    }

    const tx = zone.x + Math.floor(Math.random() * zone.w);
    const ty = zone.y + Math.floor(Math.random() * zone.h);
    const level = zone.level[0] + Math.floor(Math.random() * (zone.level[1] - zone.level[0] + 1));

    const monster = new Monster(this, tx, ty, chosen.tile, chosen.type, level);
    this.monsters.push(monster);
    this.physics.add.overlap(this.player.sprite, monster.sprite, () => this.startBattle(monster));
  }

  private respawnMonsters() {
    for (const zone of FOREST_SPAWNS) {
      const active = this.monsters.filter(m => m.alive &&
        m.sprite.x >= zone.x * DISPLAY_TILE && m.sprite.x < (zone.x + zone.w) * DISPLAY_TILE &&
        m.sprite.y >= zone.y * DISPLAY_TILE && m.sprite.y < (zone.y + zone.h) * DISPLAY_TILE
      ).length;
      if (active < zone.maxActive) {
        this.spawnOneMonster(zone);
      }
    }
  }

  private startBattle(monster: Monster) {
    if (!monster.alive || this.dialog.isActive()) return;
    this.player.freeze();
    this.scene.launch('Battle', { monster: monster.data, returnScene: 'Forest' });
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

  private checkInteraction() {
    // No NPCs in forest
  }

  private checkExits() {
    const tx = this.player.tileX;
    const ty = this.player.tileY;
    const state = PlayerState.get();

    if (tx <= 0 && ty >= 13 && ty <= 17) {
      state.spawnX = 37;
      state.spawnY = 15;
      this.scene.start('Town');
    }

    if (ty <= 1 && tx >= 17 && tx <= 21) {
      state.spawnX = 10;
      state.spawnY = 18;
      this.scene.start('Dungeon');
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
