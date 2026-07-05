// ─── Frostbite Adventures — idle NFT staking (P0, token-free) ───
// Hoppers-style loop: stake a Hero into a frozen biome → it accrues soft
// "Frost Shards" weighted by stat/level/rarity → claim → burn shards to level up
// → higher level raises both yield-share and the emission cap. P0 is 100% off-chain
// (localStorage, wall-clock accrual, ZERO token risk). The on-chain FSB/AVAX
// settlement is P1 — this module never references a token or contract.

import type { Element } from '../nft/heroGenerator';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Rank 1..5 — drives "wisdom" and the rarity yield multiplier. */
export const RARITY_RANK: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5,
};

/** Yield multiplier by rarity (Hoppers-style Exceptional/Epic curve, mapped to our tiers). */
export const RARITY_MULT: Record<Rarity, number> = {
  common: 1, uncommon: 1.15, rare: 1.35, epic: 1.6, legendary: 2.0,
};

/** A hero available to send adventuring. In P0 these come from a demo roster;
 *  the same shape maps 1:1 from FrostbiteHeroes.getHero() in P1. */
export interface AdventureHero {
  id: string;        // 'demo:1' in P0, `${tokenId}` on-chain in P1
  name: string;
  element: Element;
  rarity: Rarity;
  level: number;
  atk: number;
  def: number;
  spd: number;
  seed: number;      // stable pixel-art sprite seed
}

/** Which stat(s) a zone rewards. `wisdom` = level × rarityRank (a composite, no new field). */
export type StatKey = 'atk' | 'def' | 'spd' | 'wisdom';

export interface Zone {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  blurb: string;
  /** Total Frost Shards distributed across everyone staked here, per game-minute. */
  ratePerMin: number;
  /** Stats summed (equally) to form a hero's yield weight in this zone. */
  primaryStats: StatKey[];
  /** Element that thrives here — matching heroes earn a larger share (affinity). */
  favoredElement: Element;
  gate: {
    minLevel: number;
    minStats: Partial<Record<StatKey, number>>;
  };
}

/** A hero currently staked in a zone, with its live accrual. */
export interface StakePosition {
  heroId: string;
  zoneId: string;
  accrued: number;       // unclaimed Frost Shards, clamped to emissionCap(level)
  stakedAt: number;      // ms epoch — anchors deterministic "find" buckets
  lastFindBucket: number; // highest find-window index already resolved
}

/** A transient discovery/progress event surfaced in the feed + as a toast. */
export interface GameEvent {
  id: string;
  t: number;                                   // ms epoch
  kind: 'find' | 'rare-find' | 'level' | 'claim' | 'cap' | 'recruit';
  text: string;
  amount?: number;
}

export interface AdventuresState {
  version: 2;
  shards: number;                 // banked Frost Shards balance
  roster: AdventureHero[];        // heroes owned (demo in P0)
  positions: StakePosition[];     // active stakes (a hero is in ≤1 zone)
  lastSettle: number;             // ms epoch of last accrual settlement
  totalClaimed: number;           // lifetime claimed (stat)
  totalBurned: number;            // lifetime shards burned on level-ups (the sink)
  foundShards: number;            // lifetime shards from idle discoveries (stat)
  recruited: number;              // recruit counter (nonce + stat)
  events: GameEvent[];            // recent events (newest first, bounded)
}
