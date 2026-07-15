/**
 * CAR(D) GAME — real 4-player multiplayer renderer. Unlike the practice/staked
 * views this does NOT run the engine locally: the server owns the authoritative
 * loop and streams snapshots. This renderer just draws what the server sends and
 * relays the player's inputs (vehicle pick, card play) back over the socket.
 *
 * The 3D stage is the whole game screen (hand panel / vehicle selector / toast
 * dock into it; standings + event log are HUD overlays). Because the server owns
 * the match, a hidden tab or a dropped connection never stops the race — this
 * view simply resumes drawing from the next snapshot (see `cardgame:resumed`).
 */
import { CFG, COMBO, evaluate, fxClass, type Card, type PlayEval } from './engine';
import { ABILITIES } from './abilities';
import { vehicleSelector, vehAbbr } from './vehicles';
import { bestPlan, bestPlay, planNote } from './bestPlay';
import { createCgSound, soundLabel } from './sound';
import { attachView3D, type View3D } from './view3d';
import { attachStageHud, type StageHud } from './stageHud';
import { showRaceResults, closeRaceResults } from './resultsOverlay';

type Pid = 'P1' | 'P2' | 'P3' | 'P4';
interface Seat { pid: Pid; address: string }
interface StatePlayer { pid: Pid; address: string; veh: string | null; dist: number; speed: number; fin: boolean; ft: number | null; total: number; cd: number; fx: string | null; bot?: boolean }
interface HandCard { id: number; value: number; type: 'NORMAL' | 'MAGIC'; magic: string | null }
/** Per-seat play the server accepted this tick (from `cardgame:state`). */
interface AppliedPlay { combo: string | null; mult: number; fx?: string | null; abilities?: string[] }

export interface MpSocketLike {
  on: (event: string, cb: (data: any) => void) => void;
  off?: (event: string, cb?: (data: any) => void) => void;
  emit: (event: string, data?: any) => void;
}
export interface MpRenderOpts {
  socket: MpSocketLike;
  myAddress: string;
  seats: Seat[]; // 4 seats from the `cardgame:locked` event
  entryFee: string; // wei, decimal string — from the escrow's entryFee()
  onFinished?: (r: { ranking: Pid[]; rankingAddresses: string[] }) => void;
  onSettled?: (r: { ranking: string[]; txHash?: string }) => void;
}

const P_VAR: Record<Pid, string> = { P1: '--p1', P2: '--p2', P3: '--p3', P4: '--p4' };
const short = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '?');
const MAGIC_ICON: Record<string, string> = { NITRO: '⚡', NAIL: '✕', OIL: '●' };
// Fuji escrow economics: entry × 4 → payouts entry × [2, 1, 0.5, 0.3]
const PAYOUT_X = [2, 1, 0.5, 0.3];

/** Popup colour tier when we only know (combo, mult) — mirrors engine.fxClass
 *  minus the NITRO case (the server's applied map carries no magic info). */
function tierFx(combo: string | null, mult: number): string {
  if (mult >= CFG.CAP || combo === 'FOUR_OF_A_KIND' || combo === 'TWO_TRIOS') return 'fx-max';
  if (combo && (COMBO[combo] ?? 0) >= 150) return 'fx-epic';
  if (combo) return 'fx-ice';
  return 'fx-val';
}

export function mountMultiplayer(root: HTMLElement, opts: MpRenderOpts): () => void {
  const entryAvax = Number(opts.entryFee) / 1e18;
  const payoutStr = (rank: number) => String(+(entryAvax * (PAYOUT_X[rank] ?? 0)).toFixed(4));
  const myPid = opts.seats.find((s) => s.address.toLowerCase() === opts.myAddress.toLowerCase())?.pid ?? 'P1';
  const nameOf = (pid: Pid, addr?: string) => (pid === myPid ? 'YOU' : short(addr || opts.seats.find((s) => s.pid === pid)?.address || ''));
  const cssv = (n: string) => getComputedStyle(root).getPropertyValue(n).trim();

  const selected = new Set<number>(); // selected card ids
  // ✨ Best: repeated clicks cycle through the plan's plays; note rides the hint
  let bestNote = '';
  let bestCycle = { sig: '', i: 0 };
  let curRound = 0;
  // 🎵 quiet race music, shared toggle across modes
  const sound = createCgSound();
  let hand: HandCard[] = [];
  let hlim = 0, myCd = 0, myFin = false;
  // eval of the play we just sent — lets the popup use the full fxClass (incl.
  // NITRO gold) once the server confirms it in the `applied` map
  let sentEval: PlayEval | null = null;
  let toastT: ReturnType<typeof setTimeout> | null = null;
  let view3d: View3D | null = null;
  const handlers: Array<[string, (d: any) => void]> = [];

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
        <span class="pill eng-hint">select 1–8 cards</span></div>
    </div>`;
  const $ = (c: string) => root.querySelector('.' + c) as HTMLElement;

  // in-stage HUD (chips / mini standings / compact log)
  const hud: StageHud = attachStageHud($('eng-track3d'));
  hud.chips.innerHTML = `
    <span class="chip eng-round">MULTIPLAYER · WAITING</span>
    <span class="chip mono">4 players · server-authoritative</span>
    <button class="chip eng-snd" title="Race music on/off">🎵 MUSIC</button>
    <span class="chip mono eng-note-chip" style="display:none"></span>`;

  // ── juice helpers (cosmetic only) ───────────────────────────────────
  function log(html: string) { hud.log(html); }
  function toast(msg: string) {
    const el = $('eng-toast'); if (!el) return;
    el.textContent = msg; el.style.opacity = '1';
    if (toastT) clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }
  function popup(txt: string, cls: string) {
    const tk = $('eng-track3d'); if (!tk) return;
    const el = document.createElement('div'); el.className = 'popup ' + cls; el.textContent = txt;
    tk.appendChild(el); setTimeout(() => el.remove(), 1400);
  }
  function banner(txt: string) {
    const tk = $('eng-track3d'); if (!tk) return;
    const el = document.createElement('div'); el.className = 'cg-banner'; el.textContent = txt;
    tk.appendChild(el); setTimeout(() => el.remove(), 1400);
  }
  function note(s: string) {
    const el = $('eng-note-chip'); if (!el) return;
    el.textContent = s; el.style.display = s ? '' : 'none';
  }

  // The 3D stage starts immediately, driven by the server snapshots; the hand
  // panel / vehicle selector / toast live inside it as permanent overlays.
  view3d = attachView3D({
    host: $('eng-track3d'),
    fsBtn: $('eng-fs'),
    buildSeats: () => opts.seats.map((s) => ({ pid: s.pid, color: cssv(P_VAR[s.pid]) || '#888', name: nameOf(s.pid, s.address) })),
    dockItems: () => [[$('eng-handcard'), 'cg-fsdock'], [$('eng-vsel-slot'), 'cg-fsveh'], [$('eng-toast'), 'cg-fstoast']],
    onLog: (m) => log(m),
  });

  function on(event: string, cb: (d: any) => void) { handlers.push([event, cb]); opts.socket.on(event, cb); }

  // ── vehicle selection ───────────────────────────────────────────────
  on('cardgame:vehicle-select', (d: { round: number; remaining: string[] }) => {
    ($('eng-round')).textContent = `ROUND ${d.round + 1}/${CFG.ROUNDS} · PICK`;
    const slot = $('eng-vsel-slot'); slot.innerHTML = '';
    // build a used-map from remaining (anything not remaining is used)
    const used: Record<string, boolean> = {};
    for (const v of ['LEGENDARY', 'EPIC', 'COMMON']) used[v] = !d.remaining.includes(v);
    slot.appendChild(vehicleSelector({
      round: d.round, used, opponents: 'All four pick at once — locks when everyone’s in',
      onPick: (veh) => { opts.socket.emit('cardgame:vehicle', { veh }); slot.innerHTML = ''; note(`You picked ${veh} — waiting for the others…`); },
    }));
  });

  on('cardgame:vehicle-picked', (d: { chosen: Record<string, string> }) => {
    const n = Object.keys(d.chosen || {}).length;
    note(`${n}/4 vehicles locked…`);
  });

  on('cardgame:round-start', (d: { round: number; vehicles: Record<Pid, string> }) => {
    curRound = d.round;
    view3d?.setRound(d.round); // per-round weather
    sound.raceOn(true);
    ($('eng-round')).textContent = `ROUND ${d.round + 1}/${CFG.ROUNDS}`;
    ($('eng-vsel-slot')).innerHTML = '';
    banner(`ROUND ${d.round + 1}`);
    log(`<b>Round ${d.round + 1}</b> started — ${opts.seats.map((s) => `${nameOf(s.pid, s.address)} ${vehAbbr(d.vehicles[s.pid])}`).join(' · ')}`);
    note('Race! Play card combos for speed.');
  });

  // ── live snapshots ──────────────────────────────────────────────────
  on('cardgame:state', (d: { round: number; t: number; players: StatePlayer[]; applied?: Partial<Record<Pid, AppliedPlay>> }) => {
    for (const p of d.players) if (p.pid === myPid) { myCd = p.cd; myFin = p.fin; }
    // server-accepted plays this tick → combo popup (mine) + event log (all)
    if (d.applied) {
      for (const pid of Object.keys(d.applied) as Pid[]) {
        const a = d.applied[pid]; if (!a) continue;
        const mine = pid === myPid;
        const label = a.combo || (mine && sentEval ? sentEval.kind : 'BOOST');
        if (mine) {
          popup(`${label} ×${a.mult.toFixed(2)}`, sentEval ? fxClass(sentEval) : tierFx(a.combo, a.mult));
          sentEval = null;
          (a.abilities ?? []).forEach((txt, i) => setTimeout(() => popup(txt, 'pop-ab'), 350 + i * 300));
        }
        log(`${mine ? 'You' : nameOf(pid)} played <b>${label}</b> (×${a.mult.toFixed(2)})`);
        (a.abilities ?? []).forEach((txt) => log(mine ? txt : `${nameOf(pid)}: ${txt}`));
      }
    }
    renderBoard(d.players);
    updatePlayBtn();
    // forward the server snapshot to the 3D stage
    view3d?.forward(d.players.map((p) => ({
      pid: p.pid, dist: p.dist, speed: p.speed,
      boosted: p.speed > 0 && p.fx === 'fx-nitro' && !p.fin,
      fx: p.fx && !p.fin ? p.fx : null, fin: p.fin, veh: p.veh,
    })));
  });

  on('cardgame:hand', (d: { pid: Pid; hlim: number; hand: HandCard[]; cd: number }) => {
    if (d.pid !== myPid) return;
    hand = d.hand; hlim = d.hlim; myCd = d.cd;
    // drop selections that are no longer in hand
    for (const id of [...selected]) if (!hand.some((c) => c.id === id)) selected.delete(id);
    renderHand();
  });

  on('cardgame:rejected', () => { note('Illegal play — ignored.'); log('Play rejected by the server — ignored'); sentEval = null; });
  on('cardgame:seat-dropped', (d: { pid: Pid }) => { note(`${nameOf(d.pid)} dropped — bot takes over if they don’t return.`); log(`${nameOf(d.pid)} <b>dropped</b>`); });
  on('cardgame:seat-rejoined', (d: { pid: Pid; bot?: boolean }) => { note(`${nameOf(d.pid)} is back.`); log(`${nameOf(d.pid)} <b>reconnected</b>`); });
  on('cardgame:seat-botted', (d: { pid: Pid }) => { note(`${nameOf(d.pid)} is now bot-controlled.`); log(`${nameOf(d.pid)} is now <b>bot-controlled</b> 🤖`); });
  // we came back from a connection drop: the server kept the match running the
  // whole time — fresh hand + state land right after this event
  on('cardgame:resumed', () => { note('Reconnected — match resumed.'); log('<b>Reconnected</b> — the race never stopped'); });

  on('cardgame:round-end', (d: { round: number; totals: Record<Pid, number>; order?: Pid[] }) => {
    const winner = d.order?.[0];
    sound.raceOn(false);
    toast(winner ? `Round ${d.round + 1}: ${nameOf(winner)} wins!` : `Round ${d.round + 1} scored.`);
    log(`<b>Round ${d.round + 1}</b> — totals: ${(Object.keys(d.totals) as Pid[]).map((pid) => `${nameOf(pid)} ${d.totals[pid]}`).join(' · ')}`);
    note(`Round ${d.round + 1} scored.`);
  });

  on('cardgame:finished', (d: { ranking: Pid[]; rankingAddresses: string[]; totals: Record<Pid, number> }) => {
    sound.raceOn(false);
    if (d.ranking[0] === myPid) sound.victory();
    ($('eng-round')).textContent = 'MATCH OVER';
    hud.rank(d.ranking.map((pid, i) => ({
      name: nameOf(pid), color: cssv(P_VAR[pid]) || '#ed2f39', you: pid === myPid, fin: true,
      value: `◆ ${payoutStr(i)}`,
    })));
    toast(`🏆 ${nameOf(d.ranking[0])} wins the match!`);
    log(`<b>MATCH OVER.</b> ${d.ranking.map((pid, i) => `${i + 1}. ${nameOf(pid)}`).join(' · ')}`);
    note('Settling on-chain…');
    showRaceResults({
      rows: d.ranking.map((pid, i) => ({
        name: nameOf(pid), color: cssv(P_VAR[pid]) || '#ed2f39', you: pid === myPid,
        total: d.totals[pid] ?? 0, prize: `◆ ${payoutStr(i)}`,
      })),
      note: 'Settling on-chain — withdraw your payout from the panel below',
    });
    opts.onFinished?.({ ranking: d.ranking, rankingAddresses: d.rankingAddresses });
  });

  on('cardgame:settled', (d: { ranking: string[]; txHash?: string }) => {
    const won = d.ranking[0]?.toLowerCase() === opts.myAddress.toLowerCase();
    note(won ? 'You won! Withdraw your payout below.' : 'Settled on-chain — better luck next race.');
    toast(won ? '✓ Settled — withdraw your payout!' : '✓ Settled on-chain.');
    log(`Result settled on-chain${d.txHash ? ` — tx <a class="txh" href="https://testnet.snowtrace.io/tx/${d.txHash}" target="_blank" rel="noopener noreferrer">${short(d.txHash)}</a>` : ''} ✓`);
    opts.onSettled?.(d);
  });

  on('cardgame:cancelled', (d: { reason?: string }) => note(`Match cancelled: ${d?.reason || 'a player left'}.`));
  on('cardgame:error', (d: { error?: string }) => note(`Error: ${d?.error || 'unknown'}`));

  // ── rendering ───────────────────────────────────────────────────────
  function renderBoard(players: StatePlayer[]) {
    const ranked = [...players].sort((a, b) => b.total - a.total || b.dist - a.dist);
    hud.rank(ranked.map((p) => ({
      name: nameOf(p.pid, p.address) + (p.bot ? ' 🤖' : ''), color: cssv(P_VAR[p.pid]) || '#888',
      you: p.pid === myPid, fin: p.fin,
      value: p.fin ? `✔ ${p.ft}s · ${p.total}p` : `${Math.round(p.dist)}u · ${p.total}p`,
    })));
  }

  function renderHand() {
    ($('eng-hlim')).textContent = `${hand.length}/${hlim}`;
    const h = $('eng-hand');
    // deal-in animation only when the cards themselves changed, not the selection
    const handSig = hand.map((c) => c.id).join(',');
    h.classList.toggle('nodeal', h.dataset.hand === handSig);
    h.dataset.hand = handSig;
    h.innerHTML = '';
    let ci = 0;
    for (const c of hand) {
      const el = document.createElement('div');
      el.style.setProperty('--ci', String(ci++));
      el.className = 'card' + (c.type === 'MAGIC' ? ' magic ' + (c.magic === 'NAIL' ? 'nail' : c.magic === 'OIL' ? 'oil' : '') : '') + (c.value >= 9 ? ' hi' : '') + (selected.has(c.id) ? ' sel' : '');
      el.innerHTML = `<span class="ix">${c.value}</span><span class="ix2">${c.value}</span>
        <i class="cardart">${c.magic ? MAGIC_ICON[c.magic] || '' : '❄'}</i>
        <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : `<small class="ab">${ABILITIES[c.value].key}</small>`}`;
      el.onpointerdown = (e) => { e.preventDefault(); if (selected.has(c.id)) selected.delete(c.id); else if (selected.size < 8) selected.add(c.id); bestNote = ''; renderHand(); };
      h.appendChild(el);
    }
    updatePlayBtn();
  }

  function updatePlayBtn() {
    ($('eng-cd')).style.width = (Math.max(0, myCd) / CFG.COOLDOWN_TICKS * 100) + '%';
    ($('eng-play') as HTMLButtonElement).disabled = myCd > 0 || selected.size === 0 || myFin;
    const hint = $('eng-hint');
    if (myFin) { hint.textContent = 'finished this round'; return; }
    if (selected.size) {
      // live preview via the shared engine — the hand cards are Card-shaped
      const cards = hand.filter((c) => selected.has(c.id));
      const r = evaluate(cards);
      const abKeys = [...new Set(cards.filter((c) => c.type === 'NORMAL').map((c) => c.value))]
        .sort((a, b) => a - b).map((v) => ABILITIES[v].icon + ABILITIES[v].key);
      hint.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '')
        + (abKeys.length ? ` · ${abKeys.join(' ')}` : '')
        + (bestNote ? ` · ${bestNote}` : '');
      return;
    }
    hint.textContent = myCd > 0 ? `cooldown ${(myCd / 10).toFixed(1)}s` : 'select 1–8 cards';
  }

  ($('eng-play')).onclick = () => {
    if (myCd > 0 || selected.size === 0 || myFin) return;
    const cardIds = [...selected];
    // remember what we sent so the confirmed popup can colour by full fxClass
    sentEval = evaluate(hand.filter((c) => selected.has(c.id)));
    opts.socket.emit('cardgame:play', { cardIds });
    selected.clear(); bestNote = ''; renderHand();
  };
  ($('eng-clear')).onclick = () => { selected.clear(); bestNote = ''; renderHand(); };
  ($('eng-best')).onclick = () => {
    if (myFin || myCd > 0 || !hand.length) return;
    const plan = bestPlan(hand as Card[], { endgame: curRound >= CFG.ROUNDS - 1 });
    const sig = hand.map((c) => c.id).join(',');
    if (bestCycle.sig !== sig) bestCycle = { sig, i: 0 };
    else if (plan.plays.length) bestCycle.i = (bestCycle.i + 1) % plan.plays.length;
    const pick = plan.plays.length ? plan.plays[bestCycle.i].cards : bestPlay(hand as Card[]);
    bestNote = plan.plays.length ? planNote(plan, bestCycle.i) : '✨ low hand — worth saving';
    selected.clear();
    for (const c of pick) selected.add(c.id);
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
    if (e.key >= '0' && e.key <= '9') {
      const i = e.key === '0' ? 9 : +e.key - 1;
      const c = hand[i];
      if (c && !myFin) {
        if (selected.has(c.id)) selected.delete(c.id); else if (selected.size < 8) selected.add(c.id);
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

  renderHand();

  // ── cleanup ─────────────────────────────────────────────────────────
  return () => {
    closeRaceResults();
    for (const [event, cb] of handlers) opts.socket.off?.(event, cb);
    document.removeEventListener('keydown', onKey);
    view3d?.destroy(); view3d = null;
    hud.destroy();
    if (toastT) clearTimeout(toastT);
    sound.destroy();
    root.innerHTML = '';
  };
}
