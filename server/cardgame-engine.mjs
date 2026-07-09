// AUTO-GENERATED from frontend/lib/cardgame/engine.ts — do not edit. Run scripts/build-cardgame-engine.mjs.

// lib/cardgame/engine.ts
var CFG = {
  TRACK: 1e3,
  CP: [250, 500, 750],
  ROUNDS: 3,
  TIMEOUT_TICKS: 1800,
  // 180s
  COOLDOWN_TICKS: 30,
  // 3s
  DUR_TICKS: 30,
  // 3s
  CAP: 5,
  START_CARDS: 8,
  CP_DRAW: 3,
  VEH: { LEGENDARY: { s: 10, h: 10 }, EPIC: { s: 9, h: 9 }, COMMON: { s: 8, h: 8 } },
  MAGIC: { NITRO: { m: 1.25, t: "SELF" }, NAIL: { m: 0.75, t: "FAST" }, OIL: { m: 0.75, t: "ALL" } },
  SCORE: { 1: 5, 2: 3, 3: 2, 4: 1 },
  BOT_ACT_P: 0.22
};
var COMBO = {
  PAIR: 50,
  THREE_OF_A_KIND: 150,
  FOUR_OF_A_KIND: 500,
  TWO_PAIRS: 100,
  THREE_PAIRS: 150,
  FOUR_PAIRS: 250,
  FULL_HOUSE: 150,
  TWO_TRIOS: 400,
  STRAIGHT_3: 20,
  STRAIGHT_4: 100,
  STRAIGHT_5: 200,
  STRAIGHT_6: 250,
  STRAIGHT_7: 300,
  STRAIGHT_8: 350
};
var PIDS = ["P1", "P2", "P3", "P4"];
var VEHICLES = ["LEGENDARY", "EPIC", "COMMON"];
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const s = xmur3(seed);
  return mulberry32(s());
}
function longestStraight(vals) {
  const u = [...new Set(vals)].sort((a, b) => a - b);
  let best = 0, cur = 0;
  for (let i = 0; i < u.length; i++) {
    if (i > 0 && u[i] === u[i - 1] + 1) cur++;
    else cur = 1;
    best = Math.max(best, cur);
  }
  return best;
}
function bestCombo(cards) {
  const vals = cards.map((c) => c.value), cnt = /* @__PURE__ */ new Map();
  vals.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
  const g = [...cnt.values()];
  const pairs = g.filter((n) => n >= 2).length, trios = g.filter((n) => n >= 3).length, quads = g.filter((n) => n >= 4).length;
  const cand = [];
  const add = (n) => cand.push({ name: n, bonus: COMBO[n] });
  if (quads >= 1) add("FOUR_OF_A_KIND");
  if (trios >= 2) add("TWO_TRIOS");
  if (trios >= 1 && pairs >= 2) add("FULL_HOUSE");
  if (trios >= 1) add("THREE_OF_A_KIND");
  if (pairs >= 4) add("FOUR_PAIRS");
  if (pairs >= 3) add("THREE_PAIRS");
  if (pairs >= 2) add("TWO_PAIRS");
  if (pairs >= 1) add("PAIR");
  const s = longestStraight(vals);
  if (s >= 3) add("STRAIGHT_" + Math.min(s, 8));
  if (!cand.length) return null;
  cand.sort((a, b) => b.bonus - a.bonus);
  return cand[0];
}
function evaluate(cards) {
  const sum = cards.reduce((s, c) => s + c.value, 0);
  let mult, kind, combo = null;
  if (cards.length === 1) {
    mult = 1 + cards[0].value * 0.02;
    kind = "SINGLE";
  } else {
    combo = bestCombo(cards);
    const cb = combo ? combo.bonus : 0;
    mult = 1 + (cb + sum * 0.2) / 100;
    kind = combo ? "COMBO" : "VALUE";
  }
  const capped = Math.min(mult, CFG.CAP);
  const magic = cards.filter((c) => c.type === "MAGIC").map((c) => ({ type: c.magic, ...CFG.MAGIC[c.magic] }));
  return { kind, combo: combo ? combo.name : null, mult: capped, raw: mult, magic, sum };
}
function fxClass(r) {
  if (r.magic.some((m) => m.type === "NITRO")) return "fx-nitro";
  if (r.combo === "FOUR_OF_A_KIND" || r.combo === "TWO_TRIOS" || r.mult >= CFG.CAP) return "fx-max";
  if (r.combo && COMBO[r.combo] >= 150) return "fx-epic";
  if (r.combo) return "fx-ice";
  return "fx-val";
}
function buildDeck(rng) {
  const d = [];
  let id = 0;
  for (let v = 1; v <= 10; v++) for (let i = 0; i < 18; i++) d.push({ id: id++, type: "NORMAL", value: v, magic: null });
  const mc = [["NITRO", 7], ["NAIL", 7], ["OIL", 6]];
  for (const [k, n] of mc) for (let i = 0; i < n; i++) d.push({ id: id++, type: "MAGIC", value: 1 + Math.floor(rng() * 10), magic: k });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function mkPlayers() {
  return PIDS.map((id) => ({
    id,
    veh: null,
    base: 0,
    hlim: 0,
    hand: [],
    dist: 0,
    fin: false,
    ft: null,
    cdUntil: 0,
    nm: null,
    magics: [],
    scores: [],
    times: [],
    total: 0,
    cp: /* @__PURE__ */ new Set(),
    fx: null,
    fxUntil: 0,
    debuff: null,
    debuffUntil: 0
  }));
}
function initMatch(seed) {
  const rng = makeRng(seed);
  const deck = buildDeck(rng);
  const players = mkPlayers();
  const usedVeh = { P1: {}, P2: {}, P3: {}, P4: {} };
  for (const p of players) p.hand.push(...deck.splice(0, CFG.START_CARDS));
  return { rng, deck, players, t: 0, roundIndex: 0, usedVeh, roundActive: false, finished: false };
}
function autoDiscard(p) {
  p.hand.sort((a, b) => a.value - b.value || (a.type === "NORMAL" ? 0 : 1) - (b.type === "NORMAL" ? 0 : 1) || a.id - b.id);
  while (p.hand.length > p.hlim) p.hand.shift();
}
function grant(hlim, cur) {
  return Math.max(0, Math.min(CFG.CP_DRAW, hlim - cur));
}
function remainingVeh(s, id) {
  return VEHICLES.filter((v) => !s.usedVeh[id][v]);
}
function byId(s, id) {
  return s.players.find((p) => p.id === id);
}
function startRoundMP(s, choices) {
  const resolved = {};
  for (const p of s.players) {
    const avail = remainingVeh(s, p.id);
    const want = choices[p.id];
    resolved[p.id] = want && avail.includes(want) ? want : avail[0];
  }
  for (const p of s.players) {
    const v = resolved[p.id];
    p.veh = v;
    p.base = CFG.VEH[v].s;
    p.hlim = CFG.VEH[v].h;
    s.usedVeh[p.id][v] = true;
    autoDiscard(p);
    if (s.roundIndex > 0) p.hand.push(...s.deck.splice(0, grant(p.hlim, p.hand.length)));
    p.dist = 0;
    p.fin = false;
    p.ft = null;
    p.cdUntil = 0;
    p.nm = null;
    p.magics = [];
    p.cp = /* @__PURE__ */ new Set();
    p.fx = null;
    p.fxUntil = 0;
    p.debuff = null;
    p.debuffUntil = 0;
  }
  s.t = 0;
  s.roundActive = true;
  return resolved;
}
function startRound(s, playerVehicle) {
  startRoundMP(s, playerVehicle ? { P1: playerVehicle } : {});
}
function speed(s, p) {
  const nm = p.nm && s.t < p.nm.endsAt ? p.nm.mult : 1;
  let mg = 1;
  for (const e of p.magics) if (s.t < e.endsAt) mg *= e.mult;
  return p.base * nm * mg;
}
function fastestOpp(s, p) {
  const o = s.players.filter((q) => q !== p && !q.fin);
  o.sort((a, b) => speed(s, b) - speed(s, a) || b.dist - a.dist);
  return o[0];
}
function applyPlay(s, p, cardIds) {
  if (p.fin || s.t < p.cdUntil) return null;
  if (cardIds.length < 1 || cardIds.length > 8) return null;
  const idxs = [];
  const usedIdx = /* @__PURE__ */ new Set();
  for (const cid of cardIds) {
    const i = p.hand.findIndex((c, k) => c.id === cid && !usedIdx.has(k));
    if (i < 0) return null;
    usedIdx.add(i);
    idxs.push(i);
  }
  const cards = idxs.map((i) => p.hand[i]);
  const r = evaluate(cards);
  p.nm = { mult: r.mult, endsAt: s.t + CFG.DUR_TICKS };
  p.fx = fxClass(r);
  p.fxUntil = s.t + CFG.DUR_TICKS;
  for (const m of r.magic) {
    if (m.t === "SELF") p.magics.push({ mult: m.m, endsAt: s.t + CFG.DUR_TICKS });
    else if (m.t === "FAST") {
      const tg = fastestOpp(s, p);
      if (tg) {
        tg.magics.push({ mult: m.m, endsAt: s.t + CFG.DUR_TICKS });
        tg.debuff = "fx-hit";
        tg.debuffUntil = s.t + CFG.DUR_TICKS;
      }
    } else for (const q of s.players) if (q !== p && !q.fin) {
      q.magics.push({ mult: m.m, endsAt: s.t + CFG.DUR_TICKS });
      q.debuff = "fx-oil";
      q.debuffUntil = s.t + CFG.DUR_TICKS;
    }
  }
  const rm = new Set(idxs);
  p.hand = p.hand.filter((_, i) => !rm.has(i));
  p.cdUntil = s.t + CFG.COOLDOWN_TICKS;
  return r;
}
function botAct(s, p) {
  if (p.fin || s.t < p.cdUntil || !p.hand.length || s.rng() > CFG.BOT_ACT_P) return;
  const byv = /* @__PURE__ */ new Map();
  p.hand.forEach((c, i) => {
    if (!byv.has(c.value)) byv.set(c.value, []);
    byv.get(c.value).push(i);
  });
  let best = null;
  byv.forEach((idxs) => {
    if (idxs.length >= 2 && (!best || idxs.length > best.length)) best = idxs.slice(0, 8);
  });
  if (!best) {
    let hi = 0;
    p.hand.forEach((c, i) => {
      if (c.value > p.hand[hi].value) hi = i;
    });
    best = [hi];
  }
  const cardIds = best.map((i) => p.hand[i].id);
  applyPlay(s, p, cardIds);
}
function physics(s) {
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
function stepTick(s, playerCardIds) {
  let played = null;
  if (playerCardIds && playerCardIds.length) {
    played = applyPlay(s, s.players[0], playerCardIds);
  }
  for (const p of s.players) if (p.id !== "P1") botAct(s, p);
  physics(s);
  s.t += 1;
  return played;
}
function stepTickMP(s, actions, botSeats) {
  const out = {};
  for (const pid of PIDS) {
    const cards = actions[pid];
    if (cards && cards.length) out[pid] = applyPlay(s, byId(s, pid), cards);
  }
  if (botSeats && botSeats.size) {
    for (const pid of PIDS) if (botSeats.has(pid)) botAct(s, byId(s, pid));
  }
  physics(s);
  s.t += 1;
  return out;
}
function roundDone(s) {
  return s.players.every((p) => p.fin) || s.t >= CFG.TIMEOUT_TICKS;
}
function scoreRound(s) {
  const fin = s.players.filter((p) => p.fin).sort((a, b) => (a.ft ?? 0) - (b.ft ?? 0));
  const dnf = s.players.filter((p) => !p.fin).sort((a, b) => b.dist - a.dist);
  const rank = [...fin, ...dnf];
  rank.forEach((p, i) => {
    const pts = CFG.SCORE[i + 1];
    p.scores.push(pts);
    p.times.push(p.ft ?? CFG.TIMEOUT_TICKS * 0.1);
    p.total += pts;
  });
  s.roundActive = false;
  s.roundIndex += 1;
  if (s.roundIndex >= CFG.ROUNDS) s.finished = true;
  return rank.map((p) => p.id);
}
function finalRanking(s) {
  return [...s.players].sort(
    (a, b) => b.total - a.total || b.scores.filter((x) => x === 5).length - a.scores.filter((x) => x === 5).length || a.times.reduce((x, y) => x + y, 0) - b.times.reduce((x, y) => x + y, 0)
  ).map((p) => p.id);
}
function simulateMatch(seed, input) {
  const s = initMatch(seed);
  let valid = true;
  let reason;
  const playsByRound = {};
  for (const pe of input.plays) (playsByRound[pe.round] ||= []).push(pe);
  for (let round = 0; round < CFG.ROUNDS; round++) {
    startRound(s, input.vehicles[round] ?? null);
    const byTick = /* @__PURE__ */ new Map();
    for (const pe of playsByRound[round] ?? []) {
      if (byTick.has(pe.tick)) {
        valid = false;
        reason = "duplicate play tick";
      }
      byTick.set(pe.tick, pe.cardIds);
    }
    let guard = 0;
    while (!roundDone(s) && guard++ < CFG.TIMEOUT_TICKS + 5) {
      const play = byTick.get(s.t);
      const played = stepTick(s, play);
      if (play && !played) {
        valid = false;
        reason = "illegal player play";
      }
    }
    scoreRound(s);
  }
  const ranking = finalRanking(s);
  const totals = {};
  for (const p of s.players) totals[p.id] = p.total;
  return { ranking, totals, valid, reason };
}
function simulateMatchMP(seed, input) {
  const s = initMatch(seed);
  const botSeats = new Set(input.botSeats);
  let valid = true;
  let reason;
  const byRound = {};
  for (const a of input.actions) {
    const r = byRound[a.round] ||= {};
    const t = r[a.tick] ||= {};
    if (t[a.pid]) {
      valid = false;
      reason = "duplicate play (pid,tick)";
    }
    t[a.pid] = a.cardIds;
  }
  for (let round = 0; round < CFG.ROUNDS; round++) {
    startRoundMP(s, input.vehicles[round] ?? {});
    let guard = 0;
    while (!roundDone(s) && guard++ < CFG.TIMEOUT_TICKS + 5) {
      const acts = byRound[round]?.[s.t] ?? {};
      const res = stepTickMP(s, acts, botSeats);
      for (const pid of PIDS) if (acts[pid] && !res[pid]) {
        valid = false;
        reason = `illegal play ${pid}`;
      }
    }
    scoreRound(s);
  }
  const ranking = finalRanking(s);
  const totals = {};
  for (const p of s.players) totals[p.id] = p.total;
  return { ranking, totals, valid, reason };
}
export {
  CFG,
  COMBO,
  PIDS,
  VEHICLES,
  applyPlay,
  bestCombo,
  evaluate,
  finalRanking,
  fxClass,
  initMatch,
  makeRng,
  roundDone,
  scoreRound,
  simulateMatch,
  simulateMatchMP,
  speed,
  startRound,
  startRoundMP,
  stepTick,
  stepTickMP
};
