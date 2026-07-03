// ─── Frostbite Expeditions — core types ───
import type { Element } from '../elements';

/** On-chain element index (uint8) -> Element string, matching lib/constants ELEMENTS order. */
export const ELEMENT_BY_INDEX: readonly Element[] = [
  'fire', 'water', 'wind', 'ice', 'earth', 'thunder', 'shadow', 'light',
];

export function elementFromIndex(i: number): Element {
  return ELEMENT_BY_INDEX[i] ?? 'fire';
}

/** A warrior taken into an expedition (derived from FrostbiteWarrior.getWarrior). */
export interface ExpeditionWarrior {
  tokenId: number;
  attack: number;
  defense: number;
  speed: number;
  element: Element;
  specialPower: number; // 0-100, drives relic proc chance
  level: number;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Data-driven relic effect. Combat interprets these; nothing is hard-coded per relic. */
export type RelicEffect =
  | { kind: 'element_bonus'; pct: number }        // +pct ATK when at element advantage
  | { kind: 'flat_atk'; pct: number }             // +pct ATK always
  | { kind: 'flat_def'; pct: number }             // +pct DEF always
  | { kind: 'max_hp'; pct: number }               // +/-pct max squad HP
  | { kind: 'lifesteal'; pct: number }            // heal pct of damage dealt
  | { kind: 'survive_lethal'; charges: number }   // survive N lethal hits at 1 HP
  | { kind: 'skill_echo'; chance: number }        // chance to strike twice
  | { kind: 'crit'; chance: number; mult: number }// crit chance / multiplier
  | { kind: 'extract_bonus'; pct: number; hpPenaltyPct: number }; // +reward, -maxHP

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  effect: RelicEffect;
}

/** A single floor's boss (procedural in Phase 0; AI-authored via /api/v1/ai-enemy later). */
export interface FloorBoss {
  name: string;
  title: string;
  element: Element;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  isElite: boolean;
  entranceDialogue: string;
  defeatDialogue: string;
  lore: string;
}

/**
 * Claude-authored *flavor* for a boss — identity only, never combat stats.
 * Layered over the deterministic FloorBoss skeleton so the run stays verifiable
 * (element/hp/atk/def/spd are untouched). Absence => procedural fallback.
 */
export interface BossFlavor {
  name: string;
  title: string;
  lore: string;
  entranceDialogue: string;
  defeatDialogue: string;
}

export interface Squad {
  warriors: ExpeditionWarrior[];
  hp: number;
  maxHp: number;
  relics: Relic[];
  survivalCharges: number; // from survive_lethal relics, consumed on lethal hits
}

export type RunStatus = 'active' | 'choosing' | 'extracted' | 'dead';

export interface CombatEvent {
  round: number;
  actor: 'squad' | 'boss';
  damage: number;
  crit: boolean;
  effective: number; // element multiplier applied (1.5 / 1 / 0.67)
  note?: string;
}

export interface CombatResult {
  won: boolean;
  rounds: number;
  squadHpAfter: number;
  bossHpAfter: number;
  damageDealt: number;
  damageTaken: number;
  events: CombatEvent[];
}

export interface RunState {
  seed: string;
  economyId: string;      // which EconomyProvider backs this run ('free' by default)
  rewardLabel: string;    // UI label for the reward currency ('Frost Shards' by default)
  floor: number;          // 1-based; the floor about to be / just fought
  maxFloors: number;      // soft cap (endless-ish; escalates)
  squad: Squad;
  boss: FloorBoss | null; // current floor boss
  status: RunStatus;
  reward: number;         // accumulated FSB reward if extracted (simulated in Phase 0)
  offeredRelics: Relic[]; // between-floor draft options
  log: string[];
  flavors?: Record<number, BossFlavor>; // floor -> AI-authored identity; merged at boss creation (optional)
}
