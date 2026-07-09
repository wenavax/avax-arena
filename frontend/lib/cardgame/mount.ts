/**
 * CAR(D) GAME — self-contained demo engine + DOM renderer.
 * Ported from cardgame/demo/index.html into a mountable module so the Next
 * page can wrap it with Privy wallet identity. Game logic unchanged; the
 * connected wallet address becomes P1's racer identity in the escrow panel,
 * lane tag and settlement rows.
 */
import { vehicleSelector, VEH_META, vehAbbr, vehColor } from './vehicles';
import { bestPlay } from './bestPlay';
import type { Track3D } from './track3d';

export interface CardGameOptions {
  address?: string | null;
  /** Staked (on-chain) mode: real player + 3 bot addresses; onFinish gets the
   *  final ranking as on-chain addresses (winner first) for settle(). */
  staked?: {
    player: string;
    bots: string[]; // exactly 3
    onFinish: (rankingAddresses: string[]) => void;
  };
}

const TEMPLATE = `
<div class="toast" id="cgToast"></div>
<header class="top top--slim">
  <div>
    <div class="eyebrow">❄ FROSTBITE · AVALANCHE</div>
    <h1>CAR(D) <span class="red">GAME</span></h1>
    <div class="sub">Race 3 bots to <b>1000u</b> — play card combos for speed. Practice is free; the pot is simulated.</div>
  </div>
</header>

<div class="metaRow">
  <span class="chip" id="roundChip">ROUND 1/3</span>
  <span class="chip gold">POOL ◆ 4.00 · SIM</span>
  <span class="chip mono" id="seedChip"></span>
  <button class="chip cg-viewtoggle" id="viewToggle" title="Switch track view">🎥 3D VIEW</button>
</div>

<div class="cg-vsel-slot" id="vehSelect"></div>
<div class="track glass" id="track"></div>
<div class="track3d glass" id="track3d" style="display:none"><button class="cg-fs" id="fsBtn" title="Fullscreen">⛶</button></div>

<div class="grid">
  <div class="panel glass" id="handPanel">
    <h3>Your hand — <span id="handLimit"></span></h3>
    <div class="hand" id="hand"></div>
    <div class="cooldown"><div id="cdbar"></div></div>
    <div class="row">
      <button class="btn" id="playBtn">PLAY SELECTED</button>
      <button class="btn ghost" id="bestBtn">✨ Best</button>
      <button class="btn ghost" id="clearBtn">Clear</button>
      <span class="pill" id="playPreview">select 1–8 cards</span>
    </div>
  </div>

  <div class="panel glass">
    <h3>Standings — Round <span id="roundNo">1</span>/3</h3>
    <table id="scoreTable"><tbody></tbody></table>
    <div id="settle"></div>
    <h3 style="margin-top:14px">Event log</h3>
    <div class="log" id="log"></div>
  </div>
</div>

<footer class="foot dim">Deterministic seed · replayable &amp; auditable · staked mode settles on-chain via <span class="mono">MatchEscrow.sol</span></footer>
`;

/* neon araba — tekerlekler ayrı <g>'lerde ki CSS keyframe'ler döndürebilsin */
const CAR_SVG = `<svg class="carsvg" viewBox="0 0 56 32">
  <g class="flame"><path d="M9 15.5 L-3 13 L3 16.5 L-5 19.5 L9 20.5 Z" fill="#f5c542"></path>
    <path d="M9 16.5 L1 15 L5 17 L1 19 L9 19.5 Z" fill="#ed2f39"></path></g>
  <path class="body" d="M6 22 L8 16 Q13 9 22 8 L32 8 Q41 9 47 15 L52 18 Q54 19 54 21 L53 22 Z"></path>
  <path class="glass" d="M21 9.5 L19 15 L35 15 L33 9.5"></path>
  <circle class="light" cx="52.2" cy="19" r="1.6"></circle>
  <g class="wheel w1"><circle cx="16" cy="24" r="5.5"></circle><line x1="16" y1="20" x2="16" y2="28"></line><line x1="12" y1="24" x2="20" y2="24"></line></g>
  <g class="wheel w2"><circle cx="42" cy="24" r="5.5"></circle><line x1="42" y1="20" x2="42" y2="28"></line><line x1="38" y1="24" x2="46" y2="24"></line></g>
</svg>`;

type Card = { id: number; type: 'NORMAL' | 'MAGIC'; value: number; magic: string | null };
type Player = {
  id: string; veh: string | null; base: number; hlim: number; hand: Card[]; dist: number;
  fin: boolean; ft: number | null; cdUntil: number; nm: { mult: number; endsAt: number } | null;
  magics: { mult: number; endsAt: number }[]; scores: number[]; times: number[]; total: number;
  cp: Set<number>; fx: { cls: string; until: number } | null; debuff: { cls: string; until: number } | null;
};

export function mountCardGame(root: HTMLElement, opts: CardGameOptions = {}): () => void {
  root.innerHTML = TEMPLATE;
  const $ = (id: string) => root.querySelector('#' + id) as HTMLElement;

  // ---- Config (mirrors the design document) ----
  const CFG = {
    TRACK: 1000, CP: [250, 500, 750], TIMEOUT: 180, COOLDOWN: 3, DUR: 3, CAP: 5.0,
    VEH: { LEGENDARY: { s: 10, h: 10 }, EPIC: { s: 9, h: 9 }, COMMON: { s: 8, h: 8 } } as Record<string, { s: number; h: number }>,
    MAGIC: { NITRO: { m: 1.25, t: 'SELF' }, NAIL: { m: 0.75, t: 'FAST' }, OIL: { m: 0.75, t: 'ALL' } } as Record<string, { m: number; t: string }>,
    SCORE: { 1: 5, 2: 3, 3: 2, 4: 1 } as Record<number, number>,
  };
  const COMBO: Record<string, number> = {
    PAIR: 50, THREE_OF_A_KIND: 150, FOUR_OF_A_KIND: 500, TWO_PAIRS: 100, THREE_PAIRS: 150,
    FOUR_PAIRS: 250, FULL_HOUSE: 150, TWO_TRIOS: 400, STRAIGHT_3: 20, STRAIGHT_4: 100,
    STRAIGHT_5: 200, STRAIGHT_6: 250, STRAIGHT_7: 300, STRAIGHT_8: 350,
  };
  const COLORS: Record<string, string> = { P1: '--p1', P2: '--p2', P3: '--p3', P4: '--p4' };
  const MAGIC_ICON: Record<string, string> = { NITRO: '⚡', NAIL: '✕', OIL: '●' };

  // ---- Blockchain dressing (cosmetic — mirrors the MatchEscrow flow) ----
  function mockHex(n: number) { let s = '0x'; for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return s; }
  function short(a: string) { return a.slice(0, 6) + '…' + a.slice(-4); }
  const ADDR: Record<string, string> = opts.staked
    ? { P1: opts.staked.player, P2: opts.staked.bots[0], P3: opts.staked.bots[1], P4: opts.staked.bots[2] }
    : { P1: opts.address || mockHex(40), P2: mockHex(40), P3: mockHex(40), P4: mockHex(40) };
  const meAddr = opts.staked ? opts.staked.player : opts.address;
  function nameOf(id: string) { return id === 'P1' ? (meAddr ? 'YOU ' + short(ADDR.P1) : 'YOU') : short(ADDR[id]); }

  // ---- Deck ----
  let cid = 0;
  function buildDeck(): Card[] {
    const d: Card[] = [];
    for (let v = 1; v <= 10; v++) for (let i = 0; i < 18; i++) d.push({ id: ++cid, type: 'NORMAL', value: v, magic: null });
    const mc: Record<string, number> = { NITRO: 7, NAIL: 7, OIL: 6 };
    for (const k in mc) for (let i = 0; i < mc[k]; i++) d.push({ id: ++cid, type: 'MAGIC', value: 1 + Math.floor(Math.random() * 10), magic: k });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  // ---- Combination detection ----
  function longestStraight(vals: number[]) {
    const u = [...new Set(vals)].sort((a, b) => a - b); let b = 0, c = 0;
    for (let i = 0; i < u.length; i++) { if (i > 0 && u[i] === u[i - 1] + 1) c++; else c = 1; b = Math.max(b, c); } return b;
  }
  function bestCombo(cards: Card[]) {
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
  function evaluate(cards: Card[]) {
    const sum = cards.reduce((s, c) => s + c.value, 0);
    let mult: number, kind: string, combo: { name: string; bonus: number } | null = null;
    if (cards.length === 1) { mult = 1 + cards[0].value * 0.02; kind = 'SINGLE'; }
    else { combo = bestCombo(cards); const cb = combo ? combo.bonus : 0; mult = 1 + (cb + sum * 0.20) / 100; kind = combo ? 'COMBO' : 'VALUE'; }
    const capped = Math.min(mult, CFG.CAP);
    const magic = cards.filter((c) => c.type === 'MAGIC').map((c) => ({ type: c.magic as string, ...CFG.MAGIC[c.magic as string] }));
    return { kind, combo: combo ? combo.name : null, mult: capped, raw: mult, magic, sum };
  }

  // ---- Game state ----
  let deck: Card[] = [], players: Player[] = [], t = 0, roundIndex = 0;
  let tickH: ReturnType<typeof setInterval> | null = null;
  let toastT: ReturnType<typeof setTimeout> | null = null;
  let selected = new Set<number>();
  // 3D view (pure renderer swap — the game logic/tick is identical either way)
  let track3d: Track3D | null = null;
  let view3dBusy = false;
  let unmounted = false; // guards the async 3D load racing a page unmount
  const usedVeh: Record<string, Record<string, boolean>> = { P1: {}, P2: {}, P3: {}, P4: {} };
  function mkPlayers(): Player[] {
    return ['P1', 'P2', 'P3', 'P4'].map((id) => ({
      id, veh: null, base: 0, hlim: 0, hand: [], dist: 0, fin: false, ft: null,
      cdUntil: 0, nm: null, magics: [], scores: [], times: [], total: 0, cp: new Set(), fx: null, debuff: null,
    }));
  }
  function draw(n: number) { return deck.splice(0, n); }
  function grant(hlim: number, cur: number) { return Math.max(0, Math.min(3, hlim - cur)); }

  function autoDiscard(p: Player) {
    p.hand.sort((a, b) => a.value - b.value || (a.type === 'NORMAL' ? 0 : 1) - (b.type === 'NORMAL' ? 0 : 1) || a.id - b.id);
    while (p.hand.length > p.hlim) p.hand.shift();
  }
  function selectVeh(p: Player, v: string) { p.veh = v; p.base = CFG.VEH[v].s; p.hlim = CFG.VEH[v].h; usedVeh[p.id][v] = true; }
  function remainingVeh(id: string) { return ['LEGENDARY', 'EPIC', 'COMMON'].filter((v) => !usedVeh[id][v]); }

  function startRound(choices: Record<string, string>) {
    players.forEach((p) => {
      selectVeh(p, choices[p.id]); autoDiscard(p);
      if (roundIndex > 0) p.hand.push(...draw(grant(p.hlim, p.hand.length)));
      p.dist = 0; p.fin = false; p.ft = null; p.cdUntil = 0; p.nm = null; p.magics = []; p.cp = new Set(); p.fx = null; p.debuff = null;
    });
    buildTrack();
    t = 0; tickH = setInterval(tick, 100);
    $('roundChip').textContent = `ROUND ${roundIndex + 1}/3`;
    log(`<b>Round ${roundIndex + 1}</b> started`); render();
  }

  /* Vehicle-selection screen (round start). Player picks; bots take first
   * available (deterministic). Shared card UI with the staked renderer. */
  function showVehicleSelect() {
    const box = $('vehSelect'); box.innerHTML = '';
    box.appendChild(vehicleSelector({
      round: roundIndex,
      used: usedVeh.P1,
      opponents: 'Bots auto-pick the rest',
      onPick: (v) => {
        const choices: Record<string, string> = { P1: v };
        players.forEach((p) => { if (p.id !== 'P1') choices[p.id] = remainingVeh(p.id)[0]; });
        box.innerHTML = '';
        $('roundNo').textContent = String(roundIndex + 1);
        startRound(choices);
        players.forEach((p) => { if (p.id !== 'P1') log(`${nameOf(p.id)} takes <b>${VEH_META[choices[p.id]]?.rarity ?? choices[p.id]}</b>`); });
      },
    }));
  }
  function speed(p: Player) {
    const nm = (p.nm && t < p.nm.endsAt) ? p.nm.mult : 1; let mg = 1;
    p.magics.forEach((e) => { if (t < e.endsAt) mg *= e.mult; });
    return p.base * nm * mg;
  }
  function fastestOpp(p: Player) {
    const o = players.filter((q) => q !== p && !q.fin);
    o.sort((a, b) => speed(b) - speed(a) || b.dist - a.dist); return o[0];
  }

  /* fx sınıfı: oynanan kartların rengine göre neon aura */
  function fxClass(r: ReturnType<typeof evaluate>) {
    if (r.magic.some((m) => m.type === 'NITRO')) return 'fx-nitro';
    if (r.combo === 'FOUR_OF_A_KIND' || r.combo === 'TWO_TRIOS' || r.mult >= CFG.CAP) return 'fx-max';
    if (r.combo && COMBO[r.combo] >= 150) return 'fx-epic';
    if (r.combo) return 'fx-ice';
    return 'fx-val';
  }
  function applyPlay(p: Player, idxs: number[]) {
    if (p.fin || t < p.cdUntil || idxs.length < 1 || idxs.length > 8) return { ok: false as const };
    const cards = idxs.map((i) => p.hand[i]); const r = evaluate(cards);
    p.nm = { mult: r.mult, endsAt: t + CFG.DUR };
    p.fx = { cls: fxClass(r), until: t + CFG.DUR };
    r.magic.forEach((m) => {
      if (m.t === 'SELF') p.magics.push({ mult: m.m, endsAt: t + CFG.DUR });
      else if (m.t === 'FAST') { const tg = fastestOpp(p); if (tg) { tg.magics.push({ mult: m.m, endsAt: t + CFG.DUR }); tg.debuff = { cls: 'fx-hit', until: t + CFG.DUR }; } }
      else players.forEach((q) => { if (q !== p && !q.fin) { q.magics.push({ mult: m.m, endsAt: t + CFG.DUR }); q.debuff = { cls: 'fx-oil', until: t + CFG.DUR }; } });
    });
    const set = new Set(idxs); p.hand = p.hand.filter((_, i) => !set.has(i)); p.cdUntil = t + CFG.COOLDOWN;
    return { ok: true as const, r };
  }

  // ---- Bots ----
  function botAct(p: Player) {
    if (p.fin || t < p.cdUntil || !p.hand.length || Math.random() > 0.22) return;
    const byv = new Map<number, number[]>();
    p.hand.forEach((c, i) => { if (!byv.has(c.value)) byv.set(c.value, []); byv.get(c.value)!.push(i); });
    let best: number[] | null = null;
    byv.forEach((idxs) => { if (idxs.length >= 2 && (!best || idxs.length > best.length)) best = idxs.slice(0, 8); });
    if (!best) { let hi = 0; p.hand.forEach((c, i) => { if (c.value > p.hand[hi].value) hi = i; }); best = [hi]; }
    const res = applyPlay(p, best);
    if (res.ok && res.r.combo) log(`${nameOf(p.id)} played <b>${res.r.combo}</b> (x${res.r.mult.toFixed(2)})`);
  }

  // ---- Tick loop ----
  function tick() {
    players.forEach((p) => { if (p.id !== 'P1') botAct(p); });
    players.forEach((p) => {
      if (p.fin) return; const prev = p.dist; p.dist += speed(p) * 0.1;
      CFG.CP.forEach((cp, i) => {
        if (!p.cp.has(i) && p.dist >= cp && !p.fin) {
          p.cp.add(i);
          const g = grant(p.hlim, p.hand.length); if (g > 0) p.hand.push(...draw(g));
          if (p.id === 'P1') log(`Passed CP-${i + 1}: +${g} cards`);
        }
      });
      if (p.dist >= CFG.TRACK) {
        const need = CFG.TRACK - prev, prog = p.dist - prev; p.fin = true;
        p.ft = +(t + 0.1 * (prog > 0 ? need / prog : 0)).toFixed(2); p.dist = CFG.TRACK;
        log(`${nameOf(p.id)} <b>finished</b> @ ${p.ft}s`);
      }
    });
    render();
    if (players.every((p) => p.fin) || t >= CFG.TIMEOUT) { if (tickH) clearInterval(tickH); endRound(); }
    t += 0.1;
  }
  function endRound() {
    const fin = players.filter((p) => p.fin).sort((a, b) => (a.ft ?? 0) - (b.ft ?? 0));
    const dnf = players.filter((p) => !p.fin).sort((a, b) => b.dist - a.dist);
    const rank = [...fin, ...dnf];
    rank.forEach((p, i) => { const pts = CFG.SCORE[i + 1]; p.scores.push(pts); p.times.push(p.ft ?? CFG.TIMEOUT); p.total += pts; });
    toast(`Round ${roundIndex + 1}: ${nameOf(rank[0].id)} wins!`);
    log(`Round result signed ✓ <span class="mono">${short(mockHex(130))}</span>`);
    roundIndex++;
    if (roundIndex >= 3) { finishMatch(); return; }
    render();
    log(`Choose your vehicle for round ${roundIndex + 1}`);
    showVehicleSelect();
  }
  function finishMatch() {
    const arr = [...players].sort((a, b) => b.total - a.total ||
      b.scores.filter((s) => s === 5).length - a.scores.filter((s) => s === 5).length ||
      a.times.reduce((s, x) => s + x, 0) - b.times.reduce((s, x) => s + x, 0));
    const rw = [2.0, 1.0, 0.5, 0.3];
    toast(`🏆 ${nameOf(arr[0].id)} wins the match!`);
    log(`<b>MATCH OVER.</b> Final: ` + arr.map((p, i) => `${i + 1}. ${nameOf(p.id)} (${p.total}pts, ${rw[i]} AVAX)`).join(' · '));
    const st = $('settle');
    st.innerHTML = `<div class="settleBox"><div class="settleHead">✓ RESULT SIGNED &amp; SETTLED
        <span class="mono dim">sig ${short(mockHex(130))}</span></div>` +
      arr.map((p, i) => `<div class="settleRow"><span class="dim">#${i + 1}</span>
        <span class="addr"><i class="av" style="background:${cssv(COLORS[p.id])}"></i>${nameOf(p.id)}</span>
        <b class="gold">◆ ${rw[i].toFixed(1)}</b>
        <span class="txh">${short(mockHex(64))}</span><span class="ok">✓</span></div>`).join('') +
      `<div class="settleRow"><span class="dim">fee</span><span class="addr">treasury</span>
        <b class="dim">◆ 0.2</b><span class="txh">${short(mockHex(64))}</span><span class="ok">✓</span></div></div>`;
    render(arr, rw);
    // staked mode: hand the final ranking (winner first) back as on-chain addresses
    if (opts.staked) opts.staked.onFinish(arr.map((p) => ADDR[p.id]));
  }

  // ---- Rendering ----
  function cssv(n: string) { return getComputedStyle(root).getPropertyValue(n); }
  function popup(txt: string, cls?: string) {
    // in 3D mode the 2D track is hidden — float combo popups over the 3D scene
    const tk = track3d ? $('track3d') : $('track');
    const el = document.createElement('div');
    el.className = 'popup' + (cls ? ' ' + cls : ''); el.textContent = txt; tk.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /* Track DOM'u tur başına BİR KEZ kurulur; tick'ler yalnızca günceller */
  let laneRefs: Record<string, { car: HTMLElement; tag: HTMLElement; hud: HTMLElement }> = {};
  function buildTrack() {
    const tk = $('track');
    [...tk.querySelectorAll('.lane')].forEach((l) => l.remove());
    laneRefs = {};
    players.forEach((p) => {
      const lane = document.createElement('div'); lane.className = 'lane';
      CFG.CP.forEach((cp, i) => {
        const d = document.createElement('div'); d.className = 'cp'; d.style.left = (cp / 10) + '%'; lane.appendChild(d);
        const f = document.createElement('div'); f.className = 'cpflag'; f.style.left = (cp / 10) + '%'; f.textContent = 'CP' + (i + 1); lane.appendChild(f);
      });
      const fin = document.createElement('div'); fin.className = 'finish'; lane.appendChild(fin);
      const car = document.createElement('div'); car.className = 'car run';
      car.style.setProperty('--c', cssv(COLORS[p.id]).trim());
      car.innerHTML = `<span class="carwrap"><span class="fx"></span>${CAR_SVG}</span>
        <span class="tag"></span><span class="hud"></span>`;
      lane.appendChild(car); tk.appendChild(lane);
      laneRefs[p.id] = { car, tag: car.querySelector('.tag') as HTMLElement, hud: car.querySelector('.hud') as HTMLElement };
    });
  }
  function render(finalOrder?: Player[], rw?: number[]) {
    // 3D view: forward a per-tick snapshot; three.js lerps to 60fps on its own
    track3d?.update(players.map((p) => ({
      pid: p.id, dist: p.dist, speed: speed(p),
      boosted: !!(p.nm && t < p.nm.endsAt) && !p.fin,
      fx: p.fx && t < p.fx.until && !p.fin ? p.fx.cls : (p.debuff && t < p.debuff.until && !p.fin ? p.debuff.cls : null),
      fin: p.fin, veh: p.veh,
    })));
    players.forEach((p) => {
      const ref = laneRefs[p.id]; if (!ref) return;
      const boosted = !!(p.nm && t < p.nm.endsAt) && !p.fin;
      const fxCls = (p.fx && t < p.fx.until && !p.fin) ? ' ' + p.fx.cls : '';
      const dbCls = (p.debuff && t < p.debuff.until && !p.fin) ? ' ' + p.debuff.cls : '';
      ref.car.style.left = (p.dist / CFG.TRACK * 93) + '%';
      ref.car.className = 'car' + (p.fin ? ' fin' : ' run') + (boosted ? ' boost' : '') + fxCls + dbCls;
      ref.tag.innerHTML = `${nameOf(p.id)}${p.veh ? ` · <b style="color:${vehColor(p.veh)}">${vehAbbr(p.veh)}</b>` : ''}`;
      const cd = Math.max(0, p.cdUntil - t);
      ref.hud.textContent = p.fin ? `✔ ${p.ft}s` : `${Math.round(speed(p))}u/s${cd > 0 ? ' · cd' + cd.toFixed(1) : ''}`;
    });
    // hand (P1) — DOM'u yalnızca el/seçim değişince yeniden kur
    const p1 = players[0]; $('handLimit').textContent = `${p1.hand.length}/${p1.hlim}`;
    const h = $('hand');
    const sig = p1.hand.map((c) => c.id).join(',') + '|' + [...selected].sort((a, b) => a - b).join(',');
    if (h.dataset.sig !== sig) {
      h.dataset.sig = sig; h.innerHTML = '';
      p1.hand.forEach((c, i) => {
        const el = document.createElement('div');
        el.className = 'card' + (c.type === 'MAGIC' ? ' magic ' + (c.magic === 'NAIL' ? 'nail' : c.magic === 'OIL' ? 'oil' : '') : '') + (c.value >= 9 ? ' hi' : '') + (selected.has(i) ? ' sel' : '');
        el.innerHTML = `<span class="ix">${c.value}</span><span class="ix2">${c.value}</span>
          <i class="cardart">${c.magic ? MAGIC_ICON[c.magic] : '❄'}</i>
          <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : ''}`;
        el.onpointerdown = (e) => {
          e.preventDefault();
          if (selected.has(i)) selected.delete(i); else if (selected.size < 8) selected.add(i);
          updatePreview(); render();
        };
        h.appendChild(el);
      });
    }
    const cd = Math.max(0, p1.cdUntil - t);
    ($('cdbar')).style.width = (cd / CFG.COOLDOWN * 100) + '%';
    ($('playBtn') as HTMLButtonElement).disabled = cd > 0 || selected.size === 0 || p1.fin;
    // scoreboard
    const order = finalOrder || [...players].sort((a, b) => b.dist - a.dist);
    const tb = root.querySelector('#scoreTable tbody') as HTMLElement;
    tb.innerHTML = '<tr><th>#</th><th>Racer</th><th>Dist</th><th>Total</th></tr>';
    order.forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="dim">${i + 1}</td><td><span class="addr"><i class="av" style="background:${cssv(COLORS[p.id])}"></i>${nameOf(p.id)}</span></td>
        <td class="mono">${Math.round(p.dist)}</td><td>${p.total}${rw ? ` <span class="gold">· ◆${rw[i]}</span>` : ''}</td>`;
      tb.appendChild(tr);
    });
  }
  function updatePreview() {
    const p1 = players[0]; const cards = [...selected].map((i) => p1.hand[i]);
    const pv = $('playPreview');
    if (!cards.length) { pv.textContent = 'select 1–8 cards'; return; }
    const r = evaluate(cards);
    pv.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '');
  }
  function log(s: string) { const l = $('log'); l.innerHTML = `<div>${s}</div>` + l.innerHTML; }
  function toast(s: string) {
    const el = $('cgToast'); el.textContent = s; el.style.opacity = '1';
    if (toastT) clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }

  // ---- Controls ----
  ($('playBtn')).onclick = () => {
    const p1 = players[0]; const idxs = [...selected].sort((a, b) => a - b); const res = applyPlay(p1, idxs);
    if (res.ok) {
      log(`You played <b>${res.r.combo || res.r.kind}</b> (x${res.r.mult.toFixed(2)})` + (res.r.magic.length ? ` + ${res.r.magic.map((m) => m.type).join(', ')}` : ''));
      popup(`${res.r.combo || res.r.kind} ×${res.r.mult.toFixed(2)}`, fxClass(res.r));
      selected.clear(); updatePreview(); render();
    }
  };
  ($('clearBtn')).onclick = () => { selected.clear(); updatePreview(); render(); };
  ($('bestBtn')).onclick = () => {
    const p1 = players[0];
    if (p1.fin || t < p1.cdUntil || !p1.hand.length) return;
    const pickIds = new Set(bestPlay(p1.hand).map((c) => c.id));
    selected = new Set(p1.hand.map((c, i) => (pickIds.has(c.id) ? i : -1)).filter((i) => i >= 0));
    updatePreview(); render();
  };

  // Fullscreen for the 3D view (Esc exits natively; ResizeObserver re-fits).
  // iOS Safari has no element requestFullscreen → CSS pseudo-fullscreen fallback.
  // While fullscreen, the hand panel + vehicle selector + toast are re-parented
  // INTO the 3D container (only the fullscreened subtree is visible) so you can
  // keep playing cards at the bottom of the screen. DOM moves keep listeners.
  const dockMarkers = new Map<HTMLElement, Comment>();
  function dockIntoFS(on: boolean) {
    const host = $('track3d');
    const items: Array<[HTMLElement, string]> = [
      [$('handPanel'), 'cg-fsdock'],
      [$('vehSelect'), 'cg-fsveh'],
      [$('cgToast'), 'cg-fstoast'],
    ];
    for (const [el, cls] of items) {
      if (!el) continue;
      if (on) {
        if (dockMarkers.has(el)) continue;
        const marker = document.createComment('fs-dock');
        el.parentElement?.insertBefore(marker, el);
        dockMarkers.set(el, marker);
        host.appendChild(el);
        el.classList.add(cls);
      } else {
        const marker = dockMarkers.get(el);
        el.classList.remove(cls);
        if (marker?.parentNode) { marker.parentNode.insertBefore(el, marker); marker.remove(); }
        dockMarkers.delete(el);
      }
    }
  }
  const onFsChange = () => dockIntoFS(document.fullscreenElement === $('track3d'));
  document.addEventListener('fullscreenchange', onFsChange);
  ($('fsBtn')).onclick = (e) => {
    e.stopPropagation();
    const el = $('track3d');
    if (typeof el.requestFullscreen === 'function') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen();
    } else {
      const on = !el.classList.contains('cg-fs-fake');
      el.classList.toggle('cg-fs-fake', on);
      document.body.classList.toggle('cg-noscroll', on);
      dockIntoFS(on);
    }
  };

  // ---- 2D/3D view toggle (lazy-loads three.js on first use) ----
  ($('viewToggle')).onclick = async () => {
    if (view3dBusy) return;
    const btn = $('viewToggle') as HTMLButtonElement;
    if (track3d) {
      track3d.destroy(); track3d = null;
      $('track3d').style.display = 'none';
      $('track').style.display = '';
      btn.textContent = '🎥 3D VIEW';
      return;
    }
    view3dBusy = true;
    btn.textContent = '… LOADING 3D';
    try {
      const { createTrack3D } = await import('./track3d');
      const seats = players.map((p) => ({ pid: p.id, color: cssv(COLORS[p.id]).trim() || '#ed2f39', name: nameOf(p.id) }));
      $('track3d').style.display = 'block';
      const inst = await createTrack3D($('track3d'), seats);
      if (unmounted) { inst.destroy(); return; } // page left while three.js loaded
      track3d = inst;
      $('track').style.display = 'none';
      btn.textContent = '🗺 2D VIEW';
      render();
    } catch (e) {
      $('track3d').style.display = 'none';
      btn.textContent = '🎥 3D VIEW';
      log('3D view unavailable on this device');
    } finally { view3dBusy = false; }
  };

  // ---- Boot ----
  deck = buildDeck(); players = mkPlayers(); roundIndex = 0;
  players.forEach((p) => p.hand.push(...draw(8)));
  $('seedChip').textContent = `seed ${short(mockHex(64))}`;
  ['P1', 'P2', 'P3', 'P4'].forEach((id) => { usedVeh[id] = {}; });
  $('roundNo').textContent = '1';
  showVehicleSelect(); updatePreview();

  // ---- Cleanup ----
  return () => {
    unmounted = true;
    if (tickH) clearInterval(tickH);
    if (toastT) clearTimeout(toastT);
    track3d?.destroy(); track3d = null;
    document.removeEventListener('fullscreenchange', onFsChange);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    document.body.classList.remove('cg-noscroll'); // if unmounted mid pseudo-fullscreen
    root.innerHTML = '';
  };
}
