// ─── Hero roster: demo (P0) + recruits + on-chain mapper (ready for P1) ───
import type { AdventureHero, AdventuresState, Rarity } from './types';
import { ELEMENTS, type Element } from '../nft/heroGenerator';
import { Rng } from '../expeditions/rng';

/** uint8 rarity index (FrostbiteHeroes.getHero) → Rarity string. */
export const RARITY_BY_INDEX: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Element base stats (mirrors the mint page's getBaseStats archetypes). */
const BASE_STATS: Record<Element, { atk: number; def: number; spd: number }> = {
  fire: { atk: 12, def: 6, spd: 8 }, water: { atk: 8, def: 10, spd: 8 },
  wind: { atk: 8, def: 6, spd: 12 }, ice: { atk: 10, def: 8, spd: 8 },
  earth: { atk: 6, def: 12, spd: 8 }, thunder: { atk: 10, def: 6, spd: 10 },
  shadow: { atk: 12, def: 4, spd: 10 }, light: { atk: 8, def: 8, spd: 10 },
};
const RARITY_STAT_BONUS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5 };
const NAME_POOL = ['Frostnip', 'Sleet', 'Hail', 'Rime', 'Blizzard', 'Icicle', 'Snowdrift', 'Glimmer', 'Coldsnap', 'Flurry', 'Shiver', 'Frostbite'];

/**
 * Map a FrostbiteHeroes.getHero() tuple → AdventureHero. Unused in P0 (demo roster),
 * present so P1 can drop real on-chain heroes into the exact same loop with no engine change.
 */
export function heroFromChain(tokenId: number | bigint, h: {
  element: number; rarity: number; level: number; atk: number; def: number; spd: number;
}): AdventureHero {
  const element: Element = ELEMENTS[h.element] ?? 'fire';
  return {
    id: String(tokenId),
    name: `Frostling #${tokenId}`,
    element,
    rarity: RARITY_BY_INDEX[h.rarity] ?? 'common',
    level: Math.max(1, h.level),
    atk: h.atk, def: h.def, spd: h.spd,
    seed: Number(tokenId) * 2654435761 % 2147483647,
  };
}

/** Generate a fresh recruit deterministically from the recruit counter. */
export function makeRecruit(recruited: number): AdventureHero {
  const seed = 900001 + recruited;
  const rng = new Rng(`recruit:${seed}`);
  const element = rng.pick(ELEMENTS);
  const roll = rng.next() * 10000;
  const rarity: Rarity = roll >= 9700 ? 'legendary' : roll >= 9200 ? 'epic' : roll >= 8000 ? 'rare' : roll >= 5500 ? 'uncommon' : 'common';
  const base = BASE_STATS[element];
  const bump = RARITY_STAT_BONUS[rarity];
  return {
    id: `recruit:${recruited}`,
    name: `${rng.pick(NAME_POOL)}`,
    element,
    rarity,
    level: 1,
    atk: base.atk + bump + rng.int(0, 2),
    def: base.def + bump + rng.int(0, 2),
    spd: base.spd + bump + rng.int(0, 2),
    seed,
  };
}

/** A hand-tuned demo roster spanning rarities/elements so tier-gating, affinity,
 *  and progression are visible immediately — no wallet or NFT required. */
export const DEMO_ROSTER: AdventureHero[] = [
  { id: 'demo:1', name: 'Ember',  element: 'fire',    rarity: 'rare',      level: 12, atk: 16, def: 7,  spd: 11, seed: 101 },
  { id: 'demo:2', name: 'Glacia', element: 'ice',     rarity: 'epic',      level: 18, atk: 13, def: 12, spd: 11, seed: 202 },
  { id: 'demo:3', name: 'Zephyr', element: 'wind',    rarity: 'uncommon',  level: 8,  atk: 9,  def: 6,  spd: 15, seed: 303 },
  { id: 'demo:4', name: 'Terron', element: 'earth',   rarity: 'common',    level: 5,  atk: 6,  def: 14, spd: 7,  seed: 404 },
  { id: 'demo:5', name: 'Volt',   element: 'thunder', rarity: 'legendary', level: 22, atk: 15, def: 9,  spd: 14, seed: 505 },
  { id: 'demo:6', name: 'Umbra',  element: 'shadow',  rarity: 'rare',      level: 14, atk: 17, def: 5,  spd: 12, seed: 606 },
];

export function createInitialState(): AdventuresState {
  return {
    version: 2,
    shards: 0,
    roster: DEMO_ROSTER.map((h) => ({ ...h })),
    positions: [],
    lastSettle: Date.now(),
    totalClaimed: 0,
    totalBurned: 0,
    foundShards: 0,
    recruited: 0,
    events: [],
  };
}

// ── Persistence (localStorage, client-only) ──
export const STORAGE_KEY = 'frostbite_adventures_v2';

export function loadState(): AdventuresState {
  if (typeof window === 'undefined') return createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as AdventuresState;
    if (parsed?.version !== 2 || !Array.isArray(parsed.roster)) return createInitialState();
    return parsed;
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AdventuresState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — non-fatal for a demo */
  }
}
