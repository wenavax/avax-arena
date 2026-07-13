# CAR(D) GAME — Per-Value Card Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every normal card (values 1–10) a signature on-play ability in Practice mode, per the approved spec `docs/superpowers/specs/2026-07-13-cardgame-card-abilities-design.md`.

**Architecture:** A new pure module `abilities.ts` (no DOM, no engine import) owns all ability logic behind a tiny structural interface; `mount.ts` (Practice only) adapts its local state into that interface at the end of `applyPlay`. UI = card ribbon, preview append, popups/log, help legend. `engine.ts`, server, Staked, MP untouched.

**Tech Stack:** TypeScript, existing headless test pattern (`npx tsx scripts/*.ts`), plain CSS.

**Files:**
- Create: `frontend/lib/cardgame/abilities.ts`
- Create: `frontend/scripts/cardgame-abilities-test.ts`
- Modify: `frontend/lib/cardgame/mount.ts` (applyPlay, hand render, preview, help, boot)
- Modify: `frontend/app/cardgame/cardgame.css` (ribbon + ability popup styles)

**Key constants (all in abilities.ts, Practice-tunable):** SLIPSTREAM max 15u / 12% of gap; DRAFT +1.5s; TUNE −1s; DEICE clears mult<1; BUMP ×0.85 2s; SYNERGY +0.25; GRIP ×1.18 3s; OVERTAKE ×1.22 2.5s + ahead ×0.85 2s; REDLINE ×1.30 4s; per-play self-speed budget ×1.6 (min grant 1.02); play cap 5.0.

---

### Task 1: `abilities.ts` — pure ability table (TDD)

**Files:**
- Test: `frontend/scripts/cardgame-abilities-test.ts`
- Create: `frontend/lib/cardgame/abilities.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/scripts/cardgame-abilities-test.ts` with exactly:

```ts
/**
 * CAR(D) GAME — per-value ability tests. Pure (no DOM, no engine).
 *
 *   npx tsx scripts/cardgame-abilities-test.ts
 */
import { ABILITIES, triggerAbilities, SELF_BUDGET, type AbilityPlayer, type AbilityCtx } from '../lib/cardgame/abilities';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

function mkP(id: string, dist: number, fin = false): AbilityPlayer {
  return { id, dist, fin, cdUntil: 0, nm: null, magics: [] };
}
interface BuffCall { target: AbilityPlayer; mult: number; seconds: number }
function mkCtx(p: AbilityPlayer, players: AbilityPlayer[], opts: { t?: number; canDraw?: boolean } = {}) {
  const buffs: BuffCall[] = [];
  let drew = 0;
  const ctx: AbilityCtx = {
    p, players, t: opts.t ?? 10, dur: 3, cap: 5,
    budget: { selfSpeedLeft: SELF_BUDGET },
    drawOne: () => { if (opts.canDraw === false) return false; drew++; return true; },
    buff: (target, mult, seconds) => { buffs.push({ target, mult, seconds }); },
  };
  return { ctx, buffs, drewCount: () => drew };
}

console.log('SLIPSTREAM (1)');
{
  const me = mkP('P1', 300), lead = mkP('P2', 400);
  const { ctx } = mkCtx(me, [me, lead]);
  const txt = ABILITIES[1].apply(ctx);
  ok(txt !== null && me.dist === 312, `12% of 100u gap → +12u (dist ${me.dist})`);
  const far = mkP('P1', 100), lead2 = mkP('P2', 400);
  const c2 = mkCtx(far, [far, lead2]);
  ABILITIES[1].apply(c2.ctx);
  ok(far.dist === 115, `capped at +15u (dist ${far.dist})`);
  const leader = mkP('P1', 500), other = mkP('P2', 300);
  const c3 = mkCtx(leader, [leader, other]);
  ok(ABILITIES[1].apply(c3.ctx) === null, 'leader → no-op');
  const near = mkP('P1', 990), lead3 = mkP('P2', 998);
  const c4 = mkCtx(near, [near, lead3]);
  ABILITIES[1].apply(c4.ctx);
  ok(near.dist <= 999, `never jumps past 999 (dist ${near.dist})`);
}

console.log('DRAFT (2)');
{
  const me = mkP('P1', 100); me.nm = { mult: 2, endsAt: 12 };
  const { ctx } = mkCtx(me, [me]); // t=10 → boost active
  ok(ABILITIES[2].apply(ctx) !== null && me.nm.endsAt === 13.5, `extends boost to 13.5 (got ${me.nm.endsAt})`);
  const noB = mkP('P1', 100);
  ok(ABILITIES[2].apply(mkCtx(noB, [noB]).ctx) === null, 'no active boost → no-op');
  const expired = mkP('P1', 100); expired.nm = { mult: 2, endsAt: 5 };
  ok(ABILITIES[2].apply(mkCtx(expired, [expired]).ctx) === null, 'expired boost → no-op');
}

console.log('SCAVENGE (3)');
{
  const me = mkP('P1', 100);
  const c = mkCtx(me, [me]);
  ok(ABILITIES[3].apply(c.ctx) !== null && c.drewCount() === 1, 'draws 1 card');
  const full = mkCtx(mkP('P1', 100), [me], { canDraw: false });
  ok(ABILITIES[3].apply(full.ctx) === null, 'hand full / empty deck → no-op');
}

console.log('TUNE (4)');
{
  const me = mkP('P1', 100); me.cdUntil = 13; // t=10, cooldown 3s
  const { ctx } = mkCtx(me, [me]);
  ok(ABILITIES[4].apply(ctx) !== null && me.cdUntil === 12, `cooldown −1s (got ${me.cdUntil})`);
  const low = mkP('P1', 100); low.cdUntil = 10.5;
  ABILITIES[4].apply(mkCtx(low, [low]).ctx);
  ok(low.cdUntil === 10, 'never below current t');
}

console.log('DEICE (5)');
{
  const me = mkP('P1', 100);
  me.magics = [{ mult: 0.75, endsAt: 20 }, { mult: 1.25, endsAt: 20 }, { mult: 0.85, endsAt: 20 }];
  const { ctx } = mkCtx(me, [me]);
  ok(ABILITIES[5].apply(ctx) !== null && me.magics.length === 1 && me.magics[0].mult === 1.25, 'clears slows, keeps buffs');
  const clean = mkP('P1', 100); clean.magics = [{ mult: 1.25, endsAt: 20 }];
  ok(ABILITIES[5].apply(mkCtx(clean, [clean]).ctx) === null, 'nothing to clear → no-op');
}

console.log('BUMP (6)');
{
  const me = mkP('P1', 300), ahead = mkP('P2', 350), far = mkP('P3', 600), behind = mkP('P4', 100);
  const c = mkCtx(me, [me, ahead, far, behind]);
  const txt = ABILITIES[6].apply(c.ctx);
  ok(txt !== null && c.buffs.length === 1 && c.buffs[0].target === ahead && c.buffs[0].mult === 0.85 && c.buffs[0].seconds === 2,
    'slows the racer immediately ahead');
  const lead = mkP('P1', 700);
  const c2 = mkCtx(lead, [lead, me]);
  ok(ABILITIES[6].apply(c2.ctx) === null, 'leader → no-op');
  const me2 = mkP('P1', 300), finAhead = mkP('P2', 350, true), realAhead = mkP('P3', 400);
  const c3 = mkCtx(me2, [me2, finAhead, realAhead]);
  ABILITIES[6].apply(c3.ctx);
  ok(c3.buffs[0]?.target === realAhead, 'skips finished racers');
}

console.log('SYNERGY (7)');
{
  const me = mkP('P1', 100); me.nm = { mult: 2, endsAt: 13 };
  ok(ABILITIES[7].apply(mkCtx(me, [me]).ctx) !== null && me.nm.mult === 2.25, `+0.25 mult (got ${me.nm.mult})`);
  const maxed = mkP('P1', 100); maxed.nm = { mult: 4.9, endsAt: 13 };
  ABILITIES[7].apply(mkCtx(maxed, [maxed]).ctx);
  ok(maxed.nm.mult === 5, 'capped at 5.0');
}

console.log('GRIP (8) / OVERTAKE (9) / REDLINE (10)');
{
  const me = mkP('P1', 300), ahead = mkP('P2', 400);
  const c = mkCtx(me, [me, ahead]);
  ok(ABILITIES[8].apply(c.ctx) !== null && c.buffs[0].target === me && c.buffs[0].mult === 1.18 && c.buffs[0].seconds === 3, 'GRIP self ×1.18 3s');
  const c9 = mkCtx(mkP('P1', 300), [mkP('P1', 300), ahead]);
  // fresh player for OVERTAKE
  const me9 = c9.ctx.p;
  const t9 = ABILITIES[9].apply(c9.ctx);
  ok(t9 !== null && c9.buffs.some((b) => b.target === me9 && b.mult === 1.22) && c9.buffs.some((b) => b.mult === 0.85), 'OVERTAKE self+slow');
  const lead9 = mkP('P1', 700);
  const cl = mkCtx(lead9, [lead9, mkP('P2', 100)]);
  const tl = ABILITIES[9].apply(cl.ctx);
  ok(tl !== null && cl.buffs.length === 1 && cl.buffs[0].mult === 1.22, 'OVERTAKE as leader → self-boost only');
  const c10 = mkCtx(mkP('P1', 300), [mkP('P1', 300)]);
  ok(ABILITIES[10].apply(c10.ctx) !== null && c10.buffs[0].mult === 1.3 && c10.buffs[0].seconds === 4, 'REDLINE ×1.30 4s');
}

console.log('self-speed budget');
{
  const me = mkP('P1', 300);
  const c = mkCtx(me, [me]);
  const texts = triggerAbilities([8, 9, 10], c.ctx);
  const selfMults = c.buffs.filter((b) => b.target === me).map((b) => b.mult);
  const product = selfMults.reduce((a, b) => a * b, 1);
  ok(product <= 1.6 + 1e-9, `total self-speed product ≤ 1.6 (got ${product.toFixed(3)})`);
  ok(selfMults[0] === 1.18 && selfMults[1] === 1.22, 'ascending order: 8 then 9 full, 10 clipped');
  ok(selfMults[2] !== undefined && selfMults[2] < 1.3, `REDLINE clipped (got ${selfMults[2]?.toFixed(3)})`);
  ok(texts.length === 3, 'all three still report');
}

console.log('triggerAbilities dedupe + order');
{
  const me = mkP('P1', 300), lead = mkP('P2', 400);
  const c = mkCtx(me, [me, lead]);
  const texts = triggerAbilities([7, 1, 7, 1], c.ctx);
  ok(texts.length <= 2, `each unique value once (got ${texts.length})`);
  ok(me.dist === 312, 'SLIPSTREAM fired exactly once');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx scripts/cardgame-abilities-test.ts`
Expected: FAIL — `Cannot find module '../lib/cardgame/abilities'`

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/cardgame/abilities.ts` with exactly:

```ts
/**
 * CAR(D) GAME — per-value card abilities (Practice-first).
 *
 * Every NORMAL card's value (1–10) has one signature ability that fires
 * automatically when the card is played; each distinct value in a played set
 * triggers once. Magic cards keep their magic effect and never trigger their
 * printed value's ability (one card, one ability).
 *
 * PURE module: no DOM, no engine import, no randomness. The host (practice
 * mount today, possibly engine.ts later) adapts its state into `AbilityCtx`.
 * Determinism is a hard requirement — a future engine promotion must not be
 * able to fork client/server results.
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
const SLIP_PCT = 0.12;            // ... or 12% of the gap to the leader
const SLIP_WALL = 999;            // never jump past this (finish by speed only)
const DRAFT_EXT = 1.5;            // DRAFT boost extension (s)
const TUNE_CUT = 1;               // TUNE cooldown reduction (s)
const BUMP_MULT = 0.85; const BUMP_DUR = 2;
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
    key: 'SLIPSTREAM', icon: '🌀', desc: 'Jump forward 12% of your gap to the leader (max 15u)',
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
    key: 'DRAFT', icon: '💨', desc: 'Extend your running boost by 1.5s',
    apply(ctx) {
      if (!ctx.p.nm || ctx.t >= ctx.p.nm.endsAt) return null;
      ctx.p.nm.endsAt += DRAFT_EXT;
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
      const cut = Math.min(TUNE_CUT, ctx.p.cdUntil - ctx.t);
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
    key: 'BUMP', icon: '💥', desc: 'Slow the racer just ahead of you −15% for 2s',
    apply(ctx) {
      const tg = aheadOf(ctx);
      if (!tg) return null;
      ctx.buff(tg, BUMP_MULT, BUMP_DUR);
      return `💥 BUMP −${pct(1 / BUMP_MULT)}… wait`;
    },
  },
  7: {
    key: 'SYNERGY', icon: '✚', desc: '+0.25 to this play\'s multiplier',
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
    key: 'OVERTAKE', icon: '⏩', desc: '+22% for 2.5s, and the racer ahead −15% for 2s',
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
```

**Fix the BUMP popup text before saving** (the line above contains a deliberate reminder): it must be:

```ts
      return `💥 BUMP −15% ahead`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx scripts/cardgame-abilities-test.ts`
Expected: `… passed, 0 failed`, exit 0. If the budget test fails on ordering, re-check `triggerAbilities` sorts ascending.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/cardgame/abilities.ts frontend/scripts/cardgame-abilities-test.ts
git commit -m "feat(cardgame): pure per-value ability table + headless tests (practice-first)"
```

---

### Task 2: `mount.ts` integration (Practice engine)

**Files:**
- Modify: `frontend/lib/cardgame/mount.ts`

- [ ] **Step 1: Import the module**

After the `sound` import add:

```ts
import { ABILITIES, triggerAbilities, SELF_BUDGET } from './abilities';
```

- [ ] **Step 2: Trigger abilities at the end of `applyPlay`**

In `applyPlay`, the current tail is:

```ts
    const set = new Set(idxs); p.hand = p.hand.filter((_, i) => !set.has(i)); p.cdUntil = t + CFG.COOLDOWN;
    return { ok: true as const, r };
```

Replace with:

```ts
    const set = new Set(idxs); p.hand = p.hand.filter((_, i) => !set.has(i)); p.cdUntil = t + CFG.COOLDOWN;
    // per-value abilities: each distinct NORMAL value in the set fires once.
    // Magic cards only ever fire their magic (one card, one ability).
    const fired = triggerAbilities(
      cards.filter((c) => c.type === 'NORMAL').map((c) => c.value),
      {
        p, players, t, dur: CFG.DUR, cap: CFG.CAP,
        budget: { selfSpeedLeft: SELF_BUDGET },
        drawOne: () => {
          if (p.hand.length >= p.hlim || !deck.length) return false;
          p.hand.push(...draw(1)); return true;
        },
        buff: (tg, mult, seconds) => {
          const q = tg as Player;
          q.magics.push({ mult, endsAt: t + seconds });
          if (mult < 1) q.debuff = { cls: 'fx-hit', until: t + seconds };
        },
      },
    );
    // DEICE also clears the visual debuff mark
    if (fired.some((f) => f.includes('DEICE'))) p.debuff = null;
    return { ok: true as const, r, fired };
```

Note: `cards` is already captured above the hand filter, and `players`, `deck`, `draw`, `t` are in closure scope. The `AbilityPlayer` interface is a structural subset of `Player`, so `p`/`players` pass as-is.

- [ ] **Step 3: Surface fired abilities — human plays (popups + log)**

In the `playBtn` onclick, after the existing `popup(...)` line add:

```ts
      res.fired.forEach((txt, i) => {
        setTimeout(() => popup(txt, 'pop-ab'), 350 + i * 300);
        log(txt);
      });
```

- [ ] **Step 4: Surface fired abilities — bot plays (log only)**

In `botAct`, after `if (res.ok && res.r.combo) log(...)` add:

```ts
    if (res.ok) res.fired.forEach((txt) => log(`${nameOf(p.id)}: ${txt}`));
```

- [ ] **Step 5: Card face ribbon**

In `render()`'s hand loop, the card innerHTML ends with:

```ts
          <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : ''}`;
```

Replace with:

```ts
          <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : `<small class="ab">${ABILITIES[c.value].key}</small>`}`;
```

- [ ] **Step 6: Play preview shows what will fire**

In `updatePreview()`, replace the final `pv.textContent = ...` statement with:

```ts
    const abKeys = [...new Set(cards.filter((c) => c.type === 'NORMAL').map((c) => c.value))]
      .sort((a, b) => a - b).map((v) => ABILITIES[v].icon + ABILITIES[v].key);
    pv.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '')
      + (abKeys.length ? ` · ${abKeys.join(' ')}` : '')
      + (bestNote ? ` · ${bestNote}` : '');
```

- [ ] **Step 7: How-to-play legend**

In `TEMPLATE`, inside the second `.cg-help-col`, after the `cg-help-combos` div's closing `</div>` add:

```html
    <h4>Card abilities — every value does something</h4>
    <div class="cg-help-combos cg-help-abs" id="cgHelpAbs"></div>
```

In the Boot section (right before `showVehicleSelect(); updatePreview();`) add:

```ts
  $('cgHelpAbs').innerHTML = Object.entries(ABILITIES)
    .map(([v, a]) => `<span><b>${v}</b> ${a.icon} ${a.key} — ${a.desc}</span>`).join('');
```

- [ ] **Step 8: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "cardgame/" | grep -v "three"`
Expected: no output (pre-existing `three` typings errors excluded).

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/cardgame/mount.ts
git commit -m "feat(cardgame): wire per-value abilities into practice mode"
```

---

### Task 3: CSS — ribbon, ability popup, legend

**Files:**
- Modify: `frontend/app/cardgame/cardgame.css`

- [ ] **Step 1: Add styles**

After the `.cgroot .card small{...}` rule add:

```css
/* per-value ability ribbon on normal card faces */
.cgroot .card small.ab{font-size:6.5px;letter-spacing:1px;color:rgba(20,26,38,.55);font-weight:800}
.cgroot .card.hi small.ab{color:rgba(90,63,5,.6)}
/* ability trigger popup: smaller companion to the combo popup */
.cgroot .popup.pop-ab{font-size:16px;letter-spacing:2px;color:var(--cg-ice);
  filter:drop-shadow(0 0 10px rgba(77,208,225,.5));animation:cg-rise 1.4s ease-out forwards}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npx next build 2>&1 | grep -E "✓ Compiled|error" | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/cardgame/cardgame.css
git commit -m "style(cardgame): ability ribbon + trigger popup styles"
```

---

### Task 4: Final verification

- [ ] **Step 1: Full test sweep**

```bash
cd frontend
npx tsx scripts/cardgame-abilities-test.ts   # expect 0 failed
npx tsx scripts/cardgame-bestplay-test.ts    # expect 21/21 still green (solver untouched)
```

- [ ] **Step 2: Scope guard — engine/server untouched**

Run: `git diff HEAD~3 --stat -- frontend/lib/cardgame/engine.ts server/ cardgame/`
Expected: empty output.

- [ ] **Step 3: Manual play-test checklist (user or dev)**

Practice mode: play a single 3 → draws a card; play 8+9+10 straight → three ability popups, total self-boost visibly capped; play a 1 while behind → forward hop; preview shows `· 🌀SLIPSTREAM` etc.; help panel lists 10 abilities; bot ability lines appear in the log.

- [ ] **Step 4: Report** — summarize what shipped, flag that balance numbers are tunable constants at the top of `abilities.ts`.
