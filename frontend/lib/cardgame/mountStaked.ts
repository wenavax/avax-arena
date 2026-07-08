/**
 * CAR(D) GAME — engine-driven STAKED renderer. Unlike the practice demo, this
 * drives the SHARED deterministic engine (seeded by the server), so every player
 * play is captured as (round, tick, cardIds) that the server re-simulates to the
 * exact same result. The player genuinely plays; the server just re-derives.
 */
import {
  initMatch, startRound, stepTick, roundDone, scoreRound, finalRanking, speed,
  CFG, VEHICLES, type MatchState, type MatchInput, type PlayEvent, type Pid,
} from './engine';

export interface StakedOpts {
  seed: string;
  player: string;
  bots: string[]; // 3
  onFinish: (input: MatchInput, previewRanking: string[]) => void;
}

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const P_VAR: Record<Pid, string> = { P1: '--p1', P2: '--p2', P3: '--p3', P4: '--p4' };

export function mountStaked(root: HTMLElement, opts: StakedOpts): () => void {
  const addr: Record<Pid, string> = { P1: opts.player, P2: opts.bots[0], P3: opts.bots[1], P4: opts.bots[2] };
  const nameOf = (id: Pid) => (id === 'P1' ? 'YOU' : short(addr[id]));
  const cssv = (n: string) => getComputedStyle(root).getPropertyValue(n).trim();

  const s: MatchState = initMatch(opts.seed);
  const vehicles: string[] = [];
  const plays: PlayEvent[] = [];
  const selected = new Set<number>(); // hand indices selected by the player
  let loopH: ReturnType<typeof setInterval> | null = null;
  let done = false;

  root.innerHTML = `
    <div class="cg-eng glass" style="padding:16px;margin-bottom:12px">
      <div class="eng-hd"><span class="eng-round">ROUND 1/3</span>
        <span class="dim mono" style="font-size:11px">seed ${short(opts.seed)} · deterministic · server-verified</span></div>
      <div class="eng-track"></div>
    </div>
    <div class="cg-eng glass" style="padding:16px">
      <h3 style="margin:0 0 10px;font-size:12px;letter-spacing:2px;color:var(--cg-muted)">YOUR HAND — <span class="eng-hlim"></span></h3>
      <div class="eng-hand hand"></div>
      <div class="cooldown"><div class="eng-cd"></div></div>
      <div class="row"><button class="btn eng-play">PLAY SELECTED</button>
        <button class="btn ghost eng-clear">Clear</button>
        <span class="pill eng-note">select 1–8 cards</span></div>
      <table style="width:100%;margin-top:14px;font-size:12px" class="eng-board"><tbody></tbody></table>
    </div>`;
  const $ = (c: string) => root.querySelector('.' + c) as HTMLElement;

  function beginRound() {
    const veh = VEHICLES.filter((v) => !s.usedVeh.P1[v])[0]; // deterministic; recorded
    vehicles.push(veh);
    startRound(s, veh);
    ($('eng-round')).textContent = `ROUND ${s.roundIndex + 1}/3`;
    buildTrack();
    loopH = setInterval(loop, 100);
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
      (car.querySelector('.tag') as HTMLElement).textContent = nameOf(p.id) + (p.veh ? ' · ' + p.veh[0] : '');
      const cd = Math.max(0, p.cdUntil - s.t);
      (car.querySelector('.hud') as HTMLElement).textContent = p.fin ? `✔ ${p.ft}s` : `${Math.round(speed(s, p))}u/s${cd > 0 ? ' · cd' + (cd / 10).toFixed(1) : ''}`;
    }
  }

  function renderHand() {
    const p1 = s.players[0];
    ($('eng-hlim')).textContent = `${p1.hand.length}/${p1.hlim}`;
    const h = $('eng-hand');
    const sig = p1.hand.map((c) => c.id).join(',') + '|' + [...selected].sort((a, b) => a - b).join(',');
    if (h.dataset.sig === sig) return;
    h.dataset.sig = sig; h.innerHTML = '';
    p1.hand.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card' + (c.type === 'MAGIC' ? ' magic ' + (c.magic === 'NAIL' ? 'nail' : c.magic === 'OIL' ? 'oil' : '') : '') + (selected.has(i) ? ' sel' : '');
      el.innerHTML = `<span class="ix">${c.value}</span>${c.magic ? '⚡ ' : ''}${c.value}${c.magic ? `<small>${c.magic}</small>` : ''}`;
      el.onpointerdown = (e) => { e.preventDefault(); if (selected.has(i)) selected.delete(i); else if (selected.size < 8) selected.add(i); renderHand(); };
      h.appendChild(el);
    });
    const cd = Math.max(0, p1.cdUntil - s.t);
    ($('eng-cd')).style.width = (cd / CFG.COOLDOWN_TICKS * 100) + '%';
    ($('eng-play') as HTMLButtonElement).disabled = cd > 0 || selected.size === 0 || p1.fin;
  }

  function renderBoard(order?: Pid[]) {
    const ranked = order ? order.map((id) => s.players.find((p) => p.id === id)!) : [...s.players].sort((a, b) => b.dist - a.dist);
    const tb = root.querySelector('.eng-board tbody') as HTMLElement;
    tb.innerHTML = '<tr><th>#</th><th>Racer</th><th>Dist</th><th>Pts</th></tr>' +
      ranked.map((p, i) => `<tr><td class="dim">${i + 1}</td><td class="addr"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(${P_VAR[p.id]});margin-right:6px"></i>${nameOf(p.id)}</td><td class="mono">${Math.round(p.dist)}</td><td>${p.total}</td></tr>`).join('');
  }

  // pending player play captured for the CURRENT tick
  let pendingPlay: number[] | null = null;
  ($('eng-play')).onclick = () => {
    const p1 = s.players[0];
    if (s.t < p1.cdUntil || selected.size === 0) return;
    pendingPlay = [...selected].sort((a, b) => a - b).map((i) => p1.hand[i].id); // cardIds
    selected.clear();
  };
  ($('eng-clear')).onclick = () => { selected.clear(); renderHand(); };

  function loop() {
    const play = pendingPlay ?? undefined;
    if (play) plays.push({ round: s.roundIndex, tick: s.t, cardIds: play });
    pendingPlay = null;
    stepTick(s, play);
    renderTrack(); renderHand(); renderBoard();
    if (roundDone(s)) {
      if (loopH) clearInterval(loopH);
      scoreRound(s);
      if (s.finished) return finish();
      setTimeout(beginRound, 900);
    }
  }

  function finish() {
    done = true;
    const ranking = finalRanking(s);
    renderBoard(ranking);
    ($('eng-note')).textContent = 'Match over — settling on-chain…';
    opts.onFinish({ vehicles, plays }, ranking.map((id) => addr[id]));
  }

  beginRound();
  return () => { if (loopH) clearInterval(loopH); if (!done) root.innerHTML = ''; };
}
