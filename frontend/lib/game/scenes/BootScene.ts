import * as Phaser from 'phaser';
import { TILE_SIZE, TILE_GAP, SPRITE_SHEET_PATH, GAME_WIDTH, GAME_HEIGHT } from '../config';

export class BootScene extends Phaser.Scene {
  // Spritesheets the world can't render without; SFX failures are benign
  // (every play() is try/catch'd) so they only log
  private static CRITICAL_ASSETS = new Set(['tiles', 'ninja-floor', 'ninja-village', 'ninja-interior']);
  private failedCritical: string[] = [];

  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    // Loading bar (bottom)
    const barY = h * 0.75;
    const bar = this.add.rectangle(w / 2, barY, 300, 16, 0x1a2a3a);
    const fill = this.add.rectangle(w / 2 - 148, barY, 4, 12, 0x00e5ff);
    const loadText = this.add.text(w / 2, barY + 20, 'Loading...', {
      fontSize: '11px', color: '#4488aa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.load.on('progress', (p: number) => {
      fill.width = 296 * p;
      fill.x = w / 2 - 148 + (296 * p) / 2;
    });
    this.load.on('complete', () => {
      bar.destroy(); fill.destroy(); loadText.destroy();
    });
    // Without this, a failed asset (bad deploy, offline, ad-blocker) left a
    // silent black screen — the loader "completes" and the world renders void
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[Boot] asset failed to load: ${file.key} (${file.url})`);
      if (BootScene.CRITICAL_ASSETS.has(file.key)) this.failedCritical.push(file.key);
    });

    // Load spritesheet
    this.load.spritesheet('tiles', SPRITE_SHEET_PATH, {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
      spacing: TILE_GAP,
      margin: 0,
    });

    // Ninja Adventure tilesets (colorful, no tint needed)
    this.load.spritesheet('ninja-floor', '/avalanche/sprites/ninja-floor.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('ninja-village', '/avalanche/sprites/ninja-village.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('ninja-interior', '/avalanche/sprites/ninja-interior.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });

    // Monster/prop sprite sheets (visual upgrade). Non-critical: eşlemesiz
    // tipler prosedürel fallback'e düşer, dünya sprite'sız da render olur.
    this.load.spritesheet('tiny-dungeon', '/avalanche/sprites/tiny-dungeon.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('tiny-battle', '/avalanche/sprites/tiny-battle.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });

    // Load SFX
    const sfxFiles = [
      'slash1', 'slash2', 'slice1', 'slice2', 'chop', 'coins',
      'metal-click', 'hit-heavy1', 'hit-heavy2', 'hit-light1',
      'hit-light2', 'hit-medium1', 'hit-soft1', 'ui-click', 'ui-hover',
    ];
    sfxFiles.forEach(name => {
      this.load.audio(name, `/avalanche/sfx/${name}.ogg`);
    });
  }

  create() {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    // Critical assets missing → recoverable error screen instead of a void
    if (this.failedCritical.length > 0) {
      this.cameras.main.setBackgroundColor('#0a0e1a');
      this.add.text(w / 2, h * 0.4, '⚠ ASSETS FAILED TO LOAD', {
        fontSize: '22px', color: '#ff6655', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(w / 2, h * 0.4 + 34, `${this.failedCritical.join(', ')}\nCheck your connection, then retry.`, {
        fontSize: '12px', color: '#8899aa', fontFamily: 'monospace', align: 'center',
      }).setOrigin(0.5);
      const retry = this.add.text(w / 2, h * 0.4 + 90, '[ RETRY ]', {
        fontSize: '18px', color: '#00ccff', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      retry.on('pointerdown', () => window.location.reload());
      return;
    }

    // Pixel keskinliği: global antialias açık ama sprite'lar büyütülünce
    // bulanıklaşmasın — texture bazında nearest.
    for (const key of ['tiles', 'tiny-dungeon', 'tiny-battle']) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // F key — fullscreen toggle (works from splash/boot screen)
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-F', () => {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
        } else {
          this.scale.startFullscreen();
        }
      });
    }

    // ── Splash screen ──

    // Dark background
    this.cameras.main.setBackgroundColor('#0a0e1a');

    // Snowflake particles (subtle background effect)
    const particles: { x: number; y: number; speed: number; size: number; alpha: number }[] = [];
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: 0.3 + Math.random() * 0.8,
        size: 1 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.4,
      });
    }
    const gfx = this.add.graphics().setDepth(0);

    // Frostbite logo text — large, glowing
    const logoText = this.add.text(w / 2, h * 0.35, 'FROSTBITE', {
      fontSize: '42px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#00aadd',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    // Subtitle
    const subText = this.add.text(w / 2, h * 0.35 + 45, 'NFT Battle Arena', {
      fontSize: '14px',
      color: '#00ccff',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    // Decorative line
    const lineLeft = this.add.rectangle(w / 2 - 100, h * 0.35 + 70, 80, 1.5, 0x00ccff)
      .setAlpha(0).setDepth(2);
    const diamond = this.add.text(w / 2, h * 0.35 + 70, '◆', {
      fontSize: '10px', color: '#00ccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setAlpha(0).setDepth(2);
    const lineRight = this.add.rectangle(w / 2 + 100, h * 0.35 + 70, 80, 1.5, 0x00ccff)
      .setAlpha(0).setDepth(2);

    // "On Avalanche" text
    const chainText = this.add.text(w / 2, h * 0.35 + 90, 'on Avalanche', {
      fontSize: '11px',
      color: '#e84142',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    // Bottom hint
    const hintText = this.add.text(w / 2, h * 0.88, 'Entering the world...', {
      fontSize: '10px',
      color: '#335566',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    // ── Animations ──

    // Fade in logo (0 → 0.8s)
    this.tweens.add({
      targets: logoText, alpha: 1, duration: 800, ease: 'Sine.easeOut',
    });

    // Fade in subtitle (0.3s delay)
    this.tweens.add({
      targets: subText, alpha: 1, duration: 600, delay: 300, ease: 'Sine.easeOut',
    });

    // Fade in decorative elements (0.5s delay)
    this.tweens.add({
      targets: [lineLeft, diamond, lineRight], alpha: 0.6, duration: 500, delay: 500,
    });

    // Fade in chain text (0.7s delay)
    this.tweens.add({
      targets: chainText, alpha: 1, duration: 500, delay: 700,
    });

    // Logo pulse glow (continuous)
    this.tweens.add({
      targets: logoText,
      alpha: { from: 1, to: 0.7 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 1000,
    });

    // Hint text fade in (1.5s delay)
    this.tweens.add({
      targets: hintText, alpha: 0.5, duration: 500, delay: 1500,
    });

    // Hint text blink
    this.tweens.add({
      targets: hintText,
      alpha: { from: 0.5, to: 0.15 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      delay: 2000,
    });

    // Snowflake animation
    const snowTimer = this.time.addEvent({
      delay: 33, // ~30fps
      loop: true,
      callback: () => {
        gfx.clear();
        for (const p of particles) {
          p.y += p.speed;
          p.x += Math.sin(p.y * 0.01) * 0.3;
          if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
          gfx.fillStyle(0xaaddff, p.alpha);
          gfx.fillCircle(p.x, p.y, p.size);
        }
      },
    });

    // ── Transition to game after 3 seconds ──
    this.time.delayedCall(3000, () => {
      // Fade out everything
      this.tweens.add({
        targets: [logoText, subText, lineLeft, diamond, lineRight, chainText, hintText, gfx],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          snowTimer.destroy();
          gfx.destroy();
          this.scene.start('CharacterSelect');
        },
      });
    });
  }
}
