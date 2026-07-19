/**
 * CAR(D) GAME — shared deterministic engine.
 *
 * ONE implementation used by BOTH the browser (live play + input capture) and
 * the server (authoritative re-derivation at settle). Given a seed and the
 * player's recorded inputs, `simulateMatch` returns the exact same ranking on
 * both sides — so the server never trusts a client-reported result. A cheating
 * client can only submit its real (or illegal → rejected) inputs.
 *
 * Determinism: a single seeded RNG stream (xmur3 + mulberry32) drives the deck
 * shuffle, magic values, and all bot decisions. Time is an INTEGER tick counter
 * (1 tick = 0.1s) to avoid float accumulation drift; both runtimes are V8 so the
 * IEEE-754 float ops in the physics are bit-identical for the same op order.
 *
 * Per-value card abilities (abilities.ts) fire inside applyPlay for EVERY seat
 * (human and bot). They are RNG-free and run in tick space (sec → ×10), so the
 * capture→replay contract is unchanged: same seed + same inputs → same ranking.
 */
import { triggerAbilities, SELF_BUDGET } from './abilities';

export const CFG = {
  TRACK: 1000,
  CP: [250, 500, 750],
  ROUNDS: 3,
  TIMEOUT_TICKS: 1800, // 180s
  COOLDOWN_TICKS: 30, // 3s
  DUR_TICKS: 30, // 3s
  CAP: 5.0,
  START_CARDS: 8,
  CP_DRAW: 3,
  VEH: { LEGENDARY: { s: 10, h: 10 }, EPIC: { s: 9, h: 9 }, COMMON: { s: 8, h: 8 } } as Record<string, { s: number; h: number }>,
  MAGIC: { NITRO: { m: 1.25, t: 'SELF' }, NAIL: { m: 0.75, t: 'FAST' }, OIL: { m: 0.75, t: 'ALL' } } as Record<string, { m: number; t: string }>,
  SCORE: { 1: 5, 2: 3, 3: 2, 4: 1 } as Record<number, number>,
  BOT_ACT_P: 0.22,
} as const;

export const COMBO: Record<string, number> = {
  PAIR: 50, THREE_OF_A_KIND: 150, FOUR_OF_A_KIND: 500, TWO_PAIRS: 100, THREE_PAIRS: 150,
  FOUR_PAIRS: 250, FULL_HOUSE: 150, TWO_TRIOS: 400, STRAIGHT_3: 20, STRAIGHT_4: 100,
  STRAIGHT_5: 200, STRAIGHT_6: 250, STRAIGHT_7: 300, STRAIGHT_8: 350,
};

export const PIDS = ['P1', 'P2', 'P3', 'P4'] as const;
export type Pid = (typeof PIDS)[number];
export const VEHICLES = ['LEGENDARY', 'EPIC', 'COMMON'] as const;

export interface Card { id: number; type: 'NORMAL' | 'MAGIC'; value: number; magic: string | null }
export interface Effect { mult: number; endsAt: number }
export interface PlayerState {
  id: Pid; veh: string | null; base: number; hlim: number; hand: Card[];
  dist: number; fin: boolean; ft: number | null; cdUntil: number;
  nm: Effect | null; magics: Effect[]; scores: number[]; times: number[]; total: number;
  cp: Set<number>; fx: string | null; fxUntil: number; debuff: string | null; debuffUntil: number;
}
export interface MatchState {
  rng: () => number;
  deck: Card[];
  players: PlayerState[];
  t: number;            // ticks within the current round
  roundIndex: number;
  usedVeh: Record<Pid, Record<string, boolean>>;
  roundActive: boolean;
  finished: boolean;
}

/** One card play the player made: at (round, tick) they played these cardIds. */
export interface PlayEvent { round: number; tick: number; cardIds: number[] }
/** The full recorded player input for a match (single-human staked mode). */
export interface MatchInput { vehicles: string[]; plays: PlayEvent[] }

/** Multiplayer: one seat's play at (round, tick). */
export interface MPAction { pid: Pid; round: number; tick: number; cardIds: number[] }
/** Full recorded input for a 4-seat match. `vehicles[round][pid]` is each seat's
 *  chosen vehicle that round; `botSeats` are seats a bot drove (dropout fill). */
export interface MPInput { vehicles: Partial<Record<Pid, string>>[]; actions: MPAction[]; botSeats: Pid[] }

// ── deterministic RNG (xmur3 seed hash + mulberry32) ─────────────────────────

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRng(seed: string): () => number {
  const s = xmur3(seed);
  return mulberry32(s());
}

// ── card evaluation (identical rules to the demo) ────────────────────────────

function longestStraight(vals: number[]): number {
  const u = [...new Set(vals)].sort((a, b) => a - b);
  let best = 0, cur = 0;
  for (let i = 0; i < u.length; i++) { if (i > 0 && u[i] === u[i - 1] + 1) cur++; else cur = 1; best = Math.max(best, cur); }
  return best;
}
export function bestCombo(cards: Card[]): { name: string; bonus: number } | null {
  const vals = cards.map((c) => c.value), cnt = new Map<number, number>();
  vals.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
  const g = [...cnt.values()];
  const pairs = g.filter((n) => n >= 2).length, trios = g.filter((n) => n >= 3).length, quads = g.filter((n) => n >= 4).length;
  const cand: { name: string; bonus: number }[] = [];
  const add = (n: string) => cand.push({ name: n, bonus: COMBO[n] });
  if (quads >= 1) add('FOUR_OF_A_KIND');
  if (trios >= 2) add('TWO_TRIOS');
  if (trios >= 1 && pairs >= 2) add('FULL_HOUSE');
  if (trios >= 1) add('THREE_OF_A_KIND');
  if (pairs >= 4) add('FOUR_PAIRS'); if (pairs >= 3) add('THREE_PAIRS'); if (pairs >= 2) add('TWO_PAIRS'); if (pairs >= 1) add('PAIR');
  const s = longestStraight(vals); if (s >= 3) add('STRAIGHT_' + Math.min(s, 8));
  if (!cand.length) return null; cand.sort((a, b) => b.bonus - a.bonus); return cand[0];
}
/**
 * Is this a LEGAL multi-card play? A play of 2+ cards is only valid when the
 * ENTIRE set forms exactly one canonical combination — no extra/unrelated cards.
 * Single cards are always legal; the empty set is not a play.
 *
 * This is stricter than `bestCombo`, which ignores leftover cards (it would call
 * 2-2-6 a PAIR, silently dropping the 6). Here 2-2-6 is ILLEGAL: the 6 doesn't
 * belong. Magic cards count by their `value` like any card (a magic can be half
 * of a pair, part of a straight, etc.).
 *
 * Canonical combos (must consume ALL cards):
 *  - N-of-a-kind (2/3/4): every card the same value.
 *  - K pairs (K≥2): every distinct value appears exactly twice (two/three/four pairs).
 *  - Full house (5): one value ×3 + a different value ×2.
 *  - Two trios (6): two distinct values, each ×3.
 *  - Straight (3+): all distinct AND consecutive values (each value exactly once).
 */
export function isCompletePlay(cards: Card[]): boolean {
  const n = cards.length;
  if (n <= 1) return true; // single card (or, defensively, empty) — always fine
  const cnt = new Map<number, number>();
  for (const c of cards) cnt.set(c.value, (cnt.get(c.value) || 0) + 1);
  const counts = [...cnt.values()];
  const distinct = cnt.size;

  // N-of-a-kind: one distinct value, 2..4 copies
  if (distinct === 1) return n >= 2 && n <= 4;

  // K pairs: every distinct value appears exactly twice (n = 2K, K = 2,3,4)
  if (counts.every((c) => c === 2)) return distinct >= 2 && distinct <= 4;

  // Full house: exactly 5 cards = one value ×3 + one value ×2
  if (n === 5 && distinct === 2 && counts.includes(3) && counts.includes(2)) return true;

  // Two trios: exactly 6 cards = two distinct values each ×3
  if (n === 6 && distinct === 2 && counts.every((c) => c === 3)) return true;

  // Straight: all distinct AND consecutive (3+ cards)
  if (distinct === n && n >= 3) {
    const vals = [...cnt.keys()].sort((a, b) => a - b);
    for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1] + 1) return false;
    return true;
  }
  return false;
}

export interface PlayEval { kind: string; combo: string | null; mult: number; raw: number; magic: { type: string; m: number; t: string }[]; sum: number; legal: boolean; abilities?: string[] }
export function evaluate(cards: Card[]): PlayEval {
  const sum = cards.reduce((s, c) => s + c.value, 0);
  let mult: number, kind: string, combo: { name: string; bonus: number } | null = null;
  if (cards.length === 1) { mult = 1 + cards[0].value * 0.02; kind = 'SINGLE'; }
  else { combo = bestCombo(cards); const cb = combo ? combo.bonus : 0; mult = 1 + (cb + sum * 0.20) / 100; kind = combo ? 'COMBO' : 'VALUE'; }
  const capped = Math.min(mult, CFG.CAP);
  const magic = cards.filter((c) => c.type === 'MAGIC').map((c) => ({ type: c.magic as string, ...CFG.MAGIC[c.magic as string] }));
  return { kind, combo: combo ? combo.name : null, mult: capped, raw: mult, magic, sum, legal: isCompletePlay(cards) };
}
export function fxClass(r: PlayEval): string {
  if (r.magic.some((m) => m.type === 'NITRO')) return 'fx-nitro';
  if (r.combo === 'FOUR_OF_A_KIND' || r.combo === 'TWO_TRIOS' || r.mult >= CFG.CAP) return 'fx-max';
  if (r.combo && COMBO[r.combo] >= 150) return 'fx-epic';
  if (r.combo) return 'fx-ice';
  return 'fx-val';
}

// ── match construction & stepping ────────────────────────────────────────────

function buildDeck(rng: () => number): Card[] {
  const d: Card[] = [];
  let id = 0;
  for (let v = 1; v <= 10; v++) for (let i = 0; i < 18; i++) d.push({ id: id++, type: 'NORMAL', value: v, magic: null });
  const mc: [string, number][] = [['NITRO', 7], ['NAIL', 7], ['OIL', 6]];
  for (const [k, n] of mc) for (let i = 0; i < n; i++) d.push({ id: id++, type: 'MAGIC', value: 1 + Math.floor(rng() * 10), magic: k });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function mkPlayers(): PlayerState[] {
  return PIDS.map((id) => ({
    id, veh: null, base: 0, hlim: 0, hand: [], dist: 0, fin: false, ft: null, cdUntil: 0,
    nm: null, magics: [], scores: [], times: [], total: 0, cp: new Set<number>(), fx: null, fxUntil: 0, debuff: null, debuffUntil: 0,
  }));
}

export function initMatch(seed: string): MatchState {
  const rng = makeRng(seed);
  const deck = buildDeck(rng);
  const players = mkPlayers();
  const usedVeh: Record<Pid, Record<string, boolean>> = { P1: {}, P2: {}, P3: {}, P4: {} };
  // initial deal (8 each) — same order as PIDS
  for (const p of players) p.hand.push(...deck.splice(0, CFG.START_CARDS));
  return { rng, deck, players, t: 0, roundIndex: 0, usedVeh, roundActive: false, finished: false };
}

function autoDiscard(p: PlayerState) {
  p.hand.sort((a, b) => a.value - b.value || (a.type === 'NORMAL' ? 0 : 1) - (b.type === 'NORMAL' ? 0 : 1) || a.id - b.id);
  while (p.hand.length > p.hlim) p.hand.shift();
}
function grant(hlim: number, cur: number) { return Math.max(0, Math.min(CFG.CP_DRAW, hlim - cur)); }
function remainingVeh(s: MatchState, id: Pid): string[] { return VEHICLES.filter((v) => !s.usedVeh[id][v]); }
function byId(s: MatchState, id: Pid): PlayerState { return s.players.find((p) => p.id === id)!; }

/**
 * Begin a round with per-seat vehicle choices. Any seat whose choice is missing
 * or already-used falls back to first-available (deterministic) — the same rule
 * bots and dropped-out seats use. Returns the resolved choice per seat.
 * This is the general form; `startRound` is the single-human (P1-only) shim.
 */
export function startRoundMP(s: MatchState, choices: Partial<Record<Pid, string>>): Record<Pid, string> {
  const resolved = {} as Record<Pid, string>;
  for (const p of s.players) {
    const avail = remainingVeh(s, p.id);
    const want = choices[p.id];
    resolved[p.id] = want && avail.includes(want) ? want : avail[0];
  }
  for (const p of s.players) {
    const v = resolved[p.id];
    p.veh = v; p.base = CFG.VEH[v].s; p.hlim = CFG.VEH[v].h; s.usedVeh[p.id][v] = true;
    autoDiscard(p);
    if (s.roundIndex > 0) p.hand.push(...s.deck.splice(0, grant(p.hlim, p.hand.length)));
    p.dist = 0; p.fin = false; p.ft = null; p.cdUntil = 0; p.nm = null; p.magics = []; p.cp = new Set<number>(); p.fx = null; p.fxUntil = 0; p.debuff = null; p.debuffUntil = 0;
  }
  s.t = 0; s.roundActive = true;
  return resolved;
}

/** Begin a round: P1 chooses (validated), the other seats take first-available
 *  (deterministic). Thin shim over `startRoundMP` — behaviour is identical to
 *  the original single-human flow that the live staked mode + tests depend on. */
export function startRound(s: MatchState, playerVehicle: string | null): void {
  startRoundMP(s, playerVehicle ? { P1: playerVehicle } : {});
}

export function speed(s: MatchState, p: PlayerState): number {
  const nm = p.nm && s.t < p.nm.endsAt ? p.nm.mult : 1;
  let mg = 1;
  for (const e of p.magics) if (s.t < e.endsAt) mg *= e.mult;
  return p.base * nm * mg;
}
function fastestOpp(s: MatchState, p: PlayerState): PlayerState | undefined {
  const o = s.players.filter((q) => q !== p && !q.fin);
  o.sort((a, b) => speed(s, b) - speed(s, a) || b.dist - a.dist);
  return o[0];
}

/** Apply a play. Returns the eval, or null if illegal (used for validation). */
export function applyPlay(s: MatchState, p: PlayerState, cardIds: number[]): PlayEval | null {
  if (p.fin || s.t < p.cdUntil) return null;
  if (cardIds.length < 1 || cardIds.length > 8) return null;
  // resolve cardIds → indices in hand; every id must be present and distinct
  const idxs: number[] = [];
  const usedIdx = new Set<number>();
  for (const cid of cardIds) {
    const i = p.hand.findIndex((c, k) => c.id === cid && !usedIdx.has(k));
    if (i < 0) return null; // card not in hand → illegal
    usedIdx.add(i); idxs.push(i);
  }
  const cards = idxs.map((i) => p.hand[i]);
  // server-authoritative anti-cheat: a multi-card play must be ONE complete
  // canonical combination (no extra/unrelated cards). Rejecting here also makes
  // a settle-time replay of an illegal recorded play return valid=false.
  if (cards.length >= 2 && !isCompletePlay(cards)) return null;
  const r = evaluate(cards);
  p.nm = { mult: r.mult, endsAt: s.t + CFG.DUR_TICKS };
  p.fx = fxClass(r); p.fxUntil = s.t + CFG.DUR_TICKS;
  for (const m of r.magic) {
    if (m.t === 'SELF') p.magics.push({ mult: m.m, endsAt: s.t + CFG.DUR_TICKS });
    else if (m.t === 'FAST') { const tg = fastestOpp(s, p); if (tg) { tg.magics.push({ mult: m.m, endsAt: s.t + CFG.DUR_TICKS }); tg.debuff = 'fx-hit'; tg.debuffUntil = s.t + CFG.DUR_TICKS; } }
    else for (const q of s.players) if (q !== p && !q.fin) { q.magics.push({ mult: m.m, endsAt: s.t + CFG.DUR_TICKS }); q.debuff = 'fx-oil'; q.debuffUntil = s.t + CFG.DUR_TICKS; }
  }
  const rm = new Set(idxs);
  p.hand = p.hand.filter((_, i) => !rm.has(i));
  p.cdUntil = s.t + CFG.COOLDOWN_TICKS;
  // per-value abilities: each distinct NORMAL value fires once (after the hand
  // shrink + cooldown set, so TUNE/SCAVENGE see the post-play state — same
  // order as practice mode). Deterministic: no RNG, tick-space durations.
  const fired = triggerAbilities(
    cards.filter((c) => c.type === 'NORMAL').map((c) => c.value),
    {
      p, players: s.players, t: s.t, dur: CFG.DUR_TICKS, cap: CFG.CAP,
      budget: { selfSpeedLeft: SELF_BUDGET },
      sec: (n) => Math.round(n * 10),
      drawOne: () => {
        if (p.hand.length >= p.hlim || !s.deck.length) return false;
        p.hand.push(...s.deck.splice(0, 1)); return true;
      },
      buff: (tg, mult, seconds) => {
        const q = tg as PlayerState;
        const endsAt = s.t + Math.round(seconds * 10);
        q.magics.push({ mult, endsAt });
        if (mult < 1) { q.debuff = 'fx-hit'; q.debuffUntil = endsAt; }
      },
    },
  );
  // DEICE also clears the visual debuff mark
  if (fired.some((f) => f.includes('DEICE'))) { p.debuff = null; p.debuffUntil = 0; }
  r.abilities = fired;
  return r;
}

/** Deterministic bot decision for one bot this tick (uses the seeded RNG). */
function botAct(s: MatchState, p: PlayerState): void {
  if (p.fin || s.t < p.cdUntil || !p.hand.length || s.rng() > CFG.BOT_ACT_P) return;
  const byv = new Map<number, number[]>();
  p.hand.forEach((c, i) => { if (!byv.has(c.value)) byv.set(c.value, []); byv.get(c.value)!.push(i); });
  let best: number[] | null = null;
  byv.forEach((idxs) => { if (idxs.length >= 2 && (!best || idxs.length > best.length)) best = idxs.slice(0, 8); });
  if (!best) { let hi = 0; p.hand.forEach((c, i) => { if (c.value > p.hand[hi].value) hi = i; }); best = [hi]; }
  const cardIds = best.map((i) => p.hand[i].id);
  applyPlay(s, p, cardIds);
}

/** Physics for one tick: advance distance, cross checkpoints (draw cards),
 *  record finish time. No RNG — pure function of current state. Shared by the
 *  single-human `stepTick` and the multiplayer `stepTickMP`. */
function physics(s: MatchState): void {
  for (const p of s.players) {
    if (p.fin) continue;
    const prev = p.dist;
    p.dist += speed(s, p) * 0.1;
    CFG.CP.forEach((cp, i) => {
      if (!p.cp.has(i) && p.dist >= cp && !p.fin) {
        p.cp.add(i);
        p.hand.push(...s.deck.splice(0, grant(p.hlim, p.hand.length)));
      }
    });
    if (p.dist >= CFG.TRACK) {
      const need = CFG.TRACK - prev, prog = p.dist - prev;
      p.fin = true;
      p.ft = +((s.t + (prog > 0 ? need / prog : 0)) * 0.1).toFixed(2);
      p.dist = CFG.TRACK;
    }
  }
}

/**
 * Advance one tick. `playerCardIds` (if given) is a play the human is making
 * THIS tick — applied first, then bots act, then physics. Returns the applied
 * player eval (for the browser's popup) or null.
 */
export function stepTick(s: MatchState, playerCardIds?: number[]): PlayEval | null {
  let played: PlayEval | null = null;
  if (playerCardIds && playerCardIds.length) {
    played = applyPlay(s, s.players[0], playerCardIds);
  }
  // bots act (P2..P4) — deterministic
  for (const p of s.players) if (p.id !== 'P1') botAct(s, p);
  physics(s);
  s.t += 1;
  return played;
}

/**
 * Advance one tick in MULTIPLAYER: each seat's queued play (if any) is applied
 * in canonical Pid order (P1→P4) for determinism, then any bot-controlled seats
 * (dropouts / fills) act, then physics. Same-tick plays therefore resolve in a
 * fixed order, so a re-simulation of the recorded actions is bit-identical.
 * Returns each applied seat's eval (null = illegal / no play).
 */
export function stepTickMP(
  s: MatchState,
  actions: Partial<Record<Pid, number[]>>,
  botSeats?: Set<Pid>,
): Record<Pid, PlayEval | null> {
  const out = {} as Record<Pid, PlayEval | null>;
  for (const pid of PIDS) {
    const cards = actions[pid];
    if (cards && cards.length) out[pid] = applyPlay(s, byId(s, pid), cards);
  }
  if (botSeats && botSeats.size) for (const pid of PIDS) if (botSeats.has(pid)) botAct(s, byId(s, pid));
  physics(s);
  s.t += 1;
  return out;
}

/** Is the current round over? */
export function roundDone(s: MatchState): boolean {
  return s.players.every((p) => p.fin) || s.t >= CFG.TIMEOUT_TICKS;
}

/** Score the finished round into player totals. */
export function scoreRound(s: MatchState): Pid[] {
  const fin = s.players.filter((p) => p.fin).sort((a, b) => (a.ft ?? 0) - (b.ft ?? 0));
  const dnf = s.players.filter((p) => !p.fin).sort((a, b) => b.dist - a.dist);
  const rank = [...fin, ...dnf];
  rank.forEach((p, i) => { const pts = CFG.SCORE[i + 1]; p.scores.push(pts); p.times.push(p.ft ?? CFG.TIMEOUT_TICKS * 0.1); p.total += pts; });
  s.roundActive = false;
  s.roundIndex += 1;
  if (s.roundIndex >= CFG.ROUNDS) s.finished = true;
  return rank.map((p) => p.id);
}

/** Final ranking with the demo's tie-breaks (total, then #firsts, then time). */
export function finalRanking(s: MatchState): Pid[] {
  return [...s.players].sort((a, b) =>
    b.total - a.total ||
    b.scores.filter((x) => x === 5).length - a.scores.filter((x) => x === 5).length ||
    a.times.reduce((x, y) => x + y, 0) - b.times.reduce((x, y) => x + y, 0),
  ).map((p) => p.id);
}

// ── authoritative simulation (server side) ───────────────────────────────────

export interface SimResult { ranking: Pid[]; totals: Record<Pid, number>; valid: boolean; reason?: string }

/**
 * Re-derive a full match from (seed, player input). Pure & deterministic — the
 * server calls this at settle and trusts ONLY its output, never a client rank.
 * Illegal player plays (card not in hand / on cooldown) make valid=false.
 */
export function simulateMatch(seed: string, input: MatchInput): SimResult {
  const s = initMatch(seed);
  let valid = true;
  let reason: string | undefined;

  const playsByRound: Record<number, PlayEvent[]> = {};
  for (const pe of input.plays) (playsByRound[pe.round] ||= []).push(pe);

  for (let round = 0; round < CFG.ROUNDS; round++) {
    startRound(s, input.vehicles[round] ?? null);
    const byTick = new Map<number, number[]>();
    for (const pe of playsByRound[round] ?? []) {
      if (byTick.has(pe.tick)) { valid = false; reason = 'duplicate play tick'; }
      byTick.set(pe.tick, pe.cardIds);
    }
    let guard = 0;
    while (!roundDone(s) && guard++ < CFG.TIMEOUT_TICKS + 5) {
      const play = byTick.get(s.t); // player play scheduled for this exact tick
      // stepTick applies the player play (if any) → bots → physics → t++. Using
      // the SAME function the browser drives guarantees identical results.
      const played = stepTick(s, play);
      if (play && !played) { valid = false; reason = 'illegal player play'; }
    }
    scoreRound(s);
  }

  const ranking = finalRanking(s);
  const totals = {} as Record<Pid, number>;
  for (const p of s.players) totals[p.id] = p.total;
  return { ranking, totals, valid, reason };
}

/**
 * Re-derive a full 4-seat match from (seed, recorded MP input). The multiplayer
 * server runs the live loop authoritatively; this replays the recorded actions
 * to the exact same ranking, so any match is independently auditable and a
 * dispute can be settled by anyone holding the seed + action log.
 */
export function simulateMatchMP(seed: string, input: MPInput): SimResult {
  const s = initMatch(seed);
  const botSeats = new Set<Pid>(input.botSeats);
  let valid = true;
  let reason: string | undefined;

  // group actions by round → tick → pid (reject two plays by one seat on a tick)
  const byRound: Record<number, Record<number, Partial<Record<Pid, number[]>>>> = {};
  for (const a of input.actions) {
    const r = (byRound[a.round] ||= {});
    const t = (r[a.tick] ||= {});
    if (t[a.pid]) { valid = false; reason = 'duplicate play (pid,tick)'; }
    t[a.pid] = a.cardIds;
  }

  for (let round = 0; round < CFG.ROUNDS; round++) {
    startRoundMP(s, input.vehicles[round] ?? {});
    let guard = 0;
    while (!roundDone(s) && guard++ < CFG.TIMEOUT_TICKS + 5) {
      const acts = byRound[round]?.[s.t] ?? {};
      const res = stepTickMP(s, acts, botSeats);
      for (const pid of PIDS) if (acts[pid] && !res[pid]) { valid = false; reason = `illegal play ${pid}`; }
    }
    scoreRound(s);
  }

  const ranking = finalRanking(s);
  const totals = {} as Record<Pid, number>;
  for (const p of s.players) totals[p.id] = p.total;
  return { ranking, totals, valid, reason };
}
