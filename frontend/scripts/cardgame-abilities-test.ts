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
    sec: (n) => n, // seconds host (practice); the engine passes n*10 (ticks)
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
  ok(txt !== null && me.dist === 315, `15% of 100u gap → +15u (dist ${me.dist})`);
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
  ok(ABILITIES[2].apply(ctx) !== null && me.nm.endsAt === 14.5, `extends boost to 14.5 (got ${me.nm.endsAt})`);
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
  ok(txt !== null && c.buffs.length === 1 && c.buffs[0].target === ahead && c.buffs[0].mult === 0.85 && c.buffs[0].seconds === 2.5,
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
  const me9 = mkP('P1', 300), ahead9 = mkP('P2', 400);
  const c9 = mkCtx(me9, [me9, ahead9]);
  const t9 = ABILITIES[9].apply(c9.ctx);
  ok(t9 !== null && c9.buffs.some((b) => b.target === me9 && b.mult === 1.22) && c9.buffs.some((b) => b.target === ahead9 && b.mult === 0.85),
    'OVERTAKE self-boost + slow ahead');
  const lead9 = mkP('P1', 700);
  const cl = mkCtx(lead9, [lead9, mkP('P2', 100)]);
  const tl = ABILITIES[9].apply(cl.ctx);
  ok(tl !== null && cl.buffs.length === 1 && cl.buffs[0].mult === 1.22, 'OVERTAKE as leader → self-boost only');
  const me10 = mkP('P1', 300);
  const c10 = mkCtx(me10, [me10]);
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
  ok(selfMults[0] === 1.18 && selfMults[1] === 1.22, 'ascending order: 8 then 9 at full strength');
  ok(selfMults[2] !== undefined && selfMults[2] < 1.3, `REDLINE clipped by budget (got ${selfMults[2]?.toFixed(3)})`);
  ok(texts.length === 3, 'all three still report');
}

console.log('triggerAbilities dedupe + order');
{
  const me = mkP('P1', 300), lead = mkP('P2', 400);
  const c = mkCtx(me, [me, lead]);
  const texts = triggerAbilities([7, 1, 7, 1], c.ctx);
  ok(texts.length <= 2, `each unique value once (got ${texts.length})`);
  ok(me.dist === 315, 'SLIPSTREAM fired exactly once');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
