/**
 * CAR(D) GAME multiplayer — Socket.io wiring for the frostbite-mp server.
 *
 * Glues the transport-agnostic hub (cardgame-mp.mjs) to socket.io and to the
 * Next.js on-chain routes. On-chain create/settle live in Next (which holds the
 * operator key); this server only runs the authoritative game loop and calls
 * Next server-to-server with the shared CARDGAME_MP_SECRET. This server holds NO
 * keys. Add to multiplayer-server.mjs:  registerCardgame(io)
 *
 * Env:
 *   CARDGAME_MP_SECRET   shared secret for the Next mp/create + mp/settle routes
 *   CARDGAME_NEXT_BASE   e.g. http://127.0.0.1:3000/avalanche  (default)
 */
import { ethers } from 'ethers';
import { createCardgameHub } from './cardgame-mp.mjs';

const NEXT_BASE = process.env.CARDGAME_NEXT_BASE || 'http://127.0.0.1:3000/avalanche';

function verifyQueueSig(address, nonce, sig) {
  try {
    const msg = `Frostbite CAR(D) GAME — queue\naddress: ${String(address).toLowerCase()}\nnonce: ${nonce}`;
    return ethers.verifyMessage(msg, sig).toLowerCase() === String(address).toLowerCase();
  } catch { return false; }
}

export function registerCardgame(io) {
  const secret = process.env.CARDGAME_MP_SECRET;
  if (!secret) { console.warn('[cardgame] CARDGAME_MP_SECRET unset — multiplayer disabled'); return null; }

  const headers = { 'content-type': 'application/json', 'x-cardgame-mp-secret': secret };
  const chain = {
    async createMatch(players) {
      const salt = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const r = await fetch(`${NEXT_BASE}/api/cardgame/mp/create`, { method: 'POST', headers, body: JSON.stringify({ players, salt }) });
      if (!r.ok) throw new Error(`mp/create ${r.status}`);
      return r.json(); // { matchId, seed, entryFee }
    },
    async settle(matchId, input) {
      const r = await fetch(`${NEXT_BASE}/api/cardgame/mp/settle`, { method: 'POST', headers, body: JSON.stringify({ matchId, input }) });
      if (!r.ok) throw new Error(`mp/settle ${r.status}`);
      return r.json(); // { ranking, txHash }
    },
  };

  const addr2sock = new Map(); // addressLower → socket

  const hub = createCardgameHub({
    emitToPlayer: (address, event, data) => {
      const sock = addr2sock.get(String(address).toLowerCase());
      if (!sock) return;
      if (event === 'cardgame:match-found' && data && data.roomId) sock.join(data.roomId);
      sock.emit(event, data);
    },
    emitToRoom: (roomId, event, data) => io.to(roomId).emit(event, data),
    chain,
    now: () => Date.now(),
    log: (...a) => console.log(...a),
  });

  io.on('connection', (socket) => {
    const bind = (address) => { socket.data.cgAddr = address; addr2sock.set(address.toLowerCase(), socket); };
    const me = () => socket.data.cgAddr;

    socket.on('cardgame:queue', (d = {}) => {
      const { address, nonce, sig } = d;
      if (!address || !ethers.isAddress(address)) return socket.emit('cardgame:error', { error: 'valid address required' });
      if (!Number.isInteger(nonce) || !sig || !verifyQueueSig(address, nonce, sig)) {
        return socket.emit('cardgame:error', { error: 'sign to queue (wallet ownership)' });
      }
      bind(address);
      const res = hub.enqueue(address);
      if (res?.error) socket.emit('cardgame:error', { error: res.error });
    });

    socket.on('cardgame:leave', () => { const a = me(); if (a) { hub.dequeue(a); hub.disconnect(a); } });
    socket.on('cardgame:paid', () => { const a = me(); if (a) { const r = hub.markPaid(a); if (r?.error) socket.emit('cardgame:error', r); } });
    socket.on('cardgame:vehicle', (d = {}) => { const a = me(); if (a && d.veh) { const r = hub.chooseVehicle(a, d.veh); if (r?.error) socket.emit('cardgame:error', r); } });
    socket.on('cardgame:play', (d = {}) => { const a = me(); if (a && Array.isArray(d.cardIds)) { const r = hub.submitPlay(a, d.cardIds); if (r?.error) socket.emit('cardgame:rejected', r); } });

    socket.on('cardgame:reconnect', (d = {}) => {
      const { address, nonce, sig } = d;
      if (!address || !ethers.isAddress(address) || !Number.isInteger(nonce) || !sig || !verifyQueueSig(address, nonce, sig)) {
        return socket.emit('cardgame:error', { error: 'sign to reconnect' });
      }
      const res = hub.reconnect(address);
      if (res?.error) return socket.emit('cardgame:error', res);
      bind(address); socket.join(res.roomId); socket.emit('cardgame:resumed', res);
    });

    socket.on('disconnect', () => {
      const a = me();
      if (!a) return;
      if (addr2sock.get(a.toLowerCase()) === socket) addr2sock.delete(a.toLowerCase());
      hub.disconnect(a);
    });
  });

  const tickTimer = setInterval(() => hub.tickAll(), 100);
  const sweepTimer = setInterval(() => hub.sweep(), 2_000);
  tickTimer.unref?.(); sweepTimer.unref?.();
  console.log('[cardgame] multiplayer hub registered (Next base:', NEXT_BASE + ')');
  return hub;
}
