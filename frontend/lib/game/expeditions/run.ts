// ─── Expedition run orchestration ───
// Pure state machine over a run: start -> descend -> choose (relic/heal/extract)
// -> descend ... until extract (bank reward) or death (reward lost, depth kept).
import type { ExpeditionWarrior, Relic, RunState, Squad, CombatResult, BossFlavor } from './types';
import { bossForFloor } from './bosses';
import { resolveFloor } from './combat';
import { draftRelics } from './relics';
import { Rng } from './rng';
import { FreeEconomy, ECONOMIES, type EconomyProvider } from './economy';
import { applyFlavor } from './aiFlavor';

const RELIC_OFFERS = 3;

export function partyPower(warriors: ExpeditionWarrior[]): number {
  return warriors.reduce((s, w) => s + w.attack + w.defense + w.speed, 0);
}

export function baseMaxHp(warriors: ExpeditionWarrior[]): number {
  return warriors.reduce((s, w) => s + 80 + w.level * 10 + w.defense * 4, 0);
}

export function computeMaxHp(warriors: ExpeditionWarrior[], relics: Relic[]): number {
  let hp = baseMaxHp(warriors);
  for (const r of relics) {
    if (r.effect.kind === 'max_hp') hp *= 1 + r.effect.pct / 100;
    if (r.effect.kind === 'extract_bonus') hp *= 1 - r.effect.hpPenaltyPct / 100;
  }
  return Math.round(hp);
}

function survivalPerFloor(relics: Relic[]): number {
  return relics.reduce((s, r) => s + (r.effect.kind === 'survive_lethal' ? r.effect.charges : 0), 0);
}

function extractMultiplier(relics: Relic[]): number {
  return relics.reduce((m, r) => m * (r.effect.kind === 'extract_bonus' ? 1 + r.effect.pct / 100 : 1), 1);
}

export interface StartOpts {
  seed: string;
  warriors: ExpeditionWarrior[];
  startingRelics?: Relic[];
  maxFloors?: number;
  economy?: EconomyProvider; // default: token-free FreeEconomy
  flavors?: Record<number, BossFlavor>; // optional AI-authored identities; combat is unaffected
}

export function startRun({ seed, warriors, startingRelics = [], maxFloors = 12, economy = FreeEconomy, flavors }: StartOpts): RunState {
  const relics = [...startingRelics];
  const maxHp = computeMaxHp(warriors, relics);
  const squad: Squad = {
    warriors,
    hp: maxHp,
    maxHp,
    relics,
    survivalCharges: survivalPerFloor(relics),
  };
  const boss = applyFlavor(bossForFloor(seed, 1, partyPower(warriors)), flavors?.[1]);
  return {
    seed,
    economyId: economy.id,
    rewardLabel: economy.rewardLabel,
    floor: 1,
    maxFloors,
    squad,
    boss,
    status: 'active',
    reward: 0,
    offeredRelics: [],
    log: [`Expedition begins. ${boss.name} ${boss.title} blocks Floor 1.`],
    flavors,
  };
}

/** Fight the current floor. Mutates the run in place and returns the combat result. */
export function descend(run: RunState): CombatResult | null {
  if (run.status !== 'active' || !run.boss) return null;
  // Wards replenish each floor.
  run.squad.survivalCharges = survivalPerFloor(run.squad.relics);

  const boss = run.boss;
  const result = resolveFloor(run.seed, run.floor, run.squad, boss);

  if (result.won) {
    const eco = ECONOMIES[run.economyId] ?? FreeEconomy;
    run.reward += eco.rewardForFloor(run.floor, boss.isElite);
    run.log.push(`Floor ${run.floor} cleared — ${boss.name} falls. "${boss.defeatDialogue}"`);
    if (run.floor >= run.maxFloors) {
      run.status = 'extracted';
      run.reward = Math.round(run.reward * extractMultiplier(run.squad.relics));
      run.log.push(`Expedition complete! Banked ${run.reward} FSB.`);
    } else {
      run.offeredRelics = draftRelics(new Rng(`${run.seed}:relics:${run.floor}`), RELIC_OFFERS, run.floor);
      run.status = 'choosing';
    }
  } else {
    run.status = 'dead';
    run.reward = 0;
    run.squad.hp = 0;
    run.log.push(`Frostbitten on Floor ${run.floor}. ${boss.name} claims the squad. Reward lost — depth ${run.floor} recorded.`);
  }
  return result;
}

/** Take one of the offered relics and advance to the next floor. */
export function takeRelic(run: RunState, relicId: string): void {
  if (run.status !== 'choosing') return;
  const relic = run.offeredRelics.find((r) => r.id === relicId);
  if (!relic) return;
  const prevMax = run.squad.maxHp;
  run.squad.relics.push(relic);
  run.squad.maxHp = computeMaxHp(run.squad.warriors, run.squad.relics);
  // Grant the max-HP delta as current HP so buffs feel immediate; penalties clamp.
  run.squad.hp = Math.min(run.squad.maxHp, run.squad.hp + Math.max(0, run.squad.maxHp - prevMax));
  run.log.push(`Drafted ${relic.name} (${relic.rarity}).`);
  advance(run);
}

/** Skip the relic and heal 30% max HP instead, then advance. */
export function healAndAdvance(run: RunState): void {
  if (run.status !== 'choosing') return;
  const heal = Math.round(run.squad.maxHp * 0.30);
  run.squad.hp = Math.min(run.squad.maxHp, run.squad.hp + heal);
  run.log.push(`Rested — recovered ${heal} HP.`);
  advance(run);
}

/** Bank the accumulated reward and end the run safely. */
export function extract(run: RunState): void {
  if (run.status !== 'choosing') return;
  run.status = 'extracted';
  run.reward = Math.round(run.reward * extractMultiplier(run.squad.relics));
  run.log.push(`Extracted at Floor ${run.floor}. Banked ${run.reward} FSB.`);
}

function advance(run: RunState): void {
  run.floor += 1;
  run.boss = applyFlavor(bossForFloor(run.seed, run.floor, partyPower(run.squad.warriors)), run.flavors?.[run.floor]);
  run.offeredRelics = [];
  run.status = 'active';
  run.log.push(`Floor ${run.floor}: ${run.boss.name} ${run.boss.title}${run.boss.isElite ? ' (ELITE)' : ''}. "${run.boss.entranceDialogue}"`);
}
