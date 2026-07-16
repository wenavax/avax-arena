import * as Phaser from 'phaser';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, DISPLAY_TILE, SCALE } from '../config';
import { generateTownGround, getTownObjects, TOWN_SPAWN, MapObject } from '../maps/townMap';
import { Player } from '../Player';
import { PlayerState } from '../PlayerState';
import { DialogManager } from '../ui/DialogManager';
import { getObjectTint } from '../tints';

// NPC idle chat lines
const NPC_CHATS: Record<string, string[]> = {
  elder: [
    'The frost winds are restless...',
    'I sense dark magic in the forest.',
    'Warriors grow stronger every day.',
    'The dungeon holds many secrets.',
    'Stay vigilant, young one.',
    'The elements are out of balance.',
    'I remember when this land was peaceful.',
    'Trust your instincts in battle.',
  ],
  merchant: [
    'Fine goods for sale!',
    'Best prices in Hearthvale!',
    'Need potions? I got potions!',
    'Trade keeps the town alive.',
    'Fresh stock just arrived!',
    'Every warrior needs good gear.',
    'Come back with some gold!',
    'I traveled far for these wares.',
  ],
};

export class TownScene extends Phaser.Scene {
  player!: Player;
  colliders!: Phaser.Physics.Arcade.StaticGroup;
  interactables: MapObject[] = [];
  dialog!: DialogManager;
  private npcSprites: { id: string; x: number; y: number; sprite: Phaser.GameObjects.Sprite }[] = [];

  constructor() {
    super({ key: 'Town' });
  }

  create() {
    const state = PlayerState.get();
    state.lastZone = 'Town';

    const groundData = generateTownGround();
    const groundMap = this.make.tilemap({
      data: this.to2D(groundData, MAP_WIDTH),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = groundMap.addTilesetImage('ninja-floor', 'ninja-floor', TILE_SIZE, TILE_SIZE, 0, 0);
    if (tileset) {
      const layer = groundMap.createLayer(0, tileset, 0, 0);
      if (layer) {
        layer.setScale(SCALE);
      }
    }

    this.colliders = this.physics.add.staticGroup();

    const objects = getTownObjects();
    this.interactables = objects.filter(o => o.interact);

    for (const obj of objects) {
      const px = obj.x * DISPLAY_TILE + DISPLAY_TILE / 2;
      const py = obj.y * DISPLAY_TILE + DISPLAY_TILE / 2;
      const isNpc = obj.interact === 'npc';
      const npcScale = isNpc ? SCALE * 1.3 : SCALE;
      const spriteSheet = obj.sheet || 'tiles';
      const spr = this.add.sprite(px, py, spriteSheet, obj.tile).setScale(npcScale).setDepth(obj.y);

      // Apply tints to Kenney sprites
      const tint = getObjectTint(obj.tile);
      if (tint) spr.setTint(tint);

      // Torch animation — flickering glow + pulsing tint
      if (obj.data?.torch) {
        // Orange glow circle
        const torchGlow = this.add.circle(px, py, DISPLAY_TILE * 0.7, 0xff8800, 0.2).setDepth(obj.y - 0.5);
        this.tweens.add({
          targets: torchGlow,
          alpha: { from: 0.12, to: 0.3 },
          scaleX: { from: 0.9, to: 1.1 },
          scaleY: { from: 0.9, to: 1.1 },
          duration: 400 + Math.random() * 200,
          yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
        // Sprite flicker
        this.tweens.add({
          targets: spr,
          alpha: { from: 0.85, to: 1 },
          duration: 300 + Math.random() * 200,
          yoyo: true, repeat: -1,
        });
      }

      // NPC: bigger, floating animation, glow circle, name label, speech bubbles
      if (isNpc && obj.data?.name) {
        this.npcSprites.push({ id: obj.data.id, x: px, y: py, sprite: spr });

        // Glow circle behind NPC
        const glow = this.add.circle(px, py, DISPLAY_TILE * 0.6, 0xffdd00, 0.15).setDepth(obj.y - 0.5);
        this.tweens.add({
          targets: glow, alpha: { from: 0.08, to: 0.2 },
          duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        // Floating bob animation
        this.tweens.add({
          targets: spr, y: py - 4,
          duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        // Name label
        this.add.text(px, py - DISPLAY_TILE * 0.7 - 10, obj.data.name, {
          fontSize: '11px', color: '#ffee33', fontFamily: 'monospace', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(obj.y + 1);

        // [E] hint below
        this.add.text(px, py + DISPLAY_TILE * 0.6 + 4, '[E] Talk', {
          fontSize: '8px', color: '#aaaaaa', fontFamily: 'monospace',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(obj.y + 1);

        // Start speech bubble timer for this NPC
        this.startSpeechBubbles(obj.data.id, px, py, obj.y);
      }

      // Building labels
      if (obj.interact === 'inn') {
        this.add.text(px, py - DISPLAY_TILE / 2 - 8, 'Inn', {
          fontSize: '11px', color: '#55ddff', fontFamily: 'monospace', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setDepth(obj.y + 1);
      }
      if (obj.interact === 'shop') {
        this.add.text(px, py - DISPLAY_TILE / 2 - 8, 'Shop', {
          fontSize: '11px', color: '#55ddff', fontFamily: 'monospace', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setDepth(obj.y + 1);
      }

      if (obj.collision) {
        const blocker = this.colliders.create(px, py, undefined) as Phaser.Physics.Arcade.Sprite;
        blocker.setVisible(false);
        blocker.body?.setSize(DISPLAY_TILE - 4, DISPLAY_TILE - 4);
        (blocker.body as Phaser.Physics.Arcade.StaticBody).setOffset(
          -(DISPLAY_TILE - 4) / 2, -(DISPLAY_TILE - 4) / 2
        );
      }
    }

    const spawnX = state.spawnX || TOWN_SPAWN.x;
    const spawnY = state.spawnY || TOWN_SPAWN.y;
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, this.colliders);

    this.physics.world.setBounds(0, 0, MAP_WIDTH * DISPLAY_TILE, MAP_HEIGHT * DISPLAY_TILE);
    this.player.sprite.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * DISPLAY_TILE, MAP_HEIGHT * DISPLAY_TILE);

    this.dialog = new DialogManager(this);
    this.events.emit('zone-change', 'Hearthvale Town');
  }

  update() {
    this.player.update();
    this.dialog.update();

    if (this.player.isInteracting() && !this.dialog.isActive()) {
      this.checkInteraction();
    }

    this.checkExits();
  }

  private checkInteraction() {
    const facing = this.player.getFacingTile();
    const obj = this.interactables.find(o => o.x === facing.x && o.y === facing.y);
    if (!obj) return;

    if (obj.interact === 'npc') {
      this.handleNPC(obj);
    } else if (obj.interact === 'shop') {
      this.openShop();
    } else if (obj.interact === 'elder_house') {
      this.dialog.show('Elder\'s Tower', ['The door is locked.', 'Elder Frost prefers to meet visitors outside.']);
      this.player.freeze();
    } else if (obj.interact === 'inn') {
      const state = PlayerState.get();
      state.hp = state.maxHp;
      this.dialog.show('Innkeeper', ['Rest well, traveler.', 'Your health has been restored!']);
      this.player.freeze();
      this.events.emit('hp-change');
    }
  }

  private handleNPC(obj: MapObject) {
    const state = PlayerState.get();
    const npcId = obj.data?.id;

    if (npcId === 'elder') {
      const quest = state.quests.find(q => q.id === 'skeleton_hunt');
      if (quest && quest.completed && !quest.turnedIn) {
        quest.turnedIn = true;
        state.addXp(quest.reward.amount);
        state.gold += 30;
        state.flags.add('skeleton_quest_done');
        this.dialog.show('Elder Frost', [
          'You did it! The forest is safer now.',
          '+50 XP, +30 Gold',
          'Now... the dungeon to the north holds greater dangers.',
          'Find the Frost Key inside. We need it to seal the portal.',
        ]);
        state.quests.push({
          id: 'dungeon_boss', title: 'The Frost Key', description: 'Defeat the dungeon boss',
          objective: 'boss_frost', target: 1, progress: 0,
          reward: { type: 'xp', amount: 150 }, completed: false, turnedIn: false,
        });
        this.events.emit('quest-update');
      } else if (quest && !quest.completed) {
        this.dialog.show('Elder Frost', [
          `Skeletons slain: ${quest.progress}/${quest.target}`,
          'Keep hunting in the forest to the east!',
        ]);
      } else if (!quest && !state.flags.has('skeleton_quest_done')) {
        state.quests.push({
          id: 'skeleton_hunt', title: 'Forest Threat', description: 'Slay skeletons in the forest',
          objective: 'skeleton', target: 5, progress: 0,
          reward: { type: 'xp', amount: 50 }, completed: false, turnedIn: false,
        });
        this.dialog.show('Elder Frost', [
          'Greetings, warrior.',
          'Skeletons have infested the forest to the east.',
          'Slay 5 of them and return to me.',
          'Quest accepted: Forest Threat',
        ]);
        this.events.emit('quest-update');
      } else {
        this.dialog.show('Elder Frost', ['Thank you for your bravery, hero.']);
      }
      this.player.freeze();
    } else if (npcId === 'merchant') {
      this.openShop();
    }
  }

  private openShop() {
    this.player.freeze();
    this.scene.launch('Shop');
    this.scene.pause();

    this.scene.get('Shop').events.once('shop-closed', () => {
      this.scene.resume();
      this.player.unfreeze();
      this.events.emit('hp-change');
    });
  }

  private checkExits() {
    const tx = this.player.tileX;
    const ty = this.player.tileY;

    if (tx >= 38 && ty >= 13 && ty <= 16) {
      const state = PlayerState.get();
      state.spawnX = 1;
      state.spawnY = 15;
      this.scene.start('Forest');
    }
  }

  private startSpeechBubbles(npcId: string, x: number, y: number, depth: number) {
    const chats = NPC_CHATS[npcId];
    if (!chats || chats.length === 0) return;

    const showBubble = () => {
      if (this.dialog.isActive()) return;

      const line = chats[Math.floor(Math.random() * chats.length)];

      const padding = 8;
      const tempText = this.add.text(0, 0, line, {
        fontSize: '9px', fontFamily: 'monospace',
        wordWrap: { width: 140 },
      });
      const textW = Math.min(tempText.width + padding * 2, 160);
      const textH = tempText.height + padding * 2;
      tempText.destroy();

      const bubbleX = x;
      const bubbleY = y - DISPLAY_TILE - 20;

      const bg = this.add.rectangle(bubbleX, bubbleY, textW, textH, 0xffffff, 0.92)
        .setStrokeStyle(1.5, 0x333333)
        .setDepth(depth + 10)
        .setOrigin(0.5);

      const tail = this.add.triangle(
        bubbleX, bubbleY + textH / 2 + 4,
        -4, 0, 4, 0, 0, 6,
        0xffffff, 0.92
      ).setDepth(depth + 10);

      const txt = this.add.text(bubbleX, bubbleY, line, {
        fontSize: '9px', color: '#333333', fontFamily: 'monospace',
        wordWrap: { width: 140 }, align: 'center',
      }).setOrigin(0.5).setDepth(depth + 11);

      bg.setAlpha(0);
      tail.setAlpha(0);
      txt.setAlpha(0);
      this.tweens.add({ targets: [bg, tail, txt], alpha: 1, duration: 300 });

      this.time.delayedCall(3000, () => {
        this.tweens.add({
          targets: [bg, tail, txt], alpha: 0, duration: 500,
          onComplete: () => { bg.destroy(); tail.destroy(); txt.destroy(); },
        });
      });
    };

    const firstDelay = 2000 + Math.random() * 3000;
    this.time.delayedCall(firstDelay, () => {
      showBubble();
      this.time.addEvent({
        delay: 6000 + Math.random() * 6000,
        callback: showBubble,
        loop: true,
      });
    });
  }

  private to2D(flat: number[], width: number): number[][] {
    const result: number[][] = [];
    for (let y = 0; y < flat.length / width; y++) {
      result.push(flat.slice(y * width, (y + 1) * width));
    }
    return result;
  }
}
