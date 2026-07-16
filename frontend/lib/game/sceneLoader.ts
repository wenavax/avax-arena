// ─── Dynamic Scene Loader ───
// Lazy-loads Phaser scenes on demand instead of loading all 23 at startup.
// Core scenes load at init, zone scenes load during fade transitions.

type SceneImport = () => Promise<any>;

// Scene key → dynamic import mapping
const SCENE_IMPORTS: Record<string, SceneImport> = {
  // Town bundle
  Town:        () => import('./scenes/IsoTownScene'),
  Shop:        () => import('./scenes/ShopScene'),
  Inventory:   () => import('./scenes/InventoryScene'),
  Settings:    () => import('./scenes/SettingsScene'),
  // Combat
  Battle:      () => import('./scenes/BattleScene'),
  // Zone scenes (each its own chunk)
  Forest:      () => import('./scenes/IsoForestScene'),
  Dungeon:     () => import('./scenes/IsoDungeonScene'),
  IceCave:     () => import('./scenes/IsoIceCaveScene'),
  Volcano:     () => import('./scenes/IsoVolcanoScene'),
  Crypt:       () => import('./scenes/IsoCryptScene'),
  Abyss:       () => import('./scenes/IsoAbyssScene'),
  Sanctum:     () => import('./scenes/IsoSanctumScene'),
  Swamp:       () => import('./scenes/IsoSwampScene'),
  Mines:       () => import('./scenes/IsoMinesScene'),
  Citadel:     () => import('./scenes/IsoCitadelScene'),
  Necropolis:  () => import('./scenes/IsoNecropolisScene'),
  FrostWastes: () => import('./scenes/IsoFrostWastesScene'),
  DemonGate:   () => import('./scenes/IsoDemonGateScene'),
  Ruins:       () => import('./scenes/IsoRuinsScene'),
  VoidRealm:   () => import('./scenes/IsoVoidScene'),
  Forge:       () => import('./scenes/IsoForgeScene'),
  Eternal:     () => import('./scenes/IsoEternalScene'),
};

// Zone connection map — used for preloading neighbors
const ZONE_NEIGHBORS: Record<string, string[]> = {
  Town:        ['Forest'],
  Forest:      ['Town', 'Dungeon', 'Volcano', 'Crypt', 'Abyss', 'Sanctum', 'Swamp', 'Mines', 'Citadel', 'Necropolis', 'FrostWastes', 'DemonGate', 'Ruins', 'VoidRealm', 'Forge', 'Eternal'],
  Dungeon:     ['Forest', 'IceCave'],
  IceCave:     ['Dungeon'],
  Volcano:     ['Forest'],
  Crypt:       ['Forest'],
  Abyss:       ['Forest'],
  Sanctum:     ['Forest'],
  Swamp:       ['Forest'],
  Mines:       ['Forest'],
  Citadel:     ['Forest'],
  Necropolis:  ['Forest'],
  FrostWastes: ['Forest'],
  DemonGate:   ['Forest'],
  Ruins:       ['Forest'],
  VoidRealm:   ['Forest'],
  Forge:       ['Forest'],
  Eternal:     ['Forest'],
};

// Track loading state
const loadedScenes = new Set<string>();
const loadingPromises = new Map<string, Promise<void>>();

/**
 * Load and register a scene dynamically.
 * Safe to call multiple times — no-ops if already loaded.
 */
export async function loadScene(game: Phaser.Game, key: string): Promise<void> {
  // Trust the game instance, not just the module-level cache: after the Phaser
  // game is destroyed and recreated (leave world → re-enter), the cache would
  // still say "loaded" while the new instance has no such scene registered.
  if (loadedScenes.has(key)) {
    if (game.scene.getScene(key)) return;
    loadedScenes.delete(key);
  }
  if (loadingPromises.has(key)) return loadingPromises.get(key);

  const importFn = SCENE_IMPORTS[key];
  if (!importFn) {
    console.warn(`[SceneLoader] Unknown scene: ${key}`);
    return;
  }

  const promise = (async () => {
    try {
      const module = await importFn();
      // Find the scene class export (first function/class export)
      // Find the exported scene class
      const PhaserRef = (window as any).__Phaser;
      const isScene = PhaserRef
        ? (v: any) => typeof v === 'function' && v.prototype instanceof PhaserRef.Scene
        : (v: any) => typeof v === 'function' && v.prototype?.scene !== undefined;
      const SceneClass = Object.values(module).find(isScene)
        || Object.values(module).find((v: any) => typeof v === 'function');

      if (SceneClass && !game.scene.getScene(key)) {
        game.scene.add(key, SceneClass as any);
      }
      loadedScenes.add(key);
    } catch (e) {
      console.error(`[SceneLoader] Failed to load scene: ${key}`, e);
    } finally {
      loadingPromises.delete(key);
    }
  })();

  loadingPromises.set(key, promise);
  return promise;
}

/**
 * Preload neighbor zones in background (non-blocking).
 * Also always preloads Battle scene.
 */
export function preloadNeighbors(game: Phaser.Game, currentZone: string): void {
  const neighbors = ZONE_NEIGHBORS[currentZone] || [];
  const toLoad = ['Battle', ...neighbors];
  // Fire and forget — don't await
  for (const key of toLoad) {
    loadScene(game, key).catch(() => {});
  }
}

/**
 * Load Town bundle (Town + Shop + Inventory + Settings).
 * Called early since player almost always visits town.
 */
export async function loadTownBundle(game: Phaser.Game): Promise<void> {
  await Promise.all([
    loadScene(game, 'Town'),
    loadScene(game, 'Shop'),
    loadScene(game, 'Inventory'),
    loadScene(game, 'Settings'),
    // Battle must never lose the lazy-load race: zone scenes call
    // scene.get('Battle').events right after launch — null there soft-locks
    // the frozen zone. Loading it at boot closes that window.
    loadScene(game, 'Battle'),
  ]);
}

/**
 * Ensure a scene is ready before transitioning.
 * Returns true if scene loaded successfully.
 */
export async function ensureScene(game: Phaser.Game, key: string): Promise<boolean> {
  await loadScene(game, key);
  // Also ensure Battle is available (needed in any zone)
  loadScene(game, 'Battle').catch(() => {});
  return loadedScenes.has(key);
}
