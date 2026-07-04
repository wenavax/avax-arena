// ─── Hero roster: demo (P0) + on-chain mapper (ready for P1) ───
import type { AdventureHero, AdventuresState, Rarity } from './types';
import { ELEMENTS, type Element } from '../nft/heroGenerator';

/** uint8 rarity index (FrostbiteHeroes.getHero) → Rarity string. */
export const RARITY_BY_INDEX: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * Map a FrostbiteHeroes.getHero() tuple → AdventureHero. Unused in P0 (demo roster),
 * present so P1 can drop real on-chain heroes into the exact same loop with no engine
 * change. `h` is the struct { element, rarity, level, xp, atk, def, spd, ... }.
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
    atk: h.atk,
    def: h.def,
    spd: h.spd,
  };
}

/** A hand-tuned demo roster spanning rarities/elements so tier-gating and
 *  progression are visible immediately, with no wallet or NFT required. */
export const DEMO_ROSTER: AdventureHero[] = [
  { id: 'demo:1', name: 'Ember',  element: 'fire',    rarity: 'rare',      level: 12, atk: 16, def: 7,  spd: 11 },
  { id: 'demo:2', name: 'Glacia', element: 'ice',     rarity: 'epic',      level: 18, atk: 13, def: 12, spd: 11 },
  { id: 'demo:3', name: 'Zephyr', element: 'wind',    rarity: 'uncommon',  level: 8,  atk: 9,  def: 6,  spd: 15 },
  { id: 'demo:4', name: 'Terron', element: 'earth',   rarity: 'common',    level: 5,  atk: 6,  def: 14, spd: 7  },
  { id: 'demo:5', name: 'Volt',   element: 'thunder', rarity: 'legendary', level: 22, atk: 15, def: 9,  spd: 14 },
  { id: 'demo:6', name: 'Umbra',  element: 'shadow',  rarity: 'rare',      level: 14, atk: 17, def: 5,  spd: 12 },
];

export function createInitialState(): AdventuresState {
  return {
    version: 1,
    shards: 0,
    roster: DEMO_ROSTER.map((h) => ({ ...h })),
    positions: [],
    lastSettle: Date.now(),
    totalClaimed: 0,
    totalBurned: 0,
  };
}

// ── Persistence (localStorage, client-only) ──
export const STORAGE_KEY = 'frostbite_adventures_v1';

export function loadState(): AdventuresState {
  if (typeof window === 'undefined') return createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as AdventuresState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.roster)) return createInitialState();
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
