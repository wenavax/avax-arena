// frontend/lib/game/battleBackdrop.ts
// Savaş sahnesi zone-temalı arka planı: gradient gökyüzü + 2 kat silüet + zemin.
// ZONE_ATMOSPHERE paletinden renk alır; zone karakterine göre silüet varyantı seçer.
// Depth -10: mevcut aren detayları (yıldız/elips/ızgara, depth ~0) bunun ÜSTÜnde kalır,
// karakterler/paneller (depth 10+) en önde.
import * as Phaser from 'phaser';
import { ZONE_ATMOSPHERE } from './iso/zoneAtmosphere';

// Zone başına silüet stili: peaks=sivri üçgen, blocks=buz/kaya kütlesi, waves=dalga elips
type SilhouetteStyle = 'peaks' | 'blocks' | 'waves' | 'spires';

const ZONE_SILHOUETTE: Record<string, SilhouetteStyle> = {
  Volcano: 'peaks', DemonGate: 'peaks', Forge: 'peaks', Sanctum: 'peaks',
  IceCave: 'blocks', Citadel: 'blocks', FrostWastes: 'blocks', Mines: 'blocks',
  Abyss: 'waves', Swamp: 'waves',
  Necropolis: 'spires', VoidRealm: 'spires', Eternal: 'spires', Crypt: 'spires',
  // Forest, Town, Dungeon, Ruins -> default 'peaks' (yumuşak tepeler)
};

export function drawBattleBackdrop(scene: Phaser.Scene, zoneKey: string, w: number, h: number): void {
  const atmo = ZONE_ATMOSPHERE[zoneKey] ?? ZONE_ATMOSPHERE.Forest;
  const style = ZONE_SILHOUETTE[zoneKey] ?? 'peaks';
  const g = scene.add.graphics().setDepth(-10);
  const horizon = h * 0.62;

  // ── Gökyüzü gradyanı ──
  g.fillGradientStyle(atmo.tint, atmo.tint, atmo.fogColor, atmo.fogColor, 0.5, 0.5, 0.9, 0.9);
  g.fillRect(0, 0, w, horizon);

  // ── Uzak silüet (daha açık, daha alçak) ──
  g.fillStyle(atmo.fogColor, 0.5);
  drawSilhouetteRow(g, style, w, horizon, 7, /*far*/ true);
  // ── Yakın silüet (daha koyu, daha yüksek) ──
  g.fillStyle(atmo.fogColor, 0.82);
  drawSilhouetteRow(g, style, w, horizon, 5, /*far*/ false);

  // ── Zemin ──
  g.fillGradientStyle(atmo.fogColor, atmo.fogColor, 0x0a0e1a, 0x0a0e1a, 0.7, 0.7, 0.95, 0.95);
  g.fillRect(0, horizon, w, h - horizon);
}

function drawSilhouetteRow(
  g: Phaser.GameObjects.Graphics,
  style: SilhouetteStyle,
  w: number,
  horizon: number,
  count: number,
  far: boolean,
): void {
  const baseH = far ? horizon * 0.22 : horizon * 0.13;
  const jitter = far ? 45 : 30;
  const heightMul = far ? 1.0 : 0.6;

  for (let i = 0; i < count; i++) {
    // Seeded (deterministik) konum/boyut
    const bx = (i / count) * w + ((i * 97) % (jitter + 20)) - (jitter + 20) / 2;
    const bw = w / (count - 1) + ((i * 53) % 50);
    let bh = baseH + ((i * 31) % 45) * heightMul;

    switch (style) {
      case 'peaks': {
        // Sivri dağ/lav zirveleri
        g.fillTriangle(bx, horizon, bx + bw / 2, horizon - bh * 1.4, bx + bw, horizon);
        break;
      }
      case 'spires': {
        // İnce, uzun sivriler (necropolis/void kuleleri)
        const sw = bw * 0.45;
        g.fillTriangle(bx, horizon, bx + sw / 2, horizon - bh * 1.9, bx + sw, horizon);
        break;
      }
      case 'blocks': {
        // Buz kütleleri / dikey kaya blokları — köşeleri yumuşak
        g.fillRoundedRect(bx, horizon - bh, bw, bh, Math.min(6, bw * 0.15));
        break;
      }
      case 'waves': {
        // Alçak dalga tepeleri (abyss/swamp) — elipslerle
        g.fillEllipse(bx + bw / 2, horizon, bw * 1.1, bh * 1.3);
        break;
      }
    }
  }
}
