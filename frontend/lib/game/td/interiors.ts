// frontend/lib/game/td/interiors.ts
// ─── Faz 11.1: bina iç mekânları — SAF veri katmanı ───
// Phaser/window/document YOK: Node'da koşar (scripts/td-interior-test.ts).
// Çizim spec'leri sprites/interiorProps.ts'te (Record<FurnKind,…> — DECO_SPEC deseni:
// union'a eklenen tip çizimsiz kalırsa DERLEME hatası, runtime'a sızamaz).
// Oda koordinatları: (0,0) sol-üst İÇ köşe; duvar halkası SAHNE çiziminde eklenir
// (oda dışı her tile duvar sayılır — interiorWalkable sınır dışını false döner).

import { DEFAULT_DAY_TIME } from './dayNight';

export type FurnKind =
  | 'bed' | 'table' | 'chair' | 'rug' | 'shelf'
  | 'hearth' | 'counter' | 'lectern' | 'plant' | 'crate';

export interface InteriorFurn { kind: FurnKind; tx: number; ty: number }

/**
 * Faz 11.3: okunabilir lore kitabı. Metin lore.ts'te KALIR (LORE_ENTRIES id'siyle
 * bağlanır — kopya metin yok, TdBattleScene ile paylaşılan API'ye dokunulmaz).
 * `title` arşivcinin cilt başlığıdır (lore girdisinin başlığından bilerek farklı:
 * girdiler ganimet-dili "Fragment of X", kitaplar kronik-dili taşır).
 * `spot` ikonun durduğu mobilya hücresi (lectern/masa/raf ÜSTÜ — yürünebilir olması
 * gerekmez; test ≥1 yürünebilir 4-komşu ister ki oyuncu yanına gelip okuyabilsin).
 */
export interface InteriorBook {
  loreKey: string;
  title: string;
  spot: { tx: number; ty: number };
}

export interface InteriorDef {
  id: string;
  name: string;
  room: { w: number; h: number; floor: number; wall: number };  // renkler 0xRRGGBB
  furniture: InteriorFurn[];
  /** Kapı önü pad'i (oda İÇİ, alt-orta) — üstüne basınca/E ile çıkış. */
  exitPad: { tx: number; ty: number };
  /** 11.2'de sahneye bağlanacak iç-mekân NPC'si (dünya NPC listesine GİRMEZ). */
  npc?: { id: string; name: string; tx: number; ty: number; palette: number };
  /** Faz 11.3: okunabilir lore kitapları (yalnız arşivde). */
  books?: InteriorBook[];
}

/** Mobilya taban alanı (TILE cinsinden) — çarpışma + testler bunu okur.
 * Çizim boyutu (px) interiorProps.ts'te; ikisinin senkronu görsel iştir, sözleşme burası. */
export const FURN_SIZE: Record<FurnKind, { w: number; h: number }> = {
  bed: { w: 1, h: 2 },
  table: { w: 2, h: 1 },
  chair: { w: 1, h: 1 },
  rug: { w: 2, h: 2 },
  shelf: { w: 1, h: 1 },
  hearth: { w: 2, h: 1 },
  counter: { w: 3, h: 1 },
  lectern: { w: 1, h: 1 },
  plant: { w: 1, h: 1 },
  crate: { w: 1, h: 1 },
};

/** İçinden geçilmeyen mobilyalar. rug/chair/plant dekoratif: üstünden yürünür
 * (worldProps DECO_SOLID felsefesi — yol bulma riski sıfır). */
export const FURN_SOLID: ReadonlySet<FurnKind> = new Set<FurnKind>([
  'bed', 'table', 'shelf', 'hearth', 'counter', 'crate', 'lectern',
]);

export const INTERIORS: Record<string, InteriorDef> = {
  // ── Han: sıcak ahşap, ocak + bar + yataklar. NPC 11.2'de sahneye bağlanır. ──
  inn: {
    id: 'inn',
    name: 'The Frosted Hearth',
    room: { w: 14, h: 10, floor: 0x7a5a3e, wall: 0x4a3420 },
    furniture: [
      { kind: 'hearth', tx: 6, ty: 0 },                       // kuzey duvarı ortası
      { kind: 'shelf', tx: 0, ty: 0 }, { kind: 'shelf', tx: 13, ty: 0 },
      { kind: 'crate', tx: 0, ty: 1 },
      { kind: 'counter', tx: 1, ty: 2 },                      // bar (hancı arkasında durur)
      { kind: 'bed', tx: 12, ty: 1 }, { kind: 'bed', tx: 12, ty: 4 },  // doğu duvarı
      { kind: 'table', tx: 4, ty: 5 }, { kind: 'table', tx: 8, ty: 5 },
      { kind: 'chair', tx: 3, ty: 5 }, { kind: 'chair', tx: 6, ty: 5 },
      { kind: 'chair', tx: 7, ty: 5 }, { kind: 'chair', tx: 10, ty: 5 },
      { kind: 'rug', tx: 6, ty: 7 },                          // kapı önü halısı
      { kind: 'plant', tx: 0, ty: 8 }, { kind: 'plant', tx: 13, ty: 8 },
    ],
    exitPad: { tx: 7, ty: 9 },
    npc: { id: 'innkeeper', name: 'Keeper Sela', tx: 2, ty: 1, palette: 1 },
  },
  // ── Arşiv: taş zemin, raflar + rahleler. Kitap listesi 11.3'te dolacak. ──
  archive: {
    id: 'archive',
    name: "Scribe's Archive",
    room: { w: 12, h: 9, floor: 0x7c7468, wall: 0x4c453c },
    furniture: [
      { kind: 'shelf', tx: 1, ty: 0 }, { kind: 'shelf', tx: 2, ty: 0 }, { kind: 'shelf', tx: 3, ty: 0 },
      { kind: 'shelf', tx: 8, ty: 0 }, { kind: 'shelf', tx: 9, ty: 0 }, { kind: 'shelf', tx: 10, ty: 0 },
      { kind: 'crate', tx: 11, ty: 0 },
      { kind: 'shelf', tx: 0, ty: 2 }, { kind: 'shelf', tx: 11, ty: 2 },
      { kind: 'lectern', tx: 2, ty: 4 }, { kind: 'lectern', tx: 9, ty: 4 },
      { kind: 'table', tx: 5, ty: 3 },
      { kind: 'chair', tx: 4, ty: 3 }, { kind: 'chair', tx: 7, ty: 3 },
      { kind: 'rug', tx: 5, ty: 5 },
      { kind: 'plant', tx: 0, ty: 7 }, { kind: 'plant', tx: 11, ty: 7 },
    ],
    exitPad: { tx: 6, ty: 8 },
    // Kitap seçimi (Faz 11.3): erken/orta-oyun dünya efsanesi + bölge kronikleri.
    // Ch3 "Crown'un gerçek doğası" (lore_void) ve Ch4 final girdileri BİLEREK dışarıda —
    // savaş sonu büyük ifşalar boss ödülü olarak kalsın, arşiv spoiler dükkânı olmasın.
    books: [
      { loreKey: 'lore_frost_dragon',    title: 'On the Frost Dragon',            spot: { tx: 2, ty: 4 } },   // lectern B
      { loreKey: 'lore_crystal_colossus', title: 'The Seven Guardians',           spot: { tx: 9, ty: 4 } },   // lectern D
      { loreKey: 'lore_shadow_lord',     title: 'The Guardian Who Fell to Shadow', spot: { tx: 5, ty: 3 } },  // masa, sol yaprak
      { loreKey: 'lore_swamp_hag',       title: 'Why the Marsh Went Sour',        spot: { tx: 6, ty: 3 } },   // masa, sağ yaprak
      { loreKey: 'lore_leviathan',       title: 'The Sleeper Beneath the Waves',  spot: { tx: 0, ty: 2 } },   // batı rafı
      { loreKey: 'lore_guardian',        title: 'Where Crowns Are Unmade',        spot: { tx: 11, ty: 2 } },  // doğu rafı
    ],
  },
};

// ─── Faz 11.2: han — uyku mekaniği (SAF: sahne + test AYNI sabit/fonksiyonu okur) ───

/** Bir gecelik konaklama (gold). Dünyadaki ikinci gold sink (Faz 10 ruhu: ucuz tutuldu). */
export const INN_SLEEP_COST = 5;

/** Hancı selamı — gündüz/gece ayrımı sahnede isNight(tdState.dayTime) ile seçilir. */
export function innkeeperGreeting(night: boolean): string {
  return night
    ? 'Half the town is asleep. The other half is here.'
    : 'Warm beds, warmer stew. What do you need?';
}

export interface SleepState {
  gold: number; hp: number; maxHp: number; energy: number; dayTime: number;
}

/**
 * Uyku geçişi — SAF: yetersiz altında `null` (çağıran HİÇBİR alanı yazmaz),
 * yeterlide yeni state döner: gold −INN_SLEEP_COST, HP/enerji FULL, saat sabaha
 * (DEFAULT_DAY_TIME) çekilir. Gün sayacı YOK — gündüz uyumak da sadece saati sarar
 * (plan §11.2: "ertesi sabaha atlamaz"). Girdi NESNESİ mutate edilmez.
 */
export function applySleep(s: SleepState, energyMax: number): SleepState | null {
  if (s.gold < INN_SLEEP_COST) return null;
  return {
    gold: s.gold - INN_SLEEP_COST,
    hp: s.maxHp,
    maxHp: s.maxHp,
    energy: energyMax,
    dayTime: DEFAULT_DAY_TIME,
  };
}

/**
 * Oda İÇİ yürünebilirlik: sınır dışı = duvar, solid mobilya taban alanı = kapalı.
 * 🔒 Sahne (TdInteriorScene.canMove) ve test (td-interior-test flood-fill) AYNI
 * fonksiyonu kullanır — çarpışma sözleşmesi tek yerde.
 */
export function interiorWalkable(def: InteriorDef, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= def.room.w || ty >= def.room.h) return false;
  for (const f of def.furniture) {
    if (!FURN_SOLID.has(f.kind)) continue;
    const s = FURN_SIZE[f.kind];
    if (tx >= f.tx && tx < f.tx + s.w && ty >= f.ty && ty < f.ty + s.h) return false;
  }
  return true;
}
