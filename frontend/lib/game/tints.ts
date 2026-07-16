// Color tints for 1-bit Kenney sprites — all objects, characters, monsters, items
// Ground layer uses Ninja Adventure tilesets (already colored, no tints needed).
// IMPORTANT: Tile indices MUST match sprites.ts positions!

import { tileIndex } from './config';

// ─── Object Tints by tile index (Kenney sprites) ────────────
export const OBJECT_TINTS: Record<number, number> = {
  // ── Nature (row 0) ──
  [tileIndex(3, 0)]: 0x55bb44,  // tree1 → leaf green
  [tileIndex(4, 0)]: 0x44aa33,  // tree2 → darker green
  [tileIndex(5, 0)]: 0x338844,  // pine → forest green
  [tileIndex(6, 0)]: 0x66cc44,  // bush → bright lime
  [tileIndex(7, 0)]: 0xffdd44,  // flower → sunny yellow
  [tileIndex(8, 0)]: 0x99aabb,  // rock → blue-gray stone

  // ── Water & Bridge (row 3) ──
  [tileIndex(0, 3)]: 0x3388cc,  // water → clear blue
  [tileIndex(1, 3)]: 0x997755,  // bridge → wood brown

  // ── Skull decoration ──
  [tileIndex(44, 1)]: 0xccbbaa, // skull → bone white

  // ── Buildings (row 4 = walls, row 5 = roofs) ──
  [tileIndex(0, 4)]: 0xddcc99,  // wallH → warm cream
  [tileIndex(1, 4)]: 0xccbb88,  // wallV → slightly darker cream
  [tileIndex(2, 4)]: 0xccbb88,  // wallCorner
  [tileIndex(3, 4)]: 0x886644,  // door → rich wood brown
  [tileIndex(4, 4)]: 0x77ccee,  // window → bright sky blue
  [tileIndex(0, 5)]: 0xcc5544,  // roofL → terracotta
  [tileIndex(1, 5)]: 0xcc5544,  // roofM → terracotta
  [tileIndex(2, 5)]: 0xcc5544,  // roofR → terracotta
  [tileIndex(5, 4)]: 0xbbaa88,  // floor1 → light stone
  [tileIndex(6, 4)]: 0xaa9977,  // floor2 → darker stone

  // ── Dungeon props (row 6) ──
  [tileIndex(0, 6)]: 0x556677,  // dungeon wall → dark stone
  [tileIndex(1, 6)]: 0x667788,  // dungeon floor → gray
  [tileIndex(3, 6)]: 0xffaa33,  // torch → warm orange flame
  [tileIndex(4, 6)]: 0xddaa33,  // chest → golden
  [tileIndex(5, 6)]: 0x997755,  // barrel → wood brown

  // ── Characters (rows 0-1, cols 42+) ──
  [tileIndex(42, 0)]: 0x44aaff, // knight → clear blue
  [tileIndex(43, 0)]: 0xcc77ee, // mage → soft violet
  [tileIndex(44, 0)]: 0x66dd66, // archer → fresh green
  [tileIndex(45, 0)]: 0xffcc33, // king/elder → warm gold
  [tileIndex(42, 1)]: 0xee8855, // warrior2 → light orange
  [tileIndex(43, 1)]: 0xeebb55, // viking/merchant → golden amber

  // ── Monsters (rows 2-3, cols 42+) ──
  [tileIndex(42, 2)]: 0xeeeedd, // skeleton → warm white
  [tileIndex(43, 2)]: 0x88ddff, // ghost → light cyan
  [tileIndex(44, 2)]: 0xee4444, // demon → bright red
  [tileIndex(45, 2)]: 0x55aa66, // spider → medium green
  [tileIndex(46, 2)]: 0x9977bb, // bat → light purple
  [tileIndex(42, 3)]: 0x66ee77, // slime → mint green
  [tileIndex(43, 3)]: 0x55ccff, // dragon → bright ice
  [tileIndex(44, 3)]: 0xdd8844, // ogre → amber

  // ── Items (cols 46-47, rows 0-1) ──
  [tileIndex(46, 0)]: 0xccddee, // sword → light steel
  [tileIndex(47, 0)]: 0xccddee, // shield
  [tileIndex(46, 1)]: 0xff5577, // potion → rose red
  [tileIndex(47, 1)]: 0xffee44, // key → yellow

  // ── UI items (row 14) ──
  [tileIndex(36, 14)]: 0xff4466, // heart → bright pink
  [tileIndex(37, 14)]: 0xffcc33, // coin → gold
  [tileIndex(38, 14)]: 0xffee44, // star → yellow

  // ── Arrows/exits ──
  [tileIndex(35, 17)]: 0x77ee77, // arrowLeft
  [tileIndex(36, 16)]: 0x77ee77, // arrowUp
  [tileIndex(36, 18)]: 0x77ee77, // arrowDown
  [tileIndex(37, 17)]: 0x77ee77, // arrowRight
};

// ─── Player tint by class ──────────────────────────────────────
export const PLAYER_TINTS: Record<string, number> = {
  knight: 0x44aaff,
  mage:   0xcc77ee,
  archer: 0x66dd66,
};

// ─── Helper: get tint for a Kenney object tile ────────────────────
export function getObjectTint(tileIdx: number): number | undefined {
  return OBJECT_TINTS[tileIdx];
}
