/**
 * CAR(D) GAME - WebSocket game server (skeleton).
 *
 * This is the real-time, server-authoritative layer. It wires the Match engine
 * to a tick loop and a WebSocket transport. Clients only send inputs; the server
 * owns all state and broadcasts snapshots.
 *
 * Run: npm install ws && node server.js
 * Protocol (JSON messages):
 *   client -> server: { t:"join", playerId }
 *                     { t:"selectVehicle", vehicle }
 *                     { t:"play", cardIndices:[...] }
 *   server -> client: { t:"state", ... snapshot ... }
 *                     { t:"roundEnd", ranking }
 *                     { t:"gameEnd", finalRanking, settlePayload }
 */
'use strict';
const { Match } = require('./match');
const { CONFIG } = require('./engine');

const TICK_MS = 100;                 // 10 ticks/sec
const TICK = TICK_MS / 1000;

// A single room for demo purposes. Production: a RoomManager keyed by matchId.
class Room {
  constructor(matchId, playerIds, seed, broadcast) {
    this.match = new Match({ matchId, playerIds, seed });
    this.match.dealStart();
    this.broadcast = broadcast;
    this.t = 0;
    this.roundIndex = 0;
    this.pendingVehicles = {};
    this.timer = null;
  }

  beginRound(vehicleChoices) {
    this.match.startRound(this.roundIndex, vehicleChoices);
    this.t = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  handlePlay(playerId, cardIndices) {
    const p = this.match.players.find((x) => x.playerId === playerId);
    if (!p) return { ok: false, reason: 'no_player' };
    return this.match.applyPlay(p, cardIndices, this.t);  // server validates cooldown/hand
  }

  tick() {
    const m = this.match;
    for (const p of m.players) {
      if (p.finished) continue;
      const prev = p.distance;
      const v = m.speed(p, this.t);
      p.distance += v * TICK;
      m.triggerCheckpoints(p, prev, this.t);
      if (p.distance >= CONFIG.TRACK_LENGTH) {
        const need = CONFIG.TRACK_LENGTH - prev;
        const prog = p.distance - prev;
        p.finished = true;
        p.finishTime = +(this.t + TICK * (prog > 0 ? need / prog : 0)).toFixed(3);
        p.distance = CONFIG.TRACK_LENGTH;
      }
    }
    this.broadcast({ t: 'state', round: this.roundIndex + 1, time: +this.t.toFixed(1), players: this.snapshot() });

    const done = m.players.every((p) => p.finished) || this.t >= CONFIG.ROUND_TIMEOUT;
    if (done) {
      clearInterval(this.timer);
      const ranking = m.scoreRound();
      this.broadcast({ t: 'roundEnd', round: this.roundIndex + 1, ranking });
      this.roundIndex += 1;
      if (this.roundIndex >= CONFIG.ROUNDS_PER_MATCH) {
        const finalRanking = m.finalRanking();
        this.broadcast({ t: 'gameEnd', finalRanking, settlePayload: this.settlePayload(finalRanking) });
      }
      // else: wait for next round's vehicle selection from clients
    }
    this.t += TICK;
  }

  snapshot() {
    return this.match.players.map((p) => ({
      playerId: p.playerId, vehicle: p.currentVehicle, distance: +p.distance.toFixed(1),
      speed: +this.match.speed(p, this.t).toFixed(2), handSize: p.hand.length,
      finished: p.finished, finishTime: p.finishTime, cooldown: Math.max(0, +(p.cardCooldownUntil - this.t).toFixed(1)),
    }));
  }

  settlePayload(finalRanking) {
    const rewards = [2.0, 1.0, 0.5, 0.3];
    return {
      matchId: this.match.matchId, seed: this.match.seed,
      ranking: finalRanking.map((x, i) => ({ address: x.playerId, position: i + 1, rewardAVAX: rewards[i] })),
    };
  }
}

// --- Transport (only starts if 'ws' is installed) ---
function startServer(port = 8080) {
  let WebSocketServer;
  try { ({ WebSocketServer } = require('ws')); }
  catch { console.log("Install transport with: npm install ws"); return; }

  const wss = new WebSocketServer({ port });
  const clients = new Set();
  const broadcast = (msg) => { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === 1) c.send(s); };

  const room = new Room('demo-1', ['P1', 'P2', 'P3', 'P4'], 777, broadcast);

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.t === 'play') {
        const res = room.handlePlay(msg.playerId, msg.cardIndices || []);
        ws.send(JSON.stringify({ t: 'playResult', ...res }));
      } else if (msg.t === 'startRound') {
        room.beginRound(msg.vehicleChoices);
      }
    });
    ws.on('close', () => clients.delete(ws));
  });
  console.log(`CAR(D) GAME server listening on ws://localhost:${port}`);
}

if (require.main === module) startServer(process.env.PORT || 8080);
module.exports = { Room, startServer };
