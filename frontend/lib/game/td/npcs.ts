// frontend/lib/game/td/npcs.ts
// ─── Faz 7: kasaba NPC'leri (saf veri) ───
// Phaser importu YOK — Node testinde (npx tsx) doğrudan import edilir.
// Sprite: chibiHumanoid(dir, 0, palette) → doku anahtarı `td-npc-<id>`.
// Yerleşim kuralı: her NPC çifti ≥3 tile ayrı olmalı — etkileşim yarıçapı 28px (~1.75 tile)
// olduğundan daha yakın ikili "hangisiyle konuşuyorum" belirsizliği yaratır (td-quest-test bunu assert eder).
// Kasaba referansı: TOWN_ORIGIN(192,192) · TOWN_SPAWN(192,198) · cadde satır 191-192 ·
// kuzey binalar 188-190 · güney binalar 200-202 · kamp ateşi (192,195) ·
// plaza ağaçları (187,194)(197,194)(187,200)(197,200) · tarla 209-213.

import { DEFAULT_PALETTE, REMOTE_PALETTE_VARIANTS, type ChibiPalette } from './sprites/chibi';

export interface NpcDef {
  id: string;
  name: string;
  /** Kasaba tile koordinatı (dünya px = tx*16+8 / ty*16+16). */
  tx: number;
  ty: number;
  palette: ChibiPalette;
  /** chibiHumanoid yönü: 0 aşağı, 1 yukarı, 2 yan. Hepsi caddeye baksın diye 0. */
  dir: 0 | 1 | 2;
  /** Görev yokken gösterilen selam cümlesi (İNGİLİZCE). */
  greeting: string;
}

// Frostbite kimliğine yakın 2 ek palet (varyant havuzu 6 taneydi, 8 NPC var).
const PALETTE_SAGE: ChibiPalette = {
  ...DEFAULT_PALETTE, hair: '#d8d2c4', top: '#4a4f6e', topShade: '#383c54', accent: '#7fd4e8',
};
const PALETTE_SCRIBE: ChibiPalette = {
  ...DEFAULT_PALETTE, hair: '#2c2c34', top: '#6e5a8e', topShade: '#544470', accent: '#e8c342',
};

export const NPCS: NpcDef[] = [
  {
    id: 'herald', name: 'Herald Ru', tx: 191, ty: 197,
    palette: REMOTE_PALETTE_VARIANTS[4], dir: 0,
    greeting: 'New here? The town square holds nine doors. Each one is a different game.',
  },
  {
    id: 'elder', name: 'Elder Maren', tx: 188, ty: 194,
    palette: PALETTE_SAGE, dir: 0,
    greeting: 'The frost took our stores. Any hand that works is a hand we need.',
  },
  {
    id: 'hunter', name: 'Hunter Bex', tx: 195, ty: 196,
    palette: REMOTE_PALETTE_VARIANTS[2], dir: 0,
    greeting: 'Beasts thicken past the road. Keep your blade up and your back to the fire.',
  },
  {
    id: 'blacksmith', name: 'Smith Hilda', tx: 188, ty: 189,
    palette: REMOTE_PALETTE_VARIANTS[3], dir: 0,
    greeting: 'Bring me ore and stone. I will turn it into something that keeps you alive.',
  },
  {
    id: 'merchant', name: 'Trader Vess', tx: 195, ty: 189,
    palette: REMOTE_PALETTE_VARIANTS[5], dir: 0,
    greeting: 'Everything sells if you carry it far enough. The market is right behind me.',
  },
  {
    id: 'fisher', name: 'Fisher Pell', tx: 186, ty: 201,
    palette: REMOTE_PALETTE_VARIANTS[1], dir: 0,
    greeting: 'The lakes never freeze all the way through. That is where the good ones hide.',
  },
  {
    id: 'scholar', name: 'Scribe Yuna', tx: 198, ty: 201,
    palette: PALETTE_SCRIBE, dir: 0,
    greeting: 'Every dungeon door was carved by someone. I intend to find out who.',
  },
  {
    id: 'farmer', name: 'Farmer Odd', tx: 192, ty: 205,
    palette: REMOTE_PALETTE_VARIANTS[0], dir: 0,
    greeting: 'Plots are down the path. Plant, wait, harvest. The frost cannot stop all of it.',
  },
];

export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));
