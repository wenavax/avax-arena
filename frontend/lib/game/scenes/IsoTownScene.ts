import * as Phaser from 'phaser';
import { IsoBaseScene } from '../iso/IsoBaseScene';
import { ZoneTile } from '../iso/core';
import { PlayerState } from '../PlayerState';
import { trackZoneVisit } from '../dailyQuests';
import { isTutorialDone, markTutorialDone, getTutorialSteps } from '../tutorial';

// ---------------------------------------------------------------------------
// NPC idle chat lines
// ---------------------------------------------------------------------------
const NPC_CHATS: Record<string, string[]> = {
  elder: [
    'The frost winds are restless...',
    'I sense dark magic in the forest.',
    'Warriors grow stronger every day.',
    'The dungeon holds many secrets.',
    'Stay vigilant, young one.',
  ],
  merchant: [
    'Fine goods for sale!',
    'Best prices in Hearthvale!',
    'Need potions? I got potions!',
    'Every warrior needs good gear.',
    'Fresh stock just arrived!',
  ],
};

// ---------------------------------------------------------------------------
// Map builder — 32 cols x 26 rows
// ---------------------------------------------------------------------------
function buildTownTiles(): ZoneTile[][] {
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

  return tiles;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class IsoTownScene extends IsoBaseScene {
  constructor() {
    super('Town');
  }

  create(): void {
    const state = PlayerState.get();
    state.lastZone = 'Town';

    // Track zone visit for daily explorer quest
    trackZoneVisit('Town');

    // Track market_research quest progress
    const mrQuest = state.quests.find(q => q.id === 'market_research' && !q.completed);
    if (mrQuest) {
      if (!state.flags.has('mr_visited_town')) {
        state.flags.add('mr_visited_town');
        mrQuest.progress = Math.min(mrQuest.target, mrQuest.progress + 1);
        if (mrQuest.progress >= mrQuest.target) mrQuest.completed = true;
        state.save();
      }
    }

    this.initZone(buildTownTiles(), 16, 22);

    // NPCs
    this.addNpcAt(6, 9, 'Elder Frost', 0xffdd44);
    this.addNpcAt(25, 9, 'Merchant Bjorn', 0xddaa44);

    this.events.emit('zone-change', 'Hearthvale Town');

    // Tutorial for first-time players
    if (!isTutorialDone()) {
      this.time.delayedCall(1000, () => this.runTutorial());
    }
  }

  // -----------------------------------------------------------------------
  // Tutorial sequence
  // -----------------------------------------------------------------------
  private runTutorial(): void {
    const steps = getTutorialSteps();
    let stepIndex = 0;

    const showStep = () => {
      if (stepIndex >= steps.length) {
        markTutorialDone();
        return;
      }
      const step = steps[stepIndex];
      this.showDialog(step.speaker, step.message);

      // After dialog closes, advance to next step
      const checkClosed = () => {
        this.time.delayedCall(500, () => {
          if (!this.frozen) {
            stepIndex++;
            if (step.waitFor === 'move') {
              // Wait for player to move at least once
              const origTx = this.playerTx;
              const origTy = this.playerTy;
              const checkMove = this.time.addEvent({
                delay: 200,
                loop: true,
                callback: () => {
                  if (this.playerTx !== origTx || this.playerTy !== origTy) {
                    checkMove.destroy();
                    this.time.delayedCall(500, showStep);
                  }
                },
              });
            } else {
              this.time.delayedCall(800, showStep);
            }
          } else {
            // Dialog still open, check again
            this.time.delayedCall(200, checkClosed);
          }
        });
      };
      checkClosed();
    };

    showStep();
  }

  protected onInteract(tile: ZoneTile, tx: number, ty: number): void {
    if (!tile.interact) return;
    const state = PlayerState.get();

    switch (tile.interact) {
      case 'npc': {
        const npcId = tile.data?.id;
        if (npcId === 'elder') {
          this.handleElder(state, tx, ty);
        } else if (npcId === 'merchant') {
          this.handleMerchant(state, tx, ty);
        }
        break;
      }
      case 'shop':
        this.openShop();
        break;

      case 'inn': {
        state.hp = state.maxHp;
        this.showDialog('Innkeeper', [
          'Rest well, traveler.',
          'Your health has been restored!',
        ], tx, ty);
        this.events.emit('hp-change');
        break;
      }
      case 'exit_forest':
        this.exitToScene('Forest');
        break;

      case 'elder_house':
        this.showDialog("Elder's Tower", [
          'The door is locked.',
          'Elder Frost prefers to meet visitors outside.',
        ], tx, ty);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Elder quest chain
  // -----------------------------------------------------------------------
  private handleElder(state: PlayerState, tx: number, ty: number): void {
    // --- Quest 1: skeleton_hunt ---
    const q1 = state.quests.find(q => q.id === 'skeleton_hunt');
    if (!q1 && !state.flags.has('skeleton_quest_done')) {
      state.quests.push({
        id: 'skeleton_hunt', title: 'Forest Threat', description: 'Slay skeletons in the forest',
        objective: 'skeleton', target: 5, progress: 0,
        reward: { type: 'xp', amount: 50 }, completed: false, turnedIn: false,
      });
      this.showDialog('Elder Frost', [
        'Greetings, warrior.',
        'Skeletons have infested the forest to the east.',
        'Slay 5 of them and return to me.',
        'Quest accepted: Forest Threat',
      ], tx, ty);
      this.events.emit('quest-update');
      state.save();
      return;
    }
    if (q1 && !q1.completed) {
      this.showDialog('Elder Frost', [
        `Skeletons slain: ${q1.progress}/${q1.target}`,
        'Keep hunting in the forest to the east!',
      ], tx, ty);
      return;
    }
    if (q1 && q1.completed && !q1.turnedIn) {
      q1.turnedIn = true;
      state.addXp(q1.reward.amount);
      state.gold += 30;
      state.flags.add('skeleton_quest_done');
      this.showDialog('Elder Frost', [
        'You did it! The forest is safer now.',
        '+50 XP, +30 Gold',
        'Now... the dungeon to the north holds greater dangers.',
        'Find the Frost Key inside. We need it to seal the portal.',
      ], tx, ty);
      state.quests.push({
        id: 'dungeon_boss', title: 'The Frost Key', description: 'Defeat the dungeon boss',
        objective: 'boss_frost', target: 1, progress: 0,
        reward: { type: 'xp', amount: 150 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 2: dungeon_boss ---
    const q2 = state.quests.find(q => q.id === 'dungeon_boss');
    if (q2 && !q2.completed) {
      this.showDialog('Elder Frost', [
        'The Frost Dragon guards the key in the dungeon.',
        'Defeat it and bring the key back to me.',
      ], tx, ty);
      return;
    }
    if (q2 && q2.completed && !q2.turnedIn) {
      q2.turnedIn = true;
      state.addXp(q2.reward.amount);
      state.gold += 50;
      state.flags.add('dungeon_boss_done');
      this.showDialog('Elder Frost', [
        'The Frost Key! At last!',
        '+150 XP, +50 Gold',
        'But I sense more darkness stirring...',
        'Spiders have overrun the western forest clearings.',
      ], tx, ty);
      // Give Quest 3: spider_infestation
      state.quests.push({
        id: 'spider_infestation', title: 'Spider Infestation', description: 'Kill 8 spiders in the Forest',
        objective: 'spider', target: 8, progress: state.killCounts['spider'] || 0,
        reward: { type: 'xp', amount: 75 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 3: spider_infestation ---
    const q3 = state.quests.find(q => q.id === 'spider_infestation');
    if (q3 && !q3.completed) {
      this.showDialog('Elder Frost', [
        `Spiders slain: ${q3.progress}/${q3.target}`,
        'Clear the spiders from the forest!',
      ], tx, ty);
      return;
    }
    if (q3 && q3.completed && !q3.turnedIn) {
      q3.turnedIn = true;
      state.addXp(75);
      state.gold += 40;
      state.flags.add('spider_quest_done');
      // Reward: Spider Silk Armor
      state.addItem({
        id: 'spider_silk_armor', name: 'Spider Silk Armor', sprite: 'armor',
        type: 'armor', stat: { def: 6, spd: 2 }, stackable: false, count: 1,
      });
      this.showDialog('Elder Frost', [
        'Excellent work! The forest breathes easier.',
        '+75 XP, +40 Gold',
        'Received: Spider Silk Armor!',
        'Now, ghosts plague the dungeon depths...',
      ], tx, ty);
      // Give Quest 4: ghost_hunters
      state.quests.push({
        id: 'ghost_hunters', title: 'Ghost Hunters', description: 'Kill 5 ghosts in the Dungeon',
        objective: 'ghost', target: 5, progress: state.killCounts['ghost'] || 0,
        reward: { type: 'xp', amount: 100 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 4: ghost_hunters ---
    const q4 = state.quests.find(q => q.id === 'ghost_hunters');
    if (q4 && !q4.completed) {
      this.showDialog('Elder Frost', [
        `Ghosts vanquished: ${q4.progress}/${q4.target}`,
        'The dungeon spirits must be banished!',
      ], tx, ty);
      return;
    }
    if (q4 && q4.completed && !q4.turnedIn) {
      q4.turnedIn = true;
      state.addXp(100);
      state.gold += 50;
      state.flags.add('ghost_quest_done');
      this.showDialog('Elder Frost', [
        'The ghosts have been banished. Well done!',
        '+100 XP, +50 Gold',
        'But I sense the dragon\'s spirit reforming...',
        'A stronger Frost Dragon has risen. Defeat it again!',
      ], tx, ty);
      // Give Quest 5: dragon_revenge
      state.quests.push({
        id: 'dragon_revenge', title: 'Dragon\'s Revenge', description: 'Defeat the stronger Frost Dragon',
        objective: 'boss_frost_v2', target: 1, progress: 0,
        reward: { type: 'xp', amount: 200 }, completed: false, turnedIn: false,
      });
      // Allow boss to respawn as stronger version
      state.flags.delete('boss_defeated');
      state.flags.add('dragon_revenge_active');
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 5: dragon_revenge ---
    const q5 = state.quests.find(q => q.id === 'dragon_revenge');
    if (q5 && !q5.completed) {
      this.showDialog('Elder Frost', [
        'The Frost Dragon has returned, stronger than before.',
        'Go to the dungeon and end it once more!',
      ], tx, ty);
      return;
    }
    if (q5 && q5.completed && !q5.turnedIn) {
      q5.turnedIn = true;
      state.addXp(200);
      state.gold += 100;
      state.flags.add('dragon_revenge_done');
      this.showDialog('Elder Frost', [
        'Incredible! You have slain the empowered dragon!',
        '+200 XP, +100 Gold',
        'One last task... an ancient artifact is hidden',
        'in a secret chest deep within the dungeon.',
        'Find it and bring it back to me.',
      ], tx, ty);
      // Give Quest 6: ancient_artifact
      state.quests.push({
        id: 'ancient_artifact', title: 'Ancient Artifact', description: 'Find the hidden chest in the Dungeon and return to Elder',
        objective: 'ancient_artifact_found', target: 1, progress: 0,
        reward: { type: 'xp', amount: 150 }, completed: false, turnedIn: false,
      });
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 6: ancient_artifact ---
    const q6 = state.quests.find(q => q.id === 'ancient_artifact');
    if (q6 && !q6.completed) {
      if (state.flags.has('ancient_chest_found')) {
        // Player found the chest, mark quest complete
        q6.progress = 1;
        q6.completed = true;
        q6.turnedIn = true;
        state.addXp(150);
        state.gold += 75;
        state.flags.add('ancient_artifact_done');
        this.showDialog('Elder Frost', [
          'The Ancient Artifact! You found it!',
          '+150 XP, +75 Gold',
          'With this, we can protect Hearthvale forever.',
          'You have proven yourself a true hero.',
        ], tx, ty);
        this.events.emit('quest-update');
        state.save();
      } else {
        this.showDialog('Elder Frost', [
          'Search the dungeon carefully.',
          'The ancient chest is hidden in a secret alcove.',
        ], tx, ty);
      }
      return;
    }

    // All elder quests done — idle chat
    const chatLines = NPC_CHATS.elder;
    const line = chatLines[Math.floor(Math.random() * chatLines.length)];
    this.showDialog('Elder Frost', [line], tx, ty);
  }

  // -----------------------------------------------------------------------
  // Merchant quest chain
  // -----------------------------------------------------------------------
  private handleMerchant(state: PlayerState, tx: number, ty: number): void {
    // --- Quest 7: supply_run ---
    const q7 = state.quests.find(q => q.id === 'supply_run');
    if (!q7 && !state.flags.has('supply_run_done') && state.flags.has('skeleton_quest_done')) {
      state.quests.push({
        id: 'supply_run', title: 'Supply Run', description: 'Collect bone shard, spider silk, and bat wing',
        objective: 'collect_materials', target: 3, progress: 0,
        reward: { type: 'xp', amount: 50 }, completed: false, turnedIn: false,
      });
      // Count already owned materials
      let prog = 0;
      if (state.hasItem('bone_shard')) prog++;
      if (state.hasItem('spider_silk_mat')) prog++;
      if (state.hasItem('bat_wing')) prog++;
      const q = state.quests.find(q => q.id === 'supply_run')!;
      q.progress = prog;
      if (prog >= 3) q.completed = true;
      this.showDialog('Merchant Bjorn', [
        'Hey there, warrior!',
        'I need some materials for my shop.',
        'Bring me a Bone Shard, Spider Silk, and a Bat Wing.',
        'Quest accepted: Supply Run',
      ], tx, ty);
      this.events.emit('quest-update');
      state.save();
      return;
    }
    if (q7 && !q7.completed) {
      // Re-check progress
      let prog = 0;
      if (state.hasItem('bone_shard')) prog++;
      if (state.hasItem('spider_silk_mat')) prog++;
      if (state.hasItem('bat_wing')) prog++;
      q7.progress = prog;
      if (prog >= 3) q7.completed = true;
      if (q7.completed) {
        // Turn in immediately
        q7.turnedIn = true;
        state.removeItem('bone_shard');
        state.removeItem('spider_silk_mat');
        state.removeItem('bat_wing');
        state.addXp(50);
        state.gold += 30;
        state.flags.add('supply_run_done');
        this.showDialog('Merchant Bjorn', [
          'Perfect! These materials are just what I needed.',
          '+50 XP, +30 Gold',
          'I have another task if you\'re interested...',
        ], tx, ty);
        // Give Quest 8: market_research
        state.quests.push({
          id: 'market_research', title: 'Market Research', description: 'Visit Forest, Dungeon, and return to Town',
          objective: 'visit_zones', target: 3, progress: 0,
          reward: { type: 'xp', amount: 40 }, completed: false, turnedIn: false,
        });
        // Reset zone visit flags for this quest
        state.flags.delete('mr_visited_town');
        state.flags.delete('mr_visited_forest');
        state.flags.delete('mr_visited_dungeon');
        // Mark town as visited since we're here
        state.flags.add('mr_visited_town');
        const mq = state.quests.find(q => q.id === 'market_research')!;
        mq.progress = 1;
        this.events.emit('quest-update');
        state.save();
      } else {
        const items: string[] = [];
        if (!state.hasItem('bone_shard')) items.push('Bone Shard');
        if (!state.hasItem('spider_silk_mat')) items.push('Spider Silk');
        if (!state.hasItem('bat_wing')) items.push('Bat Wing');
        this.showDialog('Merchant Bjorn', [
          `Materials: ${q7.progress}/${q7.target}`,
          `Still need: ${items.join(', ')}`,
          'Kill monsters — they drop what I need!',
        ], tx, ty);
      }
      return;
    }
    if (q7 && q7.completed && !q7.turnedIn) {
      q7.turnedIn = true;
      state.removeItem('bone_shard');
      state.removeItem('spider_silk_mat');
      state.removeItem('bat_wing');
      state.addXp(50);
      state.gold += 30;
      state.flags.add('supply_run_done');
      this.showDialog('Merchant Bjorn', [
        'Perfect! These materials are just what I needed.',
        '+50 XP, +30 Gold',
      ], tx, ty);
      // Give Quest 8: market_research
      state.quests.push({
        id: 'market_research', title: 'Market Research', description: 'Visit Forest, Dungeon, and return to Town',
        objective: 'visit_zones', target: 3, progress: 0,
        reward: { type: 'xp', amount: 40 }, completed: false, turnedIn: false,
      });
      state.flags.delete('mr_visited_town');
      state.flags.delete('mr_visited_forest');
      state.flags.delete('mr_visited_dungeon');
      state.flags.add('mr_visited_town');
      const mq = state.quests.find(q => q.id === 'market_research')!;
      mq.progress = 1;
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // --- Quest 8: market_research ---
    const q8 = state.quests.find(q => q.id === 'market_research');
    if (q8 && !q8.completed) {
      const visited: string[] = [];
      if (state.flags.has('mr_visited_town')) visited.push('Town');
      if (state.flags.has('mr_visited_forest')) visited.push('Forest');
      if (state.flags.has('mr_visited_dungeon')) visited.push('Dungeon');
      this.showDialog('Merchant Bjorn', [
        `Zones visited: ${visited.join(', ')} (${q8.progress}/${q8.target})`,
        'Visit the Forest and Dungeon, then come back!',
      ], tx, ty);
      return;
    }
    if (q8 && q8.completed && !q8.turnedIn) {
      q8.turnedIn = true;
      state.addXp(40);
      state.gold += 20;
      state.flags.add('market_research_done');
      this.showDialog('Merchant Bjorn', [
        'Great research! Now I know where to expand.',
        '+40 XP, +20 Gold',
        'Thanks for all your help, hero!',
      ], tx, ty);
      this.events.emit('quest-update');
      state.save();
      return;
    }

    // No quests available or all done — open shop
    this.openShop();
  }

  // -----------------------------------------------------------------------
  // Shop
  // -----------------------------------------------------------------------
  private openShop(): void {
    this.freeze();
    this.scene.launch('Shop');
    this.scene.pause();

    this.scene.get('Shop').events.once('shop-closed', () => {
      this.scene.resume();
      this.unfreeze();
      this.events.emit('hp-change');
    });
  }
}
