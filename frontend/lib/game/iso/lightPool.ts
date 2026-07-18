// frontend/lib/game/iso/lightPool.ts
// Titreyen ışık havuzları — tek radial-gradient texture, ADD blend, alpha tween.
// Bütçe: masaüstü 6, mobil 3 (sahne başına). Depth 1400 (atmosfer 1500'ün altı).
import * as Phaser from 'phaser';

const TEX_KEY = 'light-radial';

function ensureLightTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_KEY)) return;
  const size = 128;
  const canvas = scene.textures.createCanvas(TEX_KEY, size, size);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}

export class LightPool {
  private count = 0;
  constructor(private scene: Phaser.Scene, private max: number) {
    ensureLightTexture(scene);
  }

  /** Işık ekle; bütçe dolduysa sessizce yok sayar. */
  add(x: number, y: number, color: number, radius: number, flicker = true): void {
    if (this.count >= this.max || !this.scene.textures.exists(TEX_KEY)) return;
    this.count++;
    const img = this.scene.add.image(x, y, TEX_KEY)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.45)
      .setDisplaySize(radius * 2, radius * 2)
      .setDepth(1400);
    if (flicker) {
      this.scene.tweens.add({
        targets: img,
        alpha: { from: 0.34, to: 0.55 },
        duration: 260 + Math.random() * 240,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }
}
