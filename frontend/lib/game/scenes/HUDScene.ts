import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { PlayerState } from '../PlayerState';
import { ChatOverlay } from '../multiplayer/ChatOverlay';
import { music } from '../musicSystem';
import { Achievement, getUnlockedCount, getTotalCount, checkAndUnlock, buildStats } from '../achievements';

// Every zone scene key (must match sceneLoader) — the old hardcoded 5-zone list
// made BAG/Settings dead buttons inside the 13 expansion zones.
const WORLD_SCENE_KEYS = [
  'Town', 'Forest', 'Dungeon', 'IceCave', 'Volcano',
  'Crypt', 'Abyss', 'Sanctum', 'Swamp', 'Mines', 'Citadel', 'Necropolis',
  'FrostWastes', 'DemonGate', 'Ruins', 'VoidRealm', 'Forge', 'Eternal',
];

export class HUDScene extends Phaser.Scene {
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private mpBar!: Phaser.GameObjects.Rectangle;
  private mpText!: Phaser.GameObjects.Text;
  private xpBar!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private zoneText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private chatOverlay: ChatOverlay | null = null;
  private achievementText!: Phaser.GameObjects.Text;
  private achievementQueue: Achievement[] = [];
  private showingAchievement = false;

  constructor() {
    super({ key: 'HUD' });
  }

  create() {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;

    // ═══════════════════════════════════════════════════════
    // TOP-LEFT: Player Stats Panel (glassmorphism style)
    // ═══════════════════════════════════════════════════════
    const statPanel = this.add.graphics().setDepth(300);
    statPanel.fillStyle(0x0a0e18, 0.75);
    statPanel.fillRoundedRect(8, 6, 170, 82, 8);
    statPanel.lineStyle(1, 0x1a2a3a, 0.6);
    statPanel.strokeRoundedRect(8, 6, 170, 82, 8);
    // Inner highlight line at top
    statPanel.lineStyle(1, 0x2a4a5a, 0.5);
    statPanel.beginPath();
    statPanel.moveTo(18, 8);
    statPanel.lineTo(168, 8);
    statPanel.strokePath();
    // Subtle accent line at bottom
    statPanel.lineStyle(1, 0x00ccee, 0.15);
    statPanel.beginPath();
    statPanel.moveTo(18, 86);
    statPanel.lineTo(168, 86);
    statPanel.strokePath();

    // HP bar
    this.add.rectangle(16, 16, 154, 14, 0x1a1a2a).setOrigin(0).setDepth(300);
    this.hpBar = this.add.rectangle(17, 17, 152, 12, 0x00cc66).setOrigin(0).setDepth(301);
    // HP gradient highlight (top 40%)
    const hpHighlight = this.add.graphics().setDepth(301);
    hpHighlight.fillStyle(0x00ff88, 0.3);
    hpHighlight.fillRect(17, 17, 152, 5);
    // HP glass edge (1px bright top)
    const hpGlass = this.add.graphics().setDepth(301);
    hpGlass.fillStyle(0x44ffaa, 0.4);
    hpGlass.fillRect(17, 17, 152, 1);
    this.hpText = this.add.text(93, 22, '', {
      fontSize: '9px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(302);

    // MP bar
    this.add.rectangle(16, 33, 154, 10, 0x1a1a2a).setOrigin(0).setDepth(300);
    this.mpBar = this.add.rectangle(17, 34, 152, 8, 0x3366cc).setOrigin(0).setDepth(301);
    // MP gradient highlight (top 40%)
    const mpHighlight = this.add.graphics().setDepth(301);
    mpHighlight.fillStyle(0x5588ff, 0.3);
    mpHighlight.fillRect(17, 34, 152, 3);
    // MP glass edge (1px bright top)
    const mpGlass = this.add.graphics().setDepth(301);
    mpGlass.fillStyle(0x5588ff, 0.4);
    mpGlass.fillRect(17, 34, 152, 1);
    this.mpText = this.add.text(93, 37, '', {
      fontSize: '8px', color: '#aaccff', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(302);

    // XP bar (thin)
    this.add.rectangle(16, 46, 154, 6, 0x1a1a2a).setOrigin(0).setDepth(300);
    this.xpBar = this.add.rectangle(17, 47, 0, 4, 0x6666ff).setOrigin(0).setDepth(301);

    // Level + Gold line
    this.levelText = this.add.text(16, 55, '', {
      fontSize: '10px', color: '#00e5ff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setDepth(302);
    this.goldText = this.add.text(16, 69, '', {
      fontSize: '10px', color: '#ffd700', fontFamily: 'Arial, sans-serif',
    }).setDepth(302);

    // ═══════════════════════════════════════════════════════
    // TOP-CENTER: Zone Name
    // ═══════════════════════════════════════════════════════
    const zoneBg = this.add.graphics().setDepth(299);
    zoneBg.fillStyle(0x0a0e18, 0.75);
    zoneBg.fillRoundedRect(W / 2 - 100, 4, 200, 26, 6);
    // Outer glow around zone background
    zoneBg.lineStyle(1.5, 0x00e5ff, 0.3);
    zoneBg.strokeRoundedRect(W / 2 - 100, 4, 200, 26, 6);
    this.zoneText = this.add.text(W / 2, 16, '', {
      fontSize: '13px', color: '#00e5ff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(300);

    // ═══════════════════════════════════════════════════════
    // TOP-RIGHT: Action Buttons (professional pill buttons)
    // ═══════════════════════════════════════════════════════
    const btnY = 14;
    const btnH = 26;
    const btnR = 6;

    // Action buttons (center-right, away from minimap which is at W-154)
    const btnBaseX = W / 2 + 80;
    this.createHudButton(btnBaseX, btnY, 58, btnH, btnR, '⛓ Save', 0x1a3322, 0x44dd66, 0x2a4a32, () => this.saveToChain());
    const musicLabel = { text: '' };
    const musicBtn = this.createHudButton(btnBaseX + 64, btnY, 50, btnH, btnR, '', 0x1a2233, 0x00ccee, 0x2a3344, () => {
      music.toggleMute();
      musicLabel.text = music.muted ? '🔇' : '🔊';
      musicTxt.setText(musicLabel.text);
    });
    const musicTxt = this.add.text(btnBaseX + 89, btnY, music.muted ? '🔇' : '🔊', {
      fontSize: '14px', color: '#00ccee', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(302);
    this.createHudButton(btnBaseX + 120, btnY, 32, btnH, btnR, '⚙', 0x1a2233, 0x00ccee, 0x2a3344, () => this.openSettings());

    // ═══════════════════════════════════════════════════════
    // TOP-RIGHT: Quest Tracker
    // ═══════════════════════════════════════════════════════
    // Quest tracker below minimap area (minimap is ~46 to ~200 top-right, size 140)
    this.questText = this.add.text(W - 16, 210, '', {
      fontSize: '9px', color: '#889', fontFamily: 'Arial, sans-serif',
      align: 'right', wordWrap: { width: 140 },
    }).setOrigin(1, 0).setDepth(300);

    // ═══════════════════════════════════════════════════════
    // BOTTOM-RIGHT: Inventory Button (prominent)
    // ═══════════════════════════════════════════════════════
    this.createHudButton(W - 55, H - 30, 80, 36, 8, '🎒 BAG', 0x1a2840, 0x00ccee, 0x263050, () => this.openInventory());

    // ═══════════════════════════════════════════════════════
    // BOTTOM-LEFT: Controls hint (desktop only)
    // ═══════════════════════════════════════════════════════
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isMobile) {
      const hintBg = this.add.graphics().setDepth(299);
      hintBg.fillStyle(0x0a0e18, 0.5);
      hintBg.fillRoundedRect(8, H - 26, 280, 20, 4);
      this.add.text(14, H - 17, 'WASD Move  |  E Interact  |  I Bag  |  F Fullscreen', {
        fontSize: '8px', color: '#445566', fontFamily: 'Arial, sans-serif',
      }).setDepth(300);
    }

    // ═══════════════════════════════════════════════════════
    // Keyboard shortcuts
    // ═══════════════════════════════════════════════════════
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-F', () => {
        this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen();
      });
    }

    // Listen for events from world scenes.
    // Legacy direct wiring only reaches scenes already registered at HUD-create;
    // lazy-loaded expansion zones instead FORWARD these events onto the HUD's own
    // emitter (see IsoBaseScene.initZone), so subscribe there too.
    const sceneKeys = ['Town', 'Forest', 'Dungeon', 'IceCave', 'Volcano'];
    sceneKeys.forEach(key => {
      const s = this.scene.get(key);
      if (s) {
        s.events.on('zone-change', (name: string) => this.zoneText.setText(name));
        s.events.on('hp-change', () => this.refresh());
        s.events.on('quest-update', () => this.refresh());
      }
    });
    this.events.on('zone-change', (name: string) => this.zoneText.setText(name));
    this.events.on('hp-change', () => this.refresh());
    this.events.on('quest-update', () => this.refresh());

    // Chat overlay
    this.chatOverlay = new ChatOverlay(this);
    (window as any).__frostbitePlayerName = PlayerState.get().name;

    // Music init
    music.init();

    // Achievement counter (bottom-left, above controls hint)
    this.achievementText = this.add.text(14, GAME_HEIGHT - 46, '', {
      fontSize: '10px', color: '#ffd700', fontFamily: 'monospace',
      align: 'left',
    }).setOrigin(0, 0).setDepth(300);
    this.updateAchievementCounter();

    // Listen for achievement-check events (fired after battles, etc.)
    this.events.on('check-achievements', () => this.runAchievementCheck());

    this.refresh();
  }

  update() {
    this.refresh();
  }

  private refresh() {
    const state = PlayerState.get();

    const hpRatio = state.hp / state.maxHp;
    this.hpBar.width = 152 * hpRatio;
    this.hpBar.setFillStyle(hpRatio > 0.5 ? 0x00cc66 : hpRatio > 0.25 ? 0xccaa00 : 0xcc3333);
    this.hpText.setText(`HP ${state.hp}/${state.maxHp}`);

    const mpRatio = state.maxMp > 0 ? state.mp / state.maxMp : 0;
    this.mpBar.width = 152 * mpRatio;
    this.mpText.setText(`MP ${state.mp}/${state.maxMp}`);

    const xpRatio = state.xp / state.xpToNext;
    this.xpBar.width = 152 * xpRatio;

    this.levelText.setText(`Lv.${state.level} (${state.xp}/${state.xpToNext} XP)`);
    this.goldText.setText(`Gold: ${state.gold}`);

    const activeQuests = state.quests.filter(q => !q.turnedIn);
    if (activeQuests.length > 0) {
      const lines = activeQuests.map(q => {
        const status = q.completed ? 'DONE' : `${q.progress}/${q.target}`;
        return `${q.title}: ${status}`;
      });
      this.questText.setText('Quests:\n' + lines.join('\n'));
    } else {
      this.questText.setText('');
    }
  }

  // ─── Achievement System ───

  private updateAchievementCounter(): void {
    this.achievementText.setText(`\uD83C\uDFC6 ${getUnlockedCount()}/${getTotalCount()}`);
  }

  runAchievementCheck(): void {
    const state = PlayerState.get();
    const filledSlots = (['weapon', 'armor', 'accessory', 'ring'] as const)
      .filter(s => state.equipped[s] !== null).length;
    const completedQuests = state.quests.filter(q => q.turnedIn).length;

    // Build zone set from flags (scenes set flags like 'visited_IceCave')
    const zones = new Set<string>();
    for (const f of state.flags) {
      if (f.startsWith('visited_')) zones.add(f.replace('visited_', ''));
    }

    const stats = buildStats({
      level: state.level,
      currentGold: state.gold,
      equipSlotsFilled: filledSlots,
      questsCompleted: completedQuests,
      zonesVisited: zones,
      itemsCollected: state.inventory.length,
    });

    const newAchs = checkAndUnlock(stats);
    for (const ach of newAchs) {
      this.achievementQueue.push(ach);
      // Apply achievement rewards
      if (ach.reward.xp) state.addXp(ach.reward.xp);
      if (ach.reward.gold) state.gold += ach.reward.gold;
    }
    if (newAchs.length > 0) {
      state.save();
      this.updateAchievementCounter();
      this.processAchievementQueue();
    }
  }

  private processAchievementQueue(): void {
    if (this.showingAchievement || this.achievementQueue.length === 0) return;
    const ach = this.achievementQueue.shift()!;
    this.showAchievement(ach);
  }

  showAchievement(achievement: Achievement): void {
    this.showingAchievement = true;

    // Container for the popup
    const cx = GAME_WIDTH / 2;
    const startY = -80;
    const targetY = 50;

    // Background
    const bg = this.add.graphics().setDepth(500);
    bg.fillStyle(0x111122, 0.95);
    bg.fillRoundedRect(cx - 160, 0, 320, 70, 8);
    bg.lineStyle(2, 0xffd700, 1);
    bg.strokeRoundedRect(cx - 160, 0, 320, 70, 8);

    // Icon + Title
    const icon = this.add.text(cx - 140, 10, achievement.icon, {
      fontSize: '28px',
    }).setDepth(501);
    const title = this.add.text(cx - 105, 8, `Achievement Unlocked!`, {
      fontSize: '10px', color: '#ffd700', fontFamily: 'Arial, sans-serif',
    }).setDepth(501);
    const name = this.add.text(cx - 105, 22, achievement.title, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setDepth(501);
    const desc = this.add.text(cx - 105, 40, achievement.description, {
      fontSize: '9px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setDepth(501);

    // Reward text
    const rewards: string[] = [];
    if (achievement.reward.xp) rewards.push(`+${achievement.reward.xp} XP`);
    if (achievement.reward.gold) rewards.push(`+${achievement.reward.gold} Gold`);
    const rewardText = this.add.text(cx + 145, 40, rewards.join('  '), {
      fontSize: '9px', color: '#44dd66', fontFamily: 'monospace',
    }).setOrigin(1, 0).setDepth(501);

    // Group all elements
    const elements = [bg, icon, title, name, desc, rewardText];

    // Position off-screen initially
    const container = this.add.container(0, startY, elements).setDepth(500);

    // Play sound
    try { this.sound.play('coins', { volume: 0.5 }); } catch {}

    // Slide down
    this.tweens.add({
      targets: container,
      y: targetY,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // Auto-hide after 4 seconds
    this.time.delayedCall(4000, () => {
      this.tweens.add({
        targets: container,
        y: startY,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          container.destroy();
          this.showingAchievement = false;
          this.processAchievementQueue();
        },
      });
    });
  }

  // ── Professional pill button creator ──
  private createHudButton(
    x: number, y: number, w: number, h: number, r: number,
    label: string, bgColor: number, textColor: number, hoverColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Rectangle {
    const gfx = this.add.graphics().setDepth(300);
    gfx.fillStyle(bgColor, 0.8);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
    gfx.lineStyle(1, textColor, 0.25);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    // Inner highlight at top
    gfx.fillStyle(0xffffff, 0.08);
    gfx.fillRect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 1);

    if (label) {
      this.add.text(x, y, label, {
        fontSize: label.length > 4 ? '11px' : '13px',
        color: `#${textColor.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(301);
    }

    const hit = this.add.rectangle(x, y, w, h).setAlpha(0.001).setDepth(302)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);
    hit.on('pointerover', () => { gfx.clear(); gfx.fillStyle(hoverColor, 0.9); gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, r); gfx.lineStyle(1, textColor, 0.5); gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r); gfx.fillStyle(0xffffff, 0.12); gfx.fillRect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 1); });
    hit.on('pointerout', () => { gfx.clear(); gfx.fillStyle(bgColor, 0.8); gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, r); gfx.lineStyle(1, textColor, 0.25); gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r); gfx.fillStyle(0xffffff, 0.08); gfx.fillRect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 1); });
    return hit;
  }

  openInventory() {
    if (this.scene.isActive('Inventory') || this.scene.isActive('Shop') || this.scene.isActive('Battle') || this.scene.isActive('CharacterSelect') || this.scene.isActive('Settings')) return;

    let activeWorld = '';
    for (const key of WORLD_SCENE_KEYS) {
      if (this.scene.isActive(key)) { activeWorld = key; break; }
    }
    if (!activeWorld) return;

    const ws = this.scene.get(activeWorld) as any;
    if (ws?.player) ws.player.freeze();
    ws?.freeze?.();
    this.scene.launch('Inventory');
    this.scene.get('Inventory').events.once('inventory-closed', () => {
      if (ws?.player) ws.player.unfreeze();
      ws?.unfreeze?.();
      this.refresh();
    });
  }

  openSettings() {
    if (this.scene.isActive('Settings') || this.scene.isActive('Inventory') || this.scene.isActive('Shop') || this.scene.isActive('Battle') || this.scene.isActive('CharacterSelect')) return;

    let activeWorld = '';
    for (const key of WORLD_SCENE_KEYS) {
      if (this.scene.isActive(key)) { activeWorld = key; break; }
    }
    if (!activeWorld) return;

    const ws = this.scene.get(activeWorld) as any;
    if (ws?.player) ws.player.freeze();
    ws?.freeze?.();
    this.scene.launch('Settings');
    this.scene.get('Settings').events.once('settings-closed', () => {
      if (ws?.player) ws.player.unfreeze();
      ws?.unfreeze?.();
      this.refresh();
    });
  }

  // ── On-chain save ──
  private async saveToChain(): Promise<void> {
    const wallet = (window as any).__frostbiteWallet;
    if (!wallet?.authenticated) {
      this.showSaveStatus('Connect wallet first!', '#ff4444');
      return;
    }

    const state = PlayerState.get();
    this.showSaveStatus('Saving to chain...', '#ffaa00');

    try {
      // Use window.ethereum provider directly
      const provider = (window as any).ethereum;
      if (!provider) {
        this.showSaveStatus('No wallet provider!', '#ff4444');
        return;
      }

      const { ethers } = await import('ethers');
      const web3Provider = new ethers.BrowserProvider(provider);
      const signer = await web3Provider.getSigner();

      // Import contract details
      const { PROGRESS_CONTRACT, PROGRESS_ABI, questsToBitmask, equipTier, ZONE_INDEX } = await import('../nft/onchain');

      const contract = new ethers.Contract(PROGRESS_CONTRACT, PROGRESS_ABI as any, signer);

      const zoneIdx = ZONE_INDEX[state.lastZone] || 0;
      const qFlags = questsToBitmask(state.quests);
      const wTier = equipTier(state.equipped.weapon);
      const aTier = equipTier(state.equipped.armor);
      const accTier = equipTier(state.equipped.accessory);
      const rTier = equipTier(state.equipped.ring);
      const totalKills = Object.values(state.killCounts).reduce((a, b) => a + b, 0);
      const bossKills = (state.killCounts['boss_frost'] || 0) + (state.killCounts['boss_frost_v2'] || 0) +
                        (state.killCounts['crystal_wyrm'] || 0) + (state.killCounts['infernal_dragon'] || 0);

      const tx = await contract.saveProgress(
        state.level, zoneIdx, state.xp, state.gold,
        qFlags, wTier, aTier, accTier, rTier,
        totalKills, bossKills, state.nftTokenId || 0
      );
      await tx.wait();

      this.showSaveStatus('Saved to chain!', '#44dd66');
    } catch (e: any) {
      this.showSaveStatus(`Error: ${e.shortMessage || e.message?.slice(0, 40) || 'Failed'}`, '#ff4444');
    }
  }

  private showSaveStatus(msg: string, color: string): void {
    const txt = this.add.text(GAME_WIDTH / 2, 40, msg, {
      fontSize: '13px', color, fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(400);

    this.tweens.add({
      targets: txt, alpha: 0, y: 30, delay: 2500, duration: 500,
      onComplete: () => txt.destroy(),
    });
  }
}
