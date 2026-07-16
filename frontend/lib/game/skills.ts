// ─── Class-Specific Skills + MP System ───
import { PlayerClass } from './PlayerState';
import { Element } from './elements';

export interface Skill {
  id: string;
  name: string;
  icon: string;
  mpCost: number;
  description: string;
  element?: Element;
  multiplier: number;       // ATK multiplier
  hits: number;             // number of hits
  stunChance?: number;      // 0-1
  selfBuff?: { stat: 'def' | 'dodge'; amount: number; turns: number };
  dot?: { type: 'poison' | 'burn'; turns: number; pctPerTurn: number };
}

export const CLASS_SKILLS: Record<PlayerClass, Skill[]> = {
  knight: [
    { id: 'slash', name: 'Slash', icon: '⚔', mpCost: 0, description: 'Basic sword attack', multiplier: 1.0, hits: 1 },
    { id: 'shield_bash', name: 'Shield Bash', icon: '🛡', mpCost: 5, description: 'Stun chance 30%', multiplier: 0.8, hits: 1, stunChance: 0.30 },
    { id: 'power_strike', name: 'Power Strike', icon: '💥', mpCost: 8, description: '1.5x ATK damage', multiplier: 1.5, hits: 1 },
    { id: 'fortify', name: 'Fortify', icon: '🏰', mpCost: 6, description: '+50% DEF 2 turns', multiplier: 0, hits: 0, selfBuff: { stat: 'def', amount: 50, turns: 2 } },
  ],
  mage: [
    { id: 'staff_hit', name: 'Staff Hit', icon: '🔮', mpCost: 0, description: 'Basic magic attack', multiplier: 0.6, hits: 1 },
    { id: 'fireball', name: 'Fireball', icon: '🔥', mpCost: 6, description: '1.4x fire damage + burn', multiplier: 1.4, hits: 1, element: 'fire', dot: { type: 'burn', turns: 3, pctPerTurn: 0.08 } },
    { id: 'ice_shard', name: 'Ice Shard', icon: '❄️', mpCost: 5, description: '1.2x ice damage', multiplier: 1.2, hits: 1, element: 'ice' },
    { id: 'arcane_barrier', name: 'Arcane Barrier', icon: '🔷', mpCost: 8, description: '+40% DEF 2 turns', multiplier: 0, hits: 0, selfBuff: { stat: 'def', amount: 40, turns: 2 } },
  ],
  archer: [
    { id: 'quick_shot', name: 'Quick Shot', icon: '🏹', mpCost: 0, description: 'Basic arrow attack', multiplier: 0.9, hits: 1 },
    { id: 'double_shot', name: 'Double Shot', icon: '🎯', mpCost: 5, description: '2 hits at 0.7x each', multiplier: 0.7, hits: 2 },
    { id: 'poison_arrow', name: 'Poison Arrow', icon: '☠️', mpCost: 6, description: 'Poison 3 turns', multiplier: 0.8, hits: 1, dot: { type: 'poison', turns: 3, pctPerTurn: 0.05 } },
    { id: 'evasion', name: 'Evasion', icon: '💨', mpCost: 4, description: '+40% dodge 2 turns', multiplier: 0, hits: 0, selfBuff: { stat: 'dodge', amount: 40, turns: 2 } },
  ],
};

export const CLASS_MP: Record<PlayerClass, { base: number; regen: number }> = {
  knight: { base: 30, regen: 3 },
  mage:   { base: 50, regen: 4 },
  archer: { base: 40, regen: 3 },
};
