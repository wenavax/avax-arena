// ─── Frostbite Adventures — pure engine (yield math + accrual + finds + mutations) ───
// Token-free. Deterministic given (state, now). All mutations return a NEW state
// (immutable) so React re-renders cleanly. Accrual + idle "finds" are wall-clock
// based, so idle progress (and discoveries) survive reloads.
import type { AdventureHero, AdventuresState, GameEvent, StakePosition, Zone, StatKey } from './types';
import { RARITY_RANK, RARITY_MULT } from './types';
import { ZONE_BY_ID, AFFINITY_MULT } from './zones';
import { makeRecruit } from './heroes';
import { Rng } from '../expeditions/rng';

/** Demo time compression: 1 real second accrues DEMO_SPEED game-seconds of yield. */
export const DEMO_SPEED = 3;

/** A staked hero rolls for a discovery every this-many game-seconds. */
export const FIND_INTERVAL_SEC = 8;
const MAX_FIND_BUCKETS = 40;   // cap per settle so a long offline gap can't spam/loop
const MAX_EVENTS = 40;

// ── Level economy ──
export function costToNextLevel(level: number): number {
  return 25 + 5 * level * level;
}
/** Emission cap = 3 × next-level cost (Hoppers' re-investment lock). */
export function emissionCap(level: number): number {
  return 3 * costToNextLevel(level);
}
/** Escalating Frost-Shard cost to recruit the next Frostling (a growth sink). */
export function recruitCost(recruited: number): number {
  return Math.round(200 * Math.pow(recruited + 1, 1.5));
}

// ── Yield weighting ──
export function wisdom(hero: AdventureHero): number {
  return hero.level * RARITY_RANK[hero.rarity];
}
export function statValue(hero: AdventureHero, key: StatKey): number {
  return key === 'wisdom' ? wisdom(hero) : hero[key];
}
/** Element affinity: matching a biome's favored element grants a share bonus. */
export function affinityMult(zone: Zone, hero: AdventureHero): number {
  return hero.element === zone.favoredElement ? AFFINITY_MULT : 1;
}
/** weight = level × (Σ zone-primary stats) × rarityMult × affinity. Drives pool share. */
export function heroWeight(zone: Zone, hero: AdventureHero): number {
  const statSum = zone.primaryStats.reduce((s, k) => s + statValue(hero, k), 0);
  return hero.level * statSum * RARITY_MULT[hero.rarity] * affinityMult(zone, hero);
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

// ── Events ──
function pushEvent(s: AdventuresState, ev: GameEvent): void {
  s.events = [ev, ...s.events].slice(0, MAX_EVENTS);
}

// ── State clone (new refs for React) ──
function clone(s: AdventuresState): AdventuresState {
  return {
    ...s,
    roster: s.roster.map((h) => ({ ...h })),
    positions: s.positions.map((p) => ({ ...p })),
    events: [...s.events],
  };
}

/** Roll idle discoveries for one position across newly-elapsed find windows. */
function processFinds(s: AdventuresState, p: StakePosition, now: number): void {
  const zone = ZONE_BY_ID[p.zoneId];
  const hero = heroById(s, p.heroId);
  if (!zone || !hero) return;
  const gameSecStaked = ((now - p.stakedAt) / 1000) * DEMO_SPEED;
  const currentBucket = Math.floor(gameSecStaked / FIND_INTERVAL_SEC);
  if (currentBucket <= p.lastFindBucket) return;
  const startBucket = Math.max(p.lastFindBucket, currentBucket - MAX_FIND_BUCKETS);
  for (let b = startBucket + 1; b <= currentBucket; b++) {
    const rng = new Rng(`${hero.seed}:${zone.id}:${b}`);
    if (!rng.chance(0.4)) continue;
    const rare = rng.chance(0.15);
    const base = zone.tier * (8 + hero.level * 0.5);
    const amount = Math.round(base * rng.range(0.8, 1.4) * (rare ? 3 : 1));
    s.shards += amount;
    s.foundShards += amount;
    pushEvent(s, {
      id: `${p.stakedAt}:${zone.id}:${b}`,
      t: now,
      kind: rare ? 'rare-find' : 'find',
      text: `${hero.name} ${rare ? 'struck a frozen cache' : 'foraged'} in ${zone.name}`,
      amount,
    });
  }
  p.lastFindBucket = currentBucket;
}

/**
 * Advance accrual + finds from `state.lastSettle` to `now`. Per zone, the pool
 * budget for the elapsed span is split by weight across UNCAPPED staked heroes —
 * so a capped hero's share automatically boosts your other heroes there. Returns new state.
 */
export function settle(state: AdventuresState, now: number): AdventuresState {
  const s = clone(state);
  const elapsedMs = Math.max(0, now - s.lastSettle);
  if (elapsedMs === 0 || s.positions.length === 0) { s.lastSettle = now; return s; }

  const spanMin = (elapsedMs / 60000) * DEMO_SPEED;
  const byZone = new Map<string, StakePosition[]>();
  for (const p of s.positions) {
    const list = byZone.get(p.zoneId) ?? [];
    list.push(p);
    byZone.set(p.zoneId, list);
  }

  for (const [zoneId, posList] of byZone) {
    const zone = ZONE_BY_ID[zoneId];
    if (!zone) continue;
    const uncapped = posList.filter((p) => !isCapped(s, p));
    const totalW = uncapped.reduce((sum, p) => {
      const h = heroById(s, p.heroId);
      return sum + (h ? heroWeight(zone, h) : 0);
    }, 0);
    if (totalW > 0) {
      const zoneBudget = zone.ratePerMin * spanMin;
      for (const p of uncapped) {
        const h = heroById(s, p.heroId);
        if (!h) continue;
        const before = p.accrued;
        const cap = emissionCap(h.level);
        p.accrued = Math.min(cap, p.accrued + zoneBudget * (heroWeight(zone, h) / totalW));
        if (before < cap - 1e-9 && p.accrued >= cap - 1e-9) {
          pushEvent(s, { id: `cap:${p.heroId}:${Math.round(now)}`, t: now, kind: 'cap', text: `${h.name} hit its emission cap — level up to unlock more` });
        }
      }
    }
  }

  // idle discoveries (independent of the pool; a reason to check back)
  for (const p of s.positions) processFinds(s, p, now);

  s.lastSettle = now;
  return s;
}

// ── Mutations (each settles to `now` first, then returns new state) ──

export function stakeHero(state: AdventuresState, now: number, heroId: string, zoneId: string): AdventuresState {
  const s = settle(state, now);
  const hero = heroById(s, heroId);
  const zone = ZONE_BY_ID[zoneId];
  if (!hero || !zone) return s;
  if (positionOf(s, heroId)) return s;
  if (!gateCheck(zone, hero).ok) return s;
  s.positions.push({ heroId, zoneId, accrued: 0, stakedAt: now, lastFindBucket: 0 });
  return s;
}

export function unstakeHero(state: AdventuresState, now: number, heroId: string): AdventuresState {
  const s = settle(state, now);
  const p = positionOf(s, heroId);
  if (!p) return s;
  const amt = Math.floor(p.accrued);
  s.shards += amt;
  s.totalClaimed += amt;
  s.positions = s.positions.filter((q) => q.heroId !== heroId);
  return s;
}

export function claimZone(state: AdventuresState, now: number, zoneId: string): AdventuresState {
  const s = settle(state, now);
  let total = 0;
  for (const p of s.positions) {
    if (p.zoneId !== zoneId) continue;
    const amt = Math.floor(p.accrued);
    s.shards += amt; s.totalClaimed += amt; total += amt; p.accrued = 0;
  }
  const zone = ZONE_BY_ID[zoneId];
  if (total > 0 && zone) pushEvent(s, { id: `claim:${zoneId}:${Math.round(now)}`, t: now, kind: 'claim', text: `Claimed from ${zone.name}`, amount: total });
  return s;
}

export function claimAll(state: AdventuresState, now: number): AdventuresState {
  const s = settle(state, now);
  let total = 0;
  for (const p of s.positions) {
    const amt = Math.floor(p.accrued);
    s.shards += amt; s.totalClaimed += amt; total += amt; p.accrued = 0;
  }
  if (total > 0) pushEvent(s, { id: `claimall:${Math.round(now)}`, t: now, kind: 'claim', text: 'Claimed all biomes', amount: total });
  return s;
}

/** Burn Frost Shards to raise a hero's level (+1 atk, higher cap/yield). */
export function levelUpHero(state: AdventuresState, now: number, heroId: string): AdventuresState {
  const s = settle(state, now);
  const hero = heroById(s, heroId);
  if (!hero) return s;
  const cost = costToNextLevel(hero.level);
  if (s.shards < cost) return s;
  s.shards -= cost;
  s.totalBurned += cost;
  hero.level += 1;
  hero.atk += 1;
  pushEvent(s, { id: `level:${heroId}:${Math.round(now)}`, t: now, kind: 'level', text: `${hero.name} reached Lv ${hero.level}`, amount: cost });
  return s;
}

/** Spend Frost Shards to recruit a new random Frostling into the roster. */
export function recruit(state: AdventuresState, now: number): AdventuresState {
  const s = settle(state, now);
  const cost = recruitCost(s.recruited);
  if (s.shards < cost) return s;
  s.shards -= cost;
  s.totalBurned += cost;
  const hero = makeRecruit(s.recruited);
  s.roster.push(hero);
  s.recruited += 1;
  pushEvent(s, { id: `recruit:${hero.id}:${Math.round(now)}`, t: now, kind: 'recruit', text: `Recruited ${hero.name} (${hero.rarity} ${hero.element})`, amount: cost });
  return s;
}

/** Total Frost Shards/second across all active stakes (for the UI headline). */
export function totalRatePerSec(s: AdventuresState): number {
  return s.positions.reduce((sum, p) => sum + ratePerSec(s, p.heroId), 0);
}
