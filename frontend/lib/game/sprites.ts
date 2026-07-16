// Kenney 1-bit spritesheet tile positions (col, row)
// Sheet: 49 cols × 22 rows, 16×16 tiles, 1px gap

export const SPRITES = {
  // Terrain
  grass1:     { col: 0, row: 0 },
  grass2:     { col: 1, row: 0 },
  grass3:     { col: 2, row: 0 },
  tree1:      { col: 3, row: 0 },
  tree2:      { col: 4, row: 0 },
  treePine:   { col: 5, row: 0 },
  bush:       { col: 6, row: 0 },
  flower:     { col: 7, row: 0 },
  rock:       { col: 8, row: 0 },
  water:      { col: 0, row: 3 },
  bridge:     { col: 1, row: 3 },
  path1:      { col: 9, row: 0 },
  pathH:      { col: 10, row: 0 },
  pathV:      { col: 9, row: 1 },

  // Buildings
  wallH:      { col: 0, row: 4 },
  wallV:      { col: 1, row: 4 },
  wallCorner: { col: 2, row: 4 },
  door:       { col: 3, row: 4 },
  window:     { col: 4, row: 4 },
  roofL:      { col: 0, row: 5 },
  roofM:      { col: 1, row: 5 },
  roofR:      { col: 2, row: 5 },
  floor1:     { col: 5, row: 4 },
  floor2:     { col: 6, row: 4 },

  // Dungeon
  dWall:      { col: 0, row: 6 },
  dFloor:     { col: 1, row: 6 },
  dDoor:      { col: 2, row: 6 },
  torch:      { col: 3, row: 6 },
  chest:      { col: 4, row: 6 },
  barrel:     { col: 5, row: 6 },
  skull:      { col: 44, row: 1 },

  // Characters
  knight:     { col: 42, row: 0 },
  mage:       { col: 43, row: 0 },
  archer:     { col: 44, row: 0 },
  king:       { col: 45, row: 0 },
  warrior2:   { col: 42, row: 1 },
  viking:     { col: 43, row: 1 },

  // Monsters
  skeleton:   { col: 42, row: 2 },
  ghost:      { col: 43, row: 2 },
  demon:      { col: 44, row: 2 },
  spider:     { col: 45, row: 2 },
  bat:        { col: 46, row: 2 },
  slime:      { col: 42, row: 3 },
  dragon:     { col: 43, row: 3 },
  ogre:       { col: 44, row: 3 },

  // NPCs
  npcOld:     { col: 45, row: 0 },
  npcShop:    { col: 43, row: 1 },

  // Items
  sword:      { col: 46, row: 0 },
  shield:     { col: 47, row: 0 },
  potion:     { col: 46, row: 1 },
  heart:      { col: 36, row: 14 },
  star:       { col: 38, row: 14 },
  coin:       { col: 37, row: 14 },
  key:        { col: 47, row: 1 },

  // UI
  arrowUp:    { col: 36, row: 16 },
  arrowDown:  { col: 36, row: 18 },
  arrowLeft:  { col: 35, row: 17 },
  arrowRight: { col: 37, row: 17 },
} as const;

export type SpriteName = keyof typeof SPRITES;
