// ─── Deterministic floor combat ───
// Squad (aggregate of 1-3 warriors) vs one floor boss. Fully seeded, so the
// same (seed, floor, squad, relics) always yields the same result — verifiable.
import { getElementMultiplier } from '../elements';
import type { Element } from '../elements';
import type { Squad, FloorBoss, CombatResult, CombatEvent, Relic } from './types';
import { Rng } from './rng';

export interface SquadStats {
  atk: number;
  def: number;
  spd: number;
  element: Element;
  avgSpecial: number;
}

/** Aggregate 1-3 warriors into fighting stats. */
export function squadStats(squad: Squad): SquadStats {
  const ws = squad.warriors;
  const n = Math.max(1, ws.length);
  const atk = ws.reduce((s, w) => s + w.attack, 0);
  const def = ws.reduce((s, w) => s + w.defense, 0) / n;
  const spd = ws.reduce((s, w) => s + w.speed, 0) / n;
  const avgSpecial = ws.reduce((s, w) => s + w.specialPower, 0) / n;
  // Primary element = the highest-attack warrior's element.
  const primary = ws.reduce((a, b) => (b.attack > a.attack ? b : a), ws[0]);
  return { atk, def, spd, element: primary.element, avgSpecial };
}

interface RelicMods {
  atkMult: number;
  defMult: number;
  elementBonusPct: number;
  critChance: number;
  critMult: number;
  echoChance: number;
  lifestealPct: number;
}

export function computeRelicMods(relics: Relic[]): RelicMods {
  const mods: RelicMods = {
    atkMult: 1, defMult: 1, elementBonusPct: 0,
    critChance: 0, critMult: 1.5, echoChance: 0, lifestealPct: 0,
  };
  for (const r of relics) {
    const e = r.effect;
    switch (e.kind) {
      case 'flat_atk': mods.atkMult *= 1 + e.pct / 100; break;
      case 'flat_def': mods.defMult *= 1 + e.pct / 100; break;
      case 'element_bonus': mods.elementBonusPct += e.pct; break;
      case 'lifesteal': mods.lifestealPct += e.pct; break;
      case 'skill_echo': mods.echoChance = Math.max(mods.echoChance, e.chance); break;
      case 'crit':
        if (e.chance * e.mult > mods.critChance * mods.critMult) {
          mods.critChance = e.chance; mods.critMult = e.mult;
        }
        break;
      default: break; // max_hp / survive_lethal / extract_bonus handled elsewhere
    }
  }
  return mods;
}

const MAX_ROUNDS = 60;

/**
 * Resolve one floor. Mutates `squad.hp` (carries across floors) and consumes
 * `squad.survivalCharges`. Returns a CombatResult with a per-round event log.
 */
export function resolveFloor(seed: string, floor: number, squad: Squad, boss: FloorBoss): CombatResult {
  const rng = new Rng(`${seed}:combat:${floor}`);
  const s = squadStats(squad);
  const mods = computeRelicMods(squad.relics);
  const specialScale = 1 + s.avgSpecial / 200; // specialPower amplifies relic procs

  let bossHp = boss.maxHp;
  const events: CombatEvent[] = [];
  let damageDealt = 0;
  let damageTaken = 0;
  let round = 0;

  const squadFirst = s.spd >= boss.spd;

  const squadHit = () => {
    const advantage = getElementMultiplier(s.element, boss.element);
    const bonus = advantage > 1 ? 1 + mods.elementBonusPct / 100 : 1;
    const crit = rng.chance(mods.critChance * specialScale);
    const critMult = crit ? mods.critMult : 1;
    const variance = rng.range(0.85, 1.15);
    let dmg = Math.max(1, Math.round((s.atk * mods.atkMult * bonus * advantage * critMult * variance) - boss.def / 2));
    bossHp -= dmg;
    damageDealt += dmg;
    if (mods.lifestealPct > 0) {
      const heal = Math.round(dmg * mods.lifestealPct / 100);
      squad.hp = Math.min(squad.maxHp, squad.hp + heal);
    }
    events.push({ round, actor: 'squad', damage: dmg, crit, effective: advantage });
    // Echo Strike
    if (bossHp > 0 && rng.chance(mods.echoChance * specialScale)) {
      const echo = Math.max(1, Math.round(dmg * 0.6));
      bossHp -= echo;
      damageDealt += echo;
      events.push({ round, actor: 'squad', damage: echo, crit: false, effective: advantage, note: 'echo' });
    }
  };

  const bossHit = () => {
    const advantage = getElementMultiplier(boss.element, s.element);
    const variance = rng.range(0.85, 1.15);
    let dmg = Math.max(1, Math.round((boss.atk * advantage * variance) - (s.def * mods.defMult) / 2));
    let note: string | undefined;
    if (dmg >= squad.hp && squad.survivalCharges > 0) {
      // Frost Ward / Undying Rime: survive at 1 HP
      squad.survivalCharges -= 1;
      dmg = Math.max(0, squad.hp - 1);
      note = 'survived';
    }
    squad.hp -= dmg;
    damageTaken += dmg;
    events.push({ round, actor: 'boss', damage: dmg, crit: false, effective: advantage, note });
  };

  while (bossHp > 0 && squad.hp > 0 && round < MAX_ROUNDS) {
    round++;
    if (squadFirst) {
      squadHit();
      if (bossHp > 0) bossHit();
    } else {
      bossHit();
      if (squad.hp > 0) squadHit();
    }
  }

  // Timeout tiebreak (deterministic): higher remaining HP% wins.
  let won = bossHp <= 0;
  if (bossHp > 0 && squad.hp > 0) {
    won = squad.hp / squad.maxHp >= bossHp / boss.maxHp;
    if (!won) squad.hp = 0; // stalled out and lost -> squad falls
  }
  if (squad.hp < 0) squad.hp = 0;

  return {
    won,
    rounds: round,
    squadHpAfter: squad.hp,
    bossHpAfter: Math.max(0, bossHp),
    damageDealt,
    damageTaken,
    events,
  };
}
