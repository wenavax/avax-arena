/**
 * CAR(D) GAME — per-value card abilities (Practice-first).
 *
 * Every NORMAL card's value (1–10) has one signature ability that fires
 * automatically when the card is played; each distinct value in a played set
 * triggers once. Magic cards keep their magic effect and never trigger their
 * printed value's ability (one card, one ability).
 *
 * PURE module: no DOM, no engine import, no randomness. Each host (the practice
 * mount in seconds, engine.ts in ticks) adapts its state into `AbilityCtx`;
 * `sec()` converts the ability constants' seconds into the host's time unit.
 * Determinism is a hard requirement — the engine fires these identically on the
 * client and at server re-simulation, so results can never fork.
 *
 * Spec: docs/superpowers/specs/2026-07-13-cardgame-card-abilities-design.md
 */

/** Minimal structural view of a racer — matches both the practice mount's
 *  Player and (unit-agnostically) the engine's PlayerState. Times (`t`,
 *  `endsAt`, `cdUntil`) just need to share one unit within a host. */
export interface AbilityPlayer {
  id: string;
  dist: number;
  fin: boolean;
  cdUntil: number;
  nm: { mult: number; endsAt: number } | null;
  magics: { mult: number; endsAt: number }[];
}

export interface AbilityCtx {
  /** the racer who played the cards */
  p: AbilityPlayer;
  /** all racers (any order; ties resolve by array order = seat order) */
  players: AbilityPlayer[];
  /** current time, same unit as endsAt/cdUntil */
  t: number;
  /** standard effect duration (3 in practice) */
  dur: number;
  /** play multiplier cap (5.0) */
  cap: number;
  /** per-play multiplicative budget for self speed buffs (init SELF_BUDGET) */
  budget: { selfSpeedLeft: number };
  /** convert seconds → the host's time unit (practice: n, engine ticks: n*10) */
  sec(n: number): number;
  /** host draws 1 card for p (respecting hand limit); false if impossible */
  drawOne(): boolean;
  /** host applies a timed speed effect (and its cosmetic mark if mult < 1) */
  buff(target: AbilityPlayer, mult: number, seconds: number): void;
}

export interface Ability {
  key: string;
  icon: string;
  desc: string;
  /** Fire the ability. Returns popup text, or null when it had no effect. */
  apply(ctx: AbilityCtx): string | null;
}

// ── tunables (Practice balance knobs) ────────────────────────────────────────
export const SELF_BUDGET = 1.6;   // max product of self speed buffs per play
const MIN_GRANT = 1.02;           // below this a clipped self-buff is a no-op
const SLIP_MAX = 15;              // SLIPSTREAM jump cap (units)
const SLIP_PCT = 0.15;            // ... or 15% of the gap to the leader (comeback lever)
const SLIP_WALL = 999;            // never jump past this (finish by speed only)
const DRAFT_EXT = 2.5;            // DRAFT boost extension (s) — buffed so value-2 in a combo pays
const TUNE_CUT = 1;               // TUNE cooldown reduction (s)
const BUMP_MULT = 0.85; const BUMP_DUR = 2.5;
const SYNERGY_ADD = 0.25;
const GRIP_MULT = 1.18; const GRIP_DUR = 3;
const OVER_MULT = 1.22; const OVER_DUR = 2.5;
const REDLINE_MULT = 1.3; const REDLINE_DUR = 4;

// ── shared helpers ───────────────────────────────────────────────────────────
function leaderOf(ctx: AbilityCtx): AbilityPlayer | null {
  let best: AbilityPlayer | null = null;
  for (const q of ctx.players) if (!q.fin && q !== ctx.p && (!best || q.dist > best.dist)) best = q;
  return best;
}
function aheadOf(ctx: AbilityCtx): AbilityPlayer | null {
  let best: AbilityPlayer | null = null;
  for (const q of ctx.players) {
    if (q.fin || q === ctx.p || q.dist <= ctx.p.dist) continue;
    if (!best || q.dist < best.dist) best = q;
  }
  return best;
}
/** Self speed buff through the per-play budget. Returns granted mult or null. */
function selfBuff(ctx: AbilityCtx, want: number, seconds: number): number | null {
  const granted = Math.min(want, ctx.budget.selfSpeedLeft);
  if (granted < MIN_GRANT) return null;
  ctx.budget.selfSpeedLeft /= granted;
  ctx.buff(ctx.p, granted, seconds);
  return granted;
}
const pct = (m: number) => `${Math.round((m - 1) * 100)}%`;

// ── the 10 abilities ─────────────────────────────────────────────────────────
export const ABILITIES: Record<number, Ability> = {
  1: {
    key: 'SLIPSTREAM', icon: '🌀', desc: 'Jump forward 15% of your gap to the leader (max 15u)',
    apply(ctx) {
      const lead = leaderOf(ctx);
      if (!lead || lead.dist <= ctx.p.dist) return null;
      const jump = Math.min(SLIP_MAX, (lead.dist - ctx.p.dist) * SLIP_PCT, SLIP_WALL - ctx.p.dist);
      if (jump <= 0) return null;
      ctx.p.dist += jump;
      return `🌀 SLIPSTREAM +${Math.round(jump)}u`;
    },
  },
  2: {
    key: 'DRAFT', icon: '💨', desc: 'Extend your running boost by 2.5s',
    apply(ctx) {
      if (!ctx.p.nm || ctx.t >= ctx.p.nm.endsAt) return null;
      ctx.p.nm.endsAt += ctx.sec(DRAFT_EXT);
      return `💨 DRAFT +${DRAFT_EXT}s`;
    },
  },
  3: {
    key: 'SCAVENGE', icon: '🎴', desc: 'Draw 1 card (up to your hand limit)',
    apply(ctx) { return ctx.drawOne() ? '🎴 SCAVENGE +1 card' : null; },
  },
  4: {
    key: 'TUNE', icon: '🔧', desc: 'This play cools down 1s faster',
    apply(ctx) {
      const cut = Math.min(ctx.sec(TUNE_CUT), ctx.p.cdUntil - ctx.t);
      if (cut <= 0) return null;
      ctx.p.cdUntil -= cut;
      return `🔧 TUNE −${TUNE_CUT}s cd`;
    },
  },
  5: {
    key: 'DEICE', icon: '🧼', desc: 'Remove all slow effects on you',
    apply(ctx) {
      const before = ctx.p.magics.length;
      ctx.p.magics = ctx.p.magics.filter((e) => e.mult >= 1);
      return ctx.p.magics.length < before ? '🧼 DEICE cleared' : null;
    },
  },
  6: {
    key: 'BUMP', icon: '💥', desc: 'Slow the racer just ahead of you −15% for 2.5s',
    apply(ctx) {
      const tg = aheadOf(ctx);
      if (!tg) return null;
      ctx.buff(tg, BUMP_MULT, BUMP_DUR);
      return '💥 BUMP −15% ahead';
    },
  },
  7: {
    key: 'SYNERGY', icon: '✚', desc: "+0.25 to this play's multiplier",
    apply(ctx) {
      if (!ctx.p.nm) return null;
      const next = Math.min(ctx.cap, ctx.p.nm.mult + SYNERGY_ADD);
      if (next <= ctx.p.nm.mult) return null;
      ctx.p.nm.mult = next;
      return `✚ SYNERGY ×${next.toFixed(2)}`;
    },
  },
  8: {
    key: 'GRIP', icon: '🛞', desc: 'You get +18% speed for 3s',
    apply(ctx) {
      const g = selfBuff(ctx, GRIP_MULT, GRIP_DUR);
      return g ? `🛞 GRIP +${pct(g)}` : null;
    },
  },
  9: {
    key: 'OVERTAKE', icon: '⏩', desc: '+22% for 2.5s, and the racer ahead −15% for 2.5s',
    apply(ctx) {
      const g = selfBuff(ctx, OVER_MULT, OVER_DUR);
      const tg = aheadOf(ctx);
      if (tg) ctx.buff(tg, BUMP_MULT, BUMP_DUR);
      if (!g && !tg) return null;
      return `⏩ OVERTAKE${g ? ` +${pct(g)}` : ''}${tg ? ' / −15% ahead' : ''}`;
    },
  },
  10: {
    key: 'REDLINE', icon: '🔥', desc: 'You get +30% speed for 4s',
    apply(ctx) {
      const g = selfBuff(ctx, REDLINE_MULT, REDLINE_DUR);
      return g ? `🔥 REDLINE +${pct(g)}` : null;
    },
  },
};

/**
 * Fire each distinct value's ability once, ascending (deterministic order).
 * Returns the popup texts of the abilities that actually did something.
 */
export function triggerAbilities(values: number[], ctx: AbilityCtx): string[] {
  const out: string[] = [];
  for (const v of [...new Set(values)].sort((a, b) => a - b)) {
    const ab = ABILITIES[v];
    if (!ab) continue;
    const txt = ab.apply(ctx);
    if (txt) out.push(txt);
  }
  return out;
}
