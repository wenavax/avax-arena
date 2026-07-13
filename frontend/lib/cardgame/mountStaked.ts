/**
 * CAR(D) GAME — engine-driven STAKED renderer. Unlike the practice demo, this
 * drives the SHARED deterministic engine (seeded by the server), so every player
 * play is captured as (round, tick, cardIds) that the server re-simulates to the
 * exact same result. The player genuinely plays; the server just re-derives.
 *
 * UI parity with practice mode: combo popups, play preview, event log, round
 * banners, toasts and a settlement panel — all cosmetic; the captured input
 * (vehicles + plays) and the engine stepping are untouched.
 */
import {
  initMatch, startRound, stepTick, roundDone, scoreRound, finalRanking, speed, evaluate, fxClass,
  CFG, type MatchState, type MatchInput, type PlayEvent, type Pid,
} from './engine';
import { vehicleSelector, vehAbbr, vehColor } from './vehicles';
import { bestPlan, bestPlay, planNote } from './bestPlay';
import { createCgSound, soundLabel } from './sound';
import { attachView3D, type View3D } from './view3d';

export interface StakedOpts {
  seed: string;
  player: string;
  bots: string[]; // 3
  onFinish: (input: MatchInput, previewRanking: string[]) => void;
}

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const P_VAR: Record<Pid, string> = { P1: '--p1', P2: '--p2', P3: '--p3', P4: '--p4' };
const MAGIC_ICON: Record<string, string> = { NITRO: '⚡', NAIL: '✕', OIL: '●' };
// Fuji escrow economics: entry 0.01 AVAX × 4 → payouts entry × [2, 1, 0.5, 0.3]
const ENTRY = 0.01;
const PAYOUT_X = [2, 1, 0.5, 0.3];
const payoutStr = (rank: number) => String(+(ENTRY * PAYOUT_X[rank]).toFixed(4));

export function mountStaked(root: HTMLElement, opts: StakedOpts): () => void {
  const addr: Record<Pid, string> = { P1: opts.player, P2: opts.bots[0], P3: opts.bots[1], P4: opts.bots[2] };
  const nameOf = (id: Pid) => (id === 'P1' ? 'YOU' : short(addr[id]));
  const cssv = (n: string) => getComputedStyle(root).getPropertyValue(n).trim();

  const s: MatchState = initMatch(opts.seed);
  const vehicles: string[] = [];
  const plays: PlayEvent[] = [];
  const selected = new Set<number>(); // hand indices selected by the player
  // ✨ Best: repeated clicks cycle through the plan's plays; note rides the preview
  let bestNote = '';
  let bestCycle = { sig: '', i: 0 };
  // 🎵 quiet race music, shared toggle across modes
  const sound = createCgSound();
  let loopH: ReturnType<typeof setInterval> | null = null;
  let toastT: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  let view3d: View3D | null = null;

  root.innerHTML = `
    <div class="toast eng-toast"></div>
    <div class="cg-eng glass" style="padding:16px;margin-bottom:12px">
      <div class="eng-hd"><span class="eng-round">ROUND 1/3</span>
        <span class="dim mono" style="font-size:11px">seed ${short(opts.seed)} · deterministic · server-verified</span>
        <button class="chip cg-viewtoggle eng-view3d" title="Switch track view">🎥 3D VIEW</button></div>
      <div class="eng-picks dim mono"></div>
      <div class="eng-vsel-slot"></div>
      <div class="eng-track"></div>
      <div class="track3d glass eng-track3d" style="display:none"><button class="cg-fs eng-fs" title="Fullscreen">⛶</button></div>
    </div>
    <div class="cg-eng glass eng-handcard" style="padding:16px">
      <div class="hand-hd"><span class="hand-hd-t">Your Hand</span><span class="hand-count eng-hlim"></span></div>
      <div class="eng-hand hand"></div>
      <div class="cooldown"><div class="eng-cd"></div></div>
      <div class="row"><button class="btn eng-play">PLAY SELECTED</button>
        <button class="btn ghost eng-best">✨ Best</button>
        <button class="btn ghost eng-clear">Clear</button>
        <button class="btn ghost eng-snd" title="Race music on/off">🎵 MUSIC</button>
        <span class="pill eng-note">select 1–8 cards</span></div>
      <table style="width:100%;margin-top:14px;font-size:12px" class="eng-board"><tbody></tbody></table>
      <div class="eng-settle"></div>
      <div class="cg-elog-hd">Event log</div>
      <div class="log eng-log"></div>
    </div>`;
  const $ = (c: string) => root.querySelector('.' + c) as HTMLElement;

  // ── juice helpers (cosmetic only) ────────────────────────────────────
  // Prepend ONE parsed node + cap the list (was O(n²): re-serialised the whole log each event).
  function log(html: string) {
    const l = $('eng-log'); if (!l) return;
    const d = document.createElement('div'); d.innerHTML = html;
    l.insertBefore(d, l.firstChild);
    while (l.childElementCount > 60) l.removeChild(l.lastElementChild!);
  }
  function toast(msg: string) {
    const el = $('eng-toast'); if (!el) return;
    el.textContent = msg; el.style.opacity = '1';
    if (toastT) clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }
  function popup(txt: string, cls: string) {
    const tk = $('eng-track'); if (!tk) return;
    const el = document.createElement('div'); el.className = 'popup ' + cls; el.textContent = txt;
    tk.appendChild(el); setTimeout(() => el.remove(), 1400);
  }
  // 3·2·1·GO race countdown over the active track view (2D or 3D), with beeps.
  // Purely presentational: the engine loop only starts when `go()` fires, so
  // the recorded (round, tick) timeline the server re-simulates is untouched.
  let countT: ReturnType<typeof setTimeout>[] = [];
  function countdown(go: () => void) {
    countT.forEach(clearTimeout); countT = [];
    const host = view3d?.is3D() ? $('eng-track3d') : $('eng-track');
    const el = document.createElement('div'); el.className = 'cg-count';
    host.appendChild(el);
    ['3', '2', '1', 'GO!'].forEach((s, i) => {
      countT.push(setTimeout(() => {
        el.textContent = s;
        el.classList.toggle('go', s === 'GO!');
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; // restart pop
        sound.count(s === 'GO!' ? 0 : 3 - i);
        if (s === 'GO!') { go(); countT.push(setTimeout(() => el.remove(), 700)); }
      }, i * 800));
    });
  }

  // Show the vehicle-selection screen for the round; the player's real choice is
  // what gets recorded into `vehicles` and re-simulated server-side, so picking
  // stays fully authoritative (a tampered choice just falls back to a legal one).
  function beginRound() {
    const slot = $('eng-vsel-slot');
    slot.innerHTML = '';
    slot.appendChild(vehicleSelector({
      round: s.roundIndex,
      used: s.usedVeh.P1,
      opponents: 'Opponents auto-pick from the remaining pool',
      onPick: (veh) => {
        vehicles.push(veh);
        startRound(s, veh);
        slot.innerHTML = '';
        ($('eng-round')).textContent = `ROUND ${s.roundIndex + 1}/3`;
        showPicks();
        buildTrack();
        log(`<b>Round ${s.roundIndex + 1}</b> started — ${s.players.map((p) => `${nameOf(p.id)} ${vehAbbr(p.veh)}`).join(' · ')}`);
        renderTrack(); renderHand(); renderBoard();
        countdown(() => {
          loopH = setInterval(loop, 100);
          sound.raceOn(true);
        });
      },
    }));
  }

  // After vehicles lock, announce every racer's pick (bots are deterministic).
  function showPicks() {
    ($('eng-picks')).innerHTML = s.players.map((p) => {
      const label = p.id === 'P1' ? 'YOU' : short(addr[p.id]);
      return `${label} <b style="color:${vehColor(p.veh)}">${vehAbbr(p.veh)}</b>`;
    }).join('  ·  ');
  }

  function buildTrack() {
    const tk = $('eng-track'); tk.innerHTML = '';
    for (const p of s.players) {
      const lane = document.createElement('div'); lane.className = 'lane';
      CFG.CP.forEach((cp) => { const d = document.createElement('div'); d.className = 'cp'; d.style.left = cp / 10 + '%'; lane.appendChild(d); });
      const fin = document.createElement('div'); fin.className = 'finish'; lane.appendChild(fin);
      const car = document.createElement('div'); car.className = 'car run'; car.dataset.pid = p.id;
      car.style.setProperty('--c', cssv(P_VAR[p.id]));
      car.innerHTML = `<span class="carwrap"><span class="fx"></span><svg class="carsvg" viewBox="0 0 56 32"><g class="flame"><path d="M9 15.5 L-3 13 L3 16.5 L-5 19.5 L9 20.5 Z" fill="#f5c542"></path></g><path class="body" d="M6 22 L8 16 Q13 9 22 8 L32 8 Q41 9 47 15 L52 18 Q54 19 54 21 L53 22 Z"></path><g class="wheel w1"><circle cx="16" cy="24" r="5.5"></circle><line x1="16" y1="20" x2="16" y2="28"></line></g><g class="wheel w2"><circle cx="42" cy="24" r="5.5"></circle><line x1="42" y1="20" x2="42" y2="28"></line></g></svg></span><span class="tag"></span><span class="hud"></span>`;
      lane.appendChild(car); tk.appendChild(lane);
    }
  }

  function renderTrack() {
    for (const p of s.players) {
      const car = $('eng-track').querySelector(`[data-pid="${p.id}"]`) as HTMLElement | null;
      if (!car) continue;
      const boosted = !!(p.nm && s.t < p.nm.endsAt) && !p.fin;
      car.style.left = (p.dist / CFG.TRACK * 93) + '%';
      car.className = 'car' + (p.fin ? ' fin' : ' run') + (boosted ? ' boost' : '') + (p.fx && s.t < p.fxUntil && !p.fin ? ' ' + p.fx : '') + (p.debuff && s.t < p.debuffUntil && !p.fin ? ' ' + p.debuff : '');
      const tagEl = car.querySelector('.tag') as HTMLElement; // only re-parse when the vehicle changes
      if (tagEl.dataset.veh !== (p.veh ?? '')) {
        tagEl.innerHTML = nameOf(p.id) + (p.veh ? ` · <b style="color:${vehColor(p.veh)}">${vehAbbr(p.veh)}</b>` : '');
        tagEl.dataset.veh = p.veh ?? '';
      }
      const cd = Math.max(0, p.cdUntil - s.t);
      (car.querySelector('.hud') as HTMLElement).textContent = p.fin ? `✔ ${p.ft}s` : `${Math.round(speed(s, p))}u/s${cd > 0 ? ' · cd' + (cd / 10).toFixed(1) : ''}`;
    }
    // forward a per-tick snapshot to the 3D scene when it's active
    if (view3d?.is3D()) view3d.forward(s.players.map((p) => ({
      pid: p.id, dist: p.dist, speed: speed(s, p),
      boosted: !!(p.nm && s.t < p.nm.endsAt) && !p.fin,
      fx: p.fx && s.t < p.fxUntil && !p.fin ? p.fx : (p.debuff && s.t < p.debuffUntil && !p.fin ? p.debuff : null),
      fin: p.fin, veh: p.veh,
    })));
  }

  function renderHand() {
    const p1 = s.players[0];
    ($('eng-hlim')).textContent = `${p1.hand.length}/${p1.hlim}`;
    // cooldown bar + button state update every tick (not only on hand change)
    const cd = Math.max(0, p1.cdUntil - s.t);
    ($('eng-cd')).style.width = (cd / CFG.COOLDOWN_TICKS * 100) + '%';
    ($('eng-play') as HTMLButtonElement).disabled = cd > 0 || selected.size === 0 || p1.fin;
    const h = $('eng-hand');
    const sig = p1.hand.map((c) => c.id).join(',') + '|' + [...selected].sort((a, b) => a - b).join(',');
    if (h.dataset.sig === sig) return;
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
        <i class="cardart">${c.magic ? MAGIC_ICON[c.magic] || '' : '❄'}</i>
        <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : ''}`;
      el.onpointerdown = (e) => { e.preventDefault(); if (selected.has(i)) selected.delete(i); else if (selected.size < 8) selected.add(i); bestNote = ''; renderHand(); };
      h.appendChild(el);
    });
    updatePreview();
  }

  // Live evaluation of the current selection — same engine `evaluate()` the play
  // will get, so the shown "PAIR → x1.50 (+NITRO)" is exactly what happens.
  function updatePreview() {
    if (done) return;
    const p1 = s.players[0];
    const pv = $('eng-note');
    const cards = [...selected].map((i) => p1.hand[i]);
    if (!cards.length) { pv.textContent = 'select 1–8 cards'; return; }
    const r = evaluate(cards);
    pv.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '')
      + (bestNote ? ` · ${bestNote}` : '');
  }

  function renderBoard(order?: Pid[]) {
    const ranked = order ? order.map((id) => s.players.find((p) => p.id === id)!) : [...s.players].sort((a, b) => b.dist - a.dist);
    const tb = root.querySelector('.eng-board tbody') as HTMLElement;
    tb.innerHTML = '<tr><th>#</th><th>Racer</th><th>Dist</th><th>Pts</th></tr>' +
      ranked.map((p, i) => `<tr><td class="dim">${i + 1}</td><td class="addr"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(${P_VAR[p.id]});margin-right:6px"></i>${nameOf(p.id)}</td><td class="mono">${Math.round(p.dist)}</td><td>${p.total}</td></tr>`).join('');
  }

  function renderSettle(ranking: Pid[]) {
    ($('eng-settle')).innerHTML = `<div class="settleBox"><div class="settleHead">🏁 FINAL RESULT — server re-derives &amp; settles on-chain
        <span class="mono dim">entry ${ENTRY} AVAX × 4</span></div>` +
      ranking.map((id, i) => `<div class="settleRow"><span class="dim">#${i + 1}</span>
        <span class="addr"><i class="av" style="background:${cssv(P_VAR[id])}"></i>${nameOf(id)}</span>
        <b class="gold">◆ ${payoutStr(i)}</b></div>`).join('') + '</div>';
  }

  // pending player play captured for the CURRENT tick
  let pendingPlay: number[] | null = null;
  ($('eng-play')).onclick = () => {
    const p1 = s.players[0];
    if (s.t < p1.cdUntil || selected.size === 0) return;
    pendingPlay = [...selected].sort((a, b) => a - b).map((i) => p1.hand[i].id); // cardIds
    selected.clear(); bestNote = '';
    renderHand();
  };
  ($('eng-clear')).onclick = () => { selected.clear(); bestNote = ''; renderHand(); };
  ($('eng-best')).onclick = () => {
    const p1 = s.players[0];
    if (p1.fin || s.t < p1.cdUntil || !p1.hand.length) return;
    const plan = bestPlan(p1.hand, { endgame: s.roundIndex >= CFG.ROUNDS - 1 });
    const sig = p1.hand.map((c) => c.id).join(',');
    if (bestCycle.sig !== sig) bestCycle = { sig, i: 0 };
    else if (plan.plays.length) bestCycle.i = (bestCycle.i + 1) % plan.plays.length;
    const pickCards = plan.plays.length ? plan.plays[bestCycle.i].cards : bestPlay(p1.hand);
    bestNote = plan.plays.length ? planNote(plan, bestCycle.i) : '✨ low hand — worth saving';
    const pickIds = new Set(pickCards.map((c) => c.id));
    selected.clear();
    p1.hand.forEach((c, i) => { if (pickIds.has(c.id)) selected.add(i); });
    renderHand();
  };
  const sndBtn = root.querySelector('.eng-snd') as HTMLButtonElement;
  sndBtn.textContent = soundLabel(sound.enabled());
  sndBtn.onclick = () => { sndBtn.textContent = soundLabel(sound.toggle()); };

  // Keyboard: 1–9/0 toggle a card, Space/Enter play, B best, C clear.
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const p1 = s.players[0]; if (!p1 || done) return;
    if (e.key >= '0' && e.key <= '9') {
      const i = e.key === '0' ? 9 : +e.key - 1;
      if (i < p1.hand.length && !p1.fin) {
        if (selected.has(i)) selected.delete(i); else if (selected.size < 8) selected.add(i);
        bestNote = ''; renderHand();
      }
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (!($('eng-play') as HTMLButtonElement).disabled) ($('eng-play') as HTMLButtonElement).click();
      e.preventDefault();
    } else if (e.key === 'b' || e.key === 'B') { ($('eng-best') as HTMLButtonElement).click(); e.preventDefault(); }
    else if (e.key === 'c' || e.key === 'C') { ($('eng-clear') as HTMLButtonElement).click(); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // 2D/3D view swap (same three.js scene as practice mode)
  view3d = attachView3D({
    host: $('eng-track3d'),
    track2d: $('eng-track'),
    toggleBtn: $('eng-view3d'),
    fsBtn: $('eng-fs'),
    buildSeats: () => s.players.map((p) => ({ pid: p.id, color: cssv(P_VAR[p.id]) || '#ed2f39', name: nameOf(p.id) })),
    dockItems: () => [[$('eng-handcard'), 'cg-fsdock'], [$('eng-vsel-slot'), 'cg-fsveh'], [$('eng-toast'), 'cg-fstoast']],
    onLog: (m) => log(m),
    onReady: () => renderTrack(),
  });

  function loop() {
    // Pause while the tab is hidden — the match is client-driven (server only
    // re-derives from the captured (round,tick) log at settle), so freezing the
    // loop just delays wall-clock time without changing the deterministic result.
    if (document.hidden) return;
    const play = pendingPlay ?? undefined;
    if (play) plays.push({ round: s.roundIndex, tick: s.t, cardIds: play });
    pendingPlay = null;
    // snapshots so we can log transitions (bot boosts, finishes, checkpoints)
    // without touching the engine — read-only references taken before the step.
    const nmBefore = new Map(s.players.map((p) => [p.id, p.nm]));
    const finBefore = new Map(s.players.map((p) => [p.id, p.fin]));
    const cpBefore = s.players[0].cp.size;
    const played = stepTick(s, play);
    if (played) {
      const label = played.combo || played.kind;
      popup(`${label} ×${played.mult.toFixed(2)}`, fxClass(played));
      log(`You played <b>${label}</b> (×${played.mult.toFixed(2)})${played.magic.length ? ' + ' + played.magic.map((m) => m.type).join(', ') : ''}`);
    }
    for (const p of s.players) {
      if (p.id !== 'P1' && p.nm && p.nm !== nmBefore.get(p.id)) log(`${nameOf(p.id)} boosts <b>×${p.nm.mult.toFixed(2)}</b>`);
      if (!finBefore.get(p.id) && p.fin) log(`${nameOf(p.id)} <b>finished</b> @ ${p.ft}s`);
    }
    if (s.players[0].cp.size > cpBefore) log(`Passed CP-${s.players[0].cp.size} — hand refilled`);
    renderTrack(); renderHand(); renderBoard();
    if (roundDone(s)) {
      if (loopH) clearInterval(loopH); loopH = null;
      sound.raceOn(false);
      const ended = s.roundIndex; // 0-based; scoreRound advances it
      const order = scoreRound(s);
      toast(`Round ${ended + 1}: ${nameOf(order[0])} wins!`);
      log(`<b>Round ${ended + 1}</b> — ${order.map((id, i) => `${i + 1}. ${nameOf(id)}`).join(' · ')}`);
      renderBoard();
      if (s.finished) return finish();
      setTimeout(beginRound, 900);
    }
  }

  function finish() {
    done = true;
    const ranking = finalRanking(s);
    renderBoard(ranking);
    if (ranking[0] === 'P1') sound.victory();
    toast(`🏆 ${nameOf(ranking[0])} wins the match!`);
    log(`<b>MATCH OVER.</b> ${ranking.map((id, i) => `${i + 1}. ${nameOf(id)} (◆ ${payoutStr(i)})`).join(' · ')}`);
    renderSettle(ranking);
    ($('eng-note')).textContent = 'Match over — settling on-chain…';
    opts.onFinish({ vehicles, plays }, ranking.map((id) => addr[id]));
  }

  beginRound();
  return () => {
    if (loopH) clearInterval(loopH);
    if (toastT) clearTimeout(toastT);
    countT.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    view3d?.destroy(); view3d = null;
    sound.destroy();
    if (!done) root.innerHTML = '';
  };
}
