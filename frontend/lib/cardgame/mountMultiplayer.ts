/**
 * CAR(D) GAME — real 4-player multiplayer renderer. Unlike the practice/staked
 * views this does NOT run the engine locally: the server owns the authoritative
 * loop and streams snapshots. This renderer just draws what the server sends and
 * relays the player's inputs (vehicle pick, card play) back over the socket.
 *
 * UI parity with practice mode: combo popups (from the server's `applied` map),
 * a live play preview via the shared engine's `evaluate()`, an event log, round
 * banners, toasts and a settlement panel. All cosmetic — inputs relayed to the
 * server are unchanged.
 */
import { CFG, COMBO, evaluate, fxClass, type Card, type PlayEval } from './engine';
import { vehicleSelector, vehAbbr, vehColor } from './vehicles';
import { bestPlay } from './bestPlay';

type Pid = 'P1' | 'P2' | 'P3' | 'P4';
interface Seat { pid: Pid; address: string }
interface StatePlayer { pid: Pid; address: string; veh: string | null; dist: number; speed: number; fin: boolean; ft: number | null; total: number; cd: number; fx: string | null; bot?: boolean }
interface HandCard { id: number; value: number; type: 'NORMAL' | 'MAGIC'; magic: string | null }
/** Per-seat play the server accepted this tick (from `cardgame:state`). */
interface AppliedPlay { combo: string | null; mult: number; fx?: string | null }

export interface MpSocketLike {
  on: (event: string, cb: (data: any) => void) => void;
  off?: (event: string, cb?: (data: any) => void) => void;
  emit: (event: string, data?: any) => void;
}
export interface MpRenderOpts {
  socket: MpSocketLike;
  myAddress: string;
  seats: Seat[]; // 4 seats from the `cardgame:locked` event
  onFinished?: (r: { ranking: Pid[]; rankingAddresses: string[] }) => void;
  onSettled?: (r: { ranking: string[]; txHash?: string }) => void;
}

const P_VAR: Record<Pid, string> = { P1: '--p1', P2: '--p2', P3: '--p3', P4: '--p4' };
const short = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '?');
const MAGIC_ICON: Record<string, string> = { NITRO: '⚡', NAIL: '✕', OIL: '●' };
// Fuji escrow economics: entry 0.01 AVAX × 4 → payouts entry × [2, 1, 0.5, 0.3]
const ENTRY = 0.01;
const PAYOUT_X = [2, 1, 0.5, 0.3];
const payoutStr = (rank: number) => String(+(ENTRY * (PAYOUT_X[rank] ?? 0)).toFixed(4));

/** Popup colour tier when we only know (combo, mult) — mirrors engine.fxClass
 *  minus the NITRO case (the server's applied map carries no magic info). */
function tierFx(combo: string | null, mult: number): string {
  if (mult >= CFG.CAP || combo === 'FOUR_OF_A_KIND' || combo === 'TWO_TRIOS') return 'fx-max';
  if (combo && (COMBO[combo] ?? 0) >= 150) return 'fx-epic';
  if (combo) return 'fx-ice';
  return 'fx-val';
}

export function mountMultiplayer(root: HTMLElement, opts: MpRenderOpts): () => void {
  const myPid = opts.seats.find((s) => s.address.toLowerCase() === opts.myAddress.toLowerCase())?.pid ?? 'P1';
  const nameOf = (pid: Pid, addr?: string) => (pid === myPid ? 'YOU' : short(addr || opts.seats.find((s) => s.pid === pid)?.address || ''));
  const cssv = (n: string) => getComputedStyle(root).getPropertyValue(n).trim();

  const selected = new Set<number>(); // selected card ids
  let hand: HandCard[] = [];
  let hlim = 0, myCd = 0, myFin = false;
  // eval of the play we just sent — lets the popup use the full fxClass (incl.
  // NITRO gold) once the server confirms it in the `applied` map
  let sentEval: PlayEval | null = null;
  let toastT: ReturnType<typeof setTimeout> | null = null;
  const handlers: Array<[string, (d: any) => void]> = [];

  root.innerHTML = `
    <div class="toast eng-toast"></div>
    <div class="cg-eng glass" style="padding:16px;margin-bottom:12px">
      <div class="eng-hd"><span class="eng-round">MULTIPLAYER · WAITING</span>
        <span class="dim mono" style="font-size:11px">4 players · server-authoritative · on-chain settle</span></div>
      <div class="eng-picks dim mono"></div>
      <div class="eng-vsel-slot"></div>
      <div class="eng-track"></div>
      <div class="cg-note dim" style="margin-top:8px;font-size:12px"></div>
    </div>
    <div class="cg-eng glass" style="padding:16px">
      <h3 style="margin:0 0 10px;font-size:12px;letter-spacing:2px;color:var(--cg-muted)">YOUR HAND — <span class="eng-hlim"></span></h3>
      <div class="eng-hand hand"></div>
      <div class="cooldown"><div class="eng-cd"></div></div>
      <div class="row"><button class="btn eng-play">PLAY SELECTED</button>
        <button class="btn ghost eng-best">✨ Best</button>
        <button class="btn ghost eng-clear">Clear</button>
        <span class="pill eng-hint">select 1–8 cards</span></div>
      <table style="width:100%;margin-top:14px;font-size:12px" class="eng-board"><tbody></tbody></table>
      <div class="eng-settle"></div>
      <div class="cg-elog-hd">Event log</div>
      <div class="log eng-log"></div>
    </div>`;
  const $ = (c: string) => root.querySelector('.' + c) as HTMLElement;

  // ── juice helpers (cosmetic only) ───────────────────────────────────
  function log(html: string) { const l = $('eng-log'); if (l) l.innerHTML = `<div>${html}</div>` + l.innerHTML; }
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
  function banner(txt: string) {
    const tk = $('eng-track'); if (!tk) return;
    const el = document.createElement('div'); el.className = 'cg-banner'; el.textContent = txt;
    tk.appendChild(el); setTimeout(() => el.remove(), 1400);
  }

  // ── track: 4 lanes built once, updated from snapshots ───────────────
  buildTrack();
  function buildTrack() {
    const tk = $('eng-track'); tk.innerHTML = '';
    for (const seat of opts.seats) {
      const lane = document.createElement('div'); lane.className = 'lane';
      CFG.CP.forEach((cp) => { const d = document.createElement('div'); d.className = 'cp'; d.style.left = cp / 10 + '%'; lane.appendChild(d); });
      const fin = document.createElement('div'); fin.className = 'finish'; lane.appendChild(fin);
      const car = document.createElement('div'); car.className = 'car run'; car.dataset.pid = seat.pid;
      car.style.setProperty('--c', cssv(P_VAR[seat.pid]) || '#888');
      car.innerHTML = `<span class="carwrap"><span class="fx"></span><svg class="carsvg" viewBox="0 0 56 32"><g class="flame"><path d="M9 15.5 L-3 13 L3 16.5 L-5 19.5 L9 20.5 Z" fill="#f5c542"></path></g><path class="body" d="M6 22 L8 16 Q13 9 22 8 L32 8 Q41 9 47 15 L52 18 Q54 19 54 21 L53 22 Z"></path><g class="wheel w1"><circle cx="16" cy="24" r="5.5"></circle><line x1="16" y1="20" x2="16" y2="28"></line></g><g class="wheel w2"><circle cx="42" cy="24" r="5.5"></circle><line x1="42" y1="20" x2="42" y2="28"></line></g></svg></span><span class="tag"></span><span class="hud"></span>`;
      lane.appendChild(car); tk.appendChild(lane);
    }
  }

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
    ($('eng-round')).textContent = `ROUND ${d.round + 1}/${CFG.ROUNDS}`;
    ($('eng-vsel-slot')).innerHTML = '';
    ($('eng-picks')).innerHTML = opts.seats.map((s) => `${nameOf(s.pid, s.address)} <b style="color:${vehColor(d.vehicles[s.pid])}">${vehAbbr(d.vehicles[s.pid])}</b>`).join('  ·  ');
    banner(`ROUND ${d.round + 1}`);
    log(`<b>Round ${d.round + 1}</b> started — ${opts.seats.map((s) => `${nameOf(s.pid, s.address)} ${vehAbbr(d.vehicles[s.pid])}`).join(' · ')}`);
    note('Race! Play card combos for speed.');
  });

  // ── live snapshots ──────────────────────────────────────────────────
  on('cardgame:state', (d: { round: number; t: number; players: StatePlayer[]; applied?: Partial<Record<Pid, AppliedPlay>> }) => {
    for (const p of d.players) {
      const car = $('eng-track').querySelector(`[data-pid="${p.pid}"]`) as HTMLElement | null;
      if (!car) continue;
      const boosted = p.speed > 0 && p.fx === 'fx-nitro';
      car.style.left = (p.dist / CFG.TRACK * 93) + '%';
      car.className = 'car' + (p.fin ? ' fin' : ' run') + (boosted ? ' boost' : '') + (p.fx && !p.fin ? ' ' + p.fx : '') + (p.bot ? ' cg-bot' : '');
      (car.querySelector('.tag') as HTMLElement).innerHTML = nameOf(p.pid, p.address) + (p.bot ? ' 🤖' : '') + (p.veh ? ` · <b style="color:${vehColor(p.veh)}">${vehAbbr(p.veh)}</b>` : '');
      (car.querySelector('.hud') as HTMLElement).textContent = p.fin ? `✔ ${p.ft}s` : `${Math.round(p.speed)}u/s${p.cd > 0 ? ' · cd' + (p.cd / 10).toFixed(1) : ''}`;
      if (p.pid === myPid) { myCd = p.cd; myFin = p.fin; }
    }
    // server-accepted plays this tick → combo popup (mine) + event log (all)
    if (d.applied) {
      for (const pid of Object.keys(d.applied) as Pid[]) {
        const a = d.applied[pid]; if (!a) continue;
        const mine = pid === myPid;
        const label = a.combo || (mine && sentEval ? sentEval.kind : 'BOOST');
        if (mine) {
          popup(`${label} ×${a.mult.toFixed(2)}`, sentEval ? fxClass(sentEval) : tierFx(a.combo, a.mult));
          sentEval = null;
        }
        log(`${mine ? 'You' : nameOf(pid)} played <b>${label}</b> (×${a.mult.toFixed(2)})`);
      }
    }
    renderBoard(d.players);
    updatePlayBtn();
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
  on('cardgame:seat-botted', (d: { pid: Pid }) => { note(`${nameOf(d.pid)} is now bot-controlled.`); log(`${nameOf(d.pid)} is now <b>bot-controlled</b> 🤖`); });

  on('cardgame:round-end', (d: { round: number; totals: Record<Pid, number>; order?: Pid[] }) => {
    const winner = d.order?.[0];
    toast(winner ? `Round ${d.round + 1}: ${nameOf(winner)} wins!` : `Round ${d.round + 1} scored.`);
    log(`<b>Round ${d.round + 1}</b> — totals: ${(Object.keys(d.totals) as Pid[]).map((pid) => `${nameOf(pid)} ${d.totals[pid]}`).join(' · ')}`);
    note(`Round ${d.round + 1} scored.`);
  });

  on('cardgame:finished', (d: { ranking: Pid[]; rankingAddresses: string[]; totals: Record<Pid, number> }) => {
    ($('eng-round')).textContent = 'MATCH OVER';
    renderBoard(d.ranking.map((pid) => ({ pid, address: opts.seats.find((s) => s.pid === pid)?.address || '', veh: null, dist: CFG.TRACK, speed: 0, fin: true, ft: null, total: d.totals[pid], cd: 0, fx: null })));
    toast(`🏆 ${nameOf(d.ranking[0])} wins the match!`);
    log(`<b>MATCH OVER.</b> ${d.ranking.map((pid, i) => `${i + 1}. ${nameOf(pid)}`).join(' · ')}`);
    renderSettle(d.rankingAddresses);
    note('Settling on-chain…');
    opts.onFinished?.({ ranking: d.ranking, rankingAddresses: d.rankingAddresses });
  });

  on('cardgame:settled', (d: { ranking: string[]; txHash?: string }) => {
    const won = d.ranking[0]?.toLowerCase() === opts.myAddress.toLowerCase();
    note(won ? 'You won! Withdraw your payout below.' : 'Settled on-chain — better luck next race.');
    toast(won ? '✓ Settled — withdraw your payout!' : '✓ Settled on-chain.');
    renderSettle(d.ranking, d.txHash);
    log(`Result settled on-chain${d.txHash ? ` — tx <span class="mono">${short(d.txHash)}</span>` : ''} ✓`);
    opts.onSettled?.(d);
  });

  on('cardgame:cancelled', (d: { reason?: string }) => note(`Match cancelled: ${d?.reason || 'a player left'}.`));
  on('cardgame:error', (d: { error?: string }) => note(`Error: ${d?.error || 'unknown'}`));

  // ── rendering ───────────────────────────────────────────────────────
  function renderBoard(players: StatePlayer[]) {
    const ranked = [...players].sort((a, b) => b.total - a.total || b.dist - a.dist);
    const tb = root.querySelector('.eng-board tbody') as HTMLElement;
    tb.innerHTML = '<tr><th>#</th><th>Racer</th><th>Dist</th><th>Pts</th></tr>' +
      ranked.map((p, i) => `<tr><td class="dim">${i + 1}</td><td class="addr"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(${P_VAR[p.pid]});margin-right:6px"></i>${nameOf(p.pid, p.address)}</td><td class="mono">${Math.round(p.dist)}</td><td>${p.total}</td></tr>`).join('');
  }

  /** Final ranking + escrow payouts. Rendered provisionally at `finished`
   *  (settling…), then again at `settled` with the tx link + checkmarks. */
  function renderSettle(addresses: string[], txHash?: string) {
    const link = txHash ? ` <a class="txh" href="https://testnet.snowtrace.io/tx/${txHash}" target="_blank" rel="noopener noreferrer">${short(txHash)}</a>` : '';
    ($('eng-settle')).innerHTML = `<div class="settleBox"><div class="settleHead">${txHash ? '✓ SETTLED ON-CHAIN' : '🏁 FINAL RESULT — settling on-chain…'}
        <span class="mono dim">entry ${ENTRY} AVAX × 4</span>${link}</div>` +
      addresses.map((a, i) => {
        const pid = opts.seats.find((st) => st.address.toLowerCase() === a.toLowerCase())?.pid;
        const me = a.toLowerCase() === opts.myAddress.toLowerCase();
        return `<div class="settleRow"><span class="dim">#${i + 1}</span>
          <span class="addr">${pid ? `<i class="av" style="background:${cssv(P_VAR[pid])}"></i>` : ''}${me ? 'YOU' : short(a)}</span>
          <b class="gold">◆ ${payoutStr(i)}</b>${txHash ? '<span class="ok">✓</span>' : ''}</div>`;
      }).join('') + '</div>';
  }

  function renderHand() {
    ($('eng-hlim')).textContent = `${hand.length}/${hlim}`;
    const h = $('eng-hand'); h.innerHTML = '';
    for (const c of hand) {
      const el = document.createElement('div');
      el.className = 'card' + (c.type === 'MAGIC' ? ' magic ' + (c.magic === 'NAIL' ? 'nail' : c.magic === 'OIL' ? 'oil' : '') : '') + (c.value >= 9 ? ' hi' : '') + (selected.has(c.id) ? ' sel' : '');
      el.innerHTML = `<span class="ix">${c.value}</span><span class="ix2">${c.value}</span>
        <i class="cardart">${c.magic ? MAGIC_ICON[c.magic] || '' : '❄'}</i>
        <span class="cv">${c.value}</span>${c.magic ? `<small>${c.magic}</small>` : ''}`;
      el.onpointerdown = (e) => { e.preventDefault(); if (selected.has(c.id)) selected.delete(c.id); else if (selected.size < 8) selected.add(c.id); renderHand(); };
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
      const r = evaluate(hand.filter((c) => selected.has(c.id)));
      hint.textContent = `${r.combo || r.kind} → x${r.mult.toFixed(2)}` + (r.magic.length ? ` +${r.magic.map((m) => m.type).join('/')}` : '');
      return;
    }
    hint.textContent = myCd > 0 ? `cooldown ${(myCd / 10).toFixed(1)}s` : 'select 1–8 cards';
  }

  function note(s: string) { ($('cg-note')).textContent = s; }

  ($('eng-play')).onclick = () => {
    if (myCd > 0 || selected.size === 0 || myFin) return;
    const cardIds = [...selected];
    // remember what we sent so the confirmed popup can colour by full fxClass
    sentEval = evaluate(hand.filter((c) => selected.has(c.id)));
    opts.socket.emit('cardgame:play', { cardIds });
    selected.clear(); renderHand();
  };
  ($('eng-clear')).onclick = () => { selected.clear(); renderHand(); };
  ($('eng-best')).onclick = () => {
    if (myFin || myCd > 0 || !hand.length) return;
    const pick = bestPlay(hand as Card[]);
    selected.clear();
    for (const c of pick) selected.add(c.id);
    renderHand();
  };

  renderHand();

  // ── cleanup ─────────────────────────────────────────────────────────
  return () => {
    for (const [event, cb] of handlers) opts.socket.off?.(event, cb);
    if (toastT) clearTimeout(toastT);
    root.innerHTML = '';
  };
}
