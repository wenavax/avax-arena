// Phaser-free kasaba harita üretici — IsoTownScene ve testler (hub-town-check.ts) tarafından paylaşılır.
// ZoneTile tipi 'phaser' içeren iso/core.ts'ten geliyor; type-only import tsx tarafından silinir (Phaser'ı çalışma zamanında yüklemez).
import type { ZoneTile } from '../iso/core';
import { HUB_GAMES, HUB_INTERACT_PREFIX, buildingRect } from '../hub/hubGames';

// ---------------------------------------------------------------------------
// Map builder — 32 cols x 26 rows
// ---------------------------------------------------------------------------
export function buildTownTiles(): ZoneTile[][] {
  const COLS = 32;
  const ROWS = 26;

  // Helper factories
  const tile = (biome: string, height: number, collision = false, extra?: Partial<ZoneTile>): ZoneTile => ({
    height, biome, collision, interact: undefined, data: undefined, ...extra,
  });

  // Init grid with grass
  const tiles: ZoneTile[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: ZoneTile[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(tile('grass', 2));
    }
    tiles.push(row);
  }

  // Helper: set tile only if no interact already placed
  const safeSet = (r: number, c: number, t: ZoneTile) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !tiles[r][c].interact) {
      tiles[r][c] = t;
    }
  };

  // =========================================================================
  // 1. BORDER TREES — dense 2-3 tile border with pine/oak mix
  // =========================================================================
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isTopBorder = r <= 1;
      const isBottomBorder = r >= 24;
      const isLeftBorder = c <= 1;
      const isRightBorder = c >= 30;
      // Extra depth on corners (3 tiles deep)
      const isCornerThick = (r <= 2 && c <= 2) || (r <= 2 && c >= 29) ||
                            (r >= 23 && c <= 2) || (r >= 23 && c >= 29);

      if (isTopBorder || isBottomBorder || isLeftBorder || isRightBorder || isCornerThick) {
        // Leave gap for forest exit (col 30-31, rows 11-15)
        if (c >= 30 && r >= 11 && r <= 15) continue;
        // Leave gap for spawn area south (cols 14-17, rows 24-25)
        if (r >= 24 && c >= 13 && c <= 18) continue;
        const deco = (r + c) % 3 === 0 ? 'tree_oak' : 'tree';
        tiles[r][c] = tile('grass', 3, true, { data: { deco } });
      }
    }
  }

  // =========================================================================
  // 2. ROAD NETWORK
  // =========================================================================

  // --- Main north-south road: 4 tiles wide cobble (cols 14-17) from row 5 to row 23 ---
  for (let r = 5; r <= 23; r++) {
    for (let c = 14; c <= 17; c++) {
      tiles[r][c] = tile('cobble', 2);
    }
  }

  // --- East road: 3 tiles wide from plaza to forest exit (rows 12-14, cols 20-31) ---
  for (let r = 12; r <= 14; r++) {
    for (let c = 20; c <= 31; c++) {
      // Forest exit at col 31
      if (c === 31) {
        tiles[r][c] = tile('dirt', 2, false, { interact: 'exit_forest', data: { target: 'Forest' } });
      } else if (c >= 29) {
        tiles[r][c] = tile('dirt', 2);
      } else {
        tiles[r][c] = tile('cobble', 2);
      }
    }
  }

  // --- Dirt side path: Elder's Tower to main road (rows 8-9, cols 9-13) ---
  for (let c = 9; c <= 13; c++) {
    tiles[8][c] = tile('dirt', 2);
    tiles[9][c] = tile('dirt', 2);
  }

  // --- Dirt side path: Merchant Shop to main road (rows 8-9, cols 18-22) ---
  for (let c = 18; c <= 22; c++) {
    tiles[8][c] = tile('dirt', 2);
    tiles[9][c] = tile('dirt', 2);
  }

  // --- Dirt side path: Inn to main road (rows 20-21, cols 8-13) ---
  for (let c = 8; c <= 13; c++) {
    tiles[20][c] = tile('dirt', 2);
    tiles[21][c] = tile('dirt', 2);
  }

  // --- Dirt side path: Training Hall to main road (rows 20-21, cols 18-23) ---
  for (let c = 18; c <= 23; c++) {
    tiles[20][c] = tile('dirt', 2);
    tiles[21][c] = tile('dirt', 2);
  }

  // --- Dirt side path: Small house NW to Elder path (rows 6-7, cols 12-13) ---
  for (let r = 6; r <= 7; r++) {
    tiles[r][12] = tile('dirt', 2);
    tiles[r][13] = tile('dirt', 2);
  }

  // =========================================================================
  // 3. CENTRAL PLAZA — cols 11-20, rows 10-14 with decorative pattern
  // =========================================================================

  // Dark grass flower border ring around plaza
  for (let r = 9; r <= 15; r++) {
    for (let c = 10; c <= 21; c++) {
      const isEdge = r === 9 || r === 15 || c === 10 || c === 21;
      if (isEdge) {
        const hasDeco = (r + c) % 2 === 0;
        tiles[r][c] = tile('dark_grass', 2, false, hasDeco ? { data: { deco: 'flower' } } : undefined);
      }
    }
  }

  // Plaza interior — alternating cobble/stone checkerboard pattern
  for (let r = 10; r <= 14; r++) {
    for (let c = 11; c <= 20; c++) {
      const isChecker = (r + c) % 5 === 0;
      tiles[r][c] = tile(isChecker ? 'stone' : 'cobble', 2);
    }
  }

  // Stone pillar decorations at plaza corners (height 4)
  tiles[10][11] = tile('stone', 4, true);
  tiles[10][20] = tile('stone', 4, true);
  tiles[14][11] = tile('stone', 4, true);
  tiles[14][20] = tile('stone', 4, true);

  // Torch decorations at plaza corners
  tiles[10][12] = tile('cobble', 2, false, { data: { deco: 'torch' } });
  tiles[10][19] = tile('cobble', 2, false, { data: { deco: 'torch' } });
  tiles[14][12] = tile('cobble', 2, false, { data: { deco: 'torch' } });
  tiles[14][19] = tile('cobble', 2, false, { data: { deco: 'torch' } });

  // Stone benches around plaza (collision, height 3)
  tiles[10][13] = tile('stone', 3, true);
  tiles[10][18] = tile('stone', 3, true);
  tiles[14][13] = tile('stone', 3, true);
  tiles[14][18] = tile('stone', 3, true);

  // --- Fountain: 3x3 in plaza center (cols 14-16, rows 11-13) ---
  for (let r = 11; r <= 13; r++) {
    for (let c = 14; c <= 16; c++) {
      tiles[r][c] = tile('stone', 3, true);
    }
  }
  // Water center of fountain
  tiles[12][15] = tile('water', 1, true);

  // Flower patches around fountain
  tiles[11][13] = tile('cobble', 2, false, { data: { deco: 'flower' } });
  tiles[11][17] = tile('cobble', 2, false, { data: { deco: 'flower' } });
  tiles[13][13] = tile('cobble', 2, false, { data: { deco: 'flower' } });
  tiles[13][17] = tile('cobble', 2, false, { data: { deco: 'flower' } });

  // =========================================================================
  // 4. ELDER'S TOWER — 6x6 (cols 3-8, rows 3-8) with garden and porch
  // =========================================================================

  // Garden patch around tower (dark_grass with flowers)
  for (let r = 2; r <= 10; r++) {
    for (let c = 2; c <= 10; c++) {
      if (!tiles[r][c].collision) {
        const hasDeco = (r + c) % 3 === 0;
        safeSet(r, c, tile('dark_grass', 2, false, hasDeco ? { data: { deco: 'flower' } } : undefined));
      }
    }
  }

  // Tower walls (6x6) — outer ring is wall, inner is roof
  for (let r = 3; r <= 8; r++) {
    for (let c = 3; c <= 8; c++) {
      if (r === 3 || r === 8 || c === 3 || c === 8) {
        tiles[r][c] = tile('wall', 5, true);
      } else {
        tiles[r][c] = tile('roof_blue', 6, true);
      }
    }
  }

  // Front porch (wood, 3 tiles wide, no collision)
  tiles[9][5] = tile('wood', 2);
  tiles[9][6] = tile('wood', 2);
  tiles[9][7] = tile('wood', 2);

  // Door at bottom of tower
  tiles[8][6] = tile('wood', 2, false, { interact: 'elder_house' });

  // Elder Frost NPC tile — matches addNpcAt(6, 9) in create()
  tiles[9][6] = tile('dirt', 2, true, { interact: 'npc', data: { id: 'elder', name: 'Elder Frost' } });

  // Torch at tower entrance
  tiles[9][4] = tile('dark_grass', 2, false, { data: { deco: 'torch' } });

  // =========================================================================
  // 5. MERCHANT'S SHOP — 6x6 (cols 23-28, rows 3-8) with market stalls
  // =========================================================================

  // Dirt ground around shop
  for (let r = 2; r <= 10; r++) {
    for (let c = 22; c <= 29; c++) {
      if (!tiles[r][c].collision) {
        safeSet(r, c, tile('dirt', 2));
      }
    }
  }

  // Shop walls (6x6)
  for (let r = 3; r <= 8; r++) {
    for (let c = 23; c <= 28; c++) {
      if (r === 3 || r === 8 || c === 23 || c === 28) {
        tiles[r][c] = tile('wall', 4, true);
      } else {
        tiles[r][c] = tile('roof_red', 5, true);
      }
    }
  }

  // Shop door
  tiles[8][25] = tile('wood', 2, false, { interact: 'shop' });

  // Market stalls — 4 wood tiles in front (height 3, collision)
  tiles[9][23] = tile('wood', 3, true);
  tiles[9][24] = tile('wood', 3, true);
  tiles[9][26] = tile('wood', 3, true);
  tiles[9][27] = tile('wood', 3, true);

  // Merchant NPC tile — matches addNpcAt(25, 9) in create()
  tiles[9][25] = tile('dirt', 2, true, { interact: 'npc', data: { id: 'merchant', name: 'Merchant Bjorn' } });

  // Barrels near shop
  tiles[10][23] = tile('dirt', 2, true, { data: { deco: 'barrel' } });
  tiles[10][24] = tile('dirt', 2, true, { data: { deco: 'barrel' } });
  tiles[10][28] = tile('dirt', 2, true, { data: { deco: 'barrel' } });

  // Torch at shop entrance
  tiles[9][28] = tile('dirt', 2, false, { data: { deco: 'torch' } });

  // =========================================================================
  // 6. INN — 5x5 (cols 3-7, rows 17-21) with cobble courtyard
  // =========================================================================

  // Cobble courtyard in front of inn (3x2)
  for (let r = 22; r <= 23; r++) {
    for (let c = 3; c <= 7; c++) {
      safeSet(r, c, tile('cobble', 2));
    }
  }

  // Inn walls (5x5)
  for (let r = 17; r <= 21; r++) {
    for (let c = 3; c <= 7; c++) {
      if (r === 17 || r === 21 || c === 3 || c === 7) {
        tiles[r][c] = tile('wall', 3, true);
      } else {
        tiles[r][c] = tile('roof_red', 4, true);
      }
    }
  }

  // Inn door
  tiles[21][5] = tile('wood', 2, false, { interact: 'inn' });

  // Barrels near inn
  tiles[22][3] = tile('cobble', 2, true, { data: { deco: 'barrel' } });
  tiles[22][7] = tile('cobble', 2, true, { data: { deco: 'barrel' } });

  // Torch at inn entrance
  tiles[22][4] = tile('cobble', 2, false, { data: { deco: 'torch' } });

  // =========================================================================
  // 7. TRAINING HALL — 5x5 (cols 24-28, rows 17-21)
  // =========================================================================

  // Dirt around training hall
  for (let r = 16; r <= 23; r++) {
    for (let c = 23; c <= 29; c++) {
      if (!tiles[r][c].collision) {
        safeSet(r, c, tile('dirt', 2));
      }
    }
  }

  // Training Hall walls (5x5)
  for (let r = 17; r <= 21; r++) {
    for (let c = 24; c <= 28; c++) {
      if (r === 17 || r === 21 || c === 24 || c === 28) {
        tiles[r][c] = tile('wall', 3, true);
      } else {
        tiles[r][c] = tile('roof_blue', 4, true);
      }
    }
  }

  // Training Hall door (no interact yet)
  tiles[21][26] = tile('wood', 2);

  // Barrel near training hall
  tiles[22][24] = tile('dirt', 2, true, { data: { deco: 'barrel' } });

  // =========================================================================
  // 8. SMALL HOUSES — two 3x3 scattered houses
  // =========================================================================

  // House A — near (11, 4) → cols 11-13, rows 4-6
  for (let r = 4; r <= 6; r++) {
    for (let c = 11; c <= 13; c++) {
      if (r === 4 || r === 6 || c === 11 || c === 13) {
        tiles[r][c] = tile('wall', 3, true);
      } else {
        tiles[r][c] = tile('roof_red', 4, true);
      }
    }
  }
  tiles[6][12] = tile('wood', 2); // door (no interact)

  // House B — near (20, 19) → cols 20-22, rows 19-21
  for (let r = 19; r <= 21; r++) {
    for (let c = 20; c <= 22; c++) {
      if (r === 19 || r === 21 || c === 20 || c === 22) {
        tiles[r][c] = tile('wall', 3, true);
      } else {
        tiles[r][c] = tile('roof_red', 4, true);
      }
    }
  }
  tiles[21][21] = tile('wood', 2); // door (no interact)

  // =========================================================================
  // 9. POND — southwest (cols 8-14, rows 16-20), irregular shape with sand shore + stream
  // =========================================================================

  // Sand shore around pond
  const sandTiles: [number, number][] = [
    [15, 8], [15, 9], [15, 10], [15, 11], [15, 12],
    [16, 7], [16, 13], [17, 7], [17, 13],
    [18, 7], [18, 13], [19, 8], [19, 9],
    [19, 10], [19, 11], [19, 12],
    // Stream shore south
    [20, 9], [20, 11], [21, 9], [21, 11],
    [22, 9], [22, 11],
  ];
  for (const [r, c] of sandTiles) {
    safeSet(r, c, tile('sand', 2));
  }

  // Pond water tiles — irregular blob
  const pondWater: [number, number][] = [
    [16, 8], [16, 9], [16, 10], [16, 11], [16, 12],
    [17, 8], [17, 9], [17, 10], [17, 11], [17, 12],
    [18, 9], [18, 10], [18, 11],
  ];
  for (const [r, c] of pondWater) {
    tiles[r][c] = tile('water', 1, true);
  }

  // Small stream flowing south from pond (3 tiles)
  tiles[19][10] = tile('water', 1, true);
  tiles[20][10] = tile('water', 1, true);
  tiles[21][10] = tile('water', 1, true);

  // Mushrooms near pond
  safeSet(15, 7, tile('grass', 2, false, { data: { deco: 'mushroom' } }));
  safeSet(19, 8, tile('sand', 2, false, { data: { deco: 'mushroom' } }));

  // =========================================================================
  // 10. FOREST EXIT — col 31, rows 11-15, dirt transition
  // =========================================================================

  // Clear path through border — already handled in east road (row 12-14 exit at col 31)
  // Add extra dirt tiles for rows 11 and 15 to widen exit gap
  tiles[11][30] = tile('dirt', 2);
  tiles[11][31] = tile('dirt', 2, false, { interact: 'exit_forest', data: { target: 'Forest' } });
  tiles[15][30] = tile('dirt', 2);
  tiles[15][31] = tile('dirt', 2, false, { interact: 'exit_forest', data: { target: 'Forest' } });

  // Dirt transition leading into exit
  for (let r = 11; r <= 15; r++) {
    safeSet(r, 29, tile('dirt', 2));
  }

  // =========================================================================
  // 11. TREES — ~40 scattered trees (pine 60% / oak 40%)
  // =========================================================================
  const treePositions: [number, number, string][] = [
    // North area between buildings
    [3, 10, 'tree_oak'], [3, 15, 'tree'], [3, 18, 'tree'], [4, 16, 'tree_oak'],
    [3, 20, 'tree'], [4, 21, 'tree_oak'],
    // West side clusters
    [10, 2, 'tree'], [11, 3, 'tree_oak'], [12, 2, 'tree'], [13, 3, 'tree'],
    [14, 2, 'tree_oak'],
    // East side clusters
    [5, 29, 'tree'], [6, 29, 'tree_oak'], [7, 29, 'tree'],
    [16, 29, 'tree_oak'], [17, 29, 'tree'],
    // South clusters
    [23, 8, 'tree_oak'], [23, 9, 'tree'], [23, 10, 'tree_oak'],
    [23, 20, 'tree'], [23, 21, 'tree_oak'], [23, 22, 'tree'],
    // Near Elder Tower
    [10, 4, 'tree'], [10, 8, 'tree_oak'],
    // Near Merchant
    [10, 27, 'tree'], [10, 29, 'tree_oak'],
    // Between inn and pond
    [15, 3, 'tree_oak'], [16, 2, 'tree'],
    // Interior scattered
    [7, 15, 'tree'], [7, 16, 'tree_oak'],
    [16, 12, 'tree'], [16, 19, 'tree_oak'],
    [22, 12, 'tree'], [22, 19, 'tree_oak'],
    // Near training hall
    [16, 24, 'tree'], [16, 28, 'tree_oak'],
    // Central west
    [12, 9, 'tree_oak'], [14, 9, 'tree'],
    // Central east
    [8, 21, 'tree'], [9, 22, 'tree_oak'],
  ];
  for (const [r, c, deco] of treePositions) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !tiles[r][c].interact && !tiles[r][c].collision) {
      tiles[r][c] = tile('grass', 3, true, { data: { deco } });
    }
  }

  // =========================================================================
  // 12. DECORATIVE OBJECTS — flowers, barrels, torches, rocks, mushrooms
  // =========================================================================

  // Flower patches (~12) near paths, buildings, plaza
  const flowerPositions: [number, number][] = [
    [9, 10], [9, 21], [15, 10], [15, 21],
    [7, 4], [7, 8], [5, 9], [5, 10],
    [22, 8], [22, 10], [18, 12], [18, 20],
  ];
  for (const [r, c] of flowerPositions) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !tiles[r][c].interact && !tiles[r][c].collision) {
      tiles[r][c] = tile('grass', 2, false, { data: { deco: 'flower' } });
    }
  }

  // Rock decorations (4) in grassy areas
  const rockPositions: [number, number][] = [
    [6, 20], [15, 5], [22, 15], [4, 15],
  ];
  for (const [r, c] of rockPositions) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !tiles[r][c].interact && !tiles[r][c].collision) {
      tiles[r][c] = tile('grass', 2, true, { data: { deco: 'rock' } });
    }
  }

  // Additional barrels (near inn and shop — 3 more)
  safeSet(22, 5, tile('cobble', 2, true, { data: { deco: 'barrel' } }));
  safeSet(10, 22, tile('dirt', 2, true, { data: { deco: 'barrel' } }));
  safeSet(22, 28, tile('dirt', 2, true, { data: { deco: 'barrel' } }));

  // =========================================================================
  // WORLD HUB BİNALARI — kayıt defterinden türetilir (hubGames.ts tek kaynak)
  // Mevcut dokuya saygı: interact/deco taşıyan tile'lar ezilmez;
  // hub-town-check.ts kapı + erişilebilirlik + korunumu ayrıca doğrular.
  // =========================================================================
  for (const g of HUB_GAMES) {
    const { r0, r1, c0, c1 } = buildingRect(g);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        if (tiles[r][c].interact) continue; // interact taşıyan tile'a asla dokunma (npc/kapı/exit)
        const isWall = r === r0 || r === r1 || c === c0 || c === c1;
        if (isWall) {
          // Duvar halkası: düz dekor (interact'sız data) ezilir — yoksa duvar delik bırakır
          // ve oyuncu çatı altına yürüyebilir (Task 5 code-review bulgusu).
          tiles[r][c] = tile('wall', 4, true);
        } else {
          // İç mekan: dekor varsa atla (çatının altından dekor sızması kozmetik, zararsız).
          if (tiles[r][c].data) continue;
          tiles[r][c] = tile(g.roof, 5, true);
        }
      }
    }
    tiles[r1][g.door.tx] = tile('wood', 2, false, { interact: `${HUB_INTERACT_PREFIX}${g.id}` });
    if (r1 + 1 < ROWS && tiles[r1 + 1][g.door.tx].collision && !tiles[r1 + 1][g.door.tx].interact) {
      tiles[r1 + 1][g.door.tx] = tile('dirt', 2, false); // kapı önü yürünebilir
    }
  }

  return tiles;
}
