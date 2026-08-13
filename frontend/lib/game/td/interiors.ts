// frontend/lib/game/td/interiors.ts
// ─── Faz 11.1: bina iç mekânları — SAF veri katmanı ───
// Phaser/window/document YOK: Node'da koşar (scripts/td-interior-test.ts).
// Çizim spec'leri sprites/interiorProps.ts'te (Record<FurnKind,…> — DECO_SPEC deseni:
// union'a eklenen tip çizimsiz kalırsa DERLEME hatası, runtime'a sızamaz).
// Oda koordinatları: (0,0) sol-üst İÇ köşe; duvar halkası SAHNE çiziminde eklenir
// (oda dışı her tile duvar sayılır — interiorWalkable sınır dışını false döner).

export type FurnKind =
  | 'bed' | 'table' | 'chair' | 'rug' | 'shelf'
  | 'hearth' | 'counter' | 'lectern' | 'plant' | 'crate';

export interface InteriorFurn { kind: FurnKind; tx: number; ty: number }

export interface InteriorDef {
  id: string;
  name: string;
  room: { w: number; h: number; floor: number; wall: number };  // renkler 0xRRGGBB
  furniture: InteriorFurn[];
  /** Kapı önü pad'i (oda İÇİ, alt-orta) — üstüne basınca/E ile çıkış. */
  exitPad: { tx: number; ty: number };
  /** 11.2'de sahneye bağlanacak iç-mekân NPC'si (dünya NPC listesine GİRMEZ). */
  npc?: { id: string; name: string; tx: number; ty: number; palette: number };
  /** 11.3'te lore.ts anahtarlarıyla dolacak. */
  books?: string[];
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
    books: [],
  },
};

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
