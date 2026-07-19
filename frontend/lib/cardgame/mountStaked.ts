/**
 * CAR(D) GAME — engine-driven STAKED renderer. Unlike the practice demo, this
 * drives the SHARED deterministic engine (seeded by the server), so every player
 * play is captured as (round, tick, cardIds) that the server re-simulates to the
 * exact same result. The player genuinely plays; the server just re-derives.
 *
 * The 3D stage is the whole game screen: the hand panel, vehicle selector and
 * toast dock into it as overlays, and the standings/event log are translucent
 * HUD widgets over the scene (stageHud). The race never pauses on a hidden tab:
 * elapsed wall-clock ticks are stepped in a catch-up batch (rendering only is
 * skipped while hidden) — the captured (round, tick) timeline is unaffected.
 */
import {
  initMatch, startRound, stepTick, roundDone, scoreRound, finalRanking, speed, evaluate, fxClass, isCompletePlay,
  CFG, type MatchState, type MatchInput, type PlayEvent, type Pid,
} from './engine';
import { ABILITIES } from './abilities';
import { vehicleSelector, vehAbbr } from './vehicles';
import { bestPlan, bestPlay, planNote } from './bestPlay';
import { showRaceResults, closeRaceResults } from './resultsOverlay';
import { createCgSound, soundLabel } from './sound';
import { attachView3D, type View3D } from './view3d';
import { attachStageHud, type StageHud } from './stageHud';
import { comboJuice, cancelComboJuice } from './juice';
import { recordMatch } from './progress';
import { createEngineAudio, engineLabel } from './engineAudio';

export interface StakedOpts {
  seed: string;
  player: string;
  bots: string[]; // 3
  entryFee: string; // wei, decimal string — from the escrow's entryFee()
  onFinish: (input: MatchInput, previewRanking: string[]) => void;
}

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const P_VAR: Record<Pid, string> = { P1: '--p1', P2: '--p2', P3: '--p3', P4: '--p4' };
const MAGIC_ICON: Record<string, string> = { NITRO: '⚡', NAIL: '✕', OIL: '●' };
// Fuji escrow economics: entry × 4 → payouts entry × [2, 1, 0.5, 0.3]
const PAYOUT_X = [2, 1, 0.5, 0.3];

export function mountStaked(root: HTMLElement, opts: StakedOpts): () => void {
  const entryAvax = Number(opts.entryFee) / 1e18;
  const payoutStr = (rank: number) => String(+(entryAvax * (PAYOUT_X[rank] ?? 0)).toFixed(4));
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
  // 🏎️ sample-based engine bed for the player car (independent toggle)
  const engine = createEngineAudio();
  // my strongest play this match → history/records (meta layer)
  const myBest = { mult: 0, combo: null as string | null, cards: 0 };
  let loopH: ReturnType<typeof setInterval> | null = null;
  let toastT: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  let view3d: View3D | null = null;

  root.innerHTML = `
    <div class="toast eng-toast"></div>
    <div class="eng-vsel-slot"></div>
    <div class="track3d glass eng-track3d"><button class="cg-fs eng-fs" title="Fullscreen">⛶</button></div>
    <div class="panel glass eng-handcard">
      <div class="hand-hd"><span class="hand-hd-t">Your Hand</span><span class="hand-count eng-hlim"></span></div>
      <div class="eng-hand hand"></div>
      <div class="cooldown"><div class="eng-cd"></div></div>
      <div class="row"><button class="btn eng-play">PLAY SELECTED</button>
        <button class="btn ghost eng-best">✨ Best</button>
        <button class="btn ghost eng-clear">Clear</button>
        <span class="pill eng-note">select 1–8 cards</span></div>
    </div>`;
  const $ = (c: string) => root.querySelector('.' + c) as HTMLElement;

  // in-stage HUD (chips / standings+progress / position badge / log);
  // gaining a place plays the overtake sting + a small camera nudge
  const hud: StageHud = attachStageHud($('eng-track3d'), {
    onPosChange: (_pos, up) => { if (up) { sound.overtake(); view3d?.shake(0.05); } },
  });
  hud.chips.innerHTML = `
    <span class="chip eng-round">ROUND 1/3</span>
    <span class="chip mono">seed ${short(opts.seed)} · server-verified</span>
    <button class="chip eng-snd" title="Race music on/off">🎵 MUSIC</button>
    <button class="chip eng-engt" title="Engine sound on/off">🏎️ ENGINE</button>`;

  // ── juice helpers (cosmetic only) ────────────────────────────────────
  function log(html: string) { hud.log(html); }
  function toast(msg: string) {
    const el = $('eng-toast'); if (!el) return;
    el.textContent = msg; el.style.opacity = '1';
    if (toastT) clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }
  // 3·2·1·GO race countdown over the stage, with beeps. Purely presentational:
  // the engine loop only starts when `go()` fires, so the recorded (round, tick)
  // timeline the server re-simulates is untouched.
  let countT: ReturnType<typeof setTimeout>[] = [];
  function countdown(go: () => void) {
    countT.forEach(clearTimeout); countT = [];
    const host = $('eng-track3d');
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
        view3d?.setRound(s.roundIndex); // per-round weather
        log(`<b>Round ${s.roundIndex + 1}</b> started — ${s.players.map((p) => `${nameOf(p.id)} ${vehAbbr(p.veh)}`).join(' · ')}`);
        renderTrack(); renderHand(); renderBoard();
        countdown(() => {
          lastWall = performance.now();
          loopH = setInterval(loop, 100);
          sound.raceOn(true);
          engine.raceOn(true);
        });
      },
    }));
  }

  function renderTrack() {
    // engine bed follows the player car (speed tops out ≈ base 10 × cap 5)
    const pe = s.players[0];
    if (pe) engine.setState({
      speed01: Math.min(1, speed(s, pe) / 50),
      boosted: !!(pe.nm && s.t < pe.nm.endsAt) && !pe.fin,
      fin: pe.fin,
    });
    // forward a per-tick snapshot to the 3D stage (lerped to 60fps there)
    view3d?.forward(s.players.map((p) => ({
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
    const selCards = [...selected].map((i) => p1.hand[i]);
    const illegalSel = selCards.length >= 2 && !isCompletePlay(selCards);
    ($('eng-play') as HTMLButtonElement).disabled = cd > 0 || selected.size === 0 || p1.fin || illegalSel;
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
        <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : `<small class="ab">${ABILITIES[c.value].key}</small>`}`;
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
    if (cards.length >= 2 && !isCompletePlay(cards)) {
      pv.textContent = 'Invalid combo — cards must form one combination';
      return;
    }
    const r = evaluate(cards);
    const abKeys = [...new Set(cards.filter((c) => c.type === 'NORMAL').map((c) => c.value))]
      .sort((a, b) => a - b).map((v) => ABILITIES[v].icon + ABILITIES[v].key);
    pv.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '')
      + (abKeys.length ? ` · ${abKeys.join(' ')}` : '')
      + (bestNote ? ` · ${bestNote}` : '');
  }

  function renderBoard(order?: Pid[], final = false) {
    const ranked = order ? order.map((id) => s.players.find((p) => p.id === id)!) : [...s.players].sort((a, b) => b.total - a.total || b.dist - a.dist);
    hud.rank(ranked.map((p, i) => ({
      pid: p.id, name: nameOf(p.id), color: cssv(P_VAR[p.id]) || '#ed2f39', you: p.id === 'P1', fin: p.fin,
      value: final ? `◆ ${payoutStr(i)}` : (p.fin ? `✔ ${p.ft}s · ${p.total}p` : `${Math.round(p.dist)}u · ${p.total}p`),
      ...(final ? {} : { dist: p.dist, pts: p.total }),
    })));
  }

  // pending player play captured for the CURRENT tick
  let pendingPlay: number[] | null = null;
  ($('eng-play')).onclick = () => {
    const p1 = s.players[0];
    if (s.t < p1.cdUntil || selected.size === 0) return;
    const selCards = [...selected].map((i) => p1.hand[i]);
    if (selCards.length >= 2 && !isCompletePlay(selCards)) return; // illegal — the engine would reject it anyway
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
  const engBtn = root.querySelector('.eng-engt') as HTMLButtonElement;
  engBtn.textContent = engineLabel(engine.enabled());
  engBtn.onclick = () => { engBtn.textContent = engineLabel(engine.toggle()); };

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

  // The 3D stage starts immediately and hosts the hand panel + vehicle selector
  // + toast as permanent overlays (same three.js scene as practice/MP).
  view3d = attachView3D({
    host: $('eng-track3d'),
    fsBtn: $('eng-fs'),
    buildSeats: () => s.players.map((p) => ({ pid: p.id, color: cssv(P_VAR[p.id]) || '#ed2f39', name: nameOf(p.id) })),
    dockItems: () => [[$('eng-handcard'), 'cg-fsdock'], [$('eng-vsel-slot'), 'cg-fsveh'], [$('eng-toast'), 'cg-fstoast']],
    onLog: (m) => log(m),
    onReady: () => renderTrack(),
  });

  // The race never pauses: step as many 100ms ticks as wall-clock time elapsed
  // (background tabs throttle timers to ≥1s → each fire catches up in a batch,
  // capped so a long absence drains in fast chunks). Rendering is skipped while
  // hidden — the engine ticks are what the server re-simulates, not the DOM.
  let lastWall = 0;
  function stepOnce(): boolean { // one engine tick; true = round ended
    const play = pendingPlay ?? undefined;
    if (play) plays.push({ round: s.roundIndex, tick: s.t, cardIds: play });
    pendingPlay = null;
    // snapshots so we can log transitions (bot boosts, finishes, checkpoints)
    // without touching the engine — read-only references taken before the step.
    const nmBefore = new Map(s.players.map((p) => [p.id, p.nm]));
    const finBefore = new Map(s.players.map((p) => [p.id, p.fin]));
    const cpBefore = s.players[0].cp.size;
    // the step consumes the played cards — capture them for the reveal first
    const playedCards = play ? s.players[0].hand.filter((c) => play.includes(c.id)) : [];
    const played = stepTick(s, play);
    if (played) {
      const label = played.combo || played.kind;
      if (played.mult > myBest.mult) { myBest.mult = played.mult; myBest.combo = label; }
      myBest.cards = Math.max(myBest.cards, playedCards.length);
      // Balatro-style sequential reveal: cards pop one-by-one, the multiplier
      // ticks up per card, then the combo lands with shake/hit-stop by tier
      comboJuice({
        host: $('eng-track3d'),
        cards: playedCards.map((c) => ({ value: c.value, magic: c.magic })),
        label, mult: played.mult, fxCls: fxClass(played),
        abilities: played.abilities ?? [], sound,
        fx: { shake: (m) => view3d?.shake(m), hitstop: (ms) => view3d?.hitstop(ms) },
      });
      log(`You played <b>${label}</b> (×${played.mult.toFixed(2)})${played.magic.length ? ' + ' + played.magic.map((m) => m.type).join(', ') : ''}`);
      (played.abilities ?? []).forEach((txt) => log(txt));
    }
    for (const p of s.players) {
      if (p.id !== 'P1' && p.nm && p.nm !== nmBefore.get(p.id)) log(`${nameOf(p.id)} boosts <b>×${p.nm.mult.toFixed(2)}</b>`);
      if (!finBefore.get(p.id) && p.fin) log(`${nameOf(p.id)} <b>finished</b> @ ${p.ft}s`);
    }
    if (s.players[0].cp.size > cpBefore) log(`Passed CP-${s.players[0].cp.size} — hand refilled`);
    if (roundDone(s)) {
      if (loopH) clearInterval(loopH); loopH = null;
      sound.raceOn(false);
      engine.raceOn(false);
      const ended = s.roundIndex; // 0-based; scoreRound advances it
      const order = scoreRound(s);
      toast(`Round ${ended + 1}: ${nameOf(order[0])} wins!`);
      log(`<b>Round ${ended + 1}</b> — ${order.map((id, i) => `${i + 1}. ${nameOf(id)}`).join(' · ')}`);
      renderBoard();
      if (s.finished) { finish(); return true; }
      setTimeout(beginRound, 900);
      return true;
    }
    return false;
  }
  function loop() {
    const now = performance.now();
    if (!lastWall) lastWall = now;
    const n = Math.max(1, Math.min(300, Math.round((now - lastWall) / 100)));
    lastWall += n * 100;
    for (let i = 0; i < n; i++) if (stepOnce()) return;
    if (!document.hidden) { renderTrack(); renderHand(); renderBoard(); }
  }

  function finish() {
    done = true;
    const ranking = finalRanking(s);
    renderBoard(ranking, true);
    const myPlace = ranking.indexOf('P1') + 1;
    const flags = recordMatch({
      ts: Date.now(), mode: 'staked', place: myPlace, pts: s.players[0].total,
      bestCombo: myBest.combo, bestMult: myBest.mult, comboCards: myBest.cards,
      prize: `◆ ${payoutStr(myPlace - 1)}`,
    });
    if (ranking[0] === 'P1') sound.victory();
    toast(`🏆 ${nameOf(ranking[0])} wins the match!`);
    log(`<b>MATCH OVER.</b> ${ranking.map((id, i) => `${i + 1}. ${nameOf(id)} (◆ ${payoutStr(i)})`).join(' · ')}`);
    ($('eng-note')).textContent = 'Match over — settling on-chain…';
    showRaceResults({
      rows: ranking.map((id, i) => {
        const p = s.players.find((x) => x.id === id)!;
        return {
          pid: id, name: nameOf(id), color: cssv(P_VAR[id]) || '#ed2f39', you: id === 'P1',
          rounds: p.scores, total: p.total, prize: `◆ ${payoutStr(i)}`,
        };
      }),
      note: 'Settling on-chain — the payout lands in your wallet panel below',
      record: flags.newBestPlay ? `best play ${myBest.combo} ×${myBest.mult.toFixed(2)}`
        : flags.newBestStreak ? 'longest win streak yet 🔥' : null,
    });
    opts.onFinish({ vehicles, plays }, ranking.map((id) => addr[id]));
  }

  beginRound();
  return () => {
    closeRaceResults();
    cancelComboJuice();
    if (loopH) clearInterval(loopH);
    if (toastT) clearTimeout(toastT);
    countT.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    view3d?.destroy(); view3d = null;
    hud.destroy();
    sound.destroy();
    engine.destroy();
    if (!done) root.innerHTML = '';
  };
}
