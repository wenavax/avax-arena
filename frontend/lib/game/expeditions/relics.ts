// ─── Relic / tactic pool ───
// FSB-bought, consumed per run (the core deflationary sink). Rarity weights are
// aligned with lib/game/lootTables.ts. Effects are pure data (see types.RelicEffect)
// so combat.ts interprets them generically.
import type { Relic, Rarity } from './types';
import type { Rng } from './rng';

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 55,
  uncommon: 28,
  rare: 12,
  epic: 4,
  legendary: 1,
};

/** FSB burn cost to draft a relic of a given rarity (simulated in Phase 0). */
export const RARITY_FSB_COST: Record<Rarity, number> = {
  common: 5,
  uncommon: 12,
  rare: 30,
  epic: 75,
  legendary: 180,
};

export const RELIC_POOL: readonly Relic[] = [
  // ── common ──
  { id: 'ember_fervor', name: 'Ember Fervor', rarity: 'common', description: '+25% ATK when at element advantage', effect: { kind: 'element_bonus', pct: 25 } },
  { id: 'whetstone', name: 'Whetstone', rarity: 'common', description: '+10% ATK', effect: { kind: 'flat_atk', pct: 10 } },
  { id: 'hide_wrap', name: 'Hide Wrap', rarity: 'common', description: '+12% DEF', effect: { kind: 'flat_def', pct: 12 } },
  { id: 'ration_pack', name: 'Ration Pack', rarity: 'common', description: '+12% max squad HP', effect: { kind: 'max_hp', pct: 12 } },
  // ── uncommon ──
  { id: 'frost_ward', name: 'Frost Ward', rarity: 'uncommon', description: 'Survive one lethal hit at 1 HP', effect: { kind: 'survive_lethal', charges: 1 } },
  { id: 'keen_edge', name: 'Keen Edge', rarity: 'uncommon', description: '18% crit for 1.8x', effect: { kind: 'crit', chance: 0.18, mult: 1.8 } },
  { id: 'war_banner', name: 'War Banner', rarity: 'uncommon', description: '+18% ATK', effect: { kind: 'flat_atk', pct: 18 } },
  // ── rare ──
  { id: 'bloodpact', name: 'Bloodpact', rarity: 'rare', description: 'Lifesteal 12% of damage dealt', effect: { kind: 'lifesteal', pct: 12 } },
  { id: 'aegis_core', name: 'Aegis Core', rarity: 'rare', description: '+22% DEF', effect: { kind: 'flat_def', pct: 22 } },
  { id: 'stormcaller', name: 'Stormcaller', rarity: 'rare', description: '+40% ATK at element advantage', effect: { kind: 'element_bonus', pct: 40 } },
  // ── epic ──
  { id: 'echo_strike', name: 'Echo Strike', rarity: 'epic', description: '30% chance to strike twice', effect: { kind: 'skill_echo', chance: 0.30 } },
  { id: 'vampiric_maw', name: 'Vampiric Maw', rarity: 'epic', description: 'Lifesteal 22% of damage dealt', effect: { kind: 'lifesteal', pct: 22 } },
  // ── legendary ──
  { id: 'avalanche_heart', name: 'Avalanche Heart', rarity: 'legendary', description: 'Extract reward +50%, but -20% max HP', effect: { kind: 'extract_bonus', pct: 50, hpPenaltyPct: 20 } },
  { id: 'undying_rime', name: 'Undying Rime', rarity: 'legendary', description: 'Survive two lethal hits at 1 HP', effect: { kind: 'survive_lethal', charges: 2 } },
];

const BY_RARITY: Record<Rarity, Relic[]> = RELIC_POOL.reduce((acc, r) => {
  (acc[r.rarity] ??= []).push(r);
  return acc;
}, {} as Record<Rarity, Relic[]>);

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Draft `count` distinct relic offers, rarity-weighted. Higher floors tilt rarer. */
export function draftRelics(rng: Rng, count: number, floor = 1): Relic[] {
  // gentle luck bump with depth: legendary/epic weight grows slightly per floor
  const depthTilt = 1 + floor * 0.05;
  const weights = RARITIES.map((r) => {
    const base = RARITY_WEIGHT[r];
    return r === 'epic' || r === 'legendary' ? base * depthTilt : base;
  });

  const offers: Relic[] = [];
  const usedIds = new Set<string>();
  let guard = 0;
  while (offers.length < count && guard++ < 200) {
    const rarity = rng.weighted(RARITIES, weights);
    const pool = BY_RARITY[rarity];
    if (!pool?.length) continue;
    const relic = rng.pick(pool);
    if (usedIds.has(relic.id)) continue;
    usedIds.add(relic.id);
    offers.push(relic);
  }
  return offers;
}

export function relicCost(relic: Relic): number {
  return RARITY_FSB_COST[relic.rarity];
}
