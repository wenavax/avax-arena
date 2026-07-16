// ─── Isometric Island World Generator ───────────────────────────────
// Block Stranding-style island with biomes, zones, and object placement.
// Deterministic via seeded PRNG.

export enum Biome {
  DEEP_WATER = 0,
  WATER = 1,
  SAND = 2,
  GRASS = 3,
  DARK_GRASS = 4,
  ROCK = 5,
  SNOW = 6,
  LAVA = 7,
}

export enum ObjectType {
  NONE = 0,
  TREE_GREEN = 1,
  TREE_PINE = 2,
  TREE_PALM = 3,
  ROCK_SMALL = 4,
  ROCK_LARGE = 5,
  HOUSE = 6,
  TOWER = 7,
  SHOP = 8,
  INN = 9,
  CRYSTAL = 10,
  LAVA_ROCK = 11,
  FLOWER = 12,
  BUSH = 13,
}

export interface WorldTile {
  height: number;      // 0-5
  biome: Biome;
  object: ObjectType;
  zoneName?: string;   // 'town' | 'forest' | 'dungeon' | 'icecave' | 'volcano'
}

export interface ZoneInfo {
  name: string;
  label: string;
  cx: number;
  cy: number;
  radius: number;
  color: number;
}

export const MAP_SIZE = 96;

export const ZONES: ZoneInfo[] = [
  // ── Core zones (central area) ──
  { name: 'town',       label: 'Hearthvale',          cx: 48, cy: 52, radius: 6, color: 0xffcc33 },
  { name: 'forest',     label: 'Whispering Forest',    cx: 60, cy: 40, radius: 7, color: 0x44aa33 },
  { name: 'dungeon',    label: 'Frost Dungeon',         cx: 48, cy: 28, radius: 5, color: 0x8888aa },
  { name: 'icecave',    label: 'Ice Cavern',            cx: 30, cy: 24, radius: 5, color: 0x88ccff },
  { name: 'volcano',    label: 'Ember Peak',            cx: 30, cy: 60, radius: 5, color: 0xff4422 },
  // ── First expansion (3 dungeons) ──
  { name: 'crypt',      label: 'Crypt of Shadows',      cx: 72, cy: 60, radius: 6, color: 0x665588 },
  { name: 'abyss',      label: 'Abyssal Depths',        cx: 72, cy: 24, radius: 6, color: 0x2266aa },
  { name: 'sanctum',    label: "Dragon's Sanctum",      cx: 30, cy: 42, radius: 6, color: 0xff6600 },
  // ── Second expansion (10 new dungeons) ──
  { name: 'swamp',      label: 'Haunted Swamp',         cx: 18, cy: 72, radius: 5, color: 0x448833 },
  { name: 'mines',      label: 'Crystal Mines',         cx: 80, cy: 42, radius: 5, color: 0x66aacc },
  { name: 'citadel',    label: 'Sky Citadel',           cx: 48, cy: 14, radius: 5, color: 0x88bbff },
  { name: 'necropolis', label: 'Necropolis',             cx: 78, cy: 72, radius: 6, color: 0x554466 },
  { name: 'frostwastes',label: 'Frost Wastes',          cx: 14, cy: 14, radius: 6, color: 0xaaddff },
  { name: 'demongate',  label: "Demon's Gate",          cx: 48, cy: 78, radius: 6, color: 0xcc2200 },
  { name: 'ruins',      label: 'Ancient Ruins',         cx: 14, cy: 42, radius: 5, color: 0x998866 },
  { name: 'voidrealm',  label: 'Void Realm',            cx: 82, cy: 14, radius: 6, color: 0x442266 },
  { name: 'forge',      label: "Titan's Forge",         cx: 82, cy: 82, radius: 6, color: 0xdd6600 },
  { name: 'eternal',    label: 'Eternal Abyss',         cx: 48, cy: 90, radius: 5, color: 0x220044 },
];

// ─── Seeded PRNG (mulberry32) ───────────────────────────────────────

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Value Noise ────────────────────────────────────────────────────

function hashNoise(ix: number, iy: number, seed: number): number {
  // Simple integer hash for reproducible per-cell value
  let h = seed + ix * 374761393 + iy * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) & 0xffff) / 0xffff;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const v00 = hashNoise(ix, iy, seed);
  const v10 = hashNoise(ix + 1, iy, seed);
  const v01 = hashNoise(ix, iy + 1, seed);
  const v11 = hashNoise(ix + 1, iy + 1, seed);

  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

// ─── Fractal Brownian Motion (4 octaves) ────────────────────────────

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxVal = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 1337);
    maxVal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxVal; // normalized 0-1
}

// ─── Helpers ────────────────────────────────────────────────────────

function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function zoneAt(x: number, y: number): ZoneInfo | null {
  for (const z of ZONES) {
    if (dist(x, y, z.cx, z.cy) <= z.radius) return z;
  }
  return null;
}

function zoneInfluence(x: number, y: number, zone: ZoneInfo): number {
  const d = dist(x, y, zone.cx, zone.cy);
  if (d >= zone.radius) return 0;
  return 1 - d / zone.radius; // 1 at center, 0 at edge
}

// ─── Main Generator ─────────────────────────────────────────────────

export function generateWorld(seed: number = 42): WorldTile[][] {
  const rng = createRng(seed);
  const center = MAP_SIZE / 2; // 24
  const maxDist = center * 1.1; // slightly beyond corner

  // Pre-allocate grid
  const grid: WorldTile[][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => ({
      height: 0,
      biome: Biome.DEEP_WATER,
      object: ObjectType.NONE,
    }))
  );

  // ── Pass 1: Height map ──────────────────────────────────────────

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      // Island falloff: radial distance from center
      const d = dist(x, y, center, center);
      const falloff = Math.max(0, 1.0 - Math.pow(d / maxDist, 1.5));

      // Base noise
      const noise = fbm(x * 0.08, y * 0.08, seed, 4);

      // Raw height (0-1 range)
      let rawHeight = falloff * noise;

      // ── Zone influence on height ──
      const zone = zoneAt(x, y);
      if (zone) {
        const inf = zoneInfluence(x, y, zone);

        switch (zone.name) {
          case 'town':
            rawHeight = rawHeight * (1 - inf * 0.8) + 0.4 * inf * 0.8;
            break;
          case 'forest':
            rawHeight = rawHeight * (1 - inf * 0.5) + 0.45 * inf * 0.5;
            break;
          case 'dungeon':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.85 * inf * 0.7;
            break;
          case 'icecave':
            rawHeight = rawHeight * (1 - inf * 0.6) + 0.7 * inf * 0.6;
            break;
          case 'volcano':
            rawHeight = rawHeight * (1 - inf * 0.6) + (0.5 + inf * 0.15) * inf * 0.6;
            break;
          case 'crypt':
            // Dark underground, push to rock/dark
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.75 * inf * 0.7;
            break;
          case 'abyss':
            // Deep ocean area
            rawHeight = rawHeight * (1 - inf * 0.6) + 0.15 * inf * 0.6;
            break;
          case 'sanctum':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.9 * inf * 0.7;
            break;
          case 'swamp':
            rawHeight = rawHeight * (1 - inf * 0.6) + 0.2 * inf * 0.6;
            break;
          case 'mines':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.8 * inf * 0.7;
            break;
          case 'citadel':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.95 * inf * 0.7;
            break;
          case 'necropolis':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.7 * inf * 0.7;
            break;
          case 'frostwastes':
            rawHeight = rawHeight * (1 - inf * 0.6) + 0.8 * inf * 0.6;
            break;
          case 'demongate':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.6 * inf * 0.7;
            break;
          case 'ruins':
            rawHeight = rawHeight * (1 - inf * 0.5) + 0.5 * inf * 0.5;
            break;
          case 'voidrealm':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.85 * inf * 0.7;
            break;
          case 'forge':
            rawHeight = rawHeight * (1 - inf * 0.7) + 0.75 * inf * 0.7;
            break;
          case 'eternal':
            rawHeight = rawHeight * (1 - inf * 0.8) + 0.1 * inf * 0.8;
            break;
        }
      }

      // Quantize to 0-5
      const height = clamp(Math.floor(rawHeight * 6), 0, 5);
      grid[y][x].height = height;
    }
  }

  // ── Pass 2: Biome assignment ────────────────────────────────────

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = grid[y][x];
      const h = tile.height;
      const zone = zoneAt(x, y);

      // Zone tagging
      if (zone) {
        tile.zoneName = zone.name;
      }

      // Volcano lava override (inner core)
      if (zone?.name === 'volcano') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.6) {
          tile.biome = Biome.LAVA;
          continue;
        }
        if (inf > 0.3) {
          tile.biome = Biome.ROCK;
          continue;
        }
      }

      // IceCave override
      if (zone?.name === 'icecave') {
        const inf = zoneInfluence(x, y, zone);
        if (h >= 3 || inf > 0.4) {
          tile.biome = Biome.SNOW;
          continue;
        }
      }

      // Dungeon override
      if (zone?.name === 'dungeon') {
        if (h >= 4) {
          tile.biome = Biome.SNOW;
          continue;
        }
        if (h >= 3) {
          tile.biome = Biome.ROCK;
          continue;
        }
      }

      // Forest override
      if (zone?.name === 'forest') {
        if (h >= 2) {
          tile.biome = Biome.DARK_GRASS;
          continue;
        }
      }

      // Town override
      if (zone?.name === 'town') {
        if (h >= 1) {
          tile.biome = Biome.GRASS;
          continue;
        }
      }

      // Crypt override — dark rocky terrain
      if (zone?.name === 'crypt') {
        const inf = zoneInfluence(x, y, zone);
        if (h >= 3 || inf > 0.5) {
          tile.biome = Biome.ROCK;
          continue;
        }
        if (inf > 0.2) {
          tile.biome = Biome.DARK_GRASS;
          continue;
        }
      }

      // Abyss override — deep water zone
      if (zone?.name === 'abyss') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.5) {
          tile.biome = Biome.DEEP_WATER;
          continue;
        }
        if (inf > 0.2) {
          tile.biome = Biome.WATER;
          continue;
        }
      }

      // Sanctum override — volcanic mountain
      if (zone?.name === 'sanctum') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.6) {
          tile.biome = Biome.LAVA;
          continue;
        }
        if (inf > 0.3) {
          tile.biome = Biome.ROCK;
          continue;
        }
      }

      // Swamp — waterlogged
      if (zone?.name === 'swamp') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.5) { tile.biome = Biome.WATER; continue; }
        if (inf > 0.2) { tile.biome = Biome.DARK_GRASS; continue; }
      }
      // Mines — rocky
      if (zone?.name === 'mines') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.4) { tile.biome = Biome.ROCK; continue; }
      }
      // Citadel — snow peaks
      if (zone?.name === 'citadel') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.3) { tile.biome = Biome.SNOW; continue; }
      }
      // Necropolis — dark rock
      if (zone?.name === 'necropolis') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.5) { tile.biome = Biome.ROCK; continue; }
        if (inf > 0.2) { tile.biome = Biome.DARK_GRASS; continue; }
      }
      // Frost Wastes — deep snow
      if (zone?.name === 'frostwastes') {
        tile.biome = Biome.SNOW; continue;
      }
      // Demon's Gate — lava/rock
      if (zone?.name === 'demongate') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.6) { tile.biome = Biome.LAVA; continue; }
        if (inf > 0.3) { tile.biome = Biome.ROCK; continue; }
      }
      // Ruins — grass with rock
      if (zone?.name === 'ruins') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.5) { tile.biome = Biome.ROCK; continue; }
        if (inf > 0.2) { tile.biome = Biome.GRASS; continue; }
      }
      // Void Realm — dark rock/snow
      if (zone?.name === 'voidrealm') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.5) { tile.biome = Biome.ROCK; continue; }
        if (inf > 0.2) { tile.biome = Biome.SNOW; continue; }
      }
      // Forge — volcanic
      if (zone?.name === 'forge') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.6) { tile.biome = Biome.LAVA; continue; }
        if (inf > 0.3) { tile.biome = Biome.ROCK; continue; }
      }
      // Eternal Abyss — deep water/dark
      if (zone?.name === 'eternal') {
        const inf = zoneInfluence(x, y, zone);
        if (inf > 0.4) { tile.biome = Biome.DEEP_WATER; continue; }
        if (inf > 0.1) { tile.biome = Biome.WATER; continue; }
      }

      // Standard biome by height
      if (h === 0) {
        // Check if deep or shallow water
        const d = dist(x, y, center, center);
        tile.biome = d > maxDist * 0.85 ? Biome.DEEP_WATER : Biome.WATER;
      } else if (h === 1) {
        tile.biome = Biome.SAND;
      } else if (h === 2) {
        tile.biome = Biome.GRASS;
      } else if (h === 3) {
        // Check proximity to forest for dark grass
        const forestZone = ZONES.find(z => z.name === 'forest')!;
        const dForest = dist(x, y, forestZone.cx, forestZone.cy);
        tile.biome = dForest < forestZone.radius + 3 ? Biome.DARK_GRASS : Biome.ROCK;
      } else if (h === 4) {
        tile.biome = Biome.ROCK;
      } else {
        tile.biome = Biome.SNOW;
      }
    }
  }

  // ── Pass 3: Object placement ────────────────────────────────────

  // Town buildings at specific positions relative to town center
  const townZone = ZONES.find(z => z.name === 'town')!;
  const townBuildings: { dx: number; dy: number; obj: ObjectType }[] = [
    { dx: 0, dy: 0, obj: ObjectType.TOWER },
    { dx: -2, dy: -1, obj: ObjectType.HOUSE },
    { dx: 2, dy: -1, obj: ObjectType.HOUSE },
    { dx: -3, dy: 1, obj: ObjectType.SHOP },
    { dx: 3, dy: 1, obj: ObjectType.INN },
    { dx: -1, dy: 2, obj: ObjectType.HOUSE },
    { dx: 1, dy: 2, obj: ObjectType.HOUSE },
    { dx: 0, dy: -3, obj: ObjectType.HOUSE },
    { dx: -2, dy: 3, obj: ObjectType.HOUSE },
    { dx: 2, dy: 3, obj: ObjectType.HOUSE },
    { dx: -4, dy: -1, obj: ObjectType.HOUSE },
    { dx: 4, dy: 0, obj: ObjectType.HOUSE },
  ];

  for (const b of townBuildings) {
    const bx = townZone.cx + b.dx;
    const by = townZone.cy + b.dy;
    if (bx >= 0 && bx < MAP_SIZE && by >= 0 && by < MAP_SIZE) {
      grid[by][bx].object = b.obj;
    }
  }

  // Natural object placement
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = grid[y][x];

      // Skip if already has an object (town buildings)
      if (tile.object !== ObjectType.NONE) continue;

      const r = rng();

      switch (tile.biome) {
        case Biome.GRASS: {
          if (tile.zoneName === 'town') break; // keep town clean
          if (r < 0.08) tile.object = ObjectType.TREE_GREEN;
          else if (r < 0.15) tile.object = ObjectType.TREE_PINE;
          else if (r < 0.20) tile.object = ObjectType.FLOWER;
          else if (r < 0.23) tile.object = ObjectType.BUSH;
          break;
        }
        case Biome.DARK_GRASS: {
          if (r < 0.18) tile.object = ObjectType.TREE_PINE;
          else if (r < 0.30) tile.object = ObjectType.TREE_GREEN;
          else if (r < 0.35) tile.object = ObjectType.BUSH;
          break;
        }
        case Biome.SAND: {
          if (r < 0.05) tile.object = ObjectType.TREE_PALM;
          else if (r < 0.08) tile.object = ObjectType.ROCK_SMALL;
          break;
        }
        case Biome.ROCK: {
          if (r < 0.05) tile.object = ObjectType.ROCK_LARGE;
          else if (r < 0.10) tile.object = ObjectType.ROCK_SMALL;
          else if (r < 0.13) tile.object = ObjectType.CRYSTAL;
          break;
        }
        case Biome.SNOW: {
          if (r < 0.05) tile.object = ObjectType.TREE_PINE;
          else if (r < 0.10) tile.object = ObjectType.ROCK_SMALL;
          else if (r < 0.13) tile.object = ObjectType.ROCK_LARGE;
          break;
        }
        case Biome.LAVA: {
          if (r < 0.15) tile.object = ObjectType.LAVA_ROCK;
          break;
        }
        default:
          break;
      }
    }
  }

  return grid;
}
