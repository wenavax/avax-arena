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
  /**
   * Faz 9B.3: gece selamı. GÖREV AKIŞINI ETKİLEMEZ — kabul/teslim gece de tamamen açık
   * (planın 🔴 tuzağı: teslimi geceye kilitlemek oyuncuyu görevde mahsur bırakır).
   * Yalnız "boş sohbet" dalı değişir.
   */
  nightGreeting: string;
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
    nightGreeting: 'The doors stay open all night, but nobody is announcing them. Come back tomorrow.',
  },
  {
    id: 'elder', name: 'Elder Maren', tx: 188, ty: 194,
    palette: PALETTE_SAGE, dir: 0,
    greeting: 'The frost took our stores. Any hand that works is a hand we need.',
    nightGreeting: 'Old bones and cold nights do not mix. Ask me again in the morning.',
  },
  {
    id: 'hunter', name: 'Hunter Bex', tx: 195, ty: 196,
    palette: REMOTE_PALETTE_VARIANTS[2], dir: 0,
    greeting: 'Beasts thicken past the road. Keep your blade up and your back to the fire.',
    nightGreeting: 'They hunt harder after dark — and they drop more. Your call.',
  },
  {
    id: 'blacksmith', name: 'Smith Hilda', tx: 188, ty: 189,
    palette: REMOTE_PALETTE_VARIANTS[3], dir: 0,
    greeting: 'Bring me ore and stone. I will turn it into something that keeps you alive.',
    nightGreeting: 'Forge is banked for the night. Leave the ore, come back tomorrow.',
  },
  {
    id: 'merchant', name: 'Trader Vess', tx: 195, ty: 189,
    palette: REMOTE_PALETTE_VARIANTS[5], dir: 0,
    greeting: 'Everything sells if you carry it far enough. The market is right behind me.',
    nightGreeting: 'Stall is shuttered. Nobody haggles well by lantern light.',
  },
  {
    id: 'fisher', name: 'Fisher Pell', tx: 186, ty: 201,
    palette: REMOTE_PALETTE_VARIANTS[1], dir: 0,
    greeting: 'The lakes never freeze all the way through. That is where the good ones hide.',
    nightGreeting: 'Lines are in the water, and I am asleep. Try me at first light.',
  },
  {
    id: 'scholar', name: 'Scribe Yuna', tx: 198, ty: 201,
    palette: PALETTE_SCRIBE, dir: 0,
    greeting: 'Every dungeon door was carved by someone. I intend to find out who.',
    nightGreeting: 'Candles are down to stubs. The archive can wait for daylight.',
  },
  {
    id: 'farmer', name: 'Farmer Odd', tx: 192, ty: 205,
    palette: REMOTE_PALETTE_VARIANTS[0], dir: 0,
    greeting: 'Plots are down the path. Plant, wait, harvest. The frost cannot stop all of it.',
    nightGreeting: 'Crops grow while I sleep. You should try sleeping sometime.',
  },
];

/**
 * Faz 9B.3: gündüz/gece selam seçimi. TEK yer — sahne `isNight(dayTime)` sonucunu geçer,
 * NPC verisi zamanı kendisi sorgulamaz (saflık: npcs.ts Node testinde import ediliyor).
 */
export function greetingFor(npc: NpcDef, night: boolean): string {
  return night ? npc.nightGreeting : npc.greeting;
}

// ─── Faz 10: hizmet veren NPC'ler ────────────────────────────────────────────
// Hizmet GÖREV AKIŞINDAN BAĞIMSIZ: 9B.3'ün dersi gereği kabul/teslim gece de açık
// kalır, kapanan yalnız tezgâh/ocak. Böylece oyuncu gece bir görevde mahsur kalmaz,
// ama gündüz/gece döngüsü ilk kez kozmetik olmaktan çıkıp bir sonuç doğurur.

export type NpcService = 'shop' | 'forge';

/** npcId → hizmet. Panelde hizmet çipi YALNIZ buradaki NPC'lerde çıkar. */
export const NPC_SERVICE: Record<string, NpcService> = {
  merchant: 'shop',
  blacksmith: 'forge',
};

export const SERVICE_LABEL: Record<NpcService, string> = { shop: 'SHOP', forge: 'FORGE' };

/**
 * Gece kapalı repliği. `nightGreeting`'ten AYRI yazıldı: selam "gece neden buradayım"ı,
 * bu satır "hizmet neden şimdi olmaz"ı anlatır — ikisi arka arkaya okununca (selam
 * panelde, bu satır çipe basınca) tekrar etmesinler diye.
 */
export const SERVICE_NIGHT_LINE: Record<NpcService, string> = {
  shop: 'Ledger is shut and the crates are roped down for the night. Bring your coin back at first light.',
  forge: 'Coals are banked. Steel worked by lantern light comes out brittle, and I do not sell brittle. Dawn, then.',
};

/** Gece NPC opaklığı — kaybolmazlar (görev teslimi için hâlâ tıklanabilir), soluklaşırlar. */
export const NIGHT_NPC_ALPHA = 0.42;

export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));
