// ─── Frostbite Multiplayer Server ───
// Socket.io server for presence, chat, PvP, and trade
import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.MP_PORT || 4001;

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', players: players.size, guilds: guilds.size, rooms: getRoomStats() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: ['https://frostbite.pro', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e5, // 100KB max message
});

// ─── Player Registry ───
const players = new Map(); // socketId → PlayerData
const walletToSocket = new Map(); // walletAddress → socketId

// ─── Room (Zone) Management ───
const VALID_ZONES = ['world', 'town', 'forest', 'dungeon', 'icecave', 'volcano'];

function getRoomStats() {
  const stats = {};
  for (const zone of VALID_ZONES) {
    const room = io.sockets.adapter.rooms.get(zone);
    stats[zone] = room ? room.size : 0;
  }
  return stats;
}

function getPlayersInRoom(zone) {
  const result = [];
  const room = io.sockets.adapter.rooms.get(zone);
  if (!room) return result;
  for (const sid of room) {
    const p = players.get(sid);
    if (p) result.push({ ...p, socketId: undefined }); // Don't leak socketId
  }
  return result;
}

// ─── PvP State ───
const pvpChallenges = new Map(); // challengeId → { from, to, timestamp }
const pvpBattles = new Map(); // battleId → BattleState

// ─── Trade State ───
const tradeOffers = new Map(); // tradeId → TradeState

// ─── Guild State ───
const guilds = new Map(); // guildId → GuildData
const walletToGuild = new Map(); // wallet → guildId (quick lookup)
const guildInvites = new Map(); // inviteId → { guildId, targetWallet, targetSocketId, from, fromName, timestamp }
const guildKickCooldowns = new Map(); // wallet → timestamp (can't rejoin for 1 hour)

const GUILD_LEVELS = [
  { level: 1, xpRequired: 0, maxMembers: 20 },
  { level: 2, xpRequired: 500, maxMembers: 30 },
  { level: 3, xpRequired: 1500, maxMembers: 40 },
  { level: 4, xpRequired: 3000, maxMembers: 50 },
  { level: 5, xpRequired: 5000, maxMembers: 75 },
];

function getGuildLevel(xp) {
  let result = GUILD_LEVELS[0];
  for (const tier of GUILD_LEVELS) {
    if (xp >= tier.xpRequired) result = tier;
  }
  return result;
}

function getOnlineGuildMembers(guildId) {
  const guild = guilds.get(guildId);
  if (!guild) return [];
  const sockets = [];
  for (const [wallet] of guild.members) {
    const sid = walletToSocket.get(wallet);
    if (sid) {
      const s = io.sockets.sockets.get(sid);
      if (s) sockets.push(s);
    }
  }
  return sockets;
}

function broadcastGuildUpdate(guildId, event, data) {
  for (const s of getOnlineGuildMembers(guildId)) {
    s.emit(event, data);
  }
}

// ─── Rate limiting ───
const rateLimits = new Map(); // socketId → { action: timestamp }
function rateLimit(socketId, action, intervalMs) {
  const key = `${socketId}:${action}`;
  const now = Date.now();
  const last = rateLimits.get(key) || 0;
  if (now - last < intervalMs) return false;
  rateLimits.set(key, now);
  return true;
}

// ─── Connection Handler ───
io.on('connection', (socket) => {
  console.log(`[MP] Connect: ${socket.id}`);

  // ── Auth / Register ──
  socket.on('register', (data) => {
    if (!data?.wallet || !data?.name || !data?.playerClass) return;

    // Prevent duplicate wallet connections
    const existingSocket = walletToSocket.get(data.wallet);
    if (existingSocket && existingSocket !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existingSocket);
      if (oldSocket) {
        oldSocket.emit('kicked', { reason: 'Connected from another session' });
        oldSocket.disconnect(true);
      }
    }

    const playerData = {
      id: socket.id,
      wallet: String(data.wallet).slice(0, 42),
      name: String(data.name).slice(0, 20),
      playerClass: ['knight', 'mage', 'archer'].includes(data.playerClass) ? data.playerClass : 'knight',
      level: Math.min(999, Math.max(1, parseInt(data.level) || 1)),
      skinColor: parseInt(data.skinColor) || 0xffddbb,
      hairColor: parseInt(data.hairColor) || 0x443322,
      zone: null,
      tx: 0,
      ty: 0,
      facing: 'down',
    };

    // Attach guild tag if player is in a guild
    const existingGuildId = walletToGuild.get(playerData.wallet);
    if (existingGuildId) {
      const guild = guilds.get(existingGuildId);
      if (guild) playerData.guildTag = guild.tag;
    }

    players.set(socket.id, playerData);
    walletToSocket.set(data.wallet, socket.id);
    socket.emit('registered', { id: socket.id, guildId: existingGuildId || null });
    console.log(`[MP] Registered: ${playerData.name} (${playerData.wallet.slice(0, 8)}...)`);
  });

  // ── Join Zone ──
  socket.on('join-zone', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.zone || !VALID_ZONES.includes(data.zone)) return;

    // Leave previous zone
    if (player.zone) {
      socket.leave(player.zone);
      socket.to(player.zone).emit('player-left', { id: socket.id, wallet: player.wallet });
    }

    // Join new zone
    player.zone = data.zone;
    player.tx = parseInt(data.tx) || 0;
    player.ty = parseInt(data.ty) || 0;
    socket.join(data.zone);

    // Send existing players in this zone to the new player
    const existingPlayers = getPlayersInRoom(data.zone).filter(p => p.id !== socket.id);
    socket.emit('zone-players', existingPlayers);

    // Broadcast new player to others in the zone
    socket.to(data.zone).emit('player-joined', {
      id: socket.id,
      wallet: player.wallet,
      name: player.name,
      guildTag: player.guildTag || null,
      playerClass: player.playerClass,
      level: player.level,
      skinColor: player.skinColor,
      hairColor: player.hairColor,
      tx: player.tx,
      ty: player.ty,
      facing: player.facing,
    });

    console.log(`[MP] ${player.name} joined ${data.zone}`);
  });

  // ── Position Update ──
  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.zone) return;
    if (!rateLimit(socket.id, 'move', 80)) return; // Max ~12 updates/sec

    player.tx = parseInt(data.tx) || player.tx;
    player.ty = parseInt(data.ty) || player.ty;
    player.facing = data.facing || player.facing;

    socket.to(player.zone).volatile.emit('player-moved', {
      id: socket.id,
      tx: player.tx,
      ty: player.ty,
      facing: player.facing,
    });
  });

  // ── Chat ──
  socket.on('chat', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.zone) return;
    if (!data?.message || typeof data.message !== 'string') return;
    if (!rateLimit(socket.id, 'chat', 1000)) return; // 1 msg/sec

    const message = data.message.slice(0, 150); // Max 150 chars

    // Emote handling
    if (message.startsWith('/emote ')) {
      const emote = message.slice(7).trim().slice(0, 20);
      io.to(player.zone).emit('player-emote', {
        id: socket.id,
        name: player.name,
        emote,
      });
      return;
    }

    io.to(player.zone).emit('chat-message', {
      id: socket.id,
      name: player.name,
      message,
      timestamp: Date.now(),
    });
  });

  // ── PvP Challenge ──
  socket.on('pvp-challenge', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.zone) return;
    if (!data?.targetId) return;
    if (!rateLimit(socket.id, 'pvp', 5000)) return; // 1 challenge per 5s

    const target = players.get(data.targetId);
    if (!target || target.zone !== player.zone) return;

    const challengeId = `pvp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pvpChallenges.set(challengeId, {
      from: socket.id,
      to: data.targetId,
      fromName: player.name,
      toName: target.name,
      timestamp: Date.now(),
    });

    // Send challenge to target
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('pvp-challenged', {
        challengeId,
        from: socket.id,
        name: player.name,
        level: player.level,
        playerClass: player.playerClass,
      });
    }

    socket.emit('pvp-challenge-sent', { challengeId, targetName: target.name });

    // Expire challenge after 30s
    setTimeout(() => {
      if (pvpChallenges.has(challengeId)) {
        pvpChallenges.delete(challengeId);
        socket.emit('pvp-challenge-expired', { challengeId });
      }
    }, 30000);
  });

  // ── PvP Accept ──
  socket.on('pvp-accept', (data) => {
    const challenge = pvpChallenges.get(data?.challengeId);
    if (!challenge || challenge.to !== socket.id) return;
    pvpChallenges.delete(data.challengeId);

    const p1 = players.get(challenge.from);
    const p2 = players.get(challenge.to);
    if (!p1 || !p2) return;

    const battleId = `battle_${Date.now()}`;
    const battleState = {
      id: battleId,
      players: {
        [challenge.from]: { ...p1, hp: 100, maxHp: 100, mp: 30, maxMp: 30, ready: false },
        [challenge.to]: { ...p2, hp: 100, maxHp: 100, mp: 30, maxMp: 30, ready: false },
      },
      turn: null, // Set when both ready
      turnCount: 0,
      status: 'preparing', // preparing → active → finished
      actions: [],
      startedAt: Date.now(),
    };
    pvpBattles.set(battleId, battleState);

    // Notify both players
    const s1 = io.sockets.sockets.get(challenge.from);
    const s2 = io.sockets.sockets.get(challenge.to);
    const battleInfo = { battleId, opponent: {} };

    if (s1) {
      s1.emit('pvp-start', { ...battleInfo, opponent: { name: p2.name, level: p2.level, playerClass: p2.playerClass } });
    }
    if (s2) {
      s2.emit('pvp-start', { ...battleInfo, opponent: { name: p1.name, level: p1.level, playerClass: p1.playerClass } });
    }

    console.log(`[PvP] Battle started: ${p1.name} vs ${p2.name}`);
  });

  // ── PvP Decline ──
  socket.on('pvp-decline', (data) => {
    const challenge = pvpChallenges.get(data?.challengeId);
    if (!challenge || challenge.to !== socket.id) return;
    pvpChallenges.delete(data.challengeId);

    const challenger = io.sockets.sockets.get(challenge.from);
    if (challenger) {
      challenger.emit('pvp-declined', { challengeId: data.challengeId });
    }
  });

  // ── PvP Ready (send stats for battle) ──
  socket.on('pvp-ready', (data) => {
    const battle = pvpBattles.get(data?.battleId);
    if (!battle || !battle.players[socket.id]) return;

    const bp = battle.players[socket.id];
    bp.hp = Math.min(9999, Math.max(1, parseInt(data.hp) || 100));
    bp.maxHp = bp.hp;
    bp.mp = Math.min(999, Math.max(0, parseInt(data.mp) || 30));
    bp.maxMp = bp.mp;
    bp.atk = Math.min(999, Math.max(1, parseInt(data.atk) || 10));
    bp.def = Math.min(999, Math.max(1, parseInt(data.def) || 5));
    bp.spd = Math.min(999, Math.max(1, parseInt(data.spd) || 5));
    bp.ready = true;

    // Check if both ready
    const pIds = Object.keys(battle.players);
    if (pIds.every(id => battle.players[id].ready)) {
      battle.status = 'active';
      // Determine first turn by SPD
      const [id1, id2] = pIds;
      battle.turn = battle.players[id1].spd >= battle.players[id2].spd ? id1 : id2;
      battle.turnCount = 1;

      // Send battle state to both players
      for (const pid of pIds) {
        const opId = pIds.find(x => x !== pid);
        const s = io.sockets.sockets.get(pid);
        if (s) {
          s.emit('pvp-battle-state', {
            battleId: data.battleId,
            yourTurn: battle.turn === pid,
            you: sanitizeBattlePlayer(battle.players[pid]),
            opponent: sanitizeBattlePlayer(battle.players[opId]),
            turnCount: battle.turnCount,
          });
        }
      }
    }
  });

  // ── PvP Action ──
  socket.on('pvp-action', (data) => {
    const battle = pvpBattles.get(data?.battleId);
    if (!battle || battle.status !== 'active') return;
    if (battle.turn !== socket.id) return; // Not your turn
    if (!data?.action) return;

    const pIds = Object.keys(battle.players);
    const attacker = battle.players[socket.id];
    const defenderId = pIds.find(x => x !== socket.id);
    const defender = battle.players[defenderId];

    // Process action
    const result = processPvpAction(data.action, attacker, defender, data);
    battle.actions.push({ turn: battle.turnCount, player: socket.id, ...result });

    // Check for battle end
    if (defender.hp <= 0) {
      battle.status = 'finished';
      const winner = socket.id;
      const loser = defenderId;

      for (const pid of pIds) {
        const s = io.sockets.sockets.get(pid);
        if (s) {
          s.emit('pvp-result', {
            battleId: data.battleId,
            won: pid === winner,
            action: result,
            you: sanitizeBattlePlayer(battle.players[pid]),
            opponent: sanitizeBattlePlayer(battle.players[pid === winner ? loser : winner]),
          });
        }
      }
      pvpBattles.delete(data.battleId);
      console.log(`[PvP] ${attacker.name} defeated ${defender.name}`);
      return;
    }

    // Switch turn
    battle.turn = defenderId;
    battle.turnCount++;

    // Send updated state
    for (const pid of pIds) {
      const opId = pIds.find(x => x !== pid);
      const s = io.sockets.sockets.get(pid);
      if (s) {
        s.emit('pvp-battle-state', {
          battleId: data.battleId,
          yourTurn: battle.turn === pid,
          you: sanitizeBattlePlayer(battle.players[pid]),
          opponent: sanitizeBattlePlayer(battle.players[opId]),
          turnCount: battle.turnCount,
          lastAction: result,
        });
      }
    }
  });

  // ── Trade Request ──
  socket.on('trade-request', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.zone) return;
    if (!data?.targetId) return;
    if (!rateLimit(socket.id, 'trade', 5000)) return;

    const target = players.get(data.targetId);
    if (!target || target.zone !== player.zone) return;

    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    tradeOffers.set(tradeId, {
      from: socket.id,
      to: data.targetId,
      fromOffer: { items: [], gold: 0 },
      toOffer: { items: [], gold: 0 },
      fromConfirmed: false,
      toConfirmed: false,
      status: 'pending',
    });

    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('trade-requested', {
        tradeId,
        from: socket.id,
        name: player.name,
        level: player.level,
      });
    }

    socket.emit('trade-request-sent', { tradeId, targetName: target.name });

    // Expire after 30s
    setTimeout(() => {
      const trade = tradeOffers.get(tradeId);
      if (trade && trade.status === 'pending') {
        tradeOffers.delete(tradeId);
        socket.emit('trade-expired', { tradeId });
      }
    }, 30000);
  });

  // ── Trade Accept ──
  socket.on('trade-accept', (data) => {
    const trade = tradeOffers.get(data?.tradeId);
    if (!trade || trade.to !== socket.id || trade.status !== 'pending') return;
    trade.status = 'active';

    const s1 = io.sockets.sockets.get(trade.from);
    const s2 = io.sockets.sockets.get(trade.to);
    if (s1) s1.emit('trade-opened', { tradeId: data.tradeId });
    if (s2) s2.emit('trade-opened', { tradeId: data.tradeId });
  });

  // ── Trade Decline ──
  socket.on('trade-decline', (data) => {
    const trade = tradeOffers.get(data?.tradeId);
    if (!trade || trade.to !== socket.id) return;
    tradeOffers.delete(data.tradeId);

    const s1 = io.sockets.sockets.get(trade.from);
    if (s1) s1.emit('trade-declined', { tradeId: data.tradeId });
  });

  // ── Trade Update Offer ──
  socket.on('trade-offer', (data) => {
    const trade = tradeOffers.get(data?.tradeId);
    if (!trade || trade.status !== 'active') return;
    if (socket.id !== trade.from && socket.id !== trade.to) return;

    const side = socket.id === trade.from ? 'fromOffer' : 'toOffer';
    const confirmedKey = socket.id === trade.from ? 'fromConfirmed' : 'toConfirmed';

    trade[side] = {
      items: Array.isArray(data.items) ? data.items.slice(0, 12) : [],
      gold: Math.max(0, parseInt(data.gold) || 0),
    };
    // Reset confirmations when offer changes
    trade.fromConfirmed = false;
    trade.toConfirmed = false;

    // Notify other party
    const otherSid = socket.id === trade.from ? trade.to : trade.from;
    const otherSocket = io.sockets.sockets.get(otherSid);
    if (otherSocket) {
      otherSocket.emit('trade-updated', {
        tradeId: data.tradeId,
        theirOffer: trade[side],
        confirmed: false,
      });
    }
  });

  // ── Trade Confirm ──
  socket.on('trade-confirm', (data) => {
    const trade = tradeOffers.get(data?.tradeId);
    if (!trade || trade.status !== 'active') return;

    const confirmedKey = socket.id === trade.from ? 'fromConfirmed' : 'toConfirmed';
    trade[confirmedKey] = true;

    const otherSid = socket.id === trade.from ? trade.to : trade.from;
    const otherSocket = io.sockets.sockets.get(otherSid);
    if (otherSocket) {
      otherSocket.emit('trade-partner-confirmed', { tradeId: data.tradeId });
    }

    // Both confirmed → execute trade
    if (trade.fromConfirmed && trade.toConfirmed) {
      trade.status = 'completed';

      const s1 = io.sockets.sockets.get(trade.from);
      const s2 = io.sockets.sockets.get(trade.to);

      if (s1) s1.emit('trade-complete', { tradeId: data.tradeId, received: trade.toOffer });
      if (s2) s2.emit('trade-complete', { tradeId: data.tradeId, received: trade.fromOffer });

      tradeOffers.delete(data.tradeId);
      console.log(`[Trade] Completed: ${players.get(trade.from)?.name} ↔ ${players.get(trade.to)?.name}`);
    }
  });

  // ── Trade Cancel ──
  socket.on('trade-cancel', (data) => {
    const trade = tradeOffers.get(data?.tradeId);
    if (!trade) return;
    if (socket.id !== trade.from && socket.id !== trade.to) return;

    tradeOffers.delete(data.tradeId);
    const otherSid = socket.id === trade.from ? trade.to : trade.from;
    const otherSocket = io.sockets.sockets.get(otherSid);
    if (otherSocket) otherSocket.emit('trade-cancelled', { tradeId: data.tradeId });
  });

  // ══════════════════════════════════════════════
  // ── Guild System ──
  // ══════════════════════════════════════════════

  // ── Guild Create ──
  socket.on('guild-create', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!rateLimit(socket.id, 'guild-create', 60000)) return;
    if (!data?.name || !data?.tag) return;

    const name = String(data.name).trim();
    const tag = String(data.tag).trim().toUpperCase();

    // Validate name: 3-20 chars
    if (name.length < 3 || name.length > 20) {
      socket.emit('guild-error', { message: 'Guild name must be 3-20 characters' });
      return;
    }
    // Validate tag: 3-4 alphanumeric
    if (!/^[A-Z0-9]{3,4}$/.test(tag)) {
      socket.emit('guild-error', { message: 'Guild tag must be 3-4 alphanumeric characters' });
      return;
    }
    // Player already in a guild
    if (walletToGuild.has(player.wallet)) {
      socket.emit('guild-error', { message: 'You are already in a guild' });
      return;
    }
    // Check unique name (case-insensitive) and tag
    for (const [, g] of guilds) {
      if (g.name.toLowerCase() === name.toLowerCase()) {
        socket.emit('guild-error', { message: 'Guild name already taken' });
        return;
      }
      if (g.tag === tag) {
        socket.emit('guild-error', { message: 'Guild tag already taken' });
        return;
      }
    }

    const guildId = `guild_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const guild = {
      name,
      tag,
      leader: player.wallet,
      officers: new Set(),
      members: new Map([[player.wallet, {
        name: player.name,
        level: player.level,
        playerClass: player.playerClass,
        joinedAt: Date.now(),
        contribution: 0,
      }]]),
      level: 1,
      xp: 0,
      treasury: 0,
      motd: '',
      createdAt: Date.now(),
      maxMembers: 20,
    };

    guilds.set(guildId, guild);
    walletToGuild.set(player.wallet, guildId);
    player.guildTag = tag;

    socket.emit('guild-created', { guildId, name, tag });
    console.log(`[Guild] ${player.name} created guild "${name}" [${tag}]`);
  });

  // ── Guild Invite ──
  socket.on('guild-invite', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!rateLimit(socket.id, 'guild-invite', 5000)) return;
    if (!data?.targetId) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) {
      socket.emit('guild-error', { message: 'You are not in a guild' });
      return;
    }
    const guild = guilds.get(guildId);
    if (!guild) return;

    // Only leader or officer can invite
    if (guild.leader !== player.wallet && !guild.officers.has(player.wallet)) {
      socket.emit('guild-error', { message: 'Only leader or officers can invite' });
      return;
    }

    const target = players.get(data.targetId);
    if (!target) {
      socket.emit('guild-error', { message: 'Player not found' });
      return;
    }

    // Target already in a guild
    if (walletToGuild.has(target.wallet)) {
      socket.emit('guild-error', { message: 'Player is already in a guild' });
      return;
    }

    // Check kick cooldown
    const kickedUntil = guildKickCooldowns.get(`${target.wallet}:${guildId}`);
    if (kickedUntil && Date.now() < kickedUntil) {
      socket.emit('guild-error', { message: 'Player was recently kicked and cannot rejoin yet' });
      return;
    }

    // Check max members
    const tierInfo = getGuildLevel(guild.xp);
    if (guild.members.size >= tierInfo.maxMembers) {
      socket.emit('guild-error', { message: 'Guild is full' });
      return;
    }

    const inviteId = `ginv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    guildInvites.set(inviteId, {
      guildId,
      targetWallet: target.wallet,
      targetSocketId: data.targetId,
      from: player.wallet,
      fromName: player.name,
      timestamp: Date.now(),
    });

    // Send invite to target
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('guild-invited', {
        inviteId,
        guildId,
        guildName: guild.name,
        guildTag: guild.tag,
        from: player.wallet,
        fromName: player.name,
      });
    }

    socket.emit('guild-invite-sent', { targetName: target.name });

    // Expire invite after 30s
    setTimeout(() => {
      if (guildInvites.has(inviteId)) {
        guildInvites.delete(inviteId);
      }
    }, 30000);
  });

  // ── Guild Accept Invite ──
  socket.on('guild-accept', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.inviteId) return;

    const invite = guildInvites.get(data.inviteId);
    if (!invite || invite.targetWallet !== player.wallet) {
      socket.emit('guild-error', { message: 'Invalid or expired invite' });
      return;
    }
    guildInvites.delete(data.inviteId);

    if (walletToGuild.has(player.wallet)) {
      socket.emit('guild-error', { message: 'You are already in a guild' });
      return;
    }

    const guild = guilds.get(invite.guildId);
    if (!guild) {
      socket.emit('guild-error', { message: 'Guild no longer exists' });
      return;
    }

    const tierInfo = getGuildLevel(guild.xp);
    if (guild.members.size >= tierInfo.maxMembers) {
      socket.emit('guild-error', { message: 'Guild is full' });
      return;
    }

    // Add member
    guild.members.set(player.wallet, {
      name: player.name,
      level: player.level,
      playerClass: player.playerClass,
      joinedAt: Date.now(),
      contribution: 0,
    });
    walletToGuild.set(player.wallet, invite.guildId);
    player.guildTag = guild.tag;

    // Notify new member
    socket.emit('guild-joined', { guildId: invite.guildId, name: guild.name, tag: guild.tag });

    // Notify guild
    broadcastGuildUpdate(invite.guildId, 'guild-update', {
      guildId: invite.guildId,
      type: 'member-joined',
      member: { wallet: player.wallet, name: player.name, level: player.level, playerClass: player.playerClass },
      memberCount: guild.members.size,
    });

    console.log(`[Guild] ${player.name} joined "${guild.name}" [${guild.tag}]`);
  });

  // ── Guild Decline Invite ──
  socket.on('guild-decline', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.inviteId) return;

    const invite = guildInvites.get(data.inviteId);
    if (!invite || invite.targetWallet !== player.wallet) return;
    guildInvites.delete(data.inviteId);

    // Notify inviter
    const inviterSid = walletToSocket.get(invite.from);
    if (inviterSid) {
      const inviterSocket = io.sockets.sockets.get(inviterSid);
      if (inviterSocket) {
        inviterSocket.emit('guild-invite-declined', { targetName: player.name });
      }
    }
  });

  // ── Guild Leave ──
  socket.on('guild-leave', () => {
    const player = players.get(socket.id);
    if (!player) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) {
      socket.emit('guild-error', { message: 'You are not in a guild' });
      return;
    }
    const guild = guilds.get(guildId);
    if (!guild) return;

    const wasLeader = guild.leader === player.wallet;

    // Remove member
    guild.members.delete(player.wallet);
    guild.officers.delete(player.wallet);
    walletToGuild.delete(player.wallet);
    player.guildTag = undefined;

    // If guild is now empty, dissolve it
    if (guild.members.size === 0) {
      guilds.delete(guildId);
      console.log(`[Guild] "${guild.name}" dissolved (empty)`);
      return;
    }

    // If leader left, promote highest-level officer or highest-level member
    if (wasLeader) {
      let newLeader = null;
      let highestLevel = -1;

      // Prefer officers first
      for (const officerWallet of guild.officers) {
        const m = guild.members.get(officerWallet);
        if (m && m.level > highestLevel) {
          highestLevel = m.level;
          newLeader = officerWallet;
        }
      }
      // Fallback to any member
      if (!newLeader) {
        for (const [wallet, m] of guild.members) {
          if (m.level > highestLevel) {
            highestLevel = m.level;
            newLeader = wallet;
          }
        }
      }

      if (newLeader) {
        guild.leader = newLeader;
        guild.officers.delete(newLeader);
        broadcastGuildUpdate(guildId, 'guild-update', {
          guildId,
          type: 'new-leader',
          leader: newLeader,
          leaderName: guild.members.get(newLeader)?.name,
        });
      }
    }

    // Notify guild
    broadcastGuildUpdate(guildId, 'guild-update', {
      guildId,
      type: 'member-left',
      wallet: player.wallet,
      name: player.name,
      memberCount: guild.members.size,
    });

    socket.emit('guild-left', {});
    console.log(`[Guild] ${player.name} left "${guild.name}"`);
  });

  // ── Guild Kick ──
  socket.on('guild-kick', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.targetWallet) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) return;
    const guild = guilds.get(guildId);
    if (!guild) return;

    // Only leader or officer can kick
    if (guild.leader !== player.wallet && !guild.officers.has(player.wallet)) {
      socket.emit('guild-error', { message: 'Only leader or officers can kick members' });
      return;
    }
    // Can't kick leader
    if (data.targetWallet === guild.leader) {
      socket.emit('guild-error', { message: 'Cannot kick the guild leader' });
      return;
    }
    // Officers can't kick other officers
    if (guild.officers.has(data.targetWallet) && guild.leader !== player.wallet) {
      socket.emit('guild-error', { message: 'Only the leader can kick officers' });
      return;
    }
    // Target must be in guild
    if (!guild.members.has(data.targetWallet)) {
      socket.emit('guild-error', { message: 'Player is not in your guild' });
      return;
    }

    const targetMember = guild.members.get(data.targetWallet);
    guild.members.delete(data.targetWallet);
    guild.officers.delete(data.targetWallet);
    walletToGuild.delete(data.targetWallet);

    // Set kick cooldown (1 hour)
    guildKickCooldowns.set(`${data.targetWallet}:${guildId}`, Date.now() + 3600000);

    // Remove guild tag from target player if online
    const targetSid = walletToSocket.get(data.targetWallet);
    if (targetSid) {
      const targetPlayer = players.get(targetSid);
      if (targetPlayer) targetPlayer.guildTag = undefined;
      const targetSocket = io.sockets.sockets.get(targetSid);
      if (targetSocket) {
        targetSocket.emit('guild-kicked', { guildId, guildName: guild.name, reason: 'Kicked by ' + player.name });
      }
    }

    // Notify guild
    broadcastGuildUpdate(guildId, 'guild-update', {
      guildId,
      type: 'member-kicked',
      wallet: data.targetWallet,
      name: targetMember?.name,
      memberCount: guild.members.size,
    });

    console.log(`[Guild] ${player.name} kicked ${targetMember?.name} from "${guild.name}"`);
  });

  // ── Guild Promote ──
  socket.on('guild-promote', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.targetWallet || !data?.role) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) return;
    const guild = guilds.get(guildId);
    if (!guild) return;

    // Only leader can promote
    if (guild.leader !== player.wallet) {
      socket.emit('guild-error', { message: 'Only the guild leader can promote members' });
      return;
    }
    if (!guild.members.has(data.targetWallet)) {
      socket.emit('guild-error', { message: 'Player is not in your guild' });
      return;
    }

    const targetMember = guild.members.get(data.targetWallet);

    if (data.role === 'officer') {
      guild.officers.add(data.targetWallet);
    } else if (data.role === 'member') {
      guild.officers.delete(data.targetWallet);
    } else if (data.role === 'leader') {
      // Transfer leadership
      guild.officers.add(player.wallet); // Demote self to officer
      guild.leader = data.targetWallet;
      guild.officers.delete(data.targetWallet);
    } else {
      socket.emit('guild-error', { message: 'Invalid role' });
      return;
    }

    // Notify target if online
    const targetSid = walletToSocket.get(data.targetWallet);
    if (targetSid) {
      const targetSocket = io.sockets.sockets.get(targetSid);
      if (targetSocket) {
        targetSocket.emit('guild-promoted', { role: data.role, guildName: guild.name });
      }
    }

    // Notify guild
    broadcastGuildUpdate(guildId, 'guild-update', {
      guildId,
      type: 'promotion',
      wallet: data.targetWallet,
      name: targetMember?.name,
      role: data.role,
    });

    console.log(`[Guild] ${targetMember?.name} promoted to ${data.role} in "${guild.name}"`);
  });

  // ── Guild Info Request ──
  socket.on('guild-info', () => {
    const player = players.get(socket.id);
    if (!player) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) {
      socket.emit('guild-error', { message: 'You are not in a guild' });
      return;
    }
    const guild = guilds.get(guildId);
    if (!guild) return;

    const tierInfo = getGuildLevel(guild.xp);
    const memberList = [];
    for (const [wallet, m] of guild.members) {
      const online = walletToSocket.has(wallet) && io.sockets.sockets.has(walletToSocket.get(wallet));
      memberList.push({
        wallet,
        name: m.name,
        level: m.level,
        playerClass: m.playerClass,
        joinedAt: m.joinedAt,
        contribution: m.contribution,
        role: wallet === guild.leader ? 'leader' : guild.officers.has(wallet) ? 'officer' : 'member',
        online,
      });
    }

    socket.emit('guild-data', {
      guildId,
      name: guild.name,
      tag: guild.tag,
      level: tierInfo.level,
      xp: guild.xp,
      xpNext: GUILD_LEVELS[Math.min(tierInfo.level, GUILD_LEVELS.length - 1)]?.xpRequired || null,
      members: memberList,
      memberCount: guild.members.size,
      maxMembers: tierInfo.maxMembers,
      treasury: guild.treasury,
      motd: guild.motd,
      leader: guild.leader,
      createdAt: guild.createdAt,
    });
  });

  // ── Guild Chat ──
  socket.on('guild-chat', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!rateLimit(socket.id, 'guild-chat', 1000)) return;
    if (!data?.message || typeof data.message !== 'string') return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) return;
    const guild = guilds.get(guildId);
    if (!guild) return;

    const message = data.message.slice(0, 150);

    broadcastGuildUpdate(guildId, 'guild-chat-message', {
      from: player.wallet,
      name: player.name,
      message,
      timestamp: Date.now(),
    });
  });

  // ── Guild Dissolve (leader only) ──
  socket.on('guild-dissolve', () => {
    const player = players.get(socket.id);
    if (!player) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) return;
    const guild = guilds.get(guildId);
    if (!guild) return;

    if (guild.leader !== player.wallet) {
      socket.emit('guild-error', { message: 'Only the guild leader can dissolve the guild' });
      return;
    }

    // Notify all members before dissolving
    broadcastGuildUpdate(guildId, 'guild-dissolved', {
      guildId,
      reason: 'Dissolved by leader',
    });

    // Remove all members from guild
    for (const [wallet] of guild.members) {
      walletToGuild.delete(wallet);
      const sid = walletToSocket.get(wallet);
      if (sid) {
        const p = players.get(sid);
        if (p) p.guildTag = undefined;
      }
    }

    guilds.delete(guildId);
    console.log(`[Guild] "${guild.name}" dissolved by ${player.name}`);
  });

  // ── Guild Contribute (deposit gold for XP) ──
  socket.on('guild-contribute', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.gold || typeof data.gold !== 'number' || data.gold <= 0) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) return;
    const guild = guilds.get(guildId);
    if (!guild) return;

    const amount = Math.floor(Math.min(data.gold, 10000)); // Cap per deposit
    guild.treasury += amount;

    // XP: +1 per 10 gold
    const xpGain = Math.floor(amount / 10);
    guild.xp += xpGain;

    // Update member contribution
    const member = guild.members.get(player.wallet);
    if (member) member.contribution += amount;

    // Check level up
    const newTier = getGuildLevel(guild.xp);
    if (newTier.level > guild.level) {
      guild.level = newTier.level;
      guild.maxMembers = newTier.maxMembers;
      broadcastGuildUpdate(guildId, 'guild-update', {
        guildId,
        type: 'level-up',
        level: newTier.level,
        maxMembers: newTier.maxMembers,
      });
    }

    broadcastGuildUpdate(guildId, 'guild-update', {
      guildId,
      type: 'contribution',
      wallet: player.wallet,
      name: player.name,
      amount,
      treasury: guild.treasury,
      xpGain,
      guildXp: guild.xp,
    });
  });

  // ── Guild XP from member actions (battle win, dungeon, mint, fusion) ──
  socket.on('guild-xp-action', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.action) return;

    const guildId = walletToGuild.get(player.wallet);
    if (!guildId) return;
    const guild = guilds.get(guildId);
    if (!guild) return;

    let xpGain = 0;
    switch (data.action) {
      case 'battle-win': xpGain = 5; break;
      case 'dungeon-complete': xpGain = 10; break;
      case 'mint': xpGain = 2; break;
      case 'fusion': xpGain = 2; break;
      default: return;
    }

    guild.xp += xpGain;

    // Check level up
    const newTier = getGuildLevel(guild.xp);
    if (newTier.level > guild.level) {
      guild.level = newTier.level;
      guild.maxMembers = newTier.maxMembers;
      broadcastGuildUpdate(guildId, 'guild-update', {
        guildId,
        type: 'level-up',
        level: newTier.level,
        maxMembers: newTier.maxMembers,
      });
    }
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      if (player.zone) {
        socket.to(player.zone).emit('player-left', { id: socket.id, wallet: player.wallet });
      }
      walletToSocket.delete(player.wallet);
      players.delete(socket.id);
      console.log(`[MP] Disconnect: ${player.name}`);
    }

    // Clean up any active battles
    for (const [battleId, battle] of pvpBattles) {
      if (battle.players[socket.id]) {
        const pIds = Object.keys(battle.players);
        const otherId = pIds.find(x => x !== socket.id);
        const otherSocket = io.sockets.sockets.get(otherId);
        if (otherSocket) {
          otherSocket.emit('pvp-result', { battleId, won: true, reason: 'opponent_disconnected' });
        }
        pvpBattles.delete(battleId);
      }
    }

    // Clean up trades
    for (const [tradeId, trade] of tradeOffers) {
      if (trade.from === socket.id || trade.to === socket.id) {
        const otherSid = socket.id === trade.from ? trade.to : trade.from;
        const otherSocket = io.sockets.sockets.get(otherSid);
        if (otherSocket) otherSocket.emit('trade-cancelled', { tradeId, reason: 'disconnected' });
        tradeOffers.delete(tradeId);
      }
    }

    // Clean up arena queues
    for (const mode of ARENA_MODES) {
      const idx = arenaQueues[mode].findIndex(e => e.socketId === socket.id);
      if (idx !== -1) arenaQueues[mode].splice(idx, 1);
    }

    // Clean up arena matches (forfeit = auto-lose)
    for (const [matchId, match] of arenaMatches) {
      if (!match.players.has(socket.id) || match.status === 'finished') continue;

      const disconnectedPlayer = match.players.get(socket.id);
      disconnectedPlayer.alive = false;
      disconnectedPlayer.hp = 0;

      const remaining = [...match.players.entries()].filter(([sid, p]) => sid !== socket.id && p.alive && p.hp > 0);

      if (match.mode === '1v1') {
        arenaFinishMatch(matchId, match, remaining.map(([sid]) => sid), [socket.id]);
      } else if (match.mode === '2v2') {
        const team0Alive = [...match.players.values()].filter(p => p.team === 0 && p.alive && p.hp > 0);
        const team1Alive = [...match.players.values()].filter(p => p.team === 1 && p.alive && p.hp > 0);
        if (team0Alive.length === 0 || team1Alive.length === 0) {
          const winTeam = team0Alive.length > 0 ? 0 : 1;
          const winners = [...match.players.entries()].filter(([, p]) => p.team === winTeam).map(([sid]) => sid);
          const losers = [...match.players.entries()].filter(([, p]) => p.team !== winTeam).map(([sid]) => sid);
          arenaFinishMatch(matchId, match, winners, losers);
        }
      } else if (match.mode === 'ffa') {
        if (remaining.length <= 1) {
          const winners = remaining.map(([sid]) => sid);
          const losers = [...match.players.keys()].filter(sid => !winners.includes(sid));
          arenaFinishMatch(matchId, match, winners, losers);
        } else if (match.turn === socket.id) {
          arenaAdvanceTurn(matchId, match);
        }
      }
    }

    // Clean rate limits
    for (const key of rateLimits.keys()) {
      if (key.startsWith(socket.id)) rateLimits.delete(key);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PVP ARENA — Matchmaking, Rated Battles, Seasons
// ═══════════════════════════════════════════════════════════════════════

const arenaQueues = {
  '1v1': [],  // [{socketId, name, level, rating, joinedAt}]
  '2v2': [],
  'ffa': [],  // 4 player free-for-all
};

const arenaMatches = new Map(); // matchId → ArenaMatchState
const playerRatings = new Map(); // wallet → {rating, wins, losses, streak, highestRating, season}

const ARENA_MODES = ['1v1', '2v2', 'ffa'];
const ARENA_BASE_RATING = 1000;
const ARENA_MIN_RATING = 100;
const ARENA_BASE_RATING_CHANGE = 25;
const ARENA_WIN_GOLD = 50;
const ARENA_STREAK_BONUS_THRESHOLD = 3;
const ARENA_STREAK_BONUS_RATING = 5;
const ARENA_TURN_TIMEOUT = 45000; // 45s
const ARENA_RATING_WINDOW_BASE = 200;
const ARENA_RATING_WINDOW_EXPAND = 50;
const ARENA_RATING_EXPAND_INTERVAL = 15000; // 15s

function getPlayerRating(wallet) {
  if (!playerRatings.has(wallet)) {
    playerRatings.set(wallet, {
      rating: ARENA_BASE_RATING,
      wins: 0,
      losses: 0,
      streak: 0,
      highestRating: ARENA_BASE_RATING,
      season: 1,
    });
  }
  return playerRatings.get(wallet);
}

function calcRatingChange(winnerRating, loserRating) {
  const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return Math.round(ARENA_BASE_RATING_CHANGE * (1 - expected) + ARENA_BASE_RATING_CHANGE * 0.5);
}

// ── Arena matchmaking interval (every 5 seconds) ──
setInterval(() => {
  for (const mode of ARENA_MODES) {
    const queue = arenaQueues[mode];
    const needed = mode === '1v1' ? 2 : 4;
    if (queue.length < needed) continue;

    const now = Date.now();
    const matched = [];

    for (let i = 0; i < queue.length && matched.length < needed; i++) {
      const entry = queue[i];
      // Check socket still connected
      if (!io.sockets.sockets.get(entry.socketId)) {
        queue.splice(i, 1);
        i--;
        continue;
      }

      if (matched.length === 0) {
        matched.push(entry);
        continue;
      }

      // Rating window expands over time
      const waitTime = now - entry.joinedAt;
      const anchorWait = now - matched[0].joinedAt;
      const maxWait = Math.max(waitTime, anchorWait);
      const expansions = Math.floor(maxWait / ARENA_RATING_EXPAND_INTERVAL);
      const window = ARENA_RATING_WINDOW_BASE + expansions * ARENA_RATING_WINDOW_EXPAND;

      const ratingDiff = Math.abs(entry.rating - matched[0].rating);
      if (ratingDiff <= window) {
        matched.push(entry);
      }
    }

    if (matched.length < needed) continue;

    // Remove matched from queue
    for (const m of matched) {
      const idx = queue.indexOf(m);
      if (idx !== -1) queue.splice(idx, 1);
    }

    // Create match
    const matchId = `arena_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const arenaPlayers = new Map();
    for (const m of matched) {
      const p = players.get(m.socketId);
      arenaPlayers.set(m.socketId, {
        name: m.name,
        level: m.level,
        rating: m.rating,
        wallet: p?.wallet || '',
        hp: 100, maxHp: 100,
        mp: 30, maxMp: 30,
        atk: 10, def: 5, spd: 5,
        alive: true,
        ready: false,
        team: null,
      });
    }

    // 2v2: split into balanced teams by rating (1st+4th vs 2nd+3rd)
    if (mode === '2v2') {
      const sorted = [...matched].sort((a, b) => b.rating - a.rating);
      arenaPlayers.get(sorted[0].socketId).team = 0;
      arenaPlayers.get(sorted[3].socketId).team = 0;
      arenaPlayers.get(sorted[1].socketId).team = 1;
      arenaPlayers.get(sorted[2].socketId).team = 1;
    }

    const matchState = {
      mode,
      status: 'countdown', // countdown → preparing → active → finished
      players: arenaPlayers,
      turn: null,
      turnOrder: [],
      turnIndex: 0,
      turnCount: 0,
      actions: [],
      startedAt: Date.now(),
      turnTimer: null,
    };
    arenaMatches.set(matchId, matchState);

    // Send match-found to all players
    const opponentList = matched.map(m => ({
      name: m.name,
      level: m.level,
      rating: m.rating,
    }));

    for (const m of matched) {
      const s = io.sockets.sockets.get(m.socketId);
      if (s) {
        s.emit('arena-match-found', {
          matchId,
          mode,
          opponents: opponentList.filter(o => o.name !== m.name),
        });
      }
    }

    // Countdown: 3, 2, 1
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      for (const m of matched) {
        const s = io.sockets.sockets.get(m.socketId);
        if (s) s.emit('arena-countdown', { matchId, seconds: countdown });
      }
      countdown--;
      if (countdown < 0) {
        clearInterval(countdownInterval);
        matchState.status = 'preparing';
      }
    }, 1000);

    console.log(`[Arena] Match created: ${matchId} (${mode}) — ${matched.map(m => m.name).join(' vs ')}`);
  }
}, 5000);

// ── Arena event handlers ──
io.on('connection', (socket) => {

  // ── Arena: Join Queue ──
  socket.on('arena-join', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.mode || !ARENA_MODES.includes(data.mode)) return;
    if (!rateLimit(socket.id, 'arena-join', 5000)) return;

    // Check not already in a queue or active match
    for (const mode of ARENA_MODES) {
      if (arenaQueues[mode].some(e => e.socketId === socket.id)) return;
    }
    for (const [, match] of arenaMatches) {
      if (match.players.has(socket.id) && match.status !== 'finished') return;
    }

    const ratings = getPlayerRating(player.wallet);
    const entry = {
      socketId: socket.id,
      name: player.name,
      level: player.level,
      rating: ratings.rating,
      joinedAt: Date.now(),
    };

    arenaQueues[data.mode].push(entry);

    socket.emit('arena-queued', {
      mode: data.mode,
      position: arenaQueues[data.mode].length,
      estimatedWait: arenaQueues[data.mode].length < (data.mode === '1v1' ? 2 : 4) ? 30 : 10,
    });

    console.log(`[Arena] ${player.name} queued for ${data.mode} (rating: ${ratings.rating})`);
  });

  // ── Arena: Leave Queue ──
  socket.on('arena-leave', () => {
    for (const mode of ARENA_MODES) {
      const idx = arenaQueues[mode].findIndex(e => e.socketId === socket.id);
      if (idx !== -1) {
        arenaQueues[mode].splice(idx, 1);
        socket.emit('arena-left', { mode });
        console.log(`[Arena] ${players.get(socket.id)?.name || socket.id} left ${mode} queue`);
        return;
      }
    }
  });

  // ── Arena: Ready (send stats for battle) ──
  socket.on('arena-ready', (data) => {
    const match = arenaMatches.get(data?.matchId);
    if (!match || !match.players.has(socket.id)) return;
    if (match.status !== 'preparing') return;

    const ap = match.players.get(socket.id);
    ap.hp = Math.min(9999, Math.max(1, parseInt(data.hp) || 100));
    ap.maxHp = ap.hp;
    ap.mp = Math.min(999, Math.max(0, parseInt(data.mp) || 30));
    ap.maxMp = ap.mp;
    ap.atk = Math.min(999, Math.max(1, parseInt(data.atk) || 10));
    ap.def = Math.min(999, Math.max(1, parseInt(data.def) || 5));
    ap.spd = Math.min(999, Math.max(1, parseInt(data.spd) || 5));
    ap.ready = true;

    // Check if all ready
    const allReady = [...match.players.values()].every(p => p.ready);
    if (!allReady) return;

    match.status = 'active';
    match.turnCount = 1;

    // Build turn order by SPD
    const sortedBySpd = [...match.players.entries()].sort((a, b) => b[1].spd - a[1].spd);
    match.turnOrder = sortedBySpd.map(([sid]) => sid);
    match.turnIndex = 0;
    match.turn = match.turnOrder[0];

    // Build player info for arena-start
    const playerInfos = [];
    for (const [sid, p] of match.players) {
      playerInfos.push({
        id: sid,
        name: p.name,
        hp: p.hp,
        atk: p.atk,
        def: p.def,
        spd: p.spd,
        team: p.team,
      });
    }

    for (const [sid] of match.players) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('arena-start', {
          matchId: data.matchId,
          mode: match.mode,
          players: playerInfos,
        });
      }
    }

    // Send first turn state and start timer
    arenaEmitTurnState(data.matchId, match);
    arenaStartTurnTimer(data.matchId, match);

    console.log(`[Arena] Match ${data.matchId} started — ${match.mode}`);
  });

  // ── Arena: Action ──
  socket.on('arena-action', (data) => {
    const match = arenaMatches.get(data?.matchId);
    if (!match || match.status !== 'active') return;
    if (match.turn !== socket.id) return;
    if (!data?.action) return;
    if (!rateLimit(socket.id, 'arena-action', 1000)) return;

    arenaProcessTurn(data.matchId, match, socket.id, data.action, data.skillId);
  });
});

function arenaStartTurnTimer(matchId, match) {
  if (match.turnTimer) clearTimeout(match.turnTimer);
  match.turnTimer = setTimeout(() => {
    if (match.status !== 'active') return;
    console.log(`[Arena] Turn timeout in ${matchId}, auto-attacking for ${match.turn}`);
    arenaProcessTurn(matchId, match, match.turn, 'attack');
  }, ARENA_TURN_TIMEOUT);
}

function arenaEmitTurnState(matchId, match) {
  for (const [sid, p] of match.players) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;

    if (match.mode === '1v1') {
      const opSid = [...match.players.keys()].find(x => x !== sid);
      const op = match.players.get(opSid);
      s.emit('arena-turn', {
        matchId,
        yourTurn: match.turn === sid,
        you: { hp: p.hp, mp: p.mp },
        opponent: { hp: op.hp, mp: op.mp },
        turnCount: match.turnCount,
      });
    } else if (match.mode === '2v2') {
      const myTeam = p.team;
      const allyHp = [...match.players.values()].filter(x => x.team === myTeam).reduce((sum, x) => sum + x.hp, 0);
      const enemyHp = [...match.players.values()].filter(x => x.team !== myTeam).reduce((sum, x) => sum + x.hp, 0);
      s.emit('arena-turn', {
        matchId,
        yourTurn: match.turn === sid,
        you: { hp: allyHp, mp: p.mp },
        opponent: { hp: enemyHp, mp: 0 },
        turnCount: match.turnCount,
      });
    } else {
      // FFA: show all players
      const allPlayers = [];
      for (const [osid, op] of match.players) {
        allPlayers.push({ name: op.name, hp: op.hp, alive: op.alive, isYou: osid === sid });
      }
      s.emit('arena-turn', {
        matchId,
        yourTurn: match.turn === sid,
        you: { hp: p.hp, mp: p.mp },
        players: allPlayers,
        turnCount: match.turnCount,
      });
    }
  }
}

function arenaProcessTurn(matchId, match, attackerSid, action, skillId) {
  if (match.turnTimer) clearTimeout(match.turnTimer);

  const attacker = match.players.get(attackerSid);
  if (!attacker || !attacker.alive) return;

  if (match.mode === '1v1') {
    const defenderSid = [...match.players.keys()].find(x => x !== attackerSid);
    const defender = match.players.get(defenderSid);

    const result = processPvpAction(action, attacker, defender, { skillId, skillMult: skillId ? 1.3 : undefined });
    match.actions.push({ turn: match.turnCount, player: attackerSid, ...result });

    if (defender.hp <= 0) {
      arenaFinishMatch(matchId, match, [attackerSid], [defenderSid]);
      return;
    }

    match.turn = defenderSid;
    match.turnCount++;
    arenaEmitTurnState(matchId, match);
    arenaStartTurnTimer(matchId, match);

  } else if (match.mode === '2v2') {
    // Target lowest HP alive enemy from opposite team
    const enemies = [...match.players.entries()].filter(([, p]) => p.team !== attacker.team && p.alive && p.hp > 0);
    if (enemies.length === 0) return;
    enemies.sort((a, b) => a[1].hp - b[1].hp);
    const [defSid, defender] = enemies[0];

    const result = processPvpAction(action, attacker, defender, { skillId, skillMult: skillId ? 1.3 : undefined });
    match.actions.push({ turn: match.turnCount, player: attackerSid, target: defSid, ...result });

    // Mark dead players
    for (const [, p] of match.players) {
      if (p.hp <= 0) p.alive = false;
    }

    const team0Alive = [...match.players.values()].filter(p => p.team === 0 && p.alive && p.hp > 0);
    const team1Alive = [...match.players.values()].filter(p => p.team === 1 && p.alive && p.hp > 0);

    if (team0Alive.length === 0 || team1Alive.length === 0) {
      const winTeam = team0Alive.length > 0 ? 0 : 1;
      const winners = [...match.players.entries()].filter(([, p]) => p.team === winTeam).map(([sid]) => sid);
      const losers = [...match.players.entries()].filter(([, p]) => p.team !== winTeam).map(([sid]) => sid);
      arenaFinishMatch(matchId, match, winners, losers);
      return;
    }

    arenaAdvanceTurn(matchId, match);

  } else if (match.mode === 'ffa') {
    // Target next alive player in turn order after attacker
    const attackerIdx = match.turnOrder.indexOf(attackerSid);
    let targetSid = null;
    for (let i = 1; i < match.turnOrder.length; i++) {
      const checkIdx = (attackerIdx + i) % match.turnOrder.length;
      const checkSid = match.turnOrder[checkIdx];
      const checkP = match.players.get(checkSid);
      if (checkP && checkP.alive && checkP.hp > 0) {
        targetSid = checkSid;
        break;
      }
    }
    if (!targetSid) return;

    const defender = match.players.get(targetSid);
    const result = processPvpAction(action, attacker, defender, { skillId, skillMult: skillId ? 1.3 : undefined });
    match.actions.push({ turn: match.turnCount, player: attackerSid, target: targetSid, ...result });

    if (defender.hp <= 0) defender.alive = false;

    const stillAlive = [...match.players.entries()].filter(([, p]) => p.alive && p.hp > 0);
    if (stillAlive.length <= 1) {
      const winners = stillAlive.map(([sid]) => sid);
      const losers = [...match.players.keys()].filter(sid => !winners.includes(sid));
      arenaFinishMatch(matchId, match, winners, losers);
      return;
    }

    arenaAdvanceTurn(matchId, match);
  }
}

function arenaAdvanceTurn(matchId, match) {
  let nextIdx = (match.turnIndex + 1) % match.turnOrder.length;
  let checks = 0;
  while (checks < match.turnOrder.length) {
    const sid = match.turnOrder[nextIdx];
    const p = match.players.get(sid);
    if (p && p.alive && p.hp > 0) break;
    nextIdx = (nextIdx + 1) % match.turnOrder.length;
    checks++;
  }

  match.turnIndex = nextIdx;
  match.turn = match.turnOrder[nextIdx];
  match.turnCount++;

  arenaEmitTurnState(matchId, match);
  arenaStartTurnTimer(matchId, match);
}

function arenaFinishMatch(matchId, match, winnerSids, loserSids) {
  if (match.turnTimer) clearTimeout(match.turnTimer);
  match.status = 'finished';

  const winnerAvgRating = winnerSids.reduce((sum, sid) => sum + (match.players.get(sid)?.rating || ARENA_BASE_RATING), 0) / winnerSids.length;
  const loserAvgRating = loserSids.reduce((sum, sid) => sum + (match.players.get(sid)?.rating || ARENA_BASE_RATING), 0) / Math.max(1, loserSids.length);

  const ratingGain = calcRatingChange(winnerAvgRating, loserAvgRating);
  const ratingLoss = Math.min(ratingGain, 20);

  for (const sid of winnerSids) {
    const p = match.players.get(sid);
    if (!p) continue;
    const ratings = getPlayerRating(p.wallet);
    ratings.wins++;
    ratings.streak++;
    const streakBonus = ratings.streak >= ARENA_STREAK_BONUS_THRESHOLD
      ? (ratings.streak - ARENA_STREAK_BONUS_THRESHOLD + 1) * ARENA_STREAK_BONUS_RATING
      : 0;
    ratings.rating += ratingGain + streakBonus;
    if (ratings.rating > ratings.highestRating) ratings.highestRating = ratings.rating;

    const s = io.sockets.sockets.get(sid);
    if (s) {
      s.emit('arena-result', {
        matchId,
        won: true,
        ratingChange: ratingGain + streakBonus,
        newRating: ratings.rating,
        rewards: { gold: ARENA_WIN_GOLD, streak: ratings.streak },
      });
    }
  }

  for (const sid of loserSids) {
    const p = match.players.get(sid);
    if (!p) continue;
    const ratings = getPlayerRating(p.wallet);
    ratings.losses++;
    ratings.streak = 0;
    ratings.rating = Math.max(ARENA_MIN_RATING, ratings.rating - ratingLoss);

    const s = io.sockets.sockets.get(sid);
    if (s) {
      s.emit('arena-result', {
        matchId,
        won: false,
        ratingChange: -ratingLoss,
        newRating: ratings.rating,
        rewards: { gold: 0, streak: 0 },
      });
    }
  }

  setTimeout(() => arenaMatches.delete(matchId), 10000);

  const winnerNames = winnerSids.map(s => match.players.get(s)?.name).join(', ');
  console.log(`[Arena] Match ${matchId} finished — Winner(s): ${winnerNames}`);
}

// ─── PvP Action Processing ───
function processPvpAction(action, attacker, defender, data) {
  const result = { action, damage: 0, crit: false, missed: false, message: '' };

  // Dodge check
  const spdDiff = Math.max(0, defender.spd - attacker.spd);
  const dodgeChance = Math.min(0.20, spdDiff * 0.03);
  if (Math.random() < dodgeChance) {
    result.missed = true;
    result.message = 'Dodged!';
    return result;
  }

  switch (action) {
    case 'attack': {
      const raw = Math.max(1, attacker.atk - defender.def + Math.floor(Math.random() * 7) - 3);
      const critChance = Math.min(0.30, 0.10 + Math.max(0, attacker.spd - defender.spd) * 0.02);
      result.crit = Math.random() < critChance;
      result.damage = result.crit ? Math.floor(raw * 1.75) : raw;
      result.message = result.crit ? 'Critical Hit!' : 'Attack';
      break;
    }
    case 'defend': {
      defender.def = Math.floor(defender.def * 1.5); // Temporary boost (reset on next action)
      result.message = 'Defending!';
      return result;
    }
    case 'skill': {
      const mult = data?.skillMult || 1.3;
      const raw = Math.max(1, Math.floor(attacker.atk * mult) - defender.def + Math.floor(Math.random() * 7) - 3);
      result.damage = raw;
      result.message = data?.skillName || 'Skill!';
      break;
    }
    default:
      result.message = 'Invalid action';
      return result;
  }

  defender.hp = Math.max(0, defender.hp - result.damage);
  return result;
}

function sanitizeBattlePlayer(p) {
  return {
    name: p.name,
    playerClass: p.playerClass,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
    mp: p.mp,
    maxMp: p.maxMp,
    atk: p.atk,
    def: p.def,
    spd: p.spd,
  };
}

// ─── Cleanup stale data every 5 minutes ───
setInterval(() => {
  const now = Date.now();
  // Clean expired challenges
  for (const [id, c] of pvpChallenges) {
    if (now - c.timestamp > 60000) pvpChallenges.delete(id);
  }
  // Clean stale battles (> 10 min)
  for (const [id, b] of pvpBattles) {
    if (now - b.startedAt > 600000) {
      pvpBattles.delete(id);
    }
  }
  // Clean stale rate limits
  for (const [key, ts] of rateLimits) {
    if (now - ts > 60000) rateLimits.delete(key);
  }
  // Clean expired party invites
  for (const [id, inv] of partyInvites) {
    if (now - inv.timestamp > 60000) partyInvites.delete(id);
  }
  // Clean stale co-op instances (> 35 min)
  for (const [id, inst] of coopInstances) {
    if (now - inst.startedAt > 35 * 60 * 1000) {
      coopInstances.delete(id);
    }
  }
  // Clean empty parties
  for (const [id, party] of parties) {
    if (party.members.size === 0) parties.delete(id);
  }
  // Clean stale arena queues (> 5 min waiting)
  for (const mode of ARENA_MODES) {
    arenaQueues[mode] = arenaQueues[mode].filter(e => {
      if (now - e.joinedAt > 300000) return false;
      if (!io.sockets.sockets.get(e.socketId)) return false;
      return true;
    });
  }
  // Clean stale arena matches (> 10 min, forfeit all)
  for (const [matchId, match] of arenaMatches) {
    if (now - match.startedAt > 600000 && match.status !== 'finished') {
      if (match.turnTimer) clearTimeout(match.turnTimer);
      match.status = 'finished';
      arenaMatches.delete(matchId);
    }
  }
  // Clean expired guild invites (> 30s)
  for (const [id, inv] of guildInvites) {
    if (now - inv.timestamp > 30000) guildInvites.delete(id);
  }
  // Clean expired kick cooldowns
  for (const [key, expiry] of guildKickCooldowns) {
    if (now > expiry) guildKickCooldowns.delete(key);
  }
}, 300000);

// ═══════════════════════════════════════════════════════════════════════
// ON-CHAIN XP SYNC — Add XP to FrostbiteHeroes after battles
// ═══════════════════════════════════════════════════════════════════════

const HERO_CONTRACT_ADDR = '0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523';
const LEADERBOARD_ADDR = '0x9E61443C983cDd72e77946C2e4631eAe7bC6Da46';
const XP_RPC = 'https://api.avax.network/ext/bc/C/rpc';

const HERO_ABI_XP = ['function addXp(uint256 tokenId, uint32 amount) external'];
const LEADERBOARD_ABI_SCORE = ['function updateScore(address wallet, uint256 score) external'];

// Queue XP updates to batch and avoid nonce conflicts
const xpQueue = [];
let xpProcessing = false;

function queueXpUpdate(heroTokenId, xpAmount, wallet, killScore) {
  if (!BR_KEY || !heroTokenId || heroTokenId === 0) return;
  xpQueue.push({ heroTokenId, xpAmount, wallet, killScore });
  processXpQueue();
}

async function processXpQueue() {
  if (xpProcessing || xpQueue.length === 0) return;
  xpProcessing = true;

  while (xpQueue.length > 0) {
    const item = xpQueue.shift();
    try {
      const provider = new ethersLib.JsonRpcProvider(XP_RPC);
      const wallet = new ethersLib.Wallet(BR_KEY, provider);

      // Add XP to hero NFT
      if (item.heroTokenId > 0 && item.xpAmount > 0) {
        const hero = new ethersLib.Contract(HERO_CONTRACT_ADDR, HERO_ABI_XP, wallet);
        const tx = await hero.addXp(item.heroTokenId, item.xpAmount);
        await tx.wait();
        console.log(`[XP] Added ${item.xpAmount} XP to hero #${item.heroTokenId}`);
      }

      // Update leaderboard score
      if (item.wallet && item.killScore > 0) {
        try {
          const lb = new ethersLib.Contract(LEADERBOARD_ADDR, LEADERBOARD_ABI_SCORE, wallet);
          const tx2 = await lb.updateScore(item.wallet, item.killScore);
          await tx2.wait();
          console.log(`[LB] Updated score for ${item.wallet}: +${item.killScore}`);
        } catch (e) {
          console.error('[LB] updateScore failed:', e.message);
        }
      }
    } catch (e) {
      console.error('[XP] addXp failed:', e.message);
    }
  }

  xpProcessing = false;
}

// Listen for battle results from game scenes (via Socket.io)
io.on('connection', (socket) => {
  socket.on('battle-result', (data) => {
    if (!data?.won || !data?.heroTokenId || !data?.xpEarned) return;
    const player = players.get(socket.id);
    if (!player) return;

    queueXpUpdate(data.heroTokenId, data.xpEarned, player.wallet, data.killScore || 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BATTLE ROYALE SYSTEM
// ═══════════════════════════════════════════════════════════════════════

import { ethers as ethersLib } from 'ethers';

const BR_CONTRACT = '0xf253bE24ffeC8D21B8Bc9169b80bc0DC34927Fb3';
const BR_RPC = 'https://api.avax.network/ext/bc/C/rpc';
const BR_KEY = process.env.PRIVATE_KEY || '';
const BR_MIN_PLAYERS = 10;

const BR_ABI = [
  'function startBattle(uint256 lobbyId) external',
  'function declareWinner(uint256 lobbyId, address winner) external',
  'function getCurrentLobbyId() view returns (uint256)',
];

// BR lobby state (server-side)
const brLobbies = new Map(); // lobbyId → { players: Map<socketId, {wallet, name, stats}>, status, matches, round }

function getBrContract() {
  if (!BR_KEY) return null;
  const provider = new ethersLib.JsonRpcProvider(BR_RPC);
  const wallet = new ethersLib.Wallet(BR_KEY, provider);
  return new ethersLib.Contract(BR_CONTRACT, BR_ABI, wallet);
}

io.on('connection', (socket) => {
  // ── BR: Join lobby ──
  socket.on('br-join', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!data?.lobbyId || !data?.wallet) return;

    const lobbyId = String(data.lobbyId);
    if (!brLobbies.has(lobbyId)) {
      brLobbies.set(lobbyId, {
        players: new Map(),
        status: 'waiting',
        matches: [],
        round: 0,
        startedAt: null,
      });
    }

    const lobby = brLobbies.get(lobbyId);
    if (lobby.status !== 'waiting') {
      socket.emit('br-error', { message: 'Battle already started' });
      return;
    }

    lobby.players.set(socket.id, {
      wallet: data.wallet,
      name: player.name,
      playerClass: player.playerClass,
      level: player.level,
      hp: parseInt(data.hp) || 100,
      maxHp: parseInt(data.hp) || 100,
      atk: parseInt(data.atk) || 10,
      def: parseInt(data.def) || 5,
      spd: parseInt(data.spd) || 5,
      alive: true,
      kills: 0,
    });

    socket.join(`br-${lobbyId}`);

    // Broadcast player list to everyone in lobby
    const playerList = [];
    for (const [sid, p] of lobby.players) {
      playerList.push({ id: sid, name: p.name, playerClass: p.playerClass, level: p.level, wallet: p.wallet.slice(0, 8) + '...' });
    }
    io.to(`br-${lobbyId}`).emit('br-lobby-update', {
      lobbyId,
      players: playerList,
      count: lobby.players.size,
      minPlayers: BR_MIN_PLAYERS,
      status: lobby.status,
    });

    console.log(`[BR] ${player.name} joined lobby ${lobbyId} (${lobby.players.size} players)`);

    // Auto-start when min players reached
    if (lobby.players.size >= BR_MIN_PLAYERS && lobby.status === 'waiting') {
      startBattleRoyale(lobbyId);
    }
  });

  // ── BR: Player action during battle ──
  socket.on('br-action', (data) => {
    const lobbyId = String(data?.lobbyId);
    const lobby = brLobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'fighting') return;

    const match = lobby.matches.find(m =>
      m.status === 'active' && (m.player1.id === socket.id || m.player2.id === socket.id)
    );
    if (!match) return;

    const isP1 = match.player1.id === socket.id;
    const attacker = isP1 ? match.player1 : match.player2;
    const defender = isP1 ? match.player2 : match.player1;

    if (match.turn !== socket.id) return; // Not your turn

    // Process action
    const action = data.action || 'attack';
    const result = processBrAction(action, attacker, defender);

    // Check if defender is dead
    if (defender.hp <= 0) {
      match.status = 'finished';
      match.winner = socket.id;
      attacker.kills++;

      // Mark loser as dead in lobby
      const loserData = lobby.players.get(defender.id);
      if (loserData) loserData.alive = false;
    }

    // Switch turn
    match.turn = defender.id;

    // Send result to both players
    const p1Socket = io.sockets.sockets.get(match.player1.id);
    const p2Socket = io.sockets.sockets.get(match.player2.id);

    const stateForPlayer = (pid) => ({
      lobbyId,
      round: lobby.round,
      yourTurn: match.turn === pid,
      you: pid === match.player1.id ? sanitizeBrPlayer(match.player1) : sanitizeBrPlayer(match.player2),
      opponent: pid === match.player1.id ? sanitizeBrPlayer(match.player2) : sanitizeBrPlayer(match.player1),
      action: result,
      matchFinished: match.status === 'finished',
      winner: match.winner === pid,
    });

    if (p1Socket) p1Socket.emit('br-battle-update', stateForPlayer(match.player1.id));
    if (p2Socket) p2Socket.emit('br-battle-update', stateForPlayer(match.player2.id));

    // If match finished, check if round is complete
    if (match.status === 'finished') {
      checkRoundComplete(lobbyId);
    }
  });

  // ── BR: Disconnect during battle ──
  socket.on('disconnect', () => {
    for (const [lobbyId, lobby] of brLobbies) {
      if (lobby.players.has(socket.id)) {
        const p = lobby.players.get(socket.id);
        if (p) p.alive = false;

        // If in active match, opponent auto-wins
        const match = lobby.matches.find(m =>
          m.status === 'active' && (m.player1.id === socket.id || m.player2.id === socket.id)
        );
        if (match) {
          match.status = 'finished';
          match.winner = match.player1.id === socket.id ? match.player2.id : match.player1.id;
          const winnerId = match.winner;
          const winnerSocket = io.sockets.sockets.get(winnerId);
          if (winnerSocket) {
            winnerSocket.emit('br-battle-update', {
              lobbyId, matchFinished: true, winner: true,
              action: { message: 'Opponent disconnected — you win!' },
            });
          }
          checkRoundComplete(lobbyId);
        }
      }
    }
  });
});

// ── Start Battle Royale ──
async function startBattleRoyale(lobbyId) {
  const lobby = brLobbies.get(lobbyId);
  if (!lobby || lobby.status !== 'waiting') return;

  lobby.status = 'starting';
  lobby.startedAt = Date.now();

  console.log(`[BR] Starting battle royale #${lobbyId} with ${lobby.players.size} players`);

  // Call smart contract to lock funds
  try {
    const contract = getBrContract();
    if (contract) {
      const tx = await contract.startBattle(lobbyId);
      await tx.wait();
      console.log(`[BR] On-chain startBattle TX: ${tx.hash}`);
    }
  } catch (e) {
    console.error('[BR] On-chain startBattle failed:', e.message);
  }

  // Notify all players
  io.to(`br-${lobbyId}`).emit('br-started', {
    lobbyId,
    playerCount: lobby.players.size,
    message: 'Battle Royale has begun!',
  });

  // Start first round after 3 second countdown
  setTimeout(() => {
    lobby.status = 'fighting';
    startNextRound(lobbyId);
  }, 3000);
}

// ── Start next round of matches ──
function startNextRound(lobbyId) {
  const lobby = brLobbies.get(lobbyId);
  if (!lobby || lobby.status !== 'fighting') return;

  lobby.round++;
  const alive = [];
  for (const [sid, p] of lobby.players) {
    if (p.alive) alive.push({ id: sid, ...p });
  }

  console.log(`[BR] Round ${lobby.round}: ${alive.length} players alive`);

  // Winner check
  if (alive.length <= 1) {
    finishBattleRoyale(lobbyId, alive[0] || null);
    return;
  }

  // Shuffle and pair up
  for (let i = alive.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alive[i], alive[j]] = [alive[j], alive[i]];
  }

  lobby.matches = [];
  for (let i = 0; i < alive.length - 1; i += 2) {
    const p1 = { id: alive[i].id, ...alive[i], hp: alive[i].hp > 0 ? alive[i].hp : alive[i].maxHp };
    const p2 = { id: alive[i + 1].id, ...alive[i + 1], hp: alive[i + 1].hp > 0 ? alive[i + 1].hp : alive[i + 1].maxHp };

    // Heal between rounds (50% of max HP)
    p1.hp = Math.min(p1.maxHp, Math.floor(p1.maxHp * 0.7));
    p2.hp = Math.min(p2.maxHp, Math.floor(p2.maxHp * 0.7));

    const turn = p1.spd >= p2.spd ? p1.id : p2.id;
    const match = { player1: p1, player2: p2, turn, status: 'active', winner: null };
    lobby.matches.push(match);

    // Notify both players of their matchup
    const s1 = io.sockets.sockets.get(p1.id);
    const s2 = io.sockets.sockets.get(p2.id);

    if (s1) s1.emit('br-match-start', {
      lobbyId, round: lobby.round, yourTurn: turn === p1.id,
      you: sanitizeBrPlayer(p1), opponent: sanitizeBrPlayer(p2),
      aliveCount: alive.length,
    });
    if (s2) s2.emit('br-match-start', {
      lobbyId, round: lobby.round, yourTurn: turn === p2.id,
      you: sanitizeBrPlayer(p2), opponent: sanitizeBrPlayer(p1),
      aliveCount: alive.length,
    });
  }

  // Odd player gets a bye (stays alive, gets heal)
  if (alive.length % 2 === 1) {
    const bye = alive[alive.length - 1];
    const byeSocket = io.sockets.sockets.get(bye.id);
    if (byeSocket) {
      byeSocket.emit('br-bye', { lobbyId, round: lobby.round, message: 'You got a bye this round! Resting...' });
    }
  }

  // 60 second timeout per round — auto-resolve unfinished matches
  setTimeout(() => {
    for (const match of lobby.matches) {
      if (match.status === 'active') {
        // Whoever has more HP wins
        if (match.player1.hp >= match.player2.hp) {
          match.winner = match.player1.id;
          const loser = lobby.players.get(match.player2.id);
          if (loser) loser.alive = false;
        } else {
          match.winner = match.player2.id;
          const loser = lobby.players.get(match.player1.id);
          if (loser) loser.alive = false;
        }
        match.status = 'finished';

        // Notify
        const ws = io.sockets.sockets.get(match.winner);
        if (ws) ws.emit('br-battle-update', { lobbyId, matchFinished: true, winner: true, action: { message: 'Time up — you win on HP!' } });
      }
    }
    checkRoundComplete(lobbyId);
  }, 60000);
}

// ── Check if all matches in round are done ──
function checkRoundComplete(lobbyId) {
  const lobby = brLobbies.get(lobbyId);
  if (!lobby) return;

  const allDone = lobby.matches.every(m => m.status === 'finished');
  if (!allDone) return;

  // Count alive
  const alive = [];
  for (const [sid, p] of lobby.players) {
    if (p.alive) alive.push(sid);
  }

  // Broadcast round results
  io.to(`br-${lobbyId}`).emit('br-round-end', {
    lobbyId,
    round: lobby.round,
    aliveCount: alive.length,
    message: `Round ${lobby.round} complete! ${alive.length} players remain.`,
  });

  if (alive.length <= 1) {
    const winner = alive.length === 1 ? lobby.players.get(alive[0]) : null;
    setTimeout(() => finishBattleRoyale(lobbyId, winner ? { id: alive[0], ...winner } : null), 2000);
  } else {
    // Next round after 5 seconds
    setTimeout(() => startNextRound(lobbyId), 5000);
  }
}

// ── Finish Battle Royale ──
async function finishBattleRoyale(lobbyId, winner) {
  const lobby = brLobbies.get(lobbyId);
  if (!lobby) return;
  lobby.status = 'finished';

  const playerCount = lobby.players.size;
  const prizePool = playerCount; // 1 AVAX each
  const prize = prizePool * 0.95;

  console.log(`[BR] Battle Royale #${lobbyId} finished! Winner: ${winner?.name || 'none'}, Prize: ${prize} AVAX`);

  // Call smart contract to pay winner
  if (winner) {
    try {
      const contract = getBrContract();
      if (contract) {
        const tx = await contract.declareWinner(lobbyId, winner.wallet);
        await tx.wait();
        console.log(`[BR] On-chain declareWinner TX: ${tx.hash}`);
      }
    } catch (e) {
      console.error('[BR] On-chain declareWinner failed:', e.message);
    }
  }

  // Notify all players
  io.to(`br-${lobbyId}`).emit('br-finished', {
    lobbyId,
    winner: winner ? { name: winner.name, wallet: winner.wallet, kills: winner.kills } : null,
    prize: prize.toFixed(2),
    playerCount,
    rounds: lobby.round,
  });

  // Cleanup after 30 seconds
  setTimeout(() => {
    brLobbies.delete(lobbyId);
  }, 30000);
}

// ── BR Combat ──
function processBrAction(action, attacker, defender) {
  const result = { action, damage: 0, crit: false, missed: false, message: '' };

  const dodgeChance = Math.min(0.2, Math.max(0, defender.spd - attacker.spd) * 0.03);
  if (Math.random() < dodgeChance) {
    result.missed = true;
    result.message = 'Dodged!';
    return result;
  }

  const raw = Math.max(1, attacker.atk - defender.def + Math.floor(Math.random() * 7) - 3);
  const critChance = Math.min(0.3, 0.1 + Math.max(0, attacker.spd - defender.spd) * 0.02);
  result.crit = Math.random() < critChance;
  result.damage = result.crit ? Math.floor(raw * 1.75) : raw;
  result.message = result.crit ? 'Critical Hit!' : 'Attack';

  defender.hp = Math.max(0, defender.hp - result.damage);
  return result;
}

function sanitizeBrPlayer(p) {
  return { name: p.name, playerClass: p.playerClass, level: p.level, hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, spd: p.spd, kills: p.kills || 0 };
}

// ═══════════════════════════════════════════════════════════════════════
// CO-OP DUNGEON SYSTEM — Party + Dungeon Instances
// ═══════════════════════════════════════════════════════════════════════

// ─── Party State ───
const parties = new Map(); // partyId → { leader, members: Map<socketId, {name, level, playerClass, wallet}>, zone }
const playerParty = new Map(); // socketId → partyId (quick lookup)
const partyInvites = new Map(); // inviteId → { partyId, from, to, timestamp }

// ─── Co-op Instance State ───
const coopInstances = new Map(); // instanceId → { dungeonId, partyId, players, monsters, boss, startedAt, status }

// ─── Dungeon Definitions ───
const DUNGEON_DEFS = {
  crypt: {
    name: 'Frozen Crypt',
    monsters: [
      { type: 'skeleton', hp: 80, atk: 12, tx: 5, ty: 3 },
      { type: 'skeleton', hp: 80, atk: 12, tx: 8, ty: 6 },
      { type: 'ghoul', hp: 120, atk: 18, tx: 12, ty: 4 },
      { type: 'ghoul', hp: 120, atk: 18, tx: 15, ty: 8 },
      { type: 'wraith', hp: 150, atk: 22, tx: 10, ty: 10 },
    ],
    boss: { type: 'lich_king', hp: 500, atk: 35, tx: 20, ty: 12 },
    loot: ['frost_shard', 'bone_armor', 'crypt_key'],
    xpReward: 150,
  },
  abyss: {
    name: 'Abyssal Depths',
    monsters: [
      { type: 'deep_one', hp: 100, atk: 15, tx: 3, ty: 5 },
      { type: 'deep_one', hp: 100, atk: 15, tx: 7, ty: 3 },
      { type: 'sea_horror', hp: 160, atk: 20, tx: 11, ty: 7 },
      { type: 'sea_horror', hp: 160, atk: 20, tx: 14, ty: 5 },
      { type: 'kraken_spawn', hp: 200, atk: 28, tx: 9, ty: 11 },
      { type: 'kraken_spawn', hp: 200, atk: 28, tx: 16, ty: 9 },
    ],
    boss: { type: 'abyssal_kraken', hp: 800, atk: 45, tx: 20, ty: 14 },
    loot: ['abyssal_pearl', 'trident_shard', 'deep_helm'],
    xpReward: 250,
  },
  volcano: {
    name: 'Molten Core',
    monsters: [
      { type: 'fire_imp', hp: 90, atk: 14, tx: 4, ty: 4 },
      { type: 'fire_imp', hp: 90, atk: 14, tx: 6, ty: 7 },
      { type: 'magma_golem', hp: 180, atk: 25, tx: 10, ty: 5 },
      { type: 'magma_golem', hp: 180, atk: 25, tx: 13, ty: 9 },
      { type: 'infernal', hp: 220, atk: 30, tx: 8, ty: 12 },
      { type: 'infernal', hp: 220, atk: 30, tx: 16, ty: 6 },
      { type: 'phoenix', hp: 250, atk: 32, tx: 12, ty: 11 },
    ],
    boss: { type: 'dragon_lord', hp: 1200, atk: 55, tx: 22, ty: 14 },
    loot: ['dragon_scale', 'molten_blade', 'infernal_gem', 'phoenix_feather'],
    xpReward: 400,
  },
};

// ─── Helper: Build party update payload ───
const buildPartyUpdate = (partyId) => {
  const party = parties.get(partyId);
  if (!party) return null;

  const members = [];
  for (const [sid, m] of party.members) {
    const player = players.get(sid);
    members.push({
      id: sid,
      name: m.name,
      level: m.level,
      playerClass: m.playerClass,
      hp: player?.hp || 100,
      maxHp: player?.maxHp || 100,
    });
  }

  return { partyId, members, leader: party.leader };
};

// ─── Helper: Broadcast party update to all members ───
const broadcastPartyUpdate = (partyId) => {
  const party = parties.get(partyId);
  if (!party) return;
  const payload = buildPartyUpdate(partyId);
  if (!payload) return;

  for (const sid of party.members.keys()) {
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit('party-update', payload);
  }
};

// ─── Helper: Dissolve a party ───
const dissolveParty = (partyId) => {
  const party = parties.get(partyId);
  if (!party) return;

  for (const sid of party.members.keys()) {
    playerParty.delete(sid);
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit('party-dissolved', { partyId });
  }

  parties.delete(partyId);
  console.log(`[Party] Dissolved: ${partyId}`);
};

// ─── Helper: Remove player from party ───
const removeFromParty = (socketId) => {
  const partyId = playerParty.get(socketId);
  if (!partyId) return;

  const party = parties.get(partyId);
  if (!party) {
    playerParty.delete(socketId);
    return;
  }

  party.members.delete(socketId);
  playerParty.delete(socketId);

  // If party is empty, just delete it
  if (party.members.size === 0) {
    parties.delete(partyId);
    return;
  }

  if (party.leader === socketId) {
    // Transfer leadership to first remaining member
    const newLeader = party.members.keys().next().value;
    party.leader = newLeader;
    console.log(`[Party] Leadership transferred to ${party.members.get(newLeader)?.name} in ${partyId}`);
  }

  if (party.members.size < 2) {
    // Only 1 person left, dissolve
    dissolveParty(partyId);
  } else {
    broadcastPartyUpdate(partyId);
  }
};

// ─── Helper: Spawn dungeon monsters with party scaling ───
const spawnDungeonMonsters = (dungeonDef, partySize) => {
  const monsters = new Map();
  const scale = partySize * 0.7;

  // Regular monsters
  dungeonDef.monsters.forEach((m, i) => {
    const monsterId = `mob_${i}`;
    monsters.set(monsterId, {
      type: m.type,
      hp: Math.floor(m.hp * scale),
      maxHp: Math.floor(m.hp * scale),
      atk: m.atk,
      alive: true,
      tx: m.tx,
      ty: m.ty,
      isBoss: false,
    });
  });

  // Boss
  const bossId = 'boss_0';
  monsters.set(bossId, {
    type: dungeonDef.boss.type,
    hp: Math.floor(dungeonDef.boss.hp * scale),
    maxHp: Math.floor(dungeonDef.boss.hp * scale),
    atk: dungeonDef.boss.atk,
    alive: true,
    tx: dungeonDef.boss.tx,
    ty: dungeonDef.boss.ty,
    isBoss: true,
    phase: 1,
  });

  return monsters;
};

// ─── Helper: Check boss phase transitions ───
const checkBossPhase = (instance, monsterId, monster) => {
  if (!monster.isBoss || !monster.alive) return;

  const hpPercent = monster.hp / monster.maxHp;
  let newPhase = 1;
  if (hpPercent <= 0.30) newPhase = 3;
  else if (hpPercent <= 0.60) newPhase = 2;

  if (newPhase !== monster.phase) {
    monster.phase = newPhase;
    for (const sid of instance.players.keys()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('coop-boss-phase', {
          instanceId: instance.id,
          bossId: monsterId,
          phase: newPhase,
          hp: monster.hp,
          maxHp: monster.maxHp,
        });
      }
    }
    console.log(`[Coop] Boss ${monster.type} entered phase ${newPhase} (${Math.floor(hpPercent * 100)}% HP)`);
  }
};

// ─── Helper: Check dungeon completion ───
const checkDungeonComplete = (instanceId) => {
  const instance = coopInstances.get(instanceId);
  if (!instance || instance.status !== 'active') return;

  // Check if all monsters are dead
  let allDead = true;
  for (const m of instance.monsters.values()) {
    if (m.alive) { allDead = false; break; }
  }
  if (!allDead) return;

  // Dungeon completed
  instance.status = 'completed';
  const dungeonDef = DUNGEON_DEFS[instance.dungeonId];
  const elapsed = Date.now() - instance.startedAt;

  // Distribute loot to alive players
  const loot = [];
  for (const [sid, p] of instance.players) {
    if (p.alive) {
      const playerLoot = [];
      const lootPool = dungeonDef.loot;
      const numItems = Math.max(1, Math.floor(Math.random() * 2) + 1);
      for (let i = 0; i < numItems; i++) {
        playerLoot.push(lootPool[Math.floor(Math.random() * lootPool.length)]);
      }
      loot.push({ playerId: sid, items: playerLoot });
    }
  }

  for (const sid of instance.players.keys()) {
    const s = io.sockets.sockets.get(sid);
    if (s) {
      s.emit('coop-complete', {
        instanceId,
        loot,
        xpGained: dungeonDef.xpReward,
        time: Math.floor(elapsed / 1000),
      });
    }
  }

  console.log(`[Coop] Dungeon ${instance.dungeonId} completed in ${Math.floor(elapsed / 1000)}s`);
  setTimeout(() => { coopInstances.delete(instanceId); }, 30000);
};

// ─── Helper: Check if all players are dead ───
const checkDungeonFailed = (instanceId) => {
  const instance = coopInstances.get(instanceId);
  if (!instance || instance.status !== 'active') return;

  let anyAlive = false;
  for (const p of instance.players.values()) {
    if (p.alive) { anyAlive = true; break; }
  }
  if (anyAlive) return;

  instance.status = 'failed';
  for (const sid of instance.players.keys()) {
    const s = io.sockets.sockets.get(sid);
    if (s) {
      s.emit('coop-failed', { instanceId, reason: 'All party members have fallen!' });
    }
  }

  console.log(`[Coop] Dungeon ${instance.dungeonId} FAILED — all players dead`);
  setTimeout(() => { coopInstances.delete(instanceId); }, 10000);
};

// ─── Co-op Connection Handler ───
io.on('connection', (socket) => {

  // ═══ Party System ═══

  // ── Party Invite ──
  socket.on('party-invite', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.zone) return;
    if (!data?.targetId) return;
    if (!rateLimit(socket.id, 'party-invite', 5000)) return;

    const target = players.get(data.targetId);
    if (!target || target.zone !== player.zone) return;

    // Target already in a party?
    if (playerParty.has(data.targetId)) {
      socket.emit('party-error', { message: 'Player is already in a party' });
      return;
    }

    // Get or create party for inviter
    let partyId = playerParty.get(socket.id);
    if (!partyId) {
      partyId = `party_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      parties.set(partyId, {
        leader: socket.id,
        members: new Map([[socket.id, {
          name: player.name,
          level: player.level,
          playerClass: player.playerClass,
          wallet: player.wallet,
        }]]),
        zone: player.zone,
      });
      playerParty.set(socket.id, partyId);
      console.log(`[Party] Created: ${partyId} by ${player.name}`);
    }

    const party = parties.get(partyId);
    if (!party) return;

    // Only leader can invite
    if (party.leader !== socket.id) {
      socket.emit('party-error', { message: 'Only the party leader can invite' });
      return;
    }

    // Max 4 members
    if (party.members.size >= 4) {
      socket.emit('party-error', { message: 'Party is full (max 4)' });
      return;
    }

    const inviteId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    partyInvites.set(inviteId, {
      partyId,
      from: socket.id,
      to: data.targetId,
      timestamp: Date.now(),
    });

    // Notify target
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('party-invited', {
        partyId,
        inviteId,
        from: socket.id,
        name: player.name,
        level: player.level,
      });
    }

    // 30s invite timeout
    setTimeout(() => {
      if (partyInvites.has(inviteId)) {
        partyInvites.delete(inviteId);
      }
    }, 30000);
  });

  // ── Party Accept ──
  socket.on('party-accept', (data) => {
    if (!data?.partyId) return;

    // Find the invite for this player and party
    let foundInvite = null;
    let foundInviteId = null;
    for (const [invId, inv] of partyInvites) {
      if (inv.partyId === data.partyId && inv.to === socket.id) {
        foundInvite = inv;
        foundInviteId = invId;
        break;
      }
    }

    if (!foundInvite) {
      socket.emit('party-error', { message: 'Invite expired or not found' });
      return;
    }

    partyInvites.delete(foundInviteId);

    const party = parties.get(data.partyId);
    if (!party) {
      socket.emit('party-error', { message: 'Party no longer exists' });
      return;
    }

    if (party.members.size >= 4) {
      socket.emit('party-error', { message: 'Party is full' });
      return;
    }

    // Already in another party?
    if (playerParty.has(socket.id)) {
      removeFromParty(socket.id);
    }

    const player = players.get(socket.id);
    if (!player) return;

    party.members.set(socket.id, {
      name: player.name,
      level: player.level,
      playerClass: player.playerClass,
      wallet: player.wallet,
    });
    playerParty.set(socket.id, data.partyId);

    broadcastPartyUpdate(data.partyId);
    console.log(`[Party] ${player.name} joined ${data.partyId} (${party.members.size} members)`);
  });

  // ── Party Decline ──
  socket.on('party-decline', (data) => {
    if (!data?.partyId) return;

    for (const [invId, inv] of partyInvites) {
      if (inv.partyId === data.partyId && inv.to === socket.id) {
        partyInvites.delete(invId);
        const leaderSocket = io.sockets.sockets.get(inv.from);
        if (leaderSocket) {
          const decliner = players.get(socket.id);
          leaderSocket.emit('party-invite-declined', {
            partyId: data.partyId,
            name: decliner?.name || 'Unknown',
          });
        }
        break;
      }
    }
  });

  // ── Party Leave ──
  socket.on('party-leave', () => {
    const partyId = playerParty.get(socket.id);
    if (!partyId) return;

    const player = players.get(socket.id);
    console.log(`[Party] ${player?.name || socket.id} left ${partyId}`);
    removeFromParty(socket.id);
  });

  // ═══ Co-op Dungeon Instances ═══

  // ── Start Co-op Dungeon ──
  socket.on('coop-start', (data) => {
    if (!data?.dungeonId) return;
    if (!rateLimit(socket.id, 'coop-start', 5000)) return;

    const partyId = playerParty.get(socket.id);
    if (!partyId) {
      socket.emit('coop-error', { message: 'You must be in a party' });
      return;
    }

    const party = parties.get(partyId);
    if (!party) return;

    // Only leader can start
    if (party.leader !== socket.id) {
      socket.emit('coop-error', { message: 'Only the party leader can start a dungeon' });
      return;
    }

    // Valid dungeon?
    const dungeonDef = DUNGEON_DEFS[data.dungeonId];
    if (!dungeonDef) {
      socket.emit('coop-error', { message: 'Unknown dungeon' });
      return;
    }

    // Check party members are all in same zone
    const leaderPlayer = players.get(socket.id);
    if (!leaderPlayer) return;

    for (const sid of party.members.keys()) {
      const p = players.get(sid);
      if (!p || p.zone !== leaderPlayer.zone) {
        socket.emit('coop-error', { message: 'All party members must be in the same zone' });
        return;
      }
    }

    // Check no one is already in an active instance
    for (const sid of party.members.keys()) {
      for (const inst of coopInstances.values()) {
        if (inst.players.has(sid) && inst.status === 'active') {
          socket.emit('coop-error', { message: 'A party member is already in a dungeon' });
          return;
        }
      }
    }

    const instanceId = `coop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const partySize = party.members.size;

    // Build player map
    const instancePlayers = new Map();
    const memberList = [];
    for (const [sid, m] of party.members) {
      const p = players.get(sid);
      instancePlayers.set(sid, {
        name: m.name,
        wallet: m.wallet,
        tx: p?.tx || 0,
        ty: p?.ty || 0,
        hp: 100 + (m.level * 5),
        maxHp: 100 + (m.level * 5),
        alive: true,
      });
      memberList.push({ id: sid, name: m.name, level: m.level, playerClass: m.playerClass });
    }

    // Spawn monsters scaled to party size
    const monsters = spawnDungeonMonsters(dungeonDef, partySize);

    const instance = {
      id: instanceId,
      dungeonId: data.dungeonId,
      partyId,
      players: instancePlayers,
      monsters,
      startedAt: Date.now(),
      status: 'active',
    };
    coopInstances.set(instanceId, instance);

    // Serialize monsters for client
    const monstersPayload = [];
    for (const [mid, m] of monsters) {
      monstersPayload.push({ id: mid, type: m.type, hp: m.hp, maxHp: m.maxHp, tx: m.tx, ty: m.ty, isBoss: m.isBoss });
    }

    // Notify all party members
    for (const sid of party.members.keys()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('coop-started', {
          instanceId,
          dungeonId: data.dungeonId,
          dungeonName: dungeonDef.name,
          members: memberList,
          monsters: monstersPayload,
        });
      }
    }

    console.log(`[Coop] Started ${data.dungeonId} (${instanceId}), ${partySize} players, ${monsters.size} monsters`);

    // 30 minute timeout
    setTimeout(() => {
      const inst = coopInstances.get(instanceId);
      if (inst && inst.status === 'active') {
        inst.status = 'failed';
        for (const sid of inst.players.keys()) {
          const s = io.sockets.sockets.get(sid);
          if (s) s.emit('coop-failed', { instanceId, reason: 'Dungeon timed out (30 min)' });
        }
        coopInstances.delete(instanceId);
        console.log(`[Coop] ${instanceId} timed out`);
      }
    }, 30 * 60 * 1000);
  });

  // ── Co-op Player Sync ──
  socket.on('coop-sync', (data) => {
    if (!data?.instanceId) return;
    if (!rateLimit(socket.id, 'coop-sync', 200)) return;

    const instance = coopInstances.get(data.instanceId);
    if (!instance || instance.status !== 'active') return;

    const p = instance.players.get(socket.id);
    if (!p) return;

    // Update player state
    p.tx = parseInt(data.tx) ?? p.tx;
    p.ty = parseInt(data.ty) ?? p.ty;
    if (typeof data.hp === 'number') p.hp = Math.max(0, Math.min(p.maxHp, data.hp));

    if (p.hp <= 0) {
      p.alive = false;
      checkDungeonFailed(data.instanceId);
    }

    // Build state for broadcast
    const playersPayload = [];
    for (const [sid, pl] of instance.players) {
      playersPayload.push({ id: sid, name: pl.name, tx: pl.tx, ty: pl.ty, hp: pl.hp, maxHp: pl.maxHp, alive: pl.alive });
    }

    const monstersPayload = [];
    for (const [mid, m] of instance.monsters) {
      monstersPayload.push({ id: mid, hp: m.hp, alive: m.alive, tx: m.tx, ty: m.ty });
    }

    // Broadcast state to other players in instance (volatile — skip if backed up)
    for (const sid of instance.players.keys()) {
      if (sid === socket.id) continue;
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.volatile.emit('coop-state', {
          instanceId: data.instanceId,
          players: playersPayload,
          monsters: monstersPayload,
        });
      }
    }
  });

  // ── Co-op Monster Hit ──
  socket.on('coop-monster-hit', (data) => {
    if (!data?.instanceId || !data?.monsterId) return;
    if (!rateLimit(socket.id, 'coop-monster-hit', 300)) return;

    const instance = coopInstances.get(data.instanceId);
    if (!instance || instance.status !== 'active') return;

    const p = instance.players.get(socket.id);
    if (!p || !p.alive) return;

    const monster = instance.monsters.get(data.monsterId);
    if (!monster || !monster.alive) return;

    // Validate damage (server-side cap)
    const damage = Math.max(0, Math.min(200, parseInt(data.damage) || 0));
    monster.hp = Math.max(0, monster.hp - damage);

    const killedBy = monster.hp <= 0 ? socket.id : undefined;
    if (killedBy) monster.alive = false;

    // Boss phase check
    if (monster.isBoss && monster.alive) {
      checkBossPhase(instance, data.monsterId, monster);
    }

    // Broadcast monster update to all players
    for (const sid of instance.players.keys()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('coop-monster-update', {
          instanceId: data.instanceId,
          monsterId: data.monsterId,
          hp: monster.hp,
          alive: monster.alive,
          killedBy: killedBy ? p.name : undefined,
        });
      }
    }

    // Check completion
    if (killedBy) {
      checkDungeonComplete(data.instanceId);
    }
  });

  // ── Co-op Disconnect Cleanup ──
  socket.on('disconnect', () => {
    // Clean up party membership
    removeFromParty(socket.id);

    // Clean up party invites
    for (const [invId, inv] of partyInvites) {
      if (inv.from === socket.id || inv.to === socket.id) {
        partyInvites.delete(invId);
      }
    }

    // Mark player as dead in active co-op instances
    for (const [instanceId, instance] of coopInstances) {
      const p = instance.players.get(socket.id);
      if (p && instance.status === 'active') {
        p.alive = false;
        p.hp = 0;

        // Notify remaining players
        for (const sid of instance.players.keys()) {
          if (sid === socket.id) continue;
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.emit('coop-player-left', {
              instanceId,
              playerId: socket.id,
              name: p.name,
            });
          }
        }

        checkDungeonFailed(instanceId);
      }
    }
  });
});

// ─── CAR(D) GAME real 4-player multiplayer (server-authoritative) ───
import { registerCardgame } from './cardgame-mp-wire.mjs';
registerCardgame(io);

// ─── Start ───
httpServer.listen(PORT, () => {
  console.log(`[MP] Frostbite Multiplayer Server running on port ${PORT}`);
});
