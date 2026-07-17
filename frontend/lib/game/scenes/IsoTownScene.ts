import * as Phaser from 'phaser';
import { IsoBaseScene } from '../iso/IsoBaseScene';
import { ZoneTile, toScreen } from '../iso/core';
import { PlayerState } from '../PlayerState';
import { trackZoneVisit } from '../dailyQuests';
import { isTutorialDone, markTutorialDone, getTutorialSteps } from '../tutorial';
import { buildTownTiles } from '../maps/townTiles';
import { HUB_GAMES } from '../hub/hubGames';

// ---------------------------------------------------------------------------
// NPC idle chat lines
// ---------------------------------------------------------------------------
const NPC_CHATS: Record<string, string[]> = {
  elder: [
    'The frost winds are restless...',
    'I sense dark magic in the forest.',
    'Warriors grow stronger every day.',
    'The dungeon holds many secrets.',
    'Stay vigilant, young one.',
  ],
  merchant: [
    'Fine goods for sale!',
    'Best prices in Hearthvale!',
    'Need potions? I got potions!',
    'Every warrior needs good gear.',
    'Fresh stock just arrived!',
  ],
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoTownScene extends IsoBaseScene {
  constructor() {
    super('Town');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Town';

    // Track zone visit for daily explorer quest
    trackZoneVisit('Town');

    // Track market_research quest progress
    const mrQuest = state.quests.find(q => q.id === 'market_research' && !q.completed);
    if (mrQuest) {
      if (!state.flags.has('mr_visited_town')) {
        state.flags.add('mr_visited_town');
        mrQuest.progress = Math.min(mrQuest.target, mrQuest.progress + 1);
        if (mrQuest.progress >= mrQuest.target) mrQuest.completed = true;
        state.save();
      }
    }

    this.initZone(buildTownTiles(), 16, 22);

    // NPCs
    this.addNpcAt(6, 9, 'Elder Frost', 0xffdd44);
    this.addNpcAt(25, 9, 'Merchant Bjorn', 0xddaa44);

    // Hub bina tabelaları — kapının üstünde oyun adı
    for (const g of HUB_GAMES) {
      const pos = toScreen(g.door.tx, g.door.ty, 6);
      this.add.text(pos.x, pos.y - 8, `${g.icon} ${g.name}`, {
        fontSize: '9px', fontFamily: 'monospace', color: '#7fe3f5',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth((g.door.tx + g.door.ty) * 10 + g.door.ty + 9);
    }

    this.events.emit('zone-change', 'Hearthvale Town');

    // Tutorial for first-time players
    if (!isTutorialDone()) {
      this.time.delayedCall(1000, () => this.runTutorial());
    }
  }

  // -----------------------------------------------------------------------
  // Tutorial sequence
  // -----------------------------------------------------------------------
  private runTutorial(): void {
    const steps = getTutorialSteps();
    let stepIndex = 0;

    const showStep = () => {
      if (stepIndex >= steps.length) {
        markTutorialDone();
        return;
      }
      const step = steps[stepIndex];
      this.showDialog(step.speaker, step.message);

      // After dialog closes, advance to next step
      const checkClosed = () => {
        this.time.delayedCall(500, () => {
          if (!this.frozen) {
            stepIndex++;
            if (step.waitFor === 'move') {
              // Wait for player to move at least once
              const origTx = this.playerTx;
              const origTy = this.playerTy;
              const checkMove = this.time.addEvent({
                delay: 200,
                loop: true,
                callback: () => {
                  if (this.playerTx !== origTx || this.playerTy !== origTy) {
                    checkMove.destroy();
                    this.time.delayedCall(500, showStep);
                  }
                },
              });
            } else {
              this.time.delayedCall(800, showStep);
            }
          } else {
            // Dialog still open, check again
            this.time.delayedCall(200, checkClosed);
          }
        });
      };
      checkClosed();
    };

    showStep();
  }

  protected onInteract(tile: ZoneTile, tx: number, ty: number): void {
    if (!tile.interact) return;
    const state = PlayerState.get();

    switch (tile.interact) {
      case 'npc': {
        const npcId = tile.data?.id;
        if (npcId === 'elder') {
          this.handleElder(state, tx, ty);
        } else if (npcId === 'merchant') {
          this.handleMerchant(state, tx, ty);
        }
        break;
      }
      case 'shop':
        this.openShop();
        break;

      case 'inn': {
        state.hp = state.maxHp;
        this.showDialog('Innkeeper', [
          'Rest well, traveler.',
          'Your health has been restored!',
        ], tx, ty);
        this.events.emit('hp-change');
        break;
      }
      case 'exit_forest':
        this.exitToScene('Forest');
        break;

      case 'elder_house':
        this.showDialog("Elder's Tower", [
          'The door is locked.',
          'Elder Frost prefers to meet visitors outside.',
        ], tx, ty);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Elder quest chain
  // -----------------------------------------------------------------------
  private handleElder(state: PlayerState, tx: number, ty: number): void {
    // --- Quest 1: skeleton_hunt ---
    const q1 = state.quests.find(q => q.id === 'skeleton_hunt');
    if (!q1 && !state.flags.has('skeleton_quest_done')) {
      state.quests.push({
        id: 'skeleton_hunt', title: 'Forest Threat', description: 'Slay skeletons in the forest',
        objective: 'skeleton', target: 5, progress: 0,
        reward: { type: 'xp', amount: 50 }, completed: false, turnedIn: false,
      });
      this.showDialog('Elder Frost', [
        'Greetings, warrior.',
        'Skeletons have infested the forest to the east.',
        'Slay 5 of them and return to me.',
        'Quest accepted: Forest Threat',
      ], tx, ty);
      this.events.emit('quest-update');
      state.save();
      return;
    }
    if (q1 && !q1.completed) {
      this.showDialog('Elder Frost', [
        `Skeletons slain: ${q1.progress}/${q1.target}`,
        'Keep hunting in the forest to the east!',
      ], tx, ty);
      return;
    }
    if (q1 && q1.completed && !q1.turnedIn) {
      q1.turnedIn = true;
      state.addXp(q1.reward.amount);
      state.gold += 30;
      state.flags.add('skeleton_quest_done');
      this.showDialog('Elder Frost', [
        'You did it! The forest is safer now.',
        '+50 XP, +30 Gold',
        'Now... the dungeon to the north holds greater dangers.',
        'Find the Frost Key inside. We need it to seal the portal.',
      ], tx, ty);
      state.quests.push({
        id: 'dungeon_boss', title: 'The Frost Key', description: 'Defeat the dungeon boss',
        objective: 'boss_frost', target: 1, progress: 0,
        reward: { type: 'xp', amount: 150 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 2: dungeon_boss ---
    const q2 = state.quests.find(q => q.id === 'dungeon_boss');
    if (q2 && !q2.completed) {
      this.showDialog('Elder Frost', [
        'The Frost Dragon guards the key in the dungeon.',
        'Defeat it and bring the key back to me.',
      ], tx, ty);
      return;
    }
    if (q2 && q2.completed && !q2.turnedIn) {
      q2.turnedIn = true;
      state.addXp(q2.reward.amount);
      state.gold += 50;
      state.flags.add('dungeon_boss_done');
      this.showDialog('Elder Frost', [
        'The Frost Key! At last!',
        '+150 XP, +50 Gold',
        'But I sense more darkness stirring...',
        'Spiders have overrun the western forest clearings.',
      ], tx, ty);
      // Give Quest 3: spider_infestation
      state.quests.push({
        id: 'spider_infestation', title: 'Spider Infestation', description: 'Kill 8 spiders in the Forest',
        objective: 'spider', target: 8, progress: state.killCounts['spider'] || 0,
        reward: { type: 'xp', amount: 75 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 3: spider_infestation ---
    const q3 = state.quests.find(q => q.id === 'spider_infestation');
    if (q3 && !q3.completed) {
      this.showDialog('Elder Frost', [
        `Spiders slain: ${q3.progress}/${q3.target}`,
        'Clear the spiders from the forest!',
      ], tx, ty);
      return;
    }
    if (q3 && q3.completed && !q3.turnedIn) {
      q3.turnedIn = true;
      state.addXp(75);
      state.gold += 40;
      state.flags.add('spider_quest_done');
      // Reward: Spider Silk Armor
      state.addItem({
        id: 'spider_silk_armor', name: 'Spider Silk Armor', sprite: 'armor',
        type: 'armor', stat: { def: 6, spd: 2 }, stackable: false, count: 1,
      });
      this.showDialog('Elder Frost', [
        'Excellent work! The forest breathes easier.',
        '+75 XP, +40 Gold',
        'Received: Spider Silk Armor!',
        'Now, ghosts plague the dungeon depths...',
      ], tx, ty);
      // Give Quest 4: ghost_hunters
      state.quests.push({
        id: 'ghost_hunters', title: 'Ghost Hunters', description: 'Kill 5 ghosts in the Dungeon',
        objective: 'ghost', target: 5, progress: state.killCounts['ghost'] || 0,
        reward: { type: 'xp', amount: 100 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 4: ghost_hunters ---
    const q4 = state.quests.find(q => q.id === 'ghost_hunters');
    if (q4 && !q4.completed) {
      this.showDialog('Elder Frost', [
        `Ghosts vanquished: ${q4.progress}/${q4.target}`,
        'The dungeon spirits must be banished!',
      ], tx, ty);
      return;
    }
    if (q4 && q4.completed && !q4.turnedIn) {
      q4.turnedIn = true;
      state.addXp(100);
      state.gold += 50;
      state.flags.add('ghost_quest_done');
      this.showDialog('Elder Frost', [
        'The ghosts have been banished. Well done!',
        '+100 XP, +50 Gold',
        'But I sense the dragon\'s spirit reforming...',
        'A stronger Frost Dragon has risen. Defeat it again!',
      ], tx, ty);
      // Give Quest 5: dragon_revenge
      state.quests.push({
        id: 'dragon_revenge', title: 'Dragon\'s Revenge', description: 'Defeat the stronger Frost Dragon',
        objective: 'boss_frost_v2', target: 1, progress: 0,
        reward: { type: 'xp', amount: 200 }, completed: false, turnedIn: false,
      });
      // Allow boss to respawn as stronger version
      state.flags.delete('boss_defeated');
      state.flags.add('dragon_revenge_active');
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 5: dragon_revenge ---
    const q5 = state.quests.find(q => q.id === 'dragon_revenge');
    if (q5 && !q5.completed) {
      this.showDialog('Elder Frost', [
        'The Frost Dragon has returned, stronger than before.',
        'Go to the dungeon and end it once more!',
      ], tx, ty);
      return;
    }
    if (q5 && q5.completed && !q5.turnedIn) {
      q5.turnedIn = true;
      state.addXp(200);
      state.gold += 100;
      state.flags.add('dragon_revenge_done');
      this.showDialog('Elder Frost', [
        'Incredible! You have slain the empowered dragon!',
        '+200 XP, +100 Gold',
        'One last task... an ancient artifact is hidden',
        'in a secret chest deep within the dungeon.',
        'Find it and bring it back to me.',
      ], tx, ty);
      // Give Quest 6: ancient_artifact
      state.quests.push({
        id: 'ancient_artifact', title: 'Ancient Artifact', description: 'Find the hidden chest in the Dungeon and return to Elder',
        objective: 'ancient_artifact_found', target: 1, progress: 0,
        reward: { type: 'xp', amount: 150 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 6: ancient_artifact ---
    const q6 = state.quests.find(q => q.id === 'ancient_artifact');
    if (q6 && !q6.completed) {
      if (state.flags.has('ancient_chest_found')) {
        // Player found the chest, mark quest complete
        q6.progress = 1;
        q6.completed = true;
        q6.turnedIn = true;
        state.addXp(150);
        state.gold += 75;
        state.flags.add('ancient_artifact_done');
        this.showDialog('Elder Frost', [
          'The Ancient Artifact! You found it!',
          '+150 XP, +75 Gold',
          'With this, we can protect Hearthvale forever.',
          'You have proven yourself a true hero.',
        ], tx, ty);
        this.events.emit('quest-update');
        state.save();
      } else {
        this.showDialog('Elder Frost', [
          'Search the dungeon carefully.',
          'The ancient chest is hidden in a secret alcove.',
        ], tx, ty);
      }
      return;
    }

    // All elder quests done — idle chat
    const chatLines = NPC_CHATS.elder;
    const line = chatLines[Math.floor(Math.random() * chatLines.length)];
    this.showDialog('Elder Frost', [line], tx, ty);
  }

  // -----------------------------------------------------------------------
  // Merchant quest chain
  // -----------------------------------------------------------------------
  private handleMerchant(state: PlayerState, tx: number, ty: number): void {
    // --- Quest 7: supply_run ---
    const q7 = state.quests.find(q => q.id === 'supply_run');
    if (!q7 && !state.flags.has('supply_run_done') && state.flags.has('skeleton_quest_done')) {
      state.quests.push({
        id: 'supply_run', title: 'Supply Run', description: 'Collect bone shard, spider silk, and bat wing',
        objective: 'collect_materials', target: 3, progress: 0,
        reward: { type: 'xp', amount: 50 }, completed: false, turnedIn: false,
      });
      // Count already owned materials
      let prog = 0;
      if (state.hasItem('bone_shard')) prog++;
      if (state.hasItem('spider_silk_mat')) prog++;
      if (state.hasItem('bat_wing')) prog++;
      const q = state.quests.find(q => q.id === 'supply_run')!;
      q.progress = prog;
      if (prog >= 3) q.completed = true;
      this.showDialog('Merchant Bjorn', [
        'Hey there, warrior!',
        'I need some materials for my shop.',
        'Bring me a Bone Shard, Spider Silk, and a Bat Wing.',
        'Quest accepted: Supply Run',
      ], tx, ty);
      this.events.emit('quest-update');
      state.save();
      return;
    }
    if (q7 && !q7.completed) {
      // Re-check progress
      let prog = 0;
      if (state.hasItem('bone_shard')) prog++;
      if (state.hasItem('spider_silk_mat')) prog++;
      if (state.hasItem('bat_wing')) prog++;
      q7.progress = prog;
      if (prog >= 3) q7.completed = true;
      if (q7.completed) {
        // Turn in immediately
        q7.turnedIn = true;
        state.removeItem('bone_shard');
        state.removeItem('spider_silk_mat');
        state.removeItem('bat_wing');
        state.addXp(50);
        state.gold += 30;
        state.flags.add('supply_run_done');
        this.showDialog('Merchant Bjorn', [
          'Perfect! These materials are just what I needed.',
          '+50 XP, +30 Gold',
          'I have another task if you\'re interested...',
        ], tx, ty);
        // Give Quest 8: market_research
        state.quests.push({
          id: 'market_research', title: 'Market Research', description: 'Visit Forest, Dungeon, and return to Town',
          objective: 'visit_zones', target: 3, progress: 0,
          reward: { type: 'xp', amount: 40 }, completed: false, turnedIn: false,
        });
        // Reset zone visit flags for this quest
        state.flags.delete('mr_visited_town');
        state.flags.delete('mr_visited_forest');
        state.flags.delete('mr_visited_dungeon');
        // Mark town as visited since we're here
        state.flags.add('mr_visited_town');
        const mq = state.quests.find(q => q.id === 'market_research')!;
        mq.progress = 1;
        this.events.emit('quest-update');
        state.save();
      } else {
        const items: string[] = [];
        if (!state.hasItem('bone_shard')) items.push('Bone Shard');
        if (!state.hasItem('spider_silk_mat')) items.push('Spider Silk');
        if (!state.hasItem('bat_wing')) items.push('Bat Wing');
        this.showDialog('Merchant Bjorn', [
          `Materials: ${q7.progress}/${q7.target}`,
          `Still need: ${items.join(', ')}`,
          'Kill monsters — they drop what I need!',
        ], tx, ty);
      }
      return;
    }
    if (q7 && q7.completed && !q7.turnedIn) {
      q7.turnedIn = true;
      state.removeItem('bone_shard');
      state.removeItem('spider_silk_mat');
      state.removeItem('bat_wing');
      state.addXp(50);
      state.gold += 30;
      state.flags.add('supply_run_done');
      this.showDialog('Merchant Bjorn', [
        'Perfect! These materials are just what I needed.',
        '+50 XP, +30 Gold',
      ], tx, ty);
      // Give Quest 8: market_research
      state.quests.push({
        id: 'market_research', title: 'Market Research', description: 'Visit Forest, Dungeon, and return to Town',
        objective: 'visit_zones', target: 3, progress: 0,
        reward: { type: 'xp', amount: 40 }, completed: false, turnedIn: false,
      });
      state.flags.delete('mr_visited_town');
      state.flags.delete('mr_visited_forest');
      state.flags.delete('mr_visited_dungeon');
      state.flags.add('mr_visited_town');
      const mq = state.quests.find(q => q.id === 'market_research')!;
      mq.progress = 1;
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 8: market_research ---
    const q8 = state.quests.find(q => q.id === 'market_research');
    if (q8 && !q8.completed) {
      const visited: string[] = [];
      if (state.flags.has('mr_visited_town')) visited.push('Town');
      if (state.flags.has('mr_visited_forest')) visited.push('Forest');
      if (state.flags.has('mr_visited_dungeon')) visited.push('Dungeon');
      this.showDialog('Merchant Bjorn', [
        `Zones visited: ${visited.join(', ')} (${q8.progress}/${q8.target})`,
        'Visit the Forest and Dungeon, then come back!',
      ], tx, ty);
      return;
    }
    if (q8 && q8.completed && !q8.turnedIn) {
      q8.turnedIn = true;
      state.addXp(40);
      state.gold += 20;
      state.flags.add('market_research_done');
      this.showDialog('Merchant Bjorn', [
        'Great research! Now I know where to expand.',
        '+40 XP, +20 Gold',
        'Thanks for all your help, hero!',
      ], tx, ty);
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // No quests available or all done — open shop
    this.openShop();
  }

  // -----------------------------------------------------------------------
  // Shop
  // -----------------------------------------------------------------------
  private openShop(): void {
    this.freeze();
    this.scene.launch('Shop');
    this.scene.pause();

    this.scene.get('Shop').events.once('shop-closed', () => {
      this.scene.resume();
      this.unfreeze();
      this.events.emit('hp-change');
    });
  }
}
