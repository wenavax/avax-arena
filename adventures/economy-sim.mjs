#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Frostbite Adventures — P1 economy simulator (spec §7: emissions vs sinks vs growth)
//
// Models the ON-CHAIN economy of FrostbiteAdventures.sol at 1x wall-clock:
//   - 6 zones, each a TOTAL budget of ratePerMin shards shared pro-rata by
//     weight across UNCAPPED staked heroes (capped heroes' share redistributes —
//     the engine.ts "boosting" waterfill).
//   - emission cap: settledSinceLevel <= 3 * costToNextLevel(L); resets ONLY on
//     levelUp, which burns (25 + 5L^2) * costUnit FSB to 0xdEaD.
//   - CRITICAL: burns go to 0xdEaD, NOT back to the pool. Pool longevity depends
//     on EMISSION only; burns only shrink circulating supply.
//   - fixed pre-funded pool; no mint path. Emission stops when pool = 0.
//   - players fund burns ONLY from farmed FSB (FSB has no Trader Joe liquidity,
//     so there is no external buy leg — the honest assumption).
//
// Units: sim runs in "shards"; FSB = shards * costUnit (FSB per shard).
//   current placeholder: costUnit = 1     (contract costUnit = 1e18 wei)
//   calibrated proposal: costUnit = 0.001 (contract costUnit = 1e15 wei)
// Shard-space gameplay is identical in both; only FSB denomination and pool
// depth (poolShards = poolFsb / costUnit) differ.
//
// Usage: node adventures/economy-sim.mjs [--weeks 12] [--heroes 3] [--only substr]
// Deterministic (seeded per scenario name).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── CLI ──
const argv = process.argv.slice(2);
function flag(name, dflt) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}
const WEEKS = Number(flag('weeks', 12));
const HEROES_PER = Number(flag('heroes', 3));
const ONLY = flag('only', '');

// ── Game constants (mirror zones.ts / engine.ts / FrostbiteAdventures.sol) ──
const ZONES = [
  { name: 'Frostpond', ratePerMin: 60, minLevel: 1 },
  { name: 'Glacier Stream', ratePerMin: 60, minLevel: 1 },
  { name: 'Frozen Marsh', ratePerMin: 60, minLevel: 1 },
  { name: 'Rime River', ratePerMin: 150, minLevel: 10 },
  { name: 'Whitewood Forest', ratePerMin: 300, minLevel: 15 },
  { name: 'Great Frostlake', ratePerMin: 600, minLevel: 20 },
];
const MAX_ADV_LEVEL = 100;
const cost = (L) => 25 + 5 * L * L; // shards to go L -> L+1
const cap = (L) => 3 * cost(L); //   emission cap while at L

// rarity mults (types.ts RARITY_MULT) with an assumed mint distribution
const RARITY = [
  { mult: 1.0, p: 0.6 },
  { mult: 1.15, p: 0.25 },
  { mult: 1.35, p: 0.1 },
  { mult: 1.6, p: 0.04 },
  { mult: 2.0, p: 0.01 },
];
const AFFINITY_MULT = 1.35; // 1-in-8 chance a hero matches its zone's element

// Player archetypes. eager = levelUp as soon as affordable (max reinvest);
// lazy = levelUp only when emission-capped (Hoppers-forced). target = stop level.
const ARCHETYPES = [
  { name: 'grinder', share: 0.35, eager: true, target: 100 },
  { name: 'farmer', share: 0.45, eager: false, target: 40 },
  { name: 'tourist', share: 0.2, eager: false, target: 5 },
];

const GROWTH = {
  zero: { type: 'zero', label: 'flat' },
  decl: { type: 'decline', rate: 0.07, label: '-7%/wk churn' },
  grow: { type: 'grow', rate: 0.15, label: '+15%/wk' },
};
const RATE_SETS = {
  cur: { costUnit: 1, label: 'placeholder rates (costUnit=1e18, 1 shard = 1 FSB)' },
  cal: { costUnit: 0.001, label: 'calibrated (costUnit=1e15, 1 shard = 0.001 FSB)' },
};
const POOLS = [100_000, 500_000, 1_000_000]; // FSB

// ── deterministic PRNG ──
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── entities ──
function newHero(rng) {
  const r = rng();
  let acc = 0;
  let mult = 1;
  for (const t of RARITY) {
    acc += t.p;
    if (r <= acc) {
      mult = t.mult;
      break;
    }
  }
  return {
    level: 1,
    rarityMult: mult,
    affinity: rng() < 1 / 8 ? AFFINITY_MULT : 1,
    capUsed: 0, // settledSinceLevel, in shards
    zone: -1,
    dormant: false, // reached target AND filled final cap => never earns again
  };
}
const weight = (h) => h.level * h.rarityMult * h.affinity; // statSum uniform, cancels in pro-rata

function newPlayer(rng, heroesPer) {
  const r = rng();
  let acc = 0;
  let arch = ARCHETYPES[0];
  for (const a of ARCHETYPES) {
    acc += a.share;
    if (r <= acc) {
      arch = a;
      break;
    }
  }
  const heroes = [];
  for (let i = 0; i < heroesPer; i++) heroes.push(newHero(rng));
  return { arch, balance: 0, heroes, active: true, churned: false };
}

// ── level-up policy (burns funded ONLY from farmed balance) ──
function applyPolicy(p, stats) {
  let leveled = false;
  for (const h of p.heroes) {
    if (h.dormant) continue;
    for (;;) {
      if (h.level >= p.arch.target || h.level >= MAX_ADV_LEVEL) {
        if (h.capUsed >= cap(h.level) - 1e-9) h.dormant = true; // extracted final cap
        break;
      }
      const c = cost(h.level);
      const capped = h.capUsed >= cap(h.level) - 1e-9;
      if (!(p.arch.eager || capped) || p.balance < c) break;
      p.balance -= c;
      stats.burned += c;
      h.level += 1;
      h.capUsed = 0; // settledSinceLevel reset — the only reset path
      leveled = true;
    }
  }
  return leveled;
}

// ── daily zone choice: greedy marginal-share equilibrium approximation ──
function rebalance(players, rng) {
  const W = new Array(ZONES.length).fill(0);
  const heroes = [];
  for (const p of players) if (p.active) for (const h of p.heroes) if (!h.dormant) heroes.push(h);
  for (let i = heroes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [heroes[i], heroes[j]] = [heroes[j], heroes[i]];
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const h of heroes) {
      if (pass > 0 && h.zone >= 0) W[h.zone] -= weight(h);
      const w = weight(h);
      let best = -1;
      let bestGain = -1;
      for (let z = 0; z < ZONES.length; z++) {
        if (h.level < ZONES[z].minLevel) continue;
        const gain = (ZONES[z].ratePerMin * w) / (W[z] + w);
        if (gain > bestGain) {
          bestGain = gain;
          best = z;
        }
      }
      h.zone = best;
      if (best >= 0) W[best] += w;
    }
  }
}

// ── one time-step: waterfill zone budgets over uncapped heroes, then policies ──
function step(players, minutes, econ, stats) {
  const budget = ZONES.map((z) => z.ratePerMin * minutes); // shards
  for (let pass = 0; pass < 8; pass++) {
    if (econ.poolShards <= 1e-9) break;
    const byZone = ZONES.map(() => []);
    for (const p of players) {
      if (!p.active) continue;
      for (const h of p.heroes) {
        if (h.dormant || h.zone < 0) continue;
        if (h.capUsed < cap(h.level) - 1e-9) byZone[h.zone].push({ p, h });
      }
    }
    let distributed = 0;
    for (let z = 0; z < ZONES.length; z++) {
      if (budget[z] <= 1e-9 || byZone[z].length === 0) continue;
      const Wz = byZone[z].reduce((s, x) => s + weight(x.h), 0);
      const b = budget[z];
      for (const { p, h } of byZone[z]) {
        let give = (b * weight(h)) / Wz;
        give = Math.min(give, cap(h.level) - h.capUsed, econ.poolShards);
        if (give <= 0) continue;
        h.capUsed += give;
        p.balance += give; // continuous settle+claim assumption
        econ.poolShards -= give;
        budget[z] -= give;
        stats.emitted += give;
        distributed += give;
        if (econ.poolShards <= 1e-9 && econ.depletedDay < 0) econ.depletedDay = econ.day;
      }
    }
    let leveled = false;
    for (const p of players) if (p.active) leveled = applyPolicy(p, stats) || leveled;
    if (distributed <= 1e-9 && !leveled) break;
  }
}

// ── weekly population change ──
function applyGrowth(players, growth, rng, heroesPer, carry) {
  const active = players.filter((p) => p.active);
  if (growth.type === 'decline') {
    carry.x += active.length * growth.rate;
    let n = Math.floor(carry.x);
    carry.x -= n;
    while (n-- > 0 && active.length > 0) {
      const i = Math.floor(rng() * active.length);
      active[i].active = false;
      active[i].churned = true;
      active.splice(i, 1);
    }
  } else if (growth.type === 'grow') {
    carry.x += active.length * growth.rate;
    let n = Math.floor(carry.x);
    carry.x -= n;
    while (n-- > 0) players.push(newPlayer(rng, heroesPer));
  }
}

// ── scenario runner ──
function runScenario(cfg) {
  const rng = mulberry32(hashSeed(cfg.name));
  const econ = { poolShards: cfg.poolFsb / cfg.costUnit, depletedDay: -1, day: 0 };
  const stats = { emitted: 0, burned: 0 };
  const players = [];
  for (let i = 0; i < cfg.players0; i++) players.push(newPlayer(rng, HEROES_PER));
  const carry = { x: 0 };
  const weekly = [];
  let prevE = 0;
  let prevB = 0;

  for (let week = 1; week <= WEEKS; week++) {
    for (let d = 0; d < 7; d++) {
      econ.day = (week - 1) * 7 + d + 1;
      rebalance(players, rng);
      const stepMin = econ.day <= 3 ? 15 : 60; // fine steps while low-level cycles are fast
      for (let s = 0; s < (24 * 60) / stepMin; s++) step(players, stepMin, econ, stats);
      for (const p of players) if (p.active && p.heroes.every((h) => h.dormant)) p.active = false;
    }
    applyGrowth(players, cfg.growth, rng, HEROES_PER, carry);

    const alive = players.filter((p) => !p.churned);
    const heroes = alive.flatMap((p) => p.heroes);
    const eWk = (stats.emitted - prevE) * cfg.costUnit;
    const bWk = (stats.burned - prevB) * cfg.costUnit;
    prevE = stats.emitted;
    prevB = stats.burned;
    weekly.push({
      week,
      actPl: players.filter((p) => p.active).length,
      heroes: heroes.length,
      avgL: heroes.reduce((s, h) => s + h.level, 0) / Math.max(1, heroes.length),
      maxL: heroes.reduce((m, h) => Math.max(m, h.level), 0),
      dormPct: (100 * heroes.filter((h) => h.dormant).length) / Math.max(1, heroes.length),
      emitWk: eWk,
      burnWk: bWk,
      poolFsb: econ.poolShards * cfg.costUnit,
    });
  }

  // invariant: emitted == burned + sum(balances)
  const balSum = players.reduce((s, p) => s + p.balance, 0);
  const drift = Math.abs(stats.emitted - stats.burned - balSum) / Math.max(1, stats.emitted);
  if (drift > 1e-6) console.error(`WARN invariant drift ${drift} in ${cfg.name}`);

  return {
    cfg,
    weekly,
    emitFsb: stats.emitted * cfg.costUnit,
    burnFsb: stats.burned * cfg.costUnit,
    poolLeftFsb: econ.poolShards * cfg.costUnit,
    depletedDay: econ.depletedDay,
    last: weekly[weekly.length - 1],
  };
}

// ── formatting ──
const fmt = (x) =>
  x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : x.toFixed(x > 0 && x < 10 ? 2 : 0);
const pad = (s, n) => String(s).padEnd(n);

function summaryRow(r) {
  const ratio = r.emitFsb > 0 ? (r.burnFsb / r.emitFsb).toFixed(2) : '-';
  return (
    pad(r.cfg.name, 26) +
    pad(r.depletedDay > 0 ? 'd' + r.depletedDay : '-', 8) +
    pad(fmt(r.emitFsb), 9) +
    pad(fmt(r.burnFsb), 9) +
    pad(ratio, 7) +
    pad(fmt(r.emitFsb - r.burnFsb), 9) +
    pad(fmt(r.poolLeftFsb), 9) +
    pad(r.last.actPl, 6) +
    pad(r.last.avgL.toFixed(1), 6) +
    r.last.maxL
  );
}
const SUMMARY_HDR =
  pad('scenario', 26) +
  pad('deplete', 8) +
  pad('emitFSB', 9) +
  pad('burnFSB', 9) +
  pad('b/e', 7) +
  pad('netExtr', 9) +
  pad('poolLeft', 9) +
  pad('actPl', 6) +
  pad('avgL', 6) +
  'maxL';

function printDetail(r) {
  console.log(`\n--- weekly: ${r.cfg.name}  (${r.cfg.growthLabel}; pool ${fmt(r.cfg.poolFsb)} FSB) ---`);
  console.log(
    pad('wk', 4) + pad('actPl', 7) + pad('heroes', 8) + pad('avgL', 7) + pad('dorm%', 7) +
      pad('emitWk', 9) + pad('burnWk', 9) + pad('b/e', 6) + 'poolFSB',
  );
  for (const w of r.weekly) {
    console.log(
      pad(w.week, 4) + pad(w.actPl, 7) + pad(w.heroes, 8) + pad(w.avgL.toFixed(1), 7) +
        pad(w.dormPct.toFixed(0), 7) + pad(fmt(w.emitWk), 9) + pad(fmt(w.burnWk), 9) +
        pad(w.emitWk > 0 ? (w.burnWk / w.emitWk).toFixed(2) : '-', 6) + fmt(w.poolFsb),
    );
  }
}

// ── analytic header ──
const totalPerMin = ZONES.reduce((s, z) => s + z.ratePerMin, 0);
const perDay = totalPerMin * 1440;
const ladder = Array.from({ length: 99 }, (_, i) => cost(i + 1)).reduce((a, b) => a + b, 0);
console.log('═══ Frostbite Adventures P1 economy sim ═══');
console.log(`zones total: ${totalPerMin} shards/min = ${fmt(perDay)} shards/day = ${fmt(perDay * 7 * WEEKS)} shards/${WEEKS}wk season (saturation ceiling)`);
console.log(`levelUp ladder L1→L100 burn: ${fmt(ladder)} shards/hero; lazy-path lifetime emission ≈ 3x = ${fmt(3 * ladder)} shards/hero`);
console.log(`at costUnit=1e18 (current): ceiling = ${fmt(perDay)} FSB/day = ${((perDay / 10_000_000) * 100).toFixed(1)}% of 10M circulating FSB PER DAY`);
console.log(`at costUnit=1e15 (calibrated ÷1000): ceiling = ${fmt(perDay * 0.001)} FSB/day, ${fmt(perDay * 0.001 * 7 * WEEKS)} FSB/${WEEKS}wk season`);
console.log(`archetypes: ${ARCHETYPES.map((a) => `${a.name} ${a.share * 100}% (${a.eager ? 'eager' : 'lazy'}→L${a.target})`).join(', ')}; ${HEROES_PER} heroes/player\n`);

// ── matrix ──
const results = [];
for (const [rk, rs] of Object.entries(RATE_SETS)) {
  for (const poolFsb of POOLS) {
    for (const players0 of [5, 50, 500]) {
      for (const [gk, growth] of Object.entries(GROWTH)) {
        const name = `${rk}-p${poolFsb / 1000}k-n${players0}-${gk}`;
        if (ONLY && !name.includes(ONLY)) continue;
        results.push(
          runScenario({ name, costUnit: rs.costUnit, poolFsb, players0, growth, growthLabel: growth.label }),
        );
      }
    }
  }
}
console.log(`═══ MATRIX (${WEEKS} weeks) ═══`);
console.log(SUMMARY_HDR);
for (const r of results) console.log(summaryRow(r));

// ── recommended launch config: calibrated rates + 150k pool (≥ season ceiling) ──
const rec = [];
if (!ONLY) {
  for (const players0 of [5, 50, 500]) {
    for (const [gk, growth] of Object.entries(GROWTH)) {
      const name = `REC-cal-p150k-n${players0}-${gk}`;
      rec.push(runScenario({ name, costUnit: 0.001, poolFsb: 150_000, players0, growth, growthLabel: growth.label }));
    }
  }
  console.log(`\n═══ RECOMMENDED (cal rates, 150k FSB pool ≥ ${fmt(perDay * 0.001 * 7 * WEEKS)} FSB ceiling → cannot deplete) ═══`);
  console.log(SUMMARY_HDR);
  for (const r of rec) console.log(summaryRow(r));
}

// ── weekly detail for headline scenarios ──
const DETAIL = ['cur-p1000k-n50-zero', 'cal-p100k-n50-zero', 'cal-p100k-n500-zero', 'REC-cal-p150k-n50-decl'];
for (const name of DETAIL) {
  const r = [...results, ...rec].find((x) => x.cfg.name === name);
  if (r) printDetail(r);
}
