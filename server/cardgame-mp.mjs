/**
 * CAR(D) GAME — real 4-player multiplayer hub (server-authoritative).
 *
 * The server owns the match: it runs the SAME deterministic engine the Next.js
 * settle route re-derives from (server/cardgame-engine.mjs, bundled from
 * lib/cardgame/engine.ts — kept identical by scripts/cardgame-engine-parity.ts),
 * validates every play against live state, and records an action log. At the end
 * it hands (seed, action log) to the on-chain settle, which re-simulates to the
 * exact ranking players saw — so no client can fabricate a result, and any match
 * is independently auditable.
 *
 * On-chain (createMatch / settle) is INJECTED as `chain` so this module is unit-
 * testable headlessly with no wallets. The tick clock is pumped via `tickAll()`
 * (the socket wiring drives it at 10 Hz; tests pump it synchronously).
 *
 * Lifecycle:  reserve → slot → forming → paying → playing(rounds) → settling → done
 */
import {
  initMatch, startRoundMP, stepTickMP, roundDone, scoreRound, finalRanking, speed,
  CFG, PIDS, VEHICLES,
} from './cardgame-engine.mjs';

export const SEATS = 4;
export const SLOT_MS = 300_000; // a scheduled race every 5 minutes (wall clock)
export const PAY_WINDOW_MS = 90_000;      // to pay entry after match found
export const VSELECT_MS = 15_000;         // to pick a vehicle each round
export const RECONNECT_GRACE_MS = 12_000; // seat stays human this long after a drop

const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '?');

/**
 * @param {object} deps
 * @param {(address:string,event:string,data:any)=>void} deps.emitToPlayer
 * @param {(roomId:string,event:string,data:any)=>void} deps.emitToRoom
 * @param {(event:string,data:any)=>void} [deps.emitToAll]
 * @param {{ createMatch:(players:string[])=>Promise<{matchId:string,seed:string,entryFee:string}>,
 *           settle:(matchId:string,input:object)=>Promise<{ranking:string[],txHash?:string}>,
 *           cancelMatch?:(matchId:string)=>Promise<any> }} deps.chain
 * @param {()=>number} [deps.now]
 * @param {(...a:any[])=>void} [deps.log]
 */
export function createCardgameHub(deps) {
  const emitToPlayer = deps.emitToPlayer;
  const emitToRoom = deps.emitToRoom;
  const emitToAll = deps.emitToAll || (() => {});
  const chain = deps.chain;
  const now = deps.now || (() => Number(process.hrtime.bigint() / 1_000_000n));
  const log = deps.log || (() => {});

  /** @type {Map<string,Room>} address → room */
  const byAddress = new Map();
  /** @type {Map<string,Room>} roomId → room */
  const rooms = new Map();
  let roomSeq = 0;

  /** Ordered reservation list for the next scheduled slot. A reservation dies
   *  with its socket (disconnect() drops it) — no ghost seats. */
  const reserved = [];
  let nextSlotAt = 0;

  function slotAfter(t) { return Math.floor(t / SLOT_MS) * SLOT_MS + SLOT_MS; }
  function broadcastSlot() {
    if (!nextSlotAt) nextSlotAt = slotAfter(now());
    emitToAll('cardgame:slot', { startsAt: nextSlotAt, reserved: reserved.length });
  }

  // ── scheduled matchmaking: players reserve, the clock opens the race ──
  function reserve(address) {
    const key = address.toLowerCase();
    if (byAddress.has(key)) return { error: 'already in a match' };
    if (reserved.some((r) => r.address.toLowerCase() === key)) return { error: 'already reserved' };
    reserved.push({ address });
    broadcastSlot();
    return { ok: true, position: reserved.length, startsAt: nextSlotAt };
  }
  function unreserve(address) {
    const key = address.toLowerCase();
    const i = reserved.findIndex((r) => r.address.toLowerCase() === key);
    if (i >= 0) { reserved.splice(i, 1); broadcastSlot(); }
  }

  class Room {
    constructor(players) {
      this.id = 'cgm_' + (++roomSeq);
      this.players = players.map((address, i) => ({
        address, pid: PIDS[i], paid: false, connected: true, droppedAt: 0, bot: false,
      }));
      this.seatOf = new Map(this.players.map((p) => [p.address.toLowerCase(), p]));
      this.state = 'forming';
      this.matchId = null;
      this.seed = null;
      this.entryFee = null;
      this.s = null;                 // engine MatchState (once playing)
      this.round = 0;
      this.roundPhase = 'idle';      // 'vselect' | 'racing'
      this.vselectDeadline = 0;
      this.payDeadline = 0;
      this.pendingPlays = new Map(); // pid → cardIds queued for next tick
      this.choices = {};             // pid → veh (current round)
      // recorded input for the settle re-derivation / audit
      this.log = { vehicles: [], actions: [], botSeats: new Set() };
    }
    seat(address) { return this.seatOf.get(address.toLowerCase()); }
    addrOf(pid) { return this.players.find((p) => p.pid === pid)?.address; }
    botSet() { return new Set(this.players.filter((p) => p.bot).map((p) => p.pid)); }
    publicSeats() {
      return this.players.map((p) => ({ pid: p.pid, address: p.address, bot: p.bot, connected: p.connected }));
    }
  }

  async function formMatch(addresses) {
    const room = new Room(addresses);
    for (const p of room.players) byAddress.set(p.address.toLowerCase(), room);
    rooms.set(room.id, room);
    log('[cardgame] forming', room.id, room.players.map((p) => short(p.address)));
    try {
      const { matchId, seed, entryFee } = await chain.createMatch(room.players.map((p) => p.address));
      room.matchId = matchId; room.seed = seed; room.entryFee = entryFee;
      room.state = 'paying';
      room.payDeadline = now() + PAY_WINDOW_MS;
      for (const p of room.players) {
        emitToPlayer(p.address, 'cardgame:match-found', {
          roomId: room.id, matchId, entryFee, seat: p.pid, seats: room.publicSeats(),
          payWindowMs: PAY_WINDOW_MS,
        });
      }
    } catch (e) {
      log('[cardgame] createMatch failed', e?.message);
      for (const p of room.players) emitToPlayer(p.address, 'cardgame:error', { error: 'match open failed — you stay reserved for the next race' });
      destroyRoom(room);
      for (const p of [...room.players].reverse()) reserved.unshift({ address: p.address });
      broadcastSlot();
    }
  }

  // ── payment → start ────────────────────────────────────────────────
  function markPaid(address) {
    const room = byAddress.get(address.toLowerCase());
    if (!room || room.state !== 'paying') return { error: 'no match awaiting payment' };
    const st = room.seat(address); if (!st) return { error: 'not in match' };
    st.paid = true;
    emitToRoom(room.id, 'cardgame:paid-update', { paid: room.players.filter((p) => p.paid).length, seats: SEATS });
    if (room.players.every((p) => p.paid)) startPlaying(room);
    return { ok: true };
  }

  function startPlaying(room) {
    room.state = 'playing';
    room.s = initMatch(room.seed);
    room.round = 0;
    emitToRoom(room.id, 'cardgame:locked', { matchId: room.matchId, seed: room.seed, seats: room.publicSeats() });
    beginRound(room);
  }

  function beginRound(room) {
    room.roundPhase = 'vselect';
    room.choices = {};
    room.vselectDeadline = now() + VSELECT_MS;
    const used = {};
    for (const p of room.players) used[p.pid] = { ...room.s.usedVeh[p.pid] };
    for (const p of room.players) {
      const remaining = VEHICLES.filter((v) => !room.s.usedVeh[p.pid][v]);
      emitToPlayer(p.address, 'cardgame:vehicle-select', { round: room.round, remaining, deadlineMs: VSELECT_MS });
    }
  }

  function chooseVehicle(address, veh) {
    const room = byAddress.get(address.toLowerCase());
    if (!room || room.roundPhase !== 'vselect') return { error: 'not selecting' };
    const st = room.seat(address); if (!st) return { error: 'not in match' };
    const remaining = VEHICLES.filter((v) => !room.s.usedVeh[st.pid][v]);
    if (!remaining.includes(veh)) return { error: 'vehicle unavailable' };
    room.choices[st.pid] = veh;
    emitToRoom(room.id, 'cardgame:vehicle-picked', { pid: st.pid, chosen: room.choices });
    if (PIDS.filter((pid) => room.players.find((p) => p.pid === pid && !p.bot)).every((pid) => room.choices[pid])) {
      lockRound(room);
    }
    return { ok: true };
  }

  function lockRound(room) {
    // any missing/bot seat falls back to first-available inside startRoundMP
    const resolved = startRoundMP(room.s, room.choices);
    room.log.vehicles.push({ ...resolved });
    room.roundPhase = 'racing';
    room.pendingPlays.clear();
    emitToRoom(room.id, 'cardgame:round-start', {
      round: room.round, vehicles: resolved, seats: room.publicSeats(),
    });
    broadcastState(room, {});
    pushHands(room);
  }

  function submitPlay(address, cardIds) {
    const room = byAddress.get(address.toLowerCase());
    if (!room || room.roundPhase !== 'racing') return { error: 'not racing' };
    const st = room.seat(address); if (!st || st.bot) return { error: 'not a live seat' };
    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 8) return { error: 'bad play' };
    room.pendingPlays.set(st.pid, cardIds.map(Number));
    return { ok: true };
  }

  // ── the authoritative tick (pumped by tickAll) ─────────────────────
  function stepRoom(room) {
    if (room.state !== 'playing') return;
    // vehicle-select timeout → auto-pick for stragglers, then lock
    if (room.roundPhase === 'vselect') {
      if (now() >= room.vselectDeadline) lockRound(room);
      return;
    }
    if (room.roundPhase !== 'racing') return;

    const s = room.s;
    const acts = {};
    for (const [pid, cardIds] of room.pendingPlays) acts[pid] = cardIds;
    room.pendingPlays.clear();
    const botSeats = room.botSet();
    const res = stepTickMP(s, acts, botSeats);
    // record only ACCEPTED plays (illegal ones returned null → notify, drop)
    for (const pid of PIDS) {
      if (acts[pid]) {
        if (res[pid]) room.log.actions.push({ pid, round: room.round, tick: s.t - 1, cardIds: acts[pid] });
        else emitToPlayer(room.addrOf(pid), 'cardgame:rejected', { reason: 'illegal play', tick: s.t - 1 });
      }
    }
    broadcastState(room, res);
    if (res && Object.values(res).some(Boolean)) pushHands(room);

    if (roundDone(s)) {
      const order = scoreRound(s);
      emitToRoom(room.id, 'cardgame:round-end', {
        round: room.round, order, totals: Object.fromEntries(s.players.map((p) => [p.pid, p.total])),
      });
      room.round += 1;
      if (s.finished) return void finishRoom(room);
      // brief pause handled by client; server proceeds to next vselect
      beginRound(room);
    }
  }

  function broadcastState(room, applied) {
    const s = room.s;
    emitToRoom(room.id, 'cardgame:state', {
      round: room.round, t: s.t,
      players: s.players.map((p) => ({
        pid: p.id, address: room.addrOf(p.id), veh: p.veh, dist: Math.round(p.dist),
        speed: +speed(s, p).toFixed(2), fin: p.fin, ft: p.ft, total: p.total,
        cd: Math.max(0, p.cdUntil - s.t), fx: p.fx && s.t < p.fxUntil ? p.fx : null,
        bot: room.players.find((q) => q.pid === p.id)?.bot || false,
      })),
      applied: Object.fromEntries(Object.entries(applied || {}).filter(([, v]) => v).map(([pid, v]) => [pid, { combo: v.combo, mult: +v.mult.toFixed(2), fx: null }])),
    });
  }

  function pushHands(room) {
    const s = room.s;
    for (const p of room.players) {
      if (p.bot) continue;
      const seat = s.players.find((x) => x.id === p.pid);
      emitToPlayer(p.address, 'cardgame:hand', {
        pid: p.pid, hlim: seat.hlim,
        hand: seat.hand.map((c) => ({ id: c.id, value: c.value, type: c.type, magic: c.magic })),
        cd: Math.max(0, seat.cdUntil - s.t),
      });
    }
  }

  async function finishRoom(room) {
    room.state = 'settling';
    const ranking = finalRanking(room.s);
    const input = { vehicles: room.log.vehicles, actions: room.log.actions, botSeats: [...room.botSet()] };
    emitToRoom(room.id, 'cardgame:finished', {
      ranking, rankingAddresses: ranking.map((pid) => room.addrOf(pid)),
      totals: Object.fromEntries(room.s.players.map((p) => [p.pid, p.total])),
    });
    try {
      const settled = await chain.settle(room.matchId, input);
      emitToRoom(room.id, 'cardgame:settled', { ranking: settled.ranking, txHash: settled.txHash, matchId: room.matchId });
    } catch (e) {
      log('[cardgame] settle failed', e?.message);
      emitToRoom(room.id, 'cardgame:error', { error: 'settlement failed — funds recoverable via on-chain refund window' });
    }
    room.state = 'done';
    setTimeout(() => destroyRoom(room), 5_000);
  }

  // ── disconnects / reconnect grace ──────────────────────────────────
  function disconnect(address) {
    unreserve(address);
    const room = byAddress.get(address.toLowerCase());
    if (!room) return;
    const st = room.seat(address); if (!st) return;
    st.connected = false; st.droppedAt = now();
    emitToRoom(room.id, 'cardgame:seat-dropped', { pid: st.pid, graceMs: RECONNECT_GRACE_MS });
    if (room.state === 'paying') {
      // pre-lock drop cancels the match; whoever already paid gets an instant
      // on-chain refund credit and stays reserved for the next race
      cancelPaying(room, 'a player left before lock');
    }
  }
  function reconnect(address) {
    const room = byAddress.get(address.toLowerCase());
    if (!room) return { error: 'no active match' };
    const st = room.seat(address); if (!st) return { error: 'not in match' };
    st.connected = true; st.droppedAt = 0;
    // a bot-converted seat cannot be reclaimed mid-round (determinism), but a
    // still-human dropped seat resumes cleanly.
    emitToRoom(room.id, 'cardgame:seat-rejoined', { pid: st.pid, bot: st.bot });
    return { ok: true, roomId: room.id, state: room.state, seat: st.pid, matchId: room.matchId };
  }

  /** Cancel a room still in 'paying': flips the on-chain match to Cancelled so
   *  payers can withdraw instantly, and puts CONNECTED payers back at the front
   *  of the reservation list for the next slot. */
  function cancelPaying(room, reason) {
    const payers = room.players.filter((p) => p.paid && p.connected).map((p) => p.address);
    if (room.matchId && chain.cancelMatch) {
      Promise.resolve(chain.cancelMatch(room.matchId)).catch((e) => log('[cardgame] cancelMatch failed', e?.message));
    }
    cancelRoom(room, reason);
    for (const a of payers.reverse()) reserved.unshift({ address: a });
    broadcastSlot();
  }

  function cancelRoom(room, reason) {
    if (room.state === 'done' || room.state === 'cancelled') return;
    room.state = 'cancelled';
    emitToRoom(room.id, 'cardgame:cancelled', { reason });
    destroyRoom(room);
  }
  function destroyRoom(room) {
    for (const p of room.players) if (byAddress.get(p.address.toLowerCase()) === room) byAddress.delete(p.address.toLowerCase());
    rooms.delete(room.id);
  }

  // ── periodic sweeps (slot boundary + pay window + reconnect grace) ──
  function sweep() {
    const t = now();
    // scheduled slots: at each 5-min boundary, the first four reservations race
    if (!nextSlotAt) nextSlotAt = slotAfter(t);
    if (t >= nextSlotAt) {
      if (reserved.length >= SEATS) {
        const group = reserved.splice(0, SEATS).map((g) => g.address);
        void formMatch(group);
      }
      nextSlotAt = slotAfter(t);
      broadcastSlot();
    }
    for (const room of rooms.values()) {
      if (room.state === 'paying' && t >= room.payDeadline) {
        cancelPaying(room, 'not all players paid in time');
      } else if (room.state === 'playing') {
        for (const p of room.players) {
          if (!p.connected && !p.bot && p.droppedAt && t - p.droppedAt >= RECONNECT_GRACE_MS) {
            p.bot = true;
            emitToRoom(room.id, 'cardgame:seat-botted', { pid: p.pid });
          }
        }
      }
    }
  }

  // pump one tick across all playing rooms (called at 10 Hz by the socket wiring)
  function tickAll() { for (const room of rooms.values()) stepRoom(room); }

  return {
    reserve, unreserve, markPaid, chooseVehicle, submitPlay, disconnect, reconnect,
    tickAll, sweep, broadcastSlot,
    _rooms: rooms, _reserved: reserved, _byAddress: byAddress, Room,
    stats: () => ({ reserved: reserved.length, rooms: rooms.size }),
  };
}
