/**
 * CAR(D) GAME — self-contained demo engine + DOM renderer.
 * Ported from cardgame/demo/index.html into a mountable module so the Next
 * page can wrap it with Privy wallet identity. Game logic unchanged; the
 * connected wallet address becomes P1's racer identity in the escrow panel,
 * lane tag and settlement rows.
 */
import { vehicleSelector, VEH_META, vehAbbr, vehColor } from './vehicles';
import { bestPlan, bestPlay, planNote } from './bestPlay';
import { createCgSound, soundLabel } from './sound';
import { ABILITIES, triggerAbilities, SELF_BUDGET } from './abilities';
import { attachView3D, type View3D } from './view3d';

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
  <button class="chip" id="sndToggle" title="Race music on/off">🎵 MUSIC</button>
  <button class="chip" id="helpToggle" title="How to play">❔ HOW TO PLAY</button>
</div>

<div class="cg-help" id="cgHelp" hidden>
  <div class="cg-help-col">
    <h4>How it works</h4>
    <p>Race 3 bots to <b>1000u</b> over <b>3 rounds</b>. Play cards to boost your speed for 3s. Best total score across the rounds wins.</p>
    <h4>Keyboard</h4>
    <p><kbd>1</kbd>–<kbd>9</kbd> <kbd>0</kbd> pick a card · <kbd>Space</kbd> play · <kbd>B</kbd> best · <kbd>C</kbd> clear</p>
    <h4>Magic cards</h4>
    <p><b>⚡ NITRO</b> +25% to you · <b>✕ NAIL</b> −25% to the leader · <b>● OIL</b> −25% to all rivals</p>
  </div>
  <div class="cg-help-col">
    <h4>Combo bonuses (more cards = bigger boost)</h4>
    <div class="cg-help-combos">
      <span>Pair <b>+50</b></span><span>Two pairs <b>+100</b></span><span>Three of a kind <b>+150</b></span>
      <span>Full house <b>+150</b></span><span>Four of a kind <b>+500</b></span><span>Two trios <b>+400</b></span>
      <span>Straight 3 <b>+20</b></span><span>Straight 5 <b>+200</b></span><span>Straight 8 <b>+350</b></span>
    </div>
    <p class="dim">Boost is capped at ×5. The <b>✨ Best</b> button suggests a strong play from your hand.</p>
    <h4>Card abilities — every value does something</h4>
    <div class="cg-help-combos cg-help-abs" id="cgHelpAbs"></div>
  </div>
</div>

<div class="cg-vsel-slot" id="vehSelect"></div>
<div class="track glass" id="track"></div>
<div class="track3d glass" id="track3d" style="display:none"><button class="cg-fs" id="fsBtn" title="Fullscreen">⛶</button></div>

<div class="grid">
  <div class="panel glass" id="handPanel">
    <div class="hand-hd"><span class="hand-hd-t">Your Hand</span><span class="hand-count" id="handLimit"></span></div>
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
  // ✨ Best: repeated clicks cycle through the plan's plays; note rides the preview
  let bestNote = '';
  let bestCycle = { sig: '', i: 0 };
  // 🎵 quiet race music, shared toggle across modes
  const sound = createCgSound();
  // 3D view (pure renderer swap — the game logic/tick is identical either way)
  let view3d: View3D | null = null;
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

  // 3·2·1·GO race countdown: shows over the active track view with beeps and
  // only then starts the tick loop. Purely presentational — no game state runs
  // until `go()` fires, so determinism and the recorded timeline are untouched.
  let countT: ReturnType<typeof setTimeout>[] = [];
  function countdown(go: () => void) {
    countT.forEach(clearTimeout); countT = [];
    const host = view3d?.is3D() ? $('track3d') : $('track');
    const el = document.createElement('div'); el.className = 'cg-count';
    host.appendChild(el);
    ['3', '2', '1', 'GO!'].forEach((s, i) => {
      countT.push(setTimeout(() => {
        el.textContent = s;
        el.classList.toggle('go', s === 'GO!');
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; // restart pop
        sound.count(s === 'GO!' ? 0 : 3 - i);
        // soft screen pulse per beep — subtle by design (low opacity, auto-removes)
        const pulse = document.createElement('div');
        pulse.className = 'cg-flash' + (s === 'GO!' ? ' go' : '');
        host.appendChild(pulse);
        countT.push(setTimeout(() => pulse.remove(), 750));
        if (s === 'GO!') { go(); countT.push(setTimeout(() => el.remove(), 700)); }
      }, i * 800));
    });
  }

  function startRound(choices: Record<string, string>) {
    players.forEach((p) => {
      selectVeh(p, choices[p.id]); autoDiscard(p);
      if (roundIndex > 0) p.hand.push(...draw(grant(p.hlim, p.hand.length)));
      p.dist = 0; p.fin = false; p.ft = null; p.cdUntil = 0; p.nm = null; p.magics = []; p.cp = new Set(); p.fx = null; p.debuff = null;
    });
    buildTrack();
    t = 0;
    $('roundChip').textContent = `ROUND ${roundIndex + 1}/3`;
    render();
    countdown(() => {
      tickH = setInterval(tick, 100);
      sound.raceOn(true);
      log(`<b>Round ${roundIndex + 1}</b> started`);
    });
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
    if (res.ok) res.fired.forEach((txt) => log(`${nameOf(p.id)}: ${txt}`));
  }

  // ---- Tick loop ----
  function tick() {
    // Pause the race while the tab is hidden: no wasted CPU/paint, and the player
    // doesn't silently lose ground while away. Resumes on the next visible tick.
    if (document.hidden) return;
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
    if (players.every((p) => p.fin) || t >= CFG.TIMEOUT) { if (tickH) clearInterval(tickH); sound.raceOn(false); endRound(); }
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
    if (arr[0].id === 'P1') sound.victory();
    toast(`🏆 ${nameOf(arr[0].id)} wins the match!`);
    log(`<b>MATCH OVER.</b> Final: ` + arr.map((p, i) => `${i + 1}. ${nameOf(p.id)} (${p.total}pts, ${rw[i]} AVAX)`).join(' · '));
    const st = $('settle');
    st.innerHTML = `<div class="settleBox"><div class="settleHead">✓ RESULT SIGNED &amp; SETTLED
        <span class="mono dim">sig ${short(mockHex(130))}</span></div>` +
      arr.map((p, i) => `<div class="settleRow"><span class="dim">#${i + 1}</span>
        <span class="addr"><i class="av" style="background:${colorOf(p.id)}"></i>${nameOf(p.id)}</span>
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
  // Lane colours never change — resolve the CSS var ONCE per pid instead of
  // calling getComputedStyle() (a forced reflow) 4× on every 10Hz render tick.
  const colorCache: Record<string, string> = {};
  function colorOf(pid: string) { return (colorCache[pid] ??= (cssv(COLORS[pid]).trim() || '#ed2f39')); }
  function popup(txt: string, cls?: string) {
    // in 3D mode the 2D track is hidden — float combo popups over the 3D scene
    const tk = view3d?.is3D() ? $('track3d') : $('track');
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
      car.style.setProperty('--c', colorOf(p.id));
      car.innerHTML = `<span class="carwrap"><span class="fx"></span>${CAR_SVG}</span>
        <span class="tag"></span><span class="hud"></span>`;
      lane.appendChild(car); tk.appendChild(lane);
      laneRefs[p.id] = { car, tag: car.querySelector('.tag') as HTMLElement, hud: car.querySelector('.hud') as HTMLElement };
    });
  }
  function render(finalOrder?: Player[], rw?: number[]) {
    // 3D view: forward a per-tick snapshot; three.js lerps to 60fps on its own
    if (view3d?.is3D()) view3d.forward(players.map((p) => ({
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
      // tag only changes when the vehicle changes (name is fixed) — skip the
      // innerHTML re-parse on every tick.
      if (ref.tag.dataset.veh !== (p.veh ?? '')) {
        ref.tag.innerHTML = `${nameOf(p.id)}${p.veh ? ` · <b style="color:${vehColor(p.veh)}">${vehAbbr(p.veh)}</b>` : ''}`;
        ref.tag.dataset.veh = p.veh ?? '';
      }
      const cd = Math.max(0, p.cdUntil - t);
      ref.hud.textContent = p.fin ? `✔ ${p.ft}s` : `${Math.round(speed(p))}u/s${cd > 0 ? ' · cd' + cd.toFixed(1) : ''}`;
    });
    // hand (P1) — DOM'u yalnızca el/seçim değişince yeniden kur
    const p1 = players[0]; $('handLimit').textContent = `${p1.hand.length}/${p1.hlim}`;
    const h = $('hand');
    const sig = p1.hand.map((c) => c.id).join(',') + '|' + [...selected].sort((a, b) => a - b).join(',');
    if (h.dataset.sig !== sig) {
      // deal-in animation only when the cards themselves changed, not the selection
      const handSig = p1.hand.map((c) => c.id).join(',');
      h.classList.toggle('nodeal', h.dataset.hand === handSig);
      h.dataset.hand = handSig;
      h.dataset.sig = sig; h.innerHTML = '';
      p1.hand.forEach((c, i) => {
        const el = document.createElement('div');
        el.style.setProperty('--ci', String(i));
        el.className = 'card' + (c.type === 'MAGIC' ? ' magic ' + (c.magic === 'NAIL' ? 'nail' : c.magic === 'OIL' ? 'oil' : '') : '') + (c.value >= 9 ? ' hi' : '') + (selected.has(i) ? ' sel' : '');
        el.innerHTML = `<span class="ix">${c.value}</span><span class="ix2">${c.value}</span>
          <i class="cardart">${c.magic ? MAGIC_ICON[c.magic] : '❄'}</i>
          <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : `<small class="ab">${ABILITIES[c.value].key}</small>`}`;
        el.onpointerdown = (e) => {
          e.preventDefault();
          if (selected.has(i)) selected.delete(i); else if (selected.size < 8) selected.add(i);
          bestNote = '';
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
      tr.innerHTML = `<td class="dim">${i + 1}</td><td><span class="addr"><i class="av" style="background:${colorOf(p.id)}"></i>${nameOf(p.id)}</span></td>
        <td class="mono">${Math.round(p.dist)}</td><td>${p.total}${rw ? ` <span class="gold">· ◆${rw[i]}</span>` : ''}</td>`;
      tb.appendChild(tr);
    });
  }
  function updatePreview() {
    const p1 = players[0]; const cards = [...selected].map((i) => p1.hand[i]);
    const pv = $('playPreview');
    if (!cards.length) { pv.textContent = 'select 1–8 cards'; return; }
    const r = evaluate(cards);
    const abKeys = [...new Set(cards.filter((c) => c.type === 'NORMAL').map((c) => c.value))]
      .sort((a, b) => a - b).map((v) => ABILITIES[v].icon + ABILITIES[v].key);
    pv.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '')
      + (abKeys.length ? ` · ${abKeys.join(' ')}` : '')
      + (bestNote ? ` · ${bestNote}` : '');
  }
  // Prepend ONE parsed node and cap the list — the old `innerHTML = new + innerHTML`
  // re-serialised the entire (unbounded) log on every event → O(n²) over a match.
  function log(s: string) {
    const l = $('log'); if (!l) return;
    const d = document.createElement('div'); d.innerHTML = s;
    l.insertBefore(d, l.firstChild);
    while (l.childElementCount > 60) l.removeChild(l.lastElementChild!);
  }
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
      res.fired.forEach((txt, i) => {
        setTimeout(() => popup(txt, 'pop-ab'), 350 + i * 300);
        log(txt);
      });
      selected.clear(); bestNote = ''; updatePreview(); render();
    }
  };
  ($('clearBtn')).onclick = () => { selected.clear(); bestNote = ''; updatePreview(); render(); };
  ($('bestBtn')).onclick = () => {
    const p1 = players[0];
    if (p1.fin || t < p1.cdUntil || !p1.hand.length) return;
    const plan = bestPlan(p1.hand, { endgame: roundIndex >= 2 });
    const sig = p1.hand.map((c) => c.id).join(',');
    if (bestCycle.sig !== sig) bestCycle = { sig, i: 0 };
    else if (plan.plays.length) bestCycle.i = (bestCycle.i + 1) % plan.plays.length;
    const pickCards = plan.plays.length ? plan.plays[bestCycle.i].cards : bestPlay(p1.hand);
    bestNote = plan.plays.length ? planNote(plan, bestCycle.i) : '✨ low hand — worth saving';
    const pickIds = new Set(pickCards.map((c) => c.id));
    selected = new Set(p1.hand.map((c, i) => (pickIds.has(c.id) ? i : -1)).filter((i) => i >= 0));
    updatePreview(); render();
  };
  const sndBtn = $('sndToggle') as HTMLButtonElement;
  sndBtn.textContent = soundLabel(sound.enabled());
  sndBtn.onclick = () => { sndBtn.textContent = soundLabel(sound.toggle()); };

  const helpBtn = $('helpToggle') as HTMLButtonElement;
  helpBtn.onclick = () => { const h = $('cgHelp'); h.hidden = !h.hidden; helpBtn.classList.toggle('on', !h.hidden); };

  // Keyboard: 1–9/0 toggle a card, Space/Enter play, B best, C clear. Lets the
  // player race hands-on-keys instead of hunting cards with the mouse.
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const p1 = players[0]; if (!p1) return;
    if (e.key >= '0' && e.key <= '9') {
      const i = e.key === '0' ? 9 : +e.key - 1; // 1→idx0 … 9→idx8, 0→idx9
      if (i < p1.hand.length && !p1.fin) {
        if (selected.has(i)) selected.delete(i); else if (selected.size < 8) selected.add(i);
        bestNote = ''; updatePreview(); render();
      }
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (!($('playBtn') as HTMLButtonElement).disabled) ($('playBtn') as HTMLButtonElement).click();
      e.preventDefault();
    } else if (e.key === 'b' || e.key === 'B') { ($('bestBtn') as HTMLButtonElement).click(); e.preventDefault(); }
    else if (e.key === 'c' || e.key === 'C') { ($('clearBtn') as HTMLButtonElement).click(); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // 2D/3D view swap + fullscreen (shared with staked/multiplayer). While
  // fullscreen the hand panel, vehicle selector and toast dock into the 3D
  // container so you can keep playing cards over the scene.
  view3d = attachView3D({
    host: $('track3d'),
    track2d: $('track'),
    toggleBtn: $('viewToggle'),
    fsBtn: $('fsBtn'),
    buildSeats: () => players.map((p) => ({ pid: p.id, color: colorOf(p.id), name: nameOf(p.id) })),
    dockItems: () => [[$('handPanel'), 'cg-fsdock'], [$('vehSelect'), 'cg-fsveh'], [$('cgToast'), 'cg-fstoast']],
    onLog: (m) => log(m),
    onReady: () => render(),
  });

  // ---- Boot ----
  deck = buildDeck(); players = mkPlayers(); roundIndex = 0;
  players.forEach((p) => p.hand.push(...draw(8)));
  $('seedChip').textContent = `seed ${short(mockHex(64))}`;
  ['P1', 'P2', 'P3', 'P4'].forEach((id) => { usedVeh[id] = {}; });
  $('roundNo').textContent = '1';
  $('cgHelpAbs').innerHTML = Object.entries(ABILITIES)
    .map(([v, a]) => `<span><b>${v}</b> ${a.icon} ${a.key} — ${a.desc}</span>`).join('');
  showVehicleSelect(); updatePreview();

  // ---- Cleanup ----
  return () => {
    if (tickH) clearInterval(tickH);
    if (toastT) clearTimeout(toastT);
    countT.forEach(clearTimeout);
    sound.destroy();
    view3d?.destroy(); view3d = null; // tears down three.js + fullscreen listeners
    document.removeEventListener('keydown', onKey);
    root.innerHTML = '';
  };
}
