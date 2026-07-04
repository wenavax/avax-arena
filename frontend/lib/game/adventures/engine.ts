// ─── Frostbite Adventures — pure engine (yield math + accrual + mutations) ───
// Token-free. Deterministic given (state, now). All mutations return a NEW state
// (immutable) so React re-renders cleanly. Accrual is wall-clock based, so idle
// progress survives reloads — the defining feature of an idle game.
import type { AdventureHero, AdventuresState, StakePosition, Zone, StatKey } from './types';
import { RARITY_RANK, RARITY_MULT } from './types';
import { ZONE_BY_ID } from './zones';

/** Demo time compression: 1 real second accrues DEMO_SPEED game-seconds of yield,
 *  so the full stake→cap→claim→level loop is observable in ~30s, not real days.
 *  (In P1 the on-chain economy uses real time; this constant is P0-demo only.) */
export const DEMO_SPEED = 3;

// ── Level economy ──
/** Frost Shards to go from `level` → `level+1`. Rising sink; also sets the cap. */
export function costToNextLevel(level: number): number {
  return 25 + 5 * level * level;
}
/** Max Frost Shards a hero can hold before its emissions LOCK until you level it up.
 *  cap = 3 × next-level cost (Hoppers' one good mechanic — forces re-investment). */
export function emissionCap(level: number): number {
  return 3 * costToNextLevel(level);
}

// ── Yield weighting ──
export function wisdom(hero: AdventureHero): number {
  return hero.level * RARITY_RANK[hero.rarity];
}
export function statValue(hero: AdventureHero, key: StatKey): number {
  return key === 'wisdom' ? wisdom(hero) : hero[key];
}
/** weight = level × (Σ zone-primary stats) × rarityMult. Drives pool share. */
export function heroWeight(zone: Zone, hero: AdventureHero): number {
  const statSum = zone.primaryStats.reduce((s, k) => s + statValue(hero, k), 0);
  return hero.level * statSum * RARITY_MULT[hero.rarity];
}

/** Does the hero meet a zone's entry gate? Returns the first failing reason if not. */
export function gateCheck(zone: Zone, hero: AdventureHero): { ok: boolean; reason?: string } {
  if (hero.level < zone.gate.minLevel) return { ok: false, reason: `Requires level ${zone.gate.minLevel}` };
  for (const [k, min] of Object.entries(zone.gate.minStats)) {
    if (statValue(hero, k as StatKey) < (min as number)) {
      return { ok: false, reason: `Requires ${k} ≥ ${min}` };
    }
  }
  return { ok: true };
}

// ── Lookups ──
export const heroById = (s: AdventuresState, id: string) => s.roster.find((h) => h.id === id);
export const positionOf = (s: AdventuresState, heroId: string) => s.positions.find((p) => p.heroId === heroId);
export const positionsInZone = (s: AdventuresState, zoneId: string) => s.positions.filter((p) => p.zoneId === zoneId);
export const isCapped = (s: AdventuresState, p: StakePosition): boolean => {
  const h = heroById(s, p.heroId);
  return !!h && p.accrued >= emissionCap(h.level) - 1e-9;
};

/** Live Frost-Shards/second a staked hero is currently earning (0 if capped). */
export function ratePerSec(s: AdventuresState, heroId: string): number {
  const p = positionOf(s, heroId);
  if (!p) return 0;
  const zone = ZONE_BY_ID[p.zoneId];
  const hero = heroById(s, heroId);
  if (!zone || !hero || isCapped(s, p)) return 0;
  const uncapped = positionsInZone(s, zone.id).filter((q) => !isCapped(s, q));
  const totalW = uncapped.reduce((sum, q) => {
    const qh = heroById(s, q.heroId);
    return sum + (qh ? heroWeight(zone, qh) : 0);
  }, 0);
  if (totalW <= 0) return 0;
  const zonePerSec = (zone.ratePerMin / 60) * DEMO_SPEED;
  return zonePerSec * (heroWeight(zone, hero) / totalW);
}

// ── State clone (new refs for React) ──
function clone(s: AdventuresState): AdventuresState {
  return {
    ...s,
    roster: s.roster.map((h) => ({ ...h })),
    positions: s.positions.map((p) => ({ ...p })),
  };
}

/**
 * Advance accrual from `state.lastSettle` to `now`. Per zone, the pool budget for
 * the elapsed span is split by weight across UNCAPPED staked heroes — so a capped
 * hero's share automatically boosts your other heroes in that zone. Returns new state.
 */
export function settle(state: AdventuresState, now: number): AdventuresState {
  const s = clone(state);
  const elapsedMs = Math.max(0, now - s.lastSettle);
  s.lastSettle = now;
  if (elapsedMs === 0 || s.positions.length === 0) return s;

  const spanMin = (elapsedMs / 60000) * DEMO_SPEED;
  const byZone = new Map<string, StakePosition[]>();
  for (const p of s.positions) {
    (byZone.get(p.zoneId) ?? byZone.set(p.zoneId, []).get(p.zoneId)!).push(p);
  }

  for (const [zoneId, posList] of byZone) {
    const zone = ZONE_BY_ID[zoneId];
    if (!zone) continue;
    const uncapped = posList.filter((p) => !isCapped(s, p));
    const totalW = uncapped.reduce((sum, p) => {
      const h = heroById(s, p.heroId);
      return sum + (h ? heroWeight(zone, h) : 0);
    }, 0);
    if (totalW <= 0) continue;
    const zoneBudget = zone.ratePerMin * spanMin;
    for (const p of uncapped) {
      const h = heroById(s, p.heroId);
      if (!h) continue;
      const share = zoneBudget * (heroWeight(zone, h) / totalW);
      p.accrued = Math.min(emissionCap(h.level), p.accrued + share);
    }
  }
  return s;
}

// ── Mutations (each settles to `now` first, then returns new state) ──

export function stakeHero(state: AdventuresState, now: number, heroId: string, zoneId: string): AdventuresState {
  const s = settle(state, now);
  const hero = heroById(s, heroId);
  const zone = ZONE_BY_ID[zoneId];
  if (!hero || !zone) return s;
  if (positionOf(s, heroId)) return s;            // already staked somewhere
  if (!gateCheck(zone, hero).ok) return s;        // fails entry gate
  s.positions.push({ heroId, zoneId, accrued: 0 });
  return s;
}

export function unstakeHero(state: AdventuresState, now: number, heroId: string): AdventuresState {
  const s = settle(state, now);
  const p = positionOf(s, heroId);
  if (!p) return s;
  s.shards += Math.floor(p.accrued);              // banking accrued on unstake is friendly
  s.totalClaimed += Math.floor(p.accrued);
  s.positions = s.positions.filter((q) => q.heroId !== heroId);
  return s;
}

export function claimZone(state: AdventuresState, now: number, zoneId: string): AdventuresState {
  const s = settle(state, now);
  for (const p of s.positions) {
    if (p.zoneId !== zoneId) continue;
    const amt = Math.floor(p.accrued);
    s.shards += amt;
    s.totalClaimed += amt;
    p.accrued = 0;
  }
  return s;
}

export function claimAll(state: AdventuresState, now: number): AdventuresState {
  const s = settle(state, now);
  for (const p of s.positions) {
    const amt = Math.floor(p.accrued);
    s.shards += amt;
    s.totalClaimed += amt;
    p.accrued = 0;
  }
  return s;
}

/** Burn Frost Shards to raise a hero's level (+1 atk on the primary, higher cap/yield). */
export function levelUpHero(state: AdventuresState, now: number, heroId: string): AdventuresState {
  const s = settle(state, now);
  const hero = heroById(s, heroId);
  if (!hero) return s;
  const cost = costToNextLevel(hero.level);
  if (s.shards < cost) return s;
  s.shards -= cost;
  s.totalBurned += cost;
  hero.level += 1;
  // small stat bump so leveling is visibly meaningful (mirrors on-chain levelUp)
  hero.atk += 1;
  return s;
}

/** Total Frost Shards/second across all active stakes (for the UI headline). */
export function totalRatePerSec(s: AdventuresState): number {
  return s.positions.reduce((sum, p) => sum + ratePerSec(s, p.heroId), 0);
}
