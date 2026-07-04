// ─── Frozen biomes (the "adventure zones") ───
// Four tiers gated by level + stats. Higher tiers pay a bigger pool but demand
// more progression — the ladder that makes leveling (the FSB sink) worthwhile.
import type { Zone } from './types';

export const ZONES: Zone[] = [
  {
    id: 'frostpond',
    name: 'Frostpond',
    tier: 1,
    blurb: 'A still, rime-crusted pool. Every Frostling can forage here.',
    ratePerMin: 60,
    primaryStats: ['atk'],
    gate: { minLevel: 1, minStats: {} },
  },
  {
    id: 'glacier-stream',
    name: 'Glacier Stream',
    tier: 1,
    blurb: 'Fast meltwater rewards the quick.',
    ratePerMin: 60,
    primaryStats: ['spd'],
    gate: { minLevel: 1, minStats: {} },
  },
  {
    id: 'frozen-marsh',
    name: 'Frozen Marsh',
    tier: 1,
    blurb: 'Treacherous ice favours the sturdy.',
    ratePerMin: 60,
    primaryStats: ['def'],
    gate: { minLevel: 1, minStats: {} },
  },
  {
    id: 'rime-river',
    name: 'Rime River',
    tier: 2,
    blurb: 'A roaring frozen river. Strength and wits both count.',
    ratePerMin: 150,
    primaryStats: ['atk', 'wisdom'],
    gate: { minLevel: 10, minStats: { atk: 5, wisdom: 5 } },
  },
  {
    id: 'whitewood-forest',
    name: 'Whitewood Forest',
    tier: 3,
    blurb: 'A silent frost-forest that tests body and mind.',
    ratePerMin: 300,
    primaryStats: ['spd', 'def', 'wisdom'],
    gate: { minLevel: 15, minStats: { spd: 5, def: 5, wisdom: 5 } },
  },
  {
    id: 'great-frostlake',
    name: 'The Great Frostlake',
    tier: 4,
    blurb: 'The frozen heart of the world. Only the mightiest endure.',
    ratePerMin: 600,
    primaryStats: ['atk', 'def', 'spd', 'wisdom'],
    gate: { minLevel: 20, minStats: { atk: 5, def: 5, spd: 5, wisdom: 5 } },
  },
];

export const ZONE_BY_ID: Record<string, Zone> = Object.fromEntries(
  ZONES.map((z) => [z.id, z]),
);
